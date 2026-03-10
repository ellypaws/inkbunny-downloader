package state

import (
	"context"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"

	"github.com/ellypaws/inkbunny"
	wruntime "github.com/wailsapp/wails/v2/pkg/runtime"

	"github.com/ellypaws/inkbunny/cmd/downloader/pkg/app/downloads"
	"github.com/ellypaws/inkbunny/cmd/downloader/pkg/app/info"
	"github.com/ellypaws/inkbunny/cmd/downloader/pkg/app/storage"
	"github.com/ellypaws/inkbunny/cmd/downloader/pkg/app/types"
	apputils "github.com/ellypaws/inkbunny/cmd/downloader/pkg/app/utils"
	"github.com/ellypaws/inkbunny/cmd/downloader/pkg/flight"
)

type App struct {
	ctx             context.Context
	store           *storage.StateStore
	mu              sync.RWMutex
	cacheMu         sync.Mutex
	searchIDMu      sync.Mutex
	searchOpMu      sync.Mutex
	user            *inkbunny.User
	settings        types.AppSettings
	workspace       types.WorkspaceState
	sessionAvatar   string
	searches        map[string]*searchState
	lastSearchID    string
	searchCounter   int
	searchOpID      uint64
	searchOpCancel  context.CancelFunc
	keywordCache    *flight.Cache[keywordCacheKey, []inkbunny.KeywordAutocomplete]
	usernameCache   *flight.Cache[usernameCacheKey, []types.UsernameSuggestion]
	avatarCache     *flight.Cache[avatarCacheKey, string]
	watchingCache   *flight.Cache[watchingCacheKey, []types.UsernameSuggestion]
	searchCache     *flight.Cache[searchCacheKey, cachedSearchResult]
	loadMoreCache   *flight.Cache[loadMoreCacheKey, inkbunny.SubmissionSearchResponse]
	detailsCache    *flight.Cache[submissionDetailsCacheKey, inkbunny.SubmissionDetails]
	rateLimiter     *apputils.RateLimiter
	downloadManager *downloads.Manager
}

const submissionDetailsBatchSize = 100

func NewApp() *App {
	store, _ := storage.NewStateStore()
	defaultState := storage.DefaultStoredState()
	return &App{
		store:       store,
		settings:    defaultState.Settings,
		workspace:   defaultState.Workspace,
		searches:    make(map[string]*searchState),
		rateLimiter: apputils.NewRateLimiter(nil),
	}
}

func (a *App) Startup(ctx context.Context) {
	a.ctx = ctx
	a.rateLimiter.SetNotifier(a.emitNotification)
	if a.store != nil {
		state, err := a.store.Load()
		if err == nil {
			a.settings = state.Settings
			a.workspace = state.Workspace
			a.lastSearchID = state.Session.LastSearchID
			a.sessionAvatar = state.Session.AvatarURL
			a.user = storage.RestoreUser(state.User)
		}
	}
	if a.sessionAvatar == "" {
		a.sessionAvatar = apputils.DefaultAvatarURL
	}
	a.resetCaches(a.user)
	a.downloadManager = downloads.NewManager(ctx, a.settings.MaxActive, a.rateLimiter, func(event string, payload any) {
		if a.ctx != nil {
			wruntime.EventsEmit(a.ctx, event, payload)
		}
	})
	a.emitDebugLog("info", "app.startup", "desktop app startup complete", map[string]any{
		"hasSession":     a.user != nil && a.user.SID != "",
		"maxActive":      a.settings.MaxActive,
		"downloadDirSet": strings.TrimSpace(a.settings.DownloadDirectory) != "",
		"lastSearchId":   a.lastSearchID,
	})
}

func (a *App) Shutdown(context.Context) {}

func (a *App) beginSearchOperation() (context.Context, func()) {
	base := a.ctx
	if base == nil {
		base = context.Background()
	}

	ctx, cancel := context.WithCancel(base)

	a.searchOpMu.Lock()
	a.searchOpID++
	opID := a.searchOpID
	a.searchOpCancel = cancel
	a.searchOpMu.Unlock()

	finish := func() {
		a.searchOpMu.Lock()
		if a.searchOpID == opID {
			a.searchOpCancel = nil
		}
		a.searchOpMu.Unlock()
		cancel()
	}

	return ctx, finish
}

