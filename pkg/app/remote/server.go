package remote

import (
	"bytes"
	"context"
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"net"
	"net/http"
	"net/http/httputil"
	"net/url"
	"path"
	"strings"
	"sync"
	"time"

	"github.com/gorilla/websocket"
	"rsc.io/qr"

	"github.com/ellypaws/inkbunny/cmd/downloader/pkg/app/state"
	"github.com/ellypaws/inkbunny/cmd/downloader/pkg/app/types"
	apputils "github.com/ellypaws/inkbunny/cmd/downloader/pkg/app/utils"
)

const (
	defaultListenAddress = "0.0.0.0:34116"
	authCookieName       = "inkbunny_remote"
	authHeaderName       = "X-Inkbunny-Remote-Auth"
	authQueryParam       = "remoteAuth"
)

type Config struct {
	Assets        fs.FS
	DevServerURL  string
	ListenAddress string
}

type Server struct {
	app        *state.App
	httpServer *http.Server
	listener   net.Listener
	info       types.RemoteAccessInfo
	pairToken  string
	assetFS    fs.FS
	devProxy   *httputil.ReverseProxy
	upgrader   websocket.Upgrader

	mu           sync.RWMutex
	selectedHost string
	authMu       sync.RWMutex
	sessions     map[string]struct{}
}

func NewServer(app *state.App, cfg Config) (*Server, error) {
	if app == nil {
		return nil, errors.New("remote app is required")
	}

	listenAddress := strings.TrimSpace(cfg.ListenAddress)
	if listenAddress == "" {
		listenAddress = defaultListenAddress
	}

	listener, err := net.Listen("tcp", listenAddress)
	if err != nil && listenAddress == defaultListenAddress {
		listener, err = net.Listen("tcp", "0.0.0.0:0")
	}
	if err != nil {
		return nil, err
	}

	var assetFS fs.FS
	if cfg.Assets != nil {
		assetFS, _ = fs.Sub(cfg.Assets, "app/dist")
	}

	server := &Server{
		app:       app,
		listener:  listener,
		assetFS:   assetFS,
		pairToken: randomToken(32),
		sessions:  make(map[string]struct{}),
		upgrader: websocket.Upgrader{
			CheckOrigin: checkOrigin,
		},
	}

	if cfg.DevServerURL != "" {
		target, parseErr := url.Parse(cfg.DevServerURL)
		if parseErr != nil {
			return nil, parseErr
		}
		server.devProxy = httputil.NewSingleHostReverseProxy(target)
		if assetFS != nil {
			fallback := http.HandlerFunc(server.serveEmbeddedFrontend)
			server.devProxy.ErrorHandler = func(w http.ResponseWriter, r *http.Request, _ error) {
				fallback.ServeHTTP(w, r)
			}
		}
	}

	server.selectedHost = "127.0.0.1"
	info, err := server.buildInfo(server.selectedHost)
	if err != nil {
		return nil, err
	}
	server.info = info

	mux := http.NewServeMux()
	mux.HandleFunc("GET /pair", server.handlePair)
	mux.HandleFunc("GET /api/avatar/image", server.handleAvatarImage)
	mux.HandleFunc("GET /api/remote/qrcode.png", server.handleQRCode)
	mux.Handle("GET /ws", server.requireAuth(http.HandlerFunc(server.handleWebSocket)))
	mux.Handle("/api/", server.requireAuth(http.HandlerFunc(server.handleAPI)))
	mux.Handle("/", http.HandlerFunc(server.handleFrontend))

	server.httpServer = &http.Server{
		Handler:           mux,
		ReadHeaderTimeout: 5 * time.Second,
	}

	go func() {
		_ = server.httpServer.Serve(listener)
	}()

	return server, nil
}

func (s *Server) Info() types.RemoteAccessInfo {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.info
}

func (s *Server) SetSelectedHost(host string) (types.RemoteAccessInfo, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	info, err := s.buildInfo(strings.TrimSpace(host))
	if err != nil {
		return s.info, err
	}
	s.selectedHost = info.SelectedHost
	s.info = info
	return s.info, nil
}

