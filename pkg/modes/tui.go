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

	"github.com/ellypaws/inkbunny/cmd/downloader/pkg/flags"
	"github.com/ellypaws/inkbunny/cmd/downloader/pkg/flight"
	uitui "github.com/ellypaws/inkbunny/cmd/downloader/pkg/tui"
)

func RunTUI(config flags.Config) {
	var (
		request      inkbunny.SubmissionSearchRequest
		searchIn     []int
		favBy        string
		maxDownloads string
		maxActiveStr string

		toDownload      int
		downloadCaption bool
		search          inkbunny.SubmissionSearchResponse
	)

Login:
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
	model := uitui.NewModel(user, user.Username, &keywordSuggestionsCache, &usernameCache)

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

	if finalModel.NeedsLogin {
		_ = os.Remove(sidFile)
		goto Login
	}

	if finalModel.Aborted {
		log.Info("Search aborted by user")
		return
	}

	request.Text = finalModel.SearchWords.Value()
	request.Username = finalModel.ArtistName.Value()
	favBy = finalModel.FavBy.Value()

	request.StringJoinType = finalModel.StringJoinType
	request.DaysLimit = finalModel.TimeRange()
	request.Type = finalModel.SubmissionType()
	request.OrderBy = finalModel.OrderBy()
	maxDownloads = finalModel.MaxDownloads.Value()
	maxActiveStr = finalModel.MaxActive.Value()
	downloadCaption = finalModel.DownloadCaption

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

	if favBy != "" {
		suggestions, _ := usernameCache.Get(favBy)
		for _, v := range suggestions {
			if v.SingleWord == favBy {
				request.FavsUserID = v.ID
			}
		}
	}

	if maxDownloads != "" {
		toDownload, err = strconv.Atoi(maxDownloads)
		if err != nil {
			log.Fatal(err)
		}
	}

	request.GetRID = inkbunny.Yes

	if request.Username != "" {
		suggestions, _ := usernameCache.Get(request.Username)
		for _, v := range suggestions {
			if strings.EqualFold(v.Value, request.Username) {
				request.UserID = v.ID
				break
			}
		}
	}

	spinner.New().
		Title("Searching...").
		Action(func() {
			search, err = user.SearchSubmissions(request)
		}).Run()
	if err != nil {
		if err, ok := errors.AsType[inkbunny.ErrorResponse](err); ok && err.Code != nil && *err.Code == inkbunny.ErrInvalidSessionID {
			invalidateAuthSource(&config, source)
			log.Warn("Session expired, please login again")
			goto Login
		}
		log.Fatal("failed to search submissions", "err", err)
	}
	log.Infof("Total number of submissions: %d", search.ResultsCountAll)
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
		for page, err := range search.AllPages() {
			if err != nil {
				log.Error("Failed to search pages", "err", err)
				break
			}
			details, err := page.Details()
			if err != nil {
				log.Error("Failed to get submission details", "err", err)
				continue
			}

			for _, d := range details.Submissions {
				if toDownload > 0 && len(items) >= toDownload {
					break
				}
				submissionCount++
				gather.Title("Gathering files to download...\n[" + strconv.Itoa(pageCount) + " pages]\n[" + strconv.Itoa(submissionCount) + " submissions]\n[" + strconv.Itoa(fileCount) + " files]")

				var keywords strings.Builder
				for i, keyword := range d.Keywords {
					if i > 0 {
						keywords.WriteString(", ")
					}
					keywords.WriteString(keyword.KeywordName)
				}

				for _, file := range d.Files {
					if toDownload > 0 && len(items) >= toDownload {
						break
					}
					fileCount++
					gather.Title("Gathering files to download...\n[" + strconv.Itoa(pageCount) + " pages]\n[" + strconv.Itoa(submissionCount) + " submissions]\n[" + strconv.Itoa(fileCount) + " files]")

					items = append(items, &uitui.DownloadItem{
						SubmissionID: d.SubmissionID.String(),
						Title:        d.Title,
						URL:          file.FileURLFull.String(),
						Username:     d.Username,
						FileName:     filepath.Base(file.FileName),
						FileMD5:      file.FullFileMD5,
						IsPublic:     d.Public.Bool(),
						Keywords:     keywords.String(),
						Spinner:      spinnerModel.New(spinnerModel.WithSpinner(spinnerModel.Dot)),
						Status:       uitui.StatusQueued,
					})
				}
			}
			if toDownload > 0 && len(items) >= toDownload {
				break
			}
			pageCount++
			gather.Title("Gathering files to download...\n[" + strconv.Itoa(pageCount) + " pages]\n[" + strconv.Itoa(submissionCount) + " submissions]\n[" + strconv.Itoa(fileCount) + " files]")
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
