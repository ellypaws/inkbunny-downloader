package main

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"net/http"
	"os"
	"path/filepath"
	"runtime"
	"slices"
	"strconv"
	"strings"
	"sync/atomic"
	"time"

	tea "charm.land/bubbletea/v2"
	"github.com/charmbracelet/huh"
	"github.com/charmbracelet/huh/spinner"
	"github.com/charmbracelet/log"
	"github.com/muesli/termenv"

	"github.com/ellypaws/inkbunny"
	"github.com/ellypaws/inkbunny/cmd/downloader/pkg/flight"
	"github.com/ellypaws/inkbunny/cmd/downloader/pkg/tui"
	"github.com/ellypaws/inkbunny/cmd/downloader/pkg/utils"
)

const (
	Keywords int = 1 << iota
	Title
	Description
	MD5
)

func main() {
	defer utils.LogOutput(os.Stdout)()
	log.SetLevel(log.DebugLevel)
	log.SetReportTimestamp(true)
	log.SetColorProfile(termenv.TrueColor)
	var (
		request      inkbunny.SubmissionSearchRequest
		searchIn     []int
		favBy        string
		maxDownloads string

		toDownload      int
		downloadCaption bool = true
		downloaded      atomic.Int64
		search          inkbunny.SubmissionSearchResponse
	)

Login:
	user, err := loadSession()
	if err != nil {
		user, err = login()
		if err != nil {
			log.Error("Failed to login", "err", err)
			goto Login
		}

		_ = saveSession(user)
		log.Info("Logged in", "username", user.Username)
	} else {
		log.Info("Logged in as", "username", user.Username)
	}

	if strings.ToLower(user.Username) == "guest" {
		defer func() {
			var err error
			spinner.New().
				Title(fmt.Sprintf("Logging out %q...", user.Username)).
				Action(func() {
					err = user.Logout()
				}).Run()
			if err != nil {
				log.Fatal("failed to logout", "err", err)
			}
		}()
		if err := changeRatings(user); err != nil {
			log.Fatal("failed to change ratings", "err", err)
		}
	}
	usernameCache := flight.NewCache(user.SearchMembers)

Search:
	model := tui.NewModel(user)

	p := tea.NewProgram(model)
	rawModel, err := p.Run()
	if err != nil {
		log.Fatal(err)
	}

	finalModel, ok := rawModel.(tui.Model)
	if !ok {
		log.Fatal("Could not cast model")
	}

	request.Text = finalModel.SearchWords.Value()
	request.Username = finalModel.ArtistName.Value()
	favBy = finalModel.FavBy.Value()

	request.StringJoinType = finalModel.StringJoinType
	request.DaysLimit = finalModel.TimeRange()
	request.Type = finalModel.SubmissionType()
	request.OrderBy = finalModel.OrderBy()
	maxDownloads = finalModel.MaxDownloads.Value()
	downloadCaption = finalModel.DownloadCaption

	searchIn = nil
	if finalModel.SearchInKeywords {
		searchIn = append(searchIn, Keywords)
	}
	if finalModel.SearchInTitle {
		searchIn = append(searchIn, Title)
	}
	if finalModel.SearchInDesc {
		searchIn = append(searchIn, Description)
	}
	if finalModel.SearchInMD5 {
		searchIn = append(searchIn, MD5)
	}

	request.Keywords = nil
	request.Title = nil
	request.Description = nil
	request.MD5 = nil

	for _, v := range searchIn {
		switch v {
		case Keywords:
			request.Keywords = &inkbunny.Yes
		case Title:
			request.Title = &inkbunny.Yes
		case Description:
			request.Description = &inkbunny.Yes
		case MD5:
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
			if err := os.Remove(sidFile); err != nil {
				log.Warn("failed to remove session file", "err", err)
			}
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

	client := &http.Client{
		Timeout: 5 * time.Minute,
	}

	downloader := utils.NewWorkerPool(runtime.NumCPU(), func(details inkbunny.SubmissionDetails) error {
		numOfFiles := len(details.Files)
		if numOfFiles == 0 {
			return nil
		}

		var keywords bytes.Buffer
		for i, keyword := range details.Keywords {
			if i > 0 {
				keywords.WriteString(", ")
			}
			keywords.WriteString(keyword.KeywordName)
		}

		submissionURL := fmt.Sprintf("https://inkbunny.net/s/%d", details.SubmissionID)
		padding := digitCount(numOfFiles)
		log.Debug("Downloading submission", "url", submissionURL, "files", numOfFiles)
		for i, file := range details.Files {
			if toDownload > 0 && int(downloaded.Load()) >= toDownload {
				return nil
			}

			folder := filepath.Join("inkbunny", details.Username)
			filename := filepath.Join(folder, filepath.Base(file.FileName))
			if fileExists(filename) {
				continue
			}
			err := os.MkdirAll(folder, os.ModePerm)
			if err != nil {
				return err
			}
			f, err := os.Create(filename)
			if err != nil {
				return err
			}
			defer f.Close()

			var resp *http.Response
			for {
				if !details.Public.Bool() {
					resp, err = client.Get(file.FileURLFull.String() + "?sid=" + user.SID)
				} else {
					resp, err = client.Get(file.FileURLFull.String())
				}
				if err != nil {
					return err
				}

				if resp.StatusCode == http.StatusOK {
					break
				}

				if resp.StatusCode == http.StatusTooManyRequests {
					resp.Body.Close()
					log.Warn("Rate limited, waiting 5 seconds before retrying...")
					time.Sleep(5 * time.Second)
					continue
				}

				resp.Body.Close()
				return fmt.Errorf("unexpected status code: %d", resp.StatusCode)
			}

			_, err = io.Copy(f, resp.Body)
			if err != nil {
				return err
			}

			if downloadCaption && len(details.Keywords) > 0 {
				err := os.WriteFile(strings.TrimSuffix(filename, filepath.Ext(filename))+".txt", keywords.Bytes(), 0600)
				if err != nil {
					return err
				}
			}

			log.Debug(fmt.Sprintf("Downloaded file %0*d/%0*d", padding, i+1, padding, numOfFiles), "url", file.FileURLFull)
			downloaded.Add(1)
		}
		if downloadCaption && len(details.Keywords) <= 0 {
			log.Warn("There are no keywords on the submission", "url", submissionURL)
		}
		log.Info("Downloaded submission", "url", submissionURL, "files", numOfFiles)
		return nil
	})

	go func() {
		defer downloader.Close()
		for page, err := range search.AllPages() {
			if err != nil {
				log.Error("Failed to search submissions", "err", err)
			}
			details, err := page.Details()
			if err != nil {
				log.Error("Failed to get submission details", "err", err)
				continue
			}
			downloader.Add(details.Submissions...)
			if toDownload > 0 && int(downloaded.Load()) >= toDownload {
				return
			}
		}
	}()

	for err := range downloader.Work() {
		if err != nil {
			log.Error("Failed to download submissions", "err", err)
		}
	}

	log.Infof("Downloaded %d files", downloaded.Load())

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

const sidFile = "sid.txt"

func loadSession() (*inkbunny.User, error) {
	if !fileExists(sidFile) {
		return nil, errors.New("no session file")
	}

	file, err := os.Open(sidFile)
	if err != nil {
		return nil, err
	}
	defer file.Close()

	var user inkbunny.User
	if err := json.NewDecoder(file).Decode(&user); err != nil {
		return nil, err
	}

	return &user, nil
}

func saveSession(user *inkbunny.User) error {
	bin, err := json.MarshalIndent(user, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(sidFile, bin, 0600)
}

func digitCount(i int) int {
	if i == 0 {
		return 1
	}
	count := 0
	for i != 0 {
		i /= 10
		count++
	}
	return count
}

func fileExists(path string) bool {
	_, err := os.Stat(path)
	return !errors.Is(err, fs.ErrNotExist)
}

func keywordCache(ratings inkbunny.Ratings) func(string) ([]inkbunny.KeywordAutocomplete, error) {
	return func(keyword string) ([]inkbunny.KeywordAutocomplete, error) {
		return inkbunny.KeywordSuggestion(keyword, ratings, strings.Contains(keyword, "_"))
	}
}

func login() (*inkbunny.User, error) {
	var (
		username string
		password string
	)
	login := huh.NewForm(
		huh.NewGroup(
			huh.NewInput().Title("Username").Value(&username),
			huh.NewInput().Title("Password").Value(&password).EchoMode(huh.EchoModePassword),
		),
	)
	if err := login.Run(); err != nil {
		log.Fatal("failed to login", "err", err)
	}

	var (
		user *inkbunny.User
		err  error
	)
	spinner.New().
		Title("Logging in...").
		Action(func() {
			user, err = inkbunny.Login(username, password)
		}).Run()

	return user, err
}

func minimum[T any](i int) func([]T) error {
	return func(s []T) error {
		if len(s) < i {
			return fmt.Errorf("you must select at least %d value(s)", i)
		}
		return nil
	}
}

func pointer[T any](i T) *T {
	return &i
}

func changeRatings(user *inkbunny.User) error {
	const (
		General int = 1 << iota
		Nudity
		MildViolence
		Sexual
		StrongViolence
	)
	var (
		chosenRatings    []int
		chosenAgreements []string
	)
	form := huh.NewForm(
		huh.NewGroup(
			huh.NewNote().Description("By default, guests cannot see submissions rated Mature (for Nudity) or Adult.\n\nMembers may block work from guests, and only registered users can block by keyword or artist."),
			huh.NewMultiSelect[string]().
				Title("To view Mature or Adult content, you must agree to the following and tick the boxes").
				Description("Only adults may view this site. We use the RTA Label to permit filtering by parental control.").
				Options(
					huh.NewOption("I am at least 18 years old and I am a legal adult in my state/country", "18"),
					huh.NewOption("I understand and agree with the Inkbunny Philosophy", "philosophy"),
					huh.NewOption("I understand and agree with the Terms of Service", "tos"),
				).Value(&chosenAgreements),

			huh.NewMultiSelect[int]().
				Title("Choose the content ratings below that you want to see when browsing Inkbunny.").
				Description("Images with ratings you have not ticked will be invisible to you.").
				Options(
					huh.NewOption("General", General).Selected(true),
					huh.NewOption("Nudity", Nudity),
					huh.NewOption("Mild Violence", MildViolence),
					huh.NewOption("Sexual", Sexual),
					huh.NewOption("Strong Violence", StrongViolence),
				).Value(&chosenRatings).Validate(func(s []int) error {
				switch len(s) {
				case 0:
					return nil
				case 1:
					if s[0] == General {
						return nil
					}
				default:
					if len(chosenAgreements) < 3 {
						return errors.New("You cannot proceed unless you tick the appropriate boxes to indicate you agree with the terms and conditions on this page.\nDeselect values to go to previous section.")
					}
				}
				return nil
			}),
		),
	)

	if err := form.Run(); err != nil {
		return err
	}

	var ratings inkbunny.Ratings
	ratings.General = &inkbunny.Yes
	ratings.Nudity = (*inkbunny.BooleanYN)(new(slices.Contains(chosenRatings, Nudity)))
	ratings.MildViolence = (*inkbunny.BooleanYN)(new(slices.Contains(chosenRatings, MildViolence)))
	ratings.MildViolence = (*inkbunny.BooleanYN)(new(slices.Contains(chosenRatings, MildViolence)))
	ratings.Sexual = (*inkbunny.BooleanYN)(new(slices.Contains(chosenRatings, Sexual)))
	ratings.StrongViolence = (*inkbunny.BooleanYN)(new(slices.Contains(chosenRatings, StrongViolence)))

	var err error
	spinner.New().
		Title("Changing ratings...").
		Action(func() {
			err = user.ChangeRatings(ratings)
		}).Run()

	return err
}