func (s *Server) Close() error {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	return s.httpServer.Shutdown(ctx)
}

func (s *Server) buildInfo(host string) (types.RemoteAccessInfo, error) {
	host = strings.TrimSpace(host)
	if host == "" {
		host = "127.0.0.1"
	}
	pairingURL := s.buildPairingURL(host)
	if _, err := qr.Encode(pairingURL, qr.M); err != nil {
		return types.RemoteAccessInfo{}, err
	}
	return types.RemoteAccessInfo{
		Enabled:       true,
		ListenAddress: s.listener.Addr().String(),
		PairingToken:  s.pairToken,
		PairingURL:    pairingURL,
		SelectedHost:  host,
		QRCodeDataURL: s.buildQRCodeImageURL(),
	}, nil
}

func (s *Server) buildPairingURL(host string) string {
	port := "34116"
	if tcpAddr, ok := s.listener.Addr().(*net.TCPAddr); ok && tcpAddr.Port > 0 {
		port = fmt.Sprintf("%d", tcpAddr.Port)
	}
	return fmt.Sprintf("http://%s:%s/pair?token=%s", host, port, url.QueryEscape(s.pairToken))
}

func (s *Server) buildQRCodeImageURL() string {
	port := "34116"
	if tcpAddr, ok := s.listener.Addr().(*net.TCPAddr); ok && tcpAddr.Port > 0 {
		port = fmt.Sprintf("%d", tcpAddr.Port)
	}
	return fmt.Sprintf("http://127.0.0.1:%s/api/remote/qrcode.png?token=%s", port, url.QueryEscape(s.pairToken))
}

func (s *Server) requireAuth(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !s.isAuthorized(r) {
			writeJSONError(w, http.StatusUnauthorized, "remote session required")
			return
		}
		next.ServeHTTP(w, r)
	})
}

func (s *Server) isAuthorized(r *http.Request) bool {
	sessionID := authTokenFromRequest(r)
	if sessionID == "" {
		return false
	}
	s.authMu.RLock()
	defer s.authMu.RUnlock()
	_, ok := s.sessions[sessionID]
	return ok
}

func authTokenFromRequest(r *http.Request) string {
	if r == nil {
		return ""
	}
	if secret, err := r.Cookie(authCookieName); err == nil {
		if value := strings.TrimSpace(secret.Value); value != "" {
			return value
		}
	}
	if value := strings.TrimSpace(r.Header.Get(authHeaderName)); value != "" {
		return value
	}
	if r.URL == nil {
		return ""
	}
	return strings.TrimSpace(r.URL.Query().Get(authQueryParam))
}

func (s *Server) handlePair(w http.ResponseWriter, r *http.Request) {
	if r.URL.Query().Get("token") != s.pairToken {
		writeJSONError(w, http.StatusUnauthorized, "invalid pairing token")
		return
	}
	sessionID := randomToken(32)
	s.authMu.Lock()
	s.sessions[sessionID] = struct{}{}
	s.authMu.Unlock()

	http.SetCookie(w, &http.Cookie{
		Name:     authCookieName,
		Value:    sessionID,
		HttpOnly: true,
		Path:     "/",
		SameSite: http.SameSiteLaxMode,
		Secure:   true,
	})
	http.Redirect(w, r, "/#"+url.Values{authQueryParam: []string{sessionID}}.Encode(), http.StatusFound)
}

func (s *Server) handleAvatarImage(w http.ResponseWriter, r *http.Request) {
	target, err := apputils.ParseApprovedUserIconURL(r.URL.Query().Get("url"))
	if err != nil {
		writeJSONError(w, http.StatusBadRequest, "invalid avatar url")
		return
	}

	body, contentType, err := apputils.FetchUserIconBytes(r.Context(), target.String())
	if err != nil {
		writeJSONError(w, http.StatusBadGateway, err.Error())
		return
	}

	w.Header().Set("Content-Type", contentType)
	w.Header().Set("Cache-Control", "public, max-age=3600")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(body)
}

