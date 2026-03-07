package desktopapp

import (
	"context"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"sync"

	"github.com/ellypaws/inkbunny"
	wruntime "github.com/wailsapp/wails/v2/pkg/runtime"

	"github.com/ellypaws/inkbunny/cmd/downloader/pkg/flight"
)

type App struct {
	ctx             context.Context
	store           *stateStore
	mu              sync.RWMutex
	cacheMu         sync.Mutex
	searchIDMu      sync.Mutex
	user            *inkbunny.User
	settings        AppSettings
	sessionAvatar   string
	searches        map[string]*searchState
	lastSearchID    string
	searchCounter   int
	keywordCache    *flight.Cache[keywordCacheKey, []inkbunny.KeywordAutocomplete]
	usernameCache   *flight.Cache[usernameCacheKey, []UsernameSuggestion]
	avatarCache     *flight.Cache[avatarCacheKey, string]
	searchCache     *flight.Cache[searchCacheKey, cachedSearchResult]
	loadMoreCache   *flight.Cache[loadMoreCacheKey, inkbunny.SubmissionSearchResponse]
	detailsCache    *flight.Cache[detailsCacheKey, inkbunny.SubmissionDetailsResponse]
	rateLimiter     *apiRateLimiter
	downloadManager *DownloadManager
}

func NewApp() *App {
	store, _ := newStateStore()
	defaultState := defaultStoredState()
	return &App{
		store:       store,
		settings:    defaultState.Settings,
		searches:    make(map[string]*searchState),
		rateLimiter: newAPIRateLimiter(nil),
	}
}

func (a *App) Startup(ctx context.Context) {
	a.ctx = ctx
	a.rateLimiter.SetNotifier(a.emitNotification)
	if a.store != nil {
		state, err := a.store.Load()
		if err == nil {
			a.settings = state.Settings
			a.lastSearchID = state.Session.LastSearchID
			a.sessionAvatar = state.Session.AvatarURL
			a.user = restoreUser(state.User)
		}
	}
	if a.sessionAvatar == "" {
		a.sessionAvatar = defaultAvatarURL
	}
	a.resetCaches(a.user)
	a.downloadManager = NewDownloadManager(ctx, a.settings.MaxActive, a.rateLimiter, func(event string, payload any) {
		if a.ctx != nil {
			wruntime.EventsEmit(a.ctx, event, payload)
		}
	})
}

func (a *App) Shutdown(context.Context) {}

func (a *App) emitNotification(notification AppNotification) {
	if a.ctx == nil {
		return
	}
	wruntime.EventsEmit(a.ctx, "app-notification", notification)
}

func (a *App) GetSession() SessionInfo {
	a.mu.RLock()
	defer a.mu.RUnlock()

	info := SessionInfo{
		Settings:       a.settings,
		LastSearchID:   a.lastSearchID,
		EffectiveTheme: ternary(a.settings.DarkMode, "dark", "light"),
		AvatarURL:      a.sessionAvatar,
	}
	if a.user == nil || a.user.SID == "" {
		if info.AvatarURL == "" {
			info.AvatarURL = defaultAvatarURL
		}
		return info
	}
	info.HasSession = true
	info.Username = a.user.Username
	info.IsGuest = strings.EqualFold(a.user.Username, "guest")
	info.RatingsMask = a.user.Ratings.String()
	if info.AvatarURL == "" || info.IsGuest {
		info.AvatarURL = defaultAvatarURL
	}
	return info
}

func (a *App) Login(username, password string) (SessionInfo, error) {
	user, err := inkbunny.Login(strings.TrimSpace(username), password)
	if err != nil {
		return SessionInfo{}, err
	}
	a.setSession(user)
	return a.GetSession(), nil
}

func (a *App) EnsureGuestSession() (SessionInfo, error) {
	guest, err := inkbunny.Login("guest", "")
	if err != nil {
		return SessionInfo{}, err
	}
	if guest == nil {
		return SessionInfo{}, errors.New("guest session unavailable")
	}
	a.setSession(guest)
	return a.GetSession(), nil
}

func (a *App) Logout() (SessionInfo, error) {
	a.mu.Lock()
	user := a.user
	a.user = nil
	a.mu.Unlock()

	if user != nil && user.SID != "" {
		_ = user.Logout()
	}
	a.clearSession()
	return a.GetSession(), nil
}

func (a *App) UpdateRatings(mask string) (SessionInfo, error) {
	user, err := a.ensureSearchSession()
	if err != nil {
		return SessionInfo{}, err
	}
	ratings := inkbunny.ParseMask(strings.TrimSpace(mask))

	a.mu.Lock()
	if a.user != nil && a.user.SID == user.SID {
		a.user.Ratings = ratings
	}
	a.mu.Unlock()
	a.resetCaches(user)
	return a.GetSession(), a.persist()
}

