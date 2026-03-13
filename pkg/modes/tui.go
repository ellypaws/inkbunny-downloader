package modes

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"

	tea "charm.land/bubbletea/v2"
	spinnerModel "github.com/charmbracelet/bubbles/spinner"
	"github.com/charmbracelet/huh"
	"github.com/charmbracelet/huh/spinner"
	"github.com/charmbracelet/log"

	"github.com/ellypaws/inkbunny"

	appdownloads "github.com/ellypaws/inkbunny/cmd/downloader/pkg/app/downloads"
	appinfo "github.com/ellypaws/inkbunny/cmd/downloader/pkg/app/info"
	appstorage "github.com/ellypaws/inkbunny/cmd/downloader/pkg/app/storage"
	apptypes "github.com/ellypaws/inkbunny/cmd/downloader/pkg/app/types"
	"github.com/ellypaws/inkbunny/cmd/downloader/pkg/flags"
	"github.com/ellypaws/inkbunny/cmd/downloader/pkg/flight"
	uitui "github.com/ellypaws/inkbunny/cmd/downloader/pkg/tui"
)

func RunTUI(config flags.Config) {
	var (
		request         inkbunny.SubmissionSearchRequest
		searchIn        []int
		favBy           string
		maxDownloads    string
		maxActiveStr    string
		downloadDir     string
		downloadPath    string
		artistFilters   []string
		favoriteFilters []string

		toDownload      int
		downloadCaption bool
		searches        []inkbunny.SubmissionSearchResponse
		releaseStatus   apptypes.ReleaseStatus
	)

	skippedReleaseTag := loadSkippedReleaseTag()
	if !config.NoTUI {
		spinner.New().
			Title("Checking for updates...").
			Action(func() {
				releaseStatus = appinfo.GetReleaseStatus()
			}).Run()
	}
	showLoginReleaseNotice := shouldShowReleaseNotice(releaseStatus, skippedReleaseTag)
	showSearchReleaseNotice := showLoginReleaseNotice

Login:
	if showLoginReleaseNotice && needsInteractiveLogin(config) {
		action, promptErr := promptReleaseUpdate(releaseStatus)
		if promptErr != nil {
			if errors.Is(promptErr, errLoginPromptAborted) {
				log.Info("Login aborted by user")
				return
			}
			log.Warn("failed to show update notice", "err", promptErr)
		} else {
			if action == releasePromptDefer {
				if err := saveSkippedReleaseTag(releaseStatus.LatestTag); err != nil {
					log.Warn("failed to save skipped release tag", "err", err)
				} else {
					skippedReleaseTag = releaseStatus.LatestTag
					showSearchReleaseNotice = false
				}
			}
			showLoginReleaseNotice = false
		}
	}
	user, source, persistSession, err := authenticateUser(config, true)
	if err != nil {
		if errors.Is(err, errLoginPromptAborted) {
			log.Info("Login aborted by user")
			return
		}
		log.Error("Failed to login", "err", err)
		goto Login
	}
	if persistSession {
		if err := saveSession(user); err != nil {
			log.Warn("failed to save session", "err", err)
		}
	}
	logAuthenticatedUser(user, source)

	cleanup := prepareGuestSession(user, true)
	defer cleanup()

	usernameCache := flight.NewCache(func(_ context.Context, query string) ([]inkbunny.Autocomplete, error) {
		return user.SearchMembers(query)
	})
	keywordSuggestionsCache := flight.NewCache(func(_ context.Context, query string) ([]inkbunny.KeywordAutocomplete, error) {
		return keywordCache(user.Ratings)(query)
	})
	canUseUnread := user != nil && user.SID != "" && !strings.EqualFold(user.Username, "guest")
	unreadCount := 0
	canUseWatching := user != nil && user.SID != "" && !strings.EqualFold(user.Username, "guest")
	watchingUsers := []string(nil)
	if canUseUnread {
		spinner.New().
			Title("Checking unread submissions...").
			Action(func() {
				unreadCount, err = fetchUnreadSubmissionCount(user)
			}).Run()
		if err != nil {
			log.Warn("failed to fetch unread submissions", "err", err)
			unreadCount = 0
		}
	}
	if canUseWatching {
		spinner.New().
			Title("Loading watch list...").
			Action(func() {
				watchingUsers, err = fetchWatchingUsers(user)
			}).Run()
		if err != nil {
			log.Warn("failed to load watch list", "err", err)
			watchingUsers = nil
		}
	}
	model := uitui.NewModel(
		user,
		user.Username,
		unreadCount,
		canUseUnread,
		canUseWatching,
		watchingUsers,
		releaseStatus,
		showSearchReleaseNotice,
		appstorage.DefaultDownloadDirectory(),
		appdownloads.DefaultPattern,
		&keywordSuggestionsCache,
		&usernameCache,
	)

	var (
		p          *tea.Program
		rawModel   tea.Model
		finalModel *uitui.Model
		ok         bool
	)
Search:
	if config.NoTUI {
		config.ApplyTo(&request, &searchIn, &favBy, &maxDownloads, &maxActiveStr, &downloadCaption)
		goto Process
	}

	p = tea.NewProgram(model)
	rawModel, err = p.Run()
	if err != nil {
		log.Fatal(err)
	}

	finalModel, ok = rawModel.(*uitui.Model)
	if !ok {
		log.Fatal("Could not cast model")
	}
	if finalModel.SkippedReleaseTag != "" {
		if err := saveSkippedReleaseTag(finalModel.SkippedReleaseTag); err != nil {
			log.Warn("failed to save skipped release tag", "err", err)
		} else {
			skippedReleaseTag = finalModel.SkippedReleaseTag
			showSearchReleaseNotice = false
			showLoginReleaseNotice = false
		}
	}
	if finalModel.UpdateNoticeDismissed {
		showSearchReleaseNotice = false
	}

	if finalModel.NeedsLogin {
		_ = os.Remove(sidFile)
		goto Login
	}

	if finalModel.Aborted {
		log.Info("Search aborted by user")
		return
	}

	request.Text = finalModel.SearchWords.Value()
	artistFilters = finalModel.ArtistFilters()
	favoriteFilters = finalModel.FavoriteFilters()

	request.StringJoinType = finalModel.StringJoinType
	request.DaysLimit = finalModel.TimeRange()
	request.Type = finalModel.SubmissionType()
	request.PoolID = finalModel.PoolIDValue()
	request.Scraps = finalModel.Scraps()
	request.OrderBy = finalModel.OrderBy()
	request.UnreadSubmissions = inkbunny.No
	maxDownloads = finalModel.MaxDownloads.Value()
	maxActiveStr = finalModel.MaxActive.Value()
	downloadDir = finalModel.DownloadDirectoryValue()
	downloadPath = finalModel.DownloadPatternValue()
	downloadCaption = finalModel.DownloadCaption
	if finalModel.UnreadMode {
		request.UnreadSubmissions = inkbunny.Yes
	}

	searchIn = nil
	if finalModel.SearchInKeywords {
		searchIn = append(searchIn, flags.Keywords)
	}
	if finalModel.SearchInTitle {
		searchIn = append(searchIn, flags.Title)
	}
	if finalModel.SearchInDesc {
		searchIn = append(searchIn, flags.Description)
	}
	if finalModel.SearchInMD5 {
		searchIn = append(searchIn, flags.MD5)
	}

Process:
	request.SearchInKeywords = nil
	request.Title = nil
	request.Description = nil
	request.MD5 = nil

	for _, v := range searchIn {
		switch v {
		case flags.Keywords:
			request.SearchInKeywords = &inkbunny.Yes
		case flags.Title:
			request.Title = &inkbunny.Yes
		case flags.Description:
			request.Description = &inkbunny.Yes
		case flags.MD5:
			request.MD5 = &inkbunny.Yes
		}
	}

	if maxDownloads != "" {
		toDownload, err = strconv.Atoi(maxDownloads)
		if err != nil {
			log.Fatal(err)
		}
	}
	downloadDir = strings.TrimSpace(downloadDir)
	if downloadDir == "" {
		downloadDir = appstorage.DefaultDownloadDirectory()
	}
	downloadDir = filepath.Clean(downloadDir)
	downloadPath = appdownloads.NormalizePattern(downloadPath)

	request.GetRID = inkbunny.Yes
	if finalModel == nil {
		if trimmed := strings.TrimSpace(request.Username); trimmed != "" {
			artistFilters = []string{trimmed}
		}
		if trimmed := strings.TrimSpace(favBy); trimmed != "" {
			favoriteFilters = []string{trimmed}
		}
	}
	request.Username = ""
	request.UserID = 0
	request.FavsUserID = 0

	if finalModel != nil {
		if finalModel.UseWatchingArtist && len(artistFilters) == 0 {
			log.Warn("your watch list is empty, so artist My watches cannot be used")
			goto Search
		}
	}

	requests, err := buildSearchRequests(request, artistFilters, favoriteFilters, &usernameCache)
	if err != nil {
		log.Error("failed to build search requests", "err", err)
		goto Search
	}

	spinner.New().
		Title("Searching...").
		Action(func() {
			searches = searches[:0]
			for _, req := range requests {
				search, searchErr := user.SearchSubmissions(req)
				if searchErr != nil {
					err = searchErr
					return
				}
				searches = append(searches, search)
			}
		}).Run()
	if err != nil {
		if err, ok := errors.AsType[inkbunny.ErrorResponse](err); ok && err.Code != nil && *err.Code == inkbunny.ErrInvalidSessionID {
			invalidateAuthSource(&config, source)
			log.Warn("Session expired, please login again")
			goto Login
		}
		log.Fatal("failed to search submissions", "err", err)
	}
	log.Infof("Search requests executed: %d", len(searches))
	if toDownload > 0 {
		log.Infof("To download: %d", toDownload)
	} else {
		log.Info("To download: Unlimited")
	}

	var items []*uitui.DownloadItem
	gather := spinner.New().Title("Gathering files to download...")

	var (
		pageCount       int
		submissionCount int
		fileCount       int
	)
	gather.Action(func() {
		seenSubmissions := make(map[string]struct{})
		seenFiles := make(map[string]struct{})
		for _, search := range searches {
			for page, pageErr := range search.AllPages() {
				if pageErr != nil {
					log.Error("Failed to search pages", "err", pageErr)
					break
				}
				details, detailsErr := page.Details()
				if detailsErr != nil {
					log.Error("Failed to get submission details", "err", detailsErr)
					continue
				}
				pageCount++

				for _, d := range details.Submissions {
					submissionID := d.SubmissionID.String()
					if _, ok := seenSubmissions[submissionID]; !ok {
						seenSubmissions[submissionID] = struct{}{}
						submissionCount++
					}
					gather.Title("Gathering files to download...\n[" + strconv.Itoa(pageCount) + " pages]\n[" + strconv.Itoa(submissionCount) + " submissions]\n[" + strconv.Itoa(fileCount) + " files]")

					var keywords strings.Builder
					for i, keyword := range d.Keywords {
						if i > 0 {
							keywords.WriteString(", ")
						}
						keywords.WriteString(keyword.KeywordName)
					}

					for _, file := range d.Files {
						key := submissionID + ":" + file.FileID.String()
						if _, ok := seenFiles[key]; ok {
							continue
						}
						if toDownload > 0 && len(items) >= toDownload {
							break
						}
						seenFiles[key] = struct{}{}
						fileCount++
						gather.Title("Gathering files to download...\n[" + strconv.Itoa(pageCount) + " pages]\n[" + strconv.Itoa(submissionCount) + " submissions]\n[" + strconv.Itoa(fileCount) + " files]")

						items = append(items, &uitui.DownloadItem{
							SubmissionID: submissionID,
							Title:        d.Title,
							URL:          file.FileURLFull.String(),
							Username:     d.Username,
							FileName:     filepath.Base(file.FileName),
							FileMD5:      file.FullFileMD5,
							IsPublic:     d.Public.Bool(),
							Keywords:     keywords.String(),
							DownloadRoot: downloadDir,
							Destinations: appdownloads.ResolveDestinations(downloadDir, downloadPath, d, file),
							Spinner:      spinnerModel.New(spinnerModel.WithSpinner(spinnerModel.Dot)),
							Status:       uitui.StatusQueued,
						})
					}
					if toDownload > 0 && len(items) >= toDownload {
						break
					}
				}
				if toDownload > 0 && len(items) >= toDownload {
					break
				}
			}
			if toDownload > 0 && len(items) >= toDownload {
				break
			}
		}
	}).Run()

	if len(items) == 0 {
		log.Info("No files to download.")
	} else {
		maxActive := min(max(1, runtime.NumCPU()/6), 6)
		if maxActiveStr != "" {
			if parsed, err := strconv.Atoi(maxActiveStr); err == nil && parsed > 0 {
				maxActive = parsed
			}
		}
		downloadModel := uitui.NewDownloadModel(user, items, maxActive, toDownload, downloadCaption)
		p := tea.NewProgram(downloadModel)
		if _, err := p.Run(); err != nil {
			log.Error("Failed to run downloader TUI", "err", err)
		}
	}

	if config.NoTUI {
		return
	}

	var exit bool
	huh.NewForm(huh.NewGroup(huh.NewConfirm().
		Title("Do you want to restart?").
		Affirmative("Exit").
		Negative("Restart").
		Value(&exit),
	),
	).Run()

	if !exit {
		goto Search
	}
}