func (s *Server) handleQRCode(w http.ResponseWriter, r *http.Request) {
	if r.URL.Query().Get("token") != s.pairToken {
		http.NotFound(w, r)
		return
	}

	s.mu.RLock()
	pairingURL := s.info.PairingURL
	s.mu.RUnlock()
	if strings.TrimSpace(pairingURL) == "" {
		http.NotFound(w, r)
		return
	}

	code, err := qr.Encode(pairingURL, qr.M)
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, "qr generation failed")
		return
	}
	code.Scale = 6
	png := code.PNG()

	w.Header().Set("Content-Type", "image/png")
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("Content-Length", fmt.Sprintf("%d", len(png)))
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(png)
}

func (s *Server) handleWebSocket(w http.ResponseWriter, r *http.Request) {
	conn, err := s.upgrader.Upgrade(w, r, nil)
	if err != nil {
		return
	}
	defer conn.Close()

	events, cancel := s.app.SubscribeSharedEvents(32)
	defer cancel()

	if err := conn.WriteJSON(sharedMessage{
		Type:    "snapshot.initial",
		Payload: s.app.SharedSnapshot(),
	}); err != nil {
		return
	}

	done := make(chan struct{})
	go func() {
		defer close(done)
		for {
			if _, _, err := conn.ReadMessage(); err != nil {
				return
			}
		}
	}()

	for {
		select {
		case <-done:
			return
		case event, ok := <-events:
			if !ok {
				return
			}
			if err := conn.WriteJSON(sharedMessage{
				Type:    event.Type,
				Payload: event.Payload,
			}); err != nil {
				return
			}
		}
	}
}