func (a *App) UpdateSettings(settings AppSettings) (AppSettings, error) {
	a.mu.Lock()
	if settings.DownloadDirectory != "" {
		a.settings.DownloadDirectory = settings.DownloadDirectory
	}
	if settings.MaxActive > 0 {
		a.settings.MaxActive = settings.MaxActive
	}
	a.settings.DarkMode = settings.DarkMode
	a.settings.MotionEnabled = settings.MotionEnabled
	current := a.settings
	a.mu.Unlock()

	if a.downloadManager != nil {
		a.downloadManager.SetMaxActive(current.MaxActive)
	}
	return current, a.persist()
}

func (a *App) PickDownloadDirectory() (string, error) {
	if a.ctx == nil {
		return "", errors.New("application context not ready")
	}
	a.mu.RLock()
	defaultDirectory := resolveDownloadPickerDirectory(a.settings.DownloadDirectory)
	a.mu.RUnlock()
	selected, err := wruntime.OpenDirectoryDialog(a.ctx, wruntime.OpenDialogOptions{
		Title:            "Choose a download folder",
		DefaultDirectory: defaultDirectory,
	})
	if err != nil || selected == "" {
		return "", err
	}
	_, updateErr := a.UpdateSettings(AppSettings{
		DownloadDirectory: selected,
		MaxActive:         a.settings.MaxActive,
		DarkMode:          a.settings.DarkMode,
		MotionEnabled:     a.settings.MotionEnabled,
	})
	return selected, updateErr
}

func (a *App) GetQueueSnapshot() QueueSnapshot {
	if a.downloadManager == nil {
		return QueueSnapshot{}
	}
	return a.downloadManager.Snapshot()
}

func (a *App) CancelDownload(jobID string) QueueSnapshot {
	if a.downloadManager == nil {
		return QueueSnapshot{}
	}
	return a.downloadManager.Cancel(jobID)
}

func (a *App) ClearQueue() QueueSnapshot {
	if a.downloadManager == nil {
		return QueueSnapshot{}
	}
	return a.downloadManager.Clear()
}

func (a *App) EnqueueDownloads(searchID string, selection DownloadSelection, options DownloadOptions) (QueueSnapshot, error) {
	user, err := a.ensureSearchSession()
	if err != nil {
		return QueueSnapshot{}, err
	}
	if len(selection.Submissions) == 0 {
		return a.GetQueueSnapshot(), nil
	}

	submissionIDs := make([]string, 0, len(selection.Submissions))
	selectedFiles := make(map[string]map[string]struct{}, len(selection.Submissions))
	for _, selected := range selection.Submissions {
		if selected.SubmissionID == "" {
			continue
		}
		submissionIDs = append(submissionIDs, selected.SubmissionID)
		if len(selected.FileIDs) > 0 {
			fileSet := make(map[string]struct{}, len(selected.FileIDs))
			for _, fileID := range selected.FileIDs {
				fileSet[fileID] = struct{}{}
			}
			selectedFiles[selected.SubmissionID] = fileSet
		}
	}
	if len(submissionIDs) == 0 {
		return a.GetQueueSnapshot(), nil
	}

	details, err := a.cachedSubmissionDetails(user, submissionIDs)
	if err != nil {
		if a.handleSessionError(err) {
			user, err = a.ensureSearchSession()
			if err != nil {
				return QueueSnapshot{}, err
			}
			details, err = a.cachedSubmissionDetails(user, submissionIDs)
		}
	}
	if err != nil {
		return QueueSnapshot{}, err
	}

	saveKeywords := options.SaveKeywords
	downloadRoot := options.DownloadDirectory
	if downloadRoot == "" {
		downloadRoot = a.GetSession().Settings.DownloadDirectory
	}
	maxActive := options.MaxActive
	if maxActive <= 0 {
		maxActive = a.GetSession().Settings.MaxActive
	}
	if err := os.MkdirAll(downloadRoot, 0o755); err != nil {
		return QueueSnapshot{}, err
	}

	tasks := make([]downloadTask, 0)
	for _, submission := range details.Submissions {
		keywords := joinKeywords(submission.Keywords)
		allowed := selectedFiles[submission.SubmissionID.String()]
		for _, file := range submission.Files {
			if len(allowed) > 0 {
				if _, ok := allowed[file.FileID.String()]; !ok {
					continue
				}
			}
			tasks = append(tasks, downloadTask{
				SessionID:    user.SID,
				SubmissionID: submission.SubmissionID.String(),
				FileID:       file.FileID.String(),
				Title:        submission.Title,
				Username:     submission.Username,
				FileName:     filepath.Base(file.FileName),
				FileMD5:      file.FullFileMD5,
				URL:          file.FileURLFull.String(),
				IsPublic:     submission.Public.Bool(),
				Keywords:     keywords,
				PreviewURL:   submissionPreviewURL(file.FileURLPreview.String(), submission.Public.Bool(), user.SID),
				SaveKeywords: saveKeywords,
				DownloadRoot: downloadRoot,
			})
		}
	}

	_, _ = a.UpdateSettings(AppSettings{
		DownloadDirectory: downloadRoot,
		MaxActive:         maxActive,
		DarkMode:          a.settings.DarkMode,
		MotionEnabled:     a.settings.MotionEnabled,
	})

	if len(tasks) == 0 {
		return a.GetQueueSnapshot(), nil
	}
	return a.downloadManager.Enqueue(tasks, maxActive), nil
}