func (a *App) CancelSearchRequests() {
	a.searchOpMu.Lock()
	cancel := a.searchOpCancel
	a.searchOpCancel = nil
	a.searchOpMu.Unlock()
	a.emitDebugLog("debug", "search.cancel", "cancel search requests invoked", map[string]any{
		"hadActiveRequest": cancel != nil,
	})
	if cancel != nil {
		cancel()
	}
}

func (a *App) emitNotification(notification types.AppNotification) {
	if a.ctx == nil {
		return
	}
	a.emitDebugLog("info", "notification", "app notification emitted", map[string]any{
		"id":           notification.ID,
		"level":        notification.Level,
		"scope":        notification.Scope,
		"message":      notification.Message,
		"dedupeKey":    notification.DedupeKey,
		"retryAfterMs": notification.RetryAfterMS,
	})
	wruntime.EventsEmit(a.ctx, "app-notification", notification)
}

func (a *App) GetSession() types.SessionInfo {
	a.mu.RLock()
	defer a.mu.RUnlock()

	info := types.SessionInfo{
		Settings:       a.settings,
		LastSearchID:   a.lastSearchID,
		EffectiveTheme: ternary(a.settings.DarkMode, "dark", "light"),
		AvatarURL:      a.sessionAvatar,
	}
	if a.user == nil || a.user.SID == "" {
		if info.AvatarURL == "" {
			info.AvatarURL = apputils.DefaultAvatarURL
		}
		return info
	}
	info.HasSession = true
	info.Username = a.user.Username
	info.IsGuest = strings.EqualFold(a.user.Username, "guest")
	info.RatingsMask = a.user.Ratings.String()
	if info.AvatarURL == "" || info.IsGuest {
		info.AvatarURL = apputils.DefaultAvatarURL
	}
	return info
}

func (a *App) Login(username, password string) (types.SessionInfo, error) {
	user, err := inkbunny.Login(strings.TrimSpace(username), password)
	if err != nil {
		return types.SessionInfo{}, err
	}
	a.setSession(user)
	return a.GetSession(), nil
}

func (a *App) EnsureGuestSession() (types.SessionInfo, error) {
	guest, err := inkbunny.Login("guest", "")
	if err != nil {
		return types.SessionInfo{}, err
	}
	if guest == nil {
		return types.SessionInfo{}, errors.New("guest session unavailable")
	}
	a.setSession(guest)
	return a.GetSession(), nil
}