func (s *Server) handleAPI(w http.ResponseWriter, r *http.Request) {
	switch {
	case r.Method == http.MethodGet && r.URL.Path == "/api/session":
		writeJSON(w, http.StatusOK, s.app.GetSession())
	case r.Method == http.MethodPost && r.URL.Path == "/api/session/login":
		var req credentialsRequest
		if !decodeJSON(w, r, &req) {
			return
		}
		session, err := s.app.Login(req.Username, req.Password)
		if err != nil {
			writeJSONError(w, http.StatusBadRequest, err.Error())
			return
		}
		writeJSON(w, http.StatusOK, session)
	case r.Method == http.MethodPost && r.URL.Path == "/api/session/guest":
		session, err := s.app.EnsureGuestSession()
		if err != nil {
			writeJSONError(w, http.StatusBadRequest, err.Error())
			return
		}
		writeJSON(w, http.StatusOK, session)
	case r.Method == http.MethodPost && r.URL.Path == "/api/session/logout":
		session, err := s.app.Logout()
		if err != nil {
			writeJSONError(w, http.StatusBadRequest, err.Error())
			return
		}
		writeJSON(w, http.StatusOK, session)
	case r.Method == http.MethodPost && r.URL.Path == "/api/session/ratings":
		var req maskRequest
		if !decodeJSON(w, r, &req) {
			return
		}
		session, err := s.app.UpdateRatings(req.Mask)
		if err != nil {
			writeJSONError(w, http.StatusBadRequest, err.Error())
			return
		}
		writeJSON(w, http.StatusOK, session)
	case r.Method == http.MethodGet && r.URL.Path == "/api/build-info":
		writeJSON(w, http.StatusOK, s.app.GetBuildInfo())
	case r.Method == http.MethodGet && r.URL.Path == "/api/release-status":
		writeJSON(w, http.StatusOK, s.app.GetReleaseStatus())
	case r.Method == http.MethodGet && r.URL.Path == "/api/remote-access":
		writeJSON(w, http.StatusOK, s.app.GetRemoteAccessInfo())
	case r.Method == http.MethodGet && r.URL.Path == "/api/workspace":
		writeJSON(w, http.StatusOK, s.app.GetWorkspaceState())
	case r.Method == http.MethodPost && r.URL.Path == "/api/workspace":
		var workspace types.WorkspaceState
		if !decodeJSON(w, r, &workspace) {
			return
		}
		if err := s.app.SaveWorkspaceState(workspace); err != nil {
			writeJSONError(w, http.StatusBadRequest, err.Error())
			return
		}
		writeNoContent(w)
	case r.Method == http.MethodGet && r.URL.Path == "/api/queue":
		writeJSON(w, http.StatusOK, s.app.GetQueueSnapshot())
	case r.Method == http.MethodGet && r.URL.Path == "/api/submission-description":
		description, err := s.app.GetSubmissionDescription(r.URL.Query().Get("submissionId"))
		if err != nil {
			writeJSONError(w, http.StatusBadRequest, err.Error())
			return
		}
		writeJSON(w, http.StatusOK, description)
	case r.Method == http.MethodPost && r.URL.Path == "/api/queue/enqueue":
		var req enqueueRequest
		if !decodeJSON(w, r, &req) {
			return
		}
		queue, err := s.app.EnqueueDownloads(req.SearchID, req.Selection, req.Options)
		if err != nil {
			writeJSONError(w, http.StatusBadRequest, err.Error())
			return
		}
		writeJSON(w, http.StatusOK, queue)
	case r.Method == http.MethodPost && r.URL.Path == "/api/queue/cancel-download":
		var req jobIDRequest
		if !decodeJSON(w, r, &req) {
			return
		}
		writeJSON(w, http.StatusOK, s.app.CancelDownload(req.JobID))
	case r.Method == http.MethodPost && r.URL.Path == "/api/queue/cancel-submission":
		var req submissionIDRequest
		if !decodeJSON(w, r, &req) {
			return
		}
		writeJSON(w, http.StatusOK, s.app.CancelSubmission(req.SubmissionID))
	case r.Method == http.MethodPost && r.URL.Path == "/api/queue/retry-download":
		var req jobIDRequest
		if !decodeJSON(w, r, &req) {
			return
		}
		writeJSON(w, http.StatusOK, s.app.RetryDownload(req.JobID))
	case r.Method == http.MethodPost && r.URL.Path == "/api/queue/retry-submission":
		var req submissionIDRequest
		if !decodeJSON(w, r, &req) {
			return
		}
		writeJSON(w, http.StatusOK, s.app.RetrySubmission(req.SubmissionID))
	case r.Method == http.MethodPost && r.URL.Path == "/api/queue/retry-all":
		writeJSON(w, http.StatusOK, s.app.RetryAllDownloads())
	case r.Method == http.MethodPost && r.URL.Path == "/api/queue/pause":
		writeJSON(w, http.StatusOK, s.app.PauseAllDownloads())
	case r.Method == http.MethodPost && r.URL.Path == "/api/queue/resume":
		writeJSON(w, http.StatusOK, s.app.ResumeAllDownloads())
	case r.Method == http.MethodPost && r.URL.Path == "/api/queue/stop":
		writeJSON(w, http.StatusOK, s.app.StopAllDownloads())
	case r.Method == http.MethodPost && r.URL.Path == "/api/queue/clear":
		writeJSON(w, http.StatusOK, s.app.ClearQueue())
	case r.Method == http.MethodPost && r.URL.Path == "/api/queue/clear-completed":
		writeJSON(w, http.StatusOK, s.app.ClearCompletedDownloads())
	case r.Method == http.MethodPost && r.URL.Path == "/api/queue/clear-completed-submissions":
		var req submissionsRequest
		if !decodeJSON(w, r, &req) {
			return
		}
		writeJSON(w, http.StatusOK, s.app.ClearCompletedSubmissions(req.SubmissionIDs))
	case r.Method == http.MethodPost && r.URL.Path == "/api/settings":
		var settings types.AppSettings
		if !decodeJSON(w, r, &settings) {
			return
		}
		nextSettings, err := s.app.UpdateSettings(settings)
		if err != nil {
			writeJSONError(w, http.StatusBadRequest, err.Error())
			return
		}
		writeJSON(w, http.StatusOK, nextSettings)
	case r.Method == http.MethodPost && r.URL.Path == "/api/settings/skip-release":
		var req tagRequest
		if !decodeJSON(w, r, &req) {
			return
		}
		settings, err := s.app.SkipReleaseTag(req.Tag)
		if err != nil {
			writeJSONError(w, http.StatusBadRequest, err.Error())
			return
		}
		writeJSON(w, http.StatusOK, settings)
	case r.Method == http.MethodPost && r.URL.Path == "/api/debug/reset":
		var req scopeRequest
		if !decodeJSON(w, r, &req) {
			return
		}
		result, err := s.app.DebugResetState(req.Scope)
		if err != nil {
			writeJSONError(w, http.StatusBadRequest, err.Error())
			return
		}
		writeJSON(w, http.StatusOK, result)
	case r.Method == http.MethodGet && r.URL.Path == "/api/avatar/proxy":
		value, err := s.app.ProxyAvatarImageURL(r.URL.Query().Get("url"))
		if err != nil {
			writeJSONError(w, http.StatusBadRequest, err.Error())
			return
		}
		writeJSON(w, http.StatusOK, map[string]string{"value": value})
	case r.Method == http.MethodGet && r.URL.Path == "/api/resource":
		s.proxyRemoteResource(w, r)
	case r.Method == http.MethodGet && r.URL.Path == "/api/open":
		location, err := s.approvedRemoteOpenLocation(r.URL.Query().Get("url"))
		if err != nil {
			writeJSONError(w, http.StatusBadRequest, err.Error())
			return
		}
		http.Redirect(w, r, location, http.StatusTemporaryRedirect)
	case r.Method == http.MethodPost && r.URL.Path == "/api/search":
		var params types.SearchParams
		if !decodeJSON(w, r, &params) {
			return
		}
		response, err := s.app.Search(params)
		if err != nil {
			writeJSONError(w, http.StatusBadRequest, err.Error())
			return
		}
		writeJSON(w, http.StatusOK, response)
	case r.Method == http.MethodPost && r.URL.Path == "/api/search/cancel":
		var req searchOperationRequest
		if !decodeJSON(w, r, &req) {
			return
		}
		s.app.CancelSearchRequests(req.OperationID)
		writeNoContent(w)
	case r.Method == http.MethodGet && r.URL.Path == "/api/search/unread-count":
		total, err := s.app.GetUnreadSubmissionCount()
		if err != nil {
			writeJSONError(w, http.StatusBadRequest, err.Error())
			return
		}
		writeJSON(w, http.StatusOK, map[string]int{"value": total})
	case r.Method == http.MethodPost && r.URL.Path == "/api/search/refresh":
		var req searchIDRequest
		if !decodeJSON(w, r, &req) {
			return
		}
		response, err := s.app.RefreshSearch(req.SearchID, req.OperationID)
		if err != nil {
			writeJSONError(w, http.StatusBadRequest, err.Error())
			return
		}
		writeJSON(w, http.StatusOK, response)
	case r.Method == http.MethodPost && r.URL.Path == "/api/search/load-more":
		var req loadMoreRequest
		if !decodeJSON(w, r, &req) {
			return
		}
		response, err := s.app.LoadMoreResults(req.SearchID, req.Page, req.OperationID)
		if err != nil {
			writeJSONError(w, http.StatusBadRequest, err.Error())
			return
		}
		writeJSON(w, http.StatusOK, response)
	case r.Method == http.MethodGet && r.URL.Path == "/api/search/keywords":
		values, err := s.app.GetKeywordSuggestions(r.URL.Query().Get("q"))
		if err != nil {
			writeJSONError(w, http.StatusBadRequest, err.Error())
			return
		}
		writeJSON(w, http.StatusOK, values)
	case r.Method == http.MethodGet && r.URL.Path == "/api/search/usernames":
		values, err := s.app.GetUsernameSuggestions(r.URL.Query().Get("q"))
		if err != nil {
			writeJSONError(w, http.StatusBadRequest, err.Error())
			return
		}
		writeJSON(w, http.StatusOK, values)
	case r.Method == http.MethodGet && r.URL.Path == "/api/search/watching":
		values, err := s.app.GetWatching()
		if err != nil {
			writeJSONError(w, http.StatusBadRequest, err.Error())
			return
		}
		writeJSON(w, http.StatusOK, values)
	default:
		writeJSONError(w, http.StatusNotFound, "not found")
	}
}