func (a *App) DiagnosticState() string {
	session := a.GetSession()
	queue := a.GetQueueSnapshot()
	return fmt.Sprintf("%s:%s:%d", session.Username, ternary(session.IsGuest, "guest", "member"), len(queue.Jobs))
}

func (a *App) ensureSearchSession() (*inkbunny.User, error) {
	a.mu.RLock()
	current := a.user
	a.mu.RUnlock()
	if current != nil && current.SID != "" {
		return current, nil
	}
	return nil, errors.New("sign in to continue")
}

func (a *App) setSession(user *inkbunny.User) {
	a.mu.Lock()
	a.user = user
	a.sessionAvatar = defaultAvatarURL
	if user != nil && user.SID != "" && !strings.EqualFold(user.Username, "guest") {
		a.sessionAvatar = ""
	}
	a.mu.Unlock()
	a.resetCaches(user)
	a.syncSessionAvatar(user)
	_ = a.persist()
}

func (a *App) clearSession() {
	a.mu.Lock()
	a.user = nil
	a.sessionAvatar = defaultAvatarURL
	a.mu.Unlock()
	a.resetCaches(nil)
	_ = a.persist()
}

func (a *App) persist() error {
	a.mu.RLock()
	defer a.mu.RUnlock()
	if a.store == nil {
		return nil
	}
	return a.store.Save(storedState{
		Session: SessionInfo{
			HasSession:     a.user != nil && a.user.SID != "",
			Username:       usernameOf(a.user),
			IsGuest:        strings.EqualFold(usernameOf(a.user), "guest"),
			AvatarURL:      a.sessionAvatar,
			RatingsMask:    ratingsOf(a.user),
			Settings:       a.settings,
			LastSearchID:   a.lastSearchID,
			EffectiveTheme: ternary(a.settings.DarkMode, "dark", "light"),
		},
		User:     toStoredUser(a.user),
		Settings: a.settings,
	})
}

func usernameOf(user *inkbunny.User) string {
	if user == nil {
		return ""
	}
	return user.Username
}

func ratingsOf(user *inkbunny.User) string {
	if user == nil {
		return ""
	}
	return user.Ratings.String()
}

func joinKeywords(keywords []inkbunny.Keyword) string {
	parts := make([]string, 0, len(keywords))
	for _, keyword := range keywords {
		parts = append(parts, keyword.KeywordName)
	}
	return strings.Join(parts, ", ")
}

func (a *App) syncSessionAvatar(user *inkbunny.User) {
	if user == nil || user.SID == "" || strings.EqualFold(user.Username, "guest") {
		a.mu.Lock()
		a.sessionAvatar = defaultAvatarURL
		a.mu.Unlock()
		return
	}
	a.ensureCaches(user)
	avatar, err := a.avatarCache.Get(avatarCacheKey{
		Scope:    sessionScope(user),
		Username: normalizeUsername(user.Username),
	})
	if err != nil || avatar == "" {
		avatar = defaultAvatarURL
	}
	a.mu.Lock()
	if a.user != nil && a.user.SID == user.SID {
		a.sessionAvatar = avatar
	}
	a.mu.Unlock()
}

func (a *App) cachedSubmissionDetails(user *inkbunny.User, submissionIDs []string) (inkbunny.SubmissionDetailsResponse, error) {
	a.ensureCaches(user)

	ids := slices.Clone(submissionIDs)
	slices.Sort(ids)
	key := detailsCacheKey{
		SID:           user.SID,
		SubmissionIDs: strings.Join(ids, ","),
	}
	return a.detailsCache.Get(key)
}

func ternary[T any](condition bool, truthy, falsy T) T {
	if condition {
		return truthy
	}
	return falsy
}