func fetchUnreadSubmissionCount(user *inkbunny.User) (int, error) {
	if user == nil || user.SID == "" {
		return 0, nil
	}

	response, err := user.SearchSubmissions(inkbunny.SubmissionSearchRequest{
		SID:                user.SID,
		UnreadSubmissions:  inkbunny.Yes,
		NoSubmissions:      inkbunny.Yes,
		SubmissionsPerPage: 1,
		Page:               1,
	})
	if err != nil {
		return 0, err
	}

	return int(response.ResultsCountAll), nil
}

func fetchWatchingUsers(user *inkbunny.User) ([]string, error) {
	if user == nil || user.SID == "" {
		return nil, nil
	}

	items, err := user.GetWatching()
	if err != nil {
		return nil, err
	}

	seen := make(map[string]struct{}, len(items))
	users := make([]string, 0, len(items))
	for _, item := range items {
		name := strings.TrimSpace(item.Username)
		if name == "" {
			continue
		}
		key := strings.ToLower(name)
		if _, ok := seen[key]; ok {
			continue
		}
		seen[key] = struct{}{}
		users = append(users, name)
	}

	return users, nil
}

func buildSearchRequests(
	base inkbunny.SubmissionSearchRequest,
	artistFilters []string,
	favoriteFilters []string,
	usernameCache *flight.Cache[string, []inkbunny.Autocomplete],
) ([]inkbunny.SubmissionSearchRequest, error) {
	artists := artistFilters
	if len(artists) == 0 {
		artists = []string{""}
	}
	favorites := favoriteFilters
	if len(favorites) == 0 {
		favorites = []string{""}
	}

	seen := make(map[string]struct{}, len(artists)*len(favorites))
	requests := make([]inkbunny.SubmissionSearchRequest, 0, len(artists)*len(favorites))
	for _, artist := range artists {
		for _, favorite := range favorites {
			key := strings.ToLower(strings.TrimSpace(artist)) + "|" + strings.ToLower(strings.TrimSpace(favorite))
			if _, ok := seen[key]; ok {
				continue
			}
			seen[key] = struct{}{}

			req := base
			req.Username = strings.TrimSpace(artist)
			req.UserID = 0
			req.FavsUserID = 0

			if req.Username != "" && usernameCache != nil {
				suggestions, _ := usernameCache.Get(req.Username)
				for _, suggestion := range suggestions {
					if strings.EqualFold(suggestion.Value, req.Username) || strings.EqualFold(suggestion.SingleWord, req.Username) {
						req.UserID = suggestion.ID
						break
					}
				}
			}

			favorite = strings.TrimSpace(favorite)
			if favorite != "" && usernameCache != nil {
				suggestions, _ := usernameCache.Get(favorite)
				for _, suggestion := range suggestions {
					if strings.EqualFold(suggestion.Value, favorite) || strings.EqualFold(suggestion.SingleWord, favorite) {
						req.FavsUserID = suggestion.ID
						break
					}
				}
			}

			requests = append(requests, req)
		}
	}

	if len(requests) == 0 {
		return []inkbunny.SubmissionSearchRequest{base}, nil
	}
	return requests, nil
}