func (s *Server) handleFrontend(w http.ResponseWriter, r *http.Request) {
	if s.devProxy != nil {
		s.devProxy.ServeHTTP(w, r)
		return
	}
	s.serveEmbeddedFrontend(w, r)
}

func (s *Server) serveEmbeddedFrontend(w http.ResponseWriter, r *http.Request) {
	if s.assetFS == nil {
		writeJSONError(w, http.StatusNotFound, "frontend assets unavailable")
		return
	}

	cleaned := path.Clean(strings.TrimPrefix(r.URL.Path, "/"))
	if cleaned == "." || cleaned == "/" {
		cleaned = "index.html"
	}

	if !strings.ContainsRune(cleaned, '.') {
		cleaned = "index.html"
	}

	file, err := s.assetFS.Open(cleaned)
	if err != nil {
		if cleaned != "index.html" {
			file, err = s.assetFS.Open("index.html")
		}
		if err != nil {
			writeJSONError(w, http.StatusNotFound, "frontend asset not found")
			return
		}
	}
	defer file.Close()

	stat, err := file.Stat()
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, "frontend stat failed")
		return
	}
	if seeker, ok := file.(io.ReadSeeker); ok {
		http.ServeContent(w, r, stat.Name(), stat.ModTime(), seeker)
		return
	}
	data, err := io.ReadAll(file)
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, "frontend read failed")
		return
	}
	http.ServeContent(w, r, stat.Name(), stat.ModTime(), bytes.NewReader(data))
}