func (a *App) Logout() (types.SessionInfo, error) {
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

func (a *App) UpdateRatings(mask string) (types.SessionInfo, error) {
	user, err := a.ensureSearchSession()
	if err != nil {
		return types.SessionInfo{}, err
	}
	ratings := inkbunny.ParseMask(strings.TrimSpace(mask))

	_, err = apputils.ExecuteWithRateLimitRetry(a.ctx, a.rateLimiter, "ratings", func() (struct{}, error) {
		return struct{}{}, user.ChangeRatings(ratings)
	})
	if err != nil {
		if a.handleSessionError(err) {
			return types.SessionInfo{}, err
		}
		return types.SessionInfo{}, err
	}

	a.mu.Lock()
	if a.user != nil && a.user.SID == user.SID {
		a.user.Ratings = user.Ratings
	}
	a.searches = make(map[string]*searchState)
	a.lastSearchID = ""
	a.mu.Unlock()
	a.resetCaches(user)
	return a.GetSession(), a.persist()
}

func (a *App) UpdateSettings(settings types.AppSettings) (types.AppSettings, error) {
	a.mu.Lock()
	if settings.DownloadDirectory != "" {
		a.settings.DownloadDirectory = settings.DownloadDirectory
	}
	a.settings.DownloadPattern = downloads.NormalizePattern(settings.DownloadPattern)
	if settings.MaxActive > 0 {
		a.settings.MaxActive = apputils.NormalizeMaxActive(settings.MaxActive)
	}
	a.settings.DarkMode = settings.DarkMode
	a.settings.MotionEnabled = settings.MotionEnabled
	a.settings.AutoClearCompleted = settings.AutoClearCompleted
	a.settings.SkippedReleaseTag = info.NormalizeReleaseTag(settings.SkippedReleaseTag)
	a.settings.HasLoggedInBefore = a.settings.HasLoggedInBefore || settings.HasLoggedInBefore
	current := a.settings
	a.mu.Unlock()

	if a.downloadManager != nil {
		a.downloadManager.SetMaxActive(current.MaxActive)
	}
	return current, a.persist()
}

func (a *App) GetWorkspaceState() types.WorkspaceState {
	a.mu.RLock()
	defer a.mu.RUnlock()

	return a.workspace
}

func (a *App) SaveWorkspaceState(workspace types.WorkspaceState) error {
	a.mu.Lock()
	a.workspace = workspace
	a.mu.Unlock()
	return a.persist()
}

func (a *App) PickDownloadDirectory() (string, error) {
	if a.ctx == nil {
		return "", errors.New("application context not ready")
	}
	a.mu.RLock()
	defaultDirectory := storage.ResolveDownloadPickerDirectory(a.settings.DownloadDirectory)
	a.mu.RUnlock()
	selected, err := wruntime.OpenDirectoryDialog(a.ctx, wruntime.OpenDialogOptions{
		Title:            "Choose a download folder",
		DefaultDirectory: defaultDirectory,
	})
	if err != nil || selected == "" {
		return "", err
	}
	_, updateErr := a.UpdateSettings(types.AppSettings{
		DownloadDirectory:  selected,
		DownloadPattern:    a.settings.DownloadPattern,
		MaxActive:          a.settings.MaxActive,
		DarkMode:           a.settings.DarkMode,
		MotionEnabled:      a.settings.MotionEnabled,
		AutoClearCompleted: a.settings.AutoClearCompleted,
		SkippedReleaseTag:  a.settings.SkippedReleaseTag,
		HasLoggedInBefore:  a.settings.HasLoggedInBefore,
	})
	return selected, updateErr
}

func (a *App) GetQueueSnapshot() types.QueueSnapshot {
	if a.downloadManager == nil {
		return types.QueueSnapshot{}
	}
	return a.downloadManager.Snapshot()
}

func (a *App) CancelDownload(jobID string) types.QueueSnapshot {
	if a.downloadManager == nil {
		return types.QueueSnapshot{}
	}
	return a.downloadManager.Cancel(jobID)
}

func (a *App) CancelSubmission(submissionID string) types.QueueSnapshot {
	if a.downloadManager == nil {
		return types.QueueSnapshot{}
	}
	return a.downloadManager.CancelSubmission(submissionID)
}

func (a *App) RetryDownload(jobID string) types.QueueSnapshot {
	if a.downloadManager == nil {
		return types.QueueSnapshot{}
	}
	return a.downloadManager.Retry(jobID)
}

func (a *App) RetrySubmission(submissionID string) types.QueueSnapshot {
	if a.downloadManager == nil {
		return types.QueueSnapshot{}
	}
	return a.downloadManager.RetrySubmission(submissionID)
}

func (a *App) RetryAllDownloads() types.QueueSnapshot {
	if a.downloadManager == nil {
		return types.QueueSnapshot{}
	}
	return a.downloadManager.RetryAll()
}

func (a *App) PauseAllDownloads() types.QueueSnapshot {
	if a.downloadManager == nil {
		return types.QueueSnapshot{}
	}
	return a.downloadManager.PauseAll()
}

func (a *App) ResumeAllDownloads() types.QueueSnapshot {
	if a.downloadManager == nil {
		return types.QueueSnapshot{}
	}
	return a.downloadManager.ResumeAll()
}

func (a *App) StopAllDownloads() types.QueueSnapshot {
	if a.downloadManager == nil {
		return types.QueueSnapshot{}
	}
	return a.downloadManager.CancelAll()
}

func (a *App) ClearQueue() types.QueueSnapshot {
	if a.downloadManager == nil {
		return types.QueueSnapshot{}
	}
	return a.downloadManager.Clear()
}

func (a *App) ClearCompletedDownloads() types.QueueSnapshot {
	if a.downloadManager == nil {
		return types.QueueSnapshot{}
	}
	return a.downloadManager.ClearCompleted()
}

func (a *App) ClearCompletedSubmissions(submissionIDs []string) types.QueueSnapshot {
	if a.downloadManager == nil {
		return types.QueueSnapshot{}
	}
	return a.downloadManager.ClearCompletedSubmissions(submissionIDs)
}

func (a *App) EnqueueDownloads(searchID string, selection types.DownloadSelection, options types.DownloadOptions) (types.QueueSnapshot, error) {
	user, err := a.ensureSearchSession()
	if err != nil {
		return types.QueueSnapshot{}, err
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

	details, err := a.cachedSubmissionDetailsBatched(user, submissionIDs)
	if err != nil {
		if a.handleSessionError(err) {
			user, err = a.ensureSearchSession()
			if err != nil {
				return types.QueueSnapshot{}, err
			}
			details, err = a.cachedSubmissionDetailsBatched(user, submissionIDs)
		}
	}
	if err != nil {
		return types.QueueSnapshot{}, err
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
	downloadPattern := downloads.NormalizePattern(options.DownloadPattern)
	if strings.TrimSpace(downloadPattern) == "" {
		downloadPattern = a.GetSession().Settings.DownloadPattern
	}
	if err := os.MkdirAll(downloadRoot, 0o755); err != nil {
		return types.QueueSnapshot{}, err
	}

	tasks := make([]downloads.Task, 0)
	for _, submission := range details.Submissions {
		keywords := joinKeywords(submission.Keywords)
		allowed := selectedFiles[submission.SubmissionID.String()]
		for _, file := range submission.Files {
			if len(allowed) > 0 {
				if _, ok := allowed[file.FileID.String()]; !ok {
					continue
				}
			}
			tasks = append(tasks, downloads.Task{
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
				PreviewURL:   submissionResourceURL(file.FileURLPreview.String(), user.SID, submission.Public.Bool()),
				SaveKeywords: saveKeywords,
				DownloadRoot: downloadRoot,
				Destinations: downloads.ResolveDestinations(downloadRoot, downloadPattern, submission, file),
			})
		}
	}

	_, _ = a.UpdateSettings(types.AppSettings{
		DownloadDirectory:  downloadRoot,
		DownloadPattern:    downloadPattern,
		MaxActive:          maxActive,
		DarkMode:           a.settings.DarkMode,
		MotionEnabled:      a.settings.MotionEnabled,
		AutoClearCompleted: a.settings.AutoClearCompleted,
		SkippedReleaseTag:  a.settings.SkippedReleaseTag,
		HasLoggedInBefore:  a.settings.HasLoggedInBefore,
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
	a.sessionAvatar = apputils.DefaultAvatarURL
	if user != nil && user.SID != "" {
		a.settings.HasLoggedInBefore = true
	}
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
	a.sessionAvatar = apputils.DefaultAvatarURL
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
	return a.store.Save(types.StoredState{
		Session: types.SessionInfo{
			HasSession:     a.user != nil && a.user.SID != "",
			Username:       usernameOf(a.user),
			IsGuest:        strings.EqualFold(usernameOf(a.user), "guest"),
			AvatarURL:      a.sessionAvatar,
			RatingsMask:    ratingsOf(a.user),
			Settings:       a.settings,
			LastSearchID:   a.lastSearchID,
			EffectiveTheme: ternary(a.settings.DarkMode, "dark", "light"),
		},
		User:      storage.ToStoredUser(a.user),
		Settings:  a.settings,
		Workspace: a.workspace,
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
		a.sessionAvatar = apputils.DefaultAvatarURL
		a.mu.Unlock()
		return
	}
	a.ensureCaches(user)
	avatar, err := a.avatarCache.Get(avatarCacheKey{
		Scope:    sessionScope(user),
		Username: normalizeUsername(user.Username),
	})
	if err != nil || avatar == "" {
		avatar = apputils.DefaultAvatarURL
	}
	a.mu.Lock()
	if a.user != nil && a.user.SID == user.SID {
		a.sessionAvatar = avatar
	}
	a.mu.Unlock()
}

func (a *App) cachedSubmissionDetails(user *inkbunny.User, submissionIDs []string) (inkbunny.SubmissionDetailsResponse, error) {
	return a.cachedSubmissionDetailsWithContext(context.Background(), user, submissionIDs)
}

func (a *App) cachedSubmissionDetailsWithContext(
	ctx context.Context,
	user *inkbunny.User,
	submissionIDs []string,
) (inkbunny.SubmissionDetailsResponse, error) {
	ids := normalizeSubmissionIDs(submissionIDs)
	response := inkbunny.SubmissionDetailsResponse{}
	sid := ""
	if user != nil {
		sid = user.SID
		response.SID = user.SID
	}
	if len(ids) == 0 {
		return response, nil
	}

	a.ensureCaches(user)
	response.Submissions = make([]inkbunny.SubmissionDetails, 0, len(ids))
	for _, id := range ids {
		detail, err := a.detailsCache.GetWithContext(ctx, submissionDetailsCacheKey{
			SID:          sid,
			SubmissionID: id,
		})
		if err != nil {
			return inkbunny.SubmissionDetailsResponse{}, err
		}
		response.Submissions = append(response.Submissions, detail)
	}
	response.ResultsCount = inkbunny.IntString(len(response.Submissions))
	return response, nil
}

func (a *App) cachedSubmissionDetailsBatched(user *inkbunny.User, submissionIDs []string) (inkbunny.SubmissionDetailsResponse, error) {
	return a.cachedSubmissionDetailsBatchedWithContext(context.Background(), user, submissionIDs)
}

func (a *App) cachedSubmissionDetailsBatchedWithContext(
	ctx context.Context,
	user *inkbunny.User,
	submissionIDs []string,
) (inkbunny.SubmissionDetailsResponse, error) {
	ids := normalizeSubmissionIDs(submissionIDs)
	response := inkbunny.SubmissionDetailsResponse{}
	sid := ""
	if user != nil {
		sid = user.SID
		response.SID = user.SID
	}
	if len(ids) == 0 {
		return response, nil
	}

	a.ensureCaches(user)

	detailsByID := make(map[string]inkbunny.SubmissionDetails, len(ids))
	missingIDs := make([]string, 0, len(ids))
	for _, id := range ids {
		detail, ok := a.detailsCache.Peek(submissionDetailsCacheKey{
			SID:          sid,
			SubmissionID: id,
		})
		if ok {
			detailsByID[id] = detail
			continue
		}
		missingIDs = append(missingIDs, id)
	}

	for start := 0; start < len(missingIDs); start += submissionDetailsBatchSize {
		end := start + submissionDetailsBatchSize
		if end > len(missingIDs) {
			end = len(missingIDs)
		}
		batchIDs := missingIDs[start:end]
		batch, err := a.fetchSubmissionDetailsBatch(ctx, user, batchIDs)
		if err != nil {
			return inkbunny.SubmissionDetailsResponse{}, err
		}
		if response.SID == "" {
			response.SID = batch.SID
		}
		if response.UserLocation == "" {
			response.UserLocation = batch.UserLocation
		}
		for _, submission := range batch.Submissions {
			id := submission.SubmissionID.String()
			detailsByID[id] = submission
			a.detailsCache.Store(submissionDetailsCacheKey{
				SID:          sid,
				SubmissionID: id,
			}, submission)
		}
	}

	response.Submissions = make([]inkbunny.SubmissionDetails, 0, len(detailsByID))
	for _, id := range ids {
		submission, ok := detailsByID[id]
		if !ok {
			continue
		}
		response.Submissions = append(response.Submissions, submission)
	}
	response.ResultsCount = inkbunny.IntString(len(response.Submissions))
	return response, nil
}

func (a *App) fetchSubmissionDetailsBatch(
	ctx context.Context,
	user *inkbunny.User,
	submissionIDs []string,
) (inkbunny.SubmissionDetailsResponse, error) {
	if len(submissionIDs) == 0 {
		return inkbunny.SubmissionDetailsResponse{}, nil
	}

	return apputils.ExecuteWithRateLimitRetry(ctx, a.rateLimiter, "submission details", func() (inkbunny.SubmissionDetailsResponse, error) {
		current, err := a.ensureSearchSession()
		if err != nil {
			return inkbunny.SubmissionDetailsResponse{}, err
		}
		sid := current.SID
		if user != nil && strings.TrimSpace(user.SID) != "" {
			sid = user.SID
		}
		return current.SubmissionDetails(inkbunny.SubmissionDetailsRequest{
			SID:                         sid,
			SubmissionIDSlice:           submissionIDs,
			ShowDescription:             inkbunny.Yes,
			ShowDescriptionBbcodeParsed: inkbunny.Yes,
			ShowWriting:                 inkbunny.Yes,
			ShowWritingBbcodeParsed:     inkbunny.Yes,
			ShowPools:                   inkbunny.Yes,
		})
	})
}

func normalizeSubmissionIDs(submissionIDs []string) []string {
	seen := make(map[string]struct{}, len(submissionIDs))
	normalized := make([]string, 0, len(submissionIDs))
	for _, submissionID := range submissionIDs {
		id := strings.TrimSpace(submissionID)
		if id == "" {
			continue
		}
		if _, ok := seen[id]; ok {
			continue
		}
		seen[id] = struct{}{}
		normalized = append(normalized, id)
	}
	return normalized
}

func ternary[T any](condition bool, truthy, falsy T) T {
	if condition {
		return truthy
	}
	return falsy
}