type sharedMessage struct {
	Type    string `json:"type"`
	Payload any    `json:"payload,omitempty"`
}

type credentialsRequest struct {
	Username string `json:"username"`
	Password string `json:"password"`
}

type maskRequest struct {
	Mask string `json:"mask"`
}

type enqueueRequest struct {
	SearchID  string                  `json:"searchId"`
	Selection types.DownloadSelection `json:"selection"`
	Options   types.DownloadOptions   `json:"options"`
}

type jobIDRequest struct {
	JobID string `json:"jobId"`
}

type submissionIDRequest struct {
	SubmissionID string `json:"submissionId"`
}

type submissionsRequest struct {
	SubmissionIDs []string `json:"submissionIds"`
}

type tagRequest struct {
	Tag string `json:"tag"`
}

type scopeRequest struct {
	Scope string `json:"scope"`
}

type searchIDRequest struct {
	SearchID    string `json:"searchId"`
	OperationID string `json:"operationId"`
}

type loadMoreRequest struct {
	SearchID    string `json:"searchId"`
	Page        int    `json:"page"`
	OperationID string `json:"operationId"`
}

type searchOperationRequest struct {
	OperationID string `json:"operationId"`
}

func decodeJSON(w http.ResponseWriter, r *http.Request, target any) bool {
	defer r.Body.Close()
	decoder := json.NewDecoder(r.Body)
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(target); err != nil {
		writeJSONError(w, http.StatusBadRequest, err.Error())
		return false
	}
	return true
}

func writeJSON(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(value)
}

func writeJSONError(w http.ResponseWriter, status int, message string) {
	writeJSON(w, status, map[string]string{"error": message})
}

func writeNoContent(w http.ResponseWriter) {
	w.WriteHeader(http.StatusNoContent)
}

func randomToken(size int) string {
	if size <= 0 {
		size = 32
	}
	value := make([]byte, size)
	if _, err := rand.Read(value); err != nil {
		return fmt.Sprintf("%d", time.Now().UnixNano())
	}
	return base64.RawURLEncoding.EncodeToString(value)
}

func checkOrigin(r *http.Request) bool {
	origin := strings.TrimSpace(r.Header.Get("Origin"))
	if origin == "" {
		return true
	}
	parsed, err := url.Parse(origin)
	if err != nil {
		return false
	}
	return hostWithoutPort(parsed.Host) == hostWithoutPort(r.Host)
}

func hostWithoutPort(value string) string {
	host, _, err := net.SplitHostPort(value)
	if err == nil {
		return host
	}
	return value
}

func (s *Server) proxyRemoteResource(w http.ResponseWriter, r *http.Request) {
	target, err := s.approvedRemoteTarget(r.URL.Query().Get("url"))
	if err != nil {
		writeJSONError(w, http.StatusBadRequest, "unsupported resource url")
		return
	}
	req, err := apputils.NewApprovedGetRequest(r.Context(), target)
	if err != nil {
		writeJSONError(w, http.StatusBadRequest, "invalid resource url")
		return
	}
	copyRequestHeaderIfPresent(req.Header, r.Header, "Accept")
	copyRequestHeaderIfPresent(req.Header, r.Header, "If-Modified-Since")
	copyRequestHeaderIfPresent(req.Header, r.Header, "If-None-Match")
	copyRequestHeaderIfPresent(req.Header, r.Header, "Range")
	copyRequestHeaderIfPresent(req.Header, r.Header, "Cache-Control")
	req.Header.Set("Origin", "https://inkbunny.net")
	req.Header.Set("Referer", "https://inkbunny.net/")
	req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36")

	response, err := approvedRemoteHTTPClient().Do(req)
	if err != nil {
		writeJSONError(w, http.StatusBadGateway, "resource fetch failed")
		return
	}
	defer response.Body.Close()

	copyHeaderIfPresent(w.Header(), response.Header, "Content-Type")
	copyHeaderIfPresent(w.Header(), response.Header, "Content-Length")
	copyHeaderIfPresent(w.Header(), response.Header, "Content-Disposition")
	copyHeaderIfPresent(w.Header(), response.Header, "Cache-Control")
	copyHeaderIfPresent(w.Header(), response.Header, "ETag")
	copyHeaderIfPresent(w.Header(), response.Header, "Last-Modified")
	copyHeaderIfPresent(w.Header(), response.Header, "Accept-Ranges")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.WriteHeader(response.StatusCode)
	_, _ = io.Copy(w, response.Body)
}

func copyHeaderIfPresent(target http.Header, source http.Header, name string) {
	value := strings.TrimSpace(source.Get(name))
	if value == "" {
		return
	}
	target.Set(name, value)
}

func copyRequestHeaderIfPresent(target http.Header, source http.Header, name string) {
	for _, value := range source.Values(name) {
		if strings.TrimSpace(value) == "" {
			continue
		}
		target.Add(name, value)
	}
}

func (s *Server) approvedRemoteOpenLocation(raw string) (string, error) {
	target, err := s.approvedRemoteTarget(raw)
	if err != nil {
		return "", err
	}
	return "/api/resource?" + url.Values{"url": []string{target.String()}}.Encode(), nil
}

func (s *Server) approvedRemoteTarget(raw string) (*url.URL, error) {
	target, err := s.app.ResolveApprovedRemoteURL(raw)
	if err != nil {
		return nil, err
	}
	if target == nil || target.Scheme != "https" || !strings.HasPrefix(target.EscapedPath(), "/") {
		return nil, errors.New("unsupported resource url")
	}
	if !apputils.IsApprovedInkbunnyHost(target.Hostname()) {
		return nil, errors.New("unsupported resource url")
	}
	return target, nil
}

func approvedRemoteHTTPClient() *http.Client {
	return &http.Client{
		Timeout: 15 * time.Second,
		CheckRedirect: func(req *http.Request, via []*http.Request) error {
			if len(via) >= 10 {
				return errors.New("too many redirects")
			}
			if req == nil || req.URL == nil {
				return errors.New("invalid resource url")
			}
			_, err := state.ParseApprovedRemoteURL(req.URL.String())
			return err
		},
	}
}
