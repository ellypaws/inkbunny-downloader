package main

import (
	"bytes"
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

	"github.com/charmbracelet/huh"
	"github.com/charmbracelet/huh/spinner"
	"github.com/charmbracelet/log"
	"github.com/muesli/termenv"

	"github.com/ellypaws/inkbunny"
	"github.com/ellypaws/inkbunny/cmd/downloader/flight"
	"github.com/ellypaws/inkbunny/cmd/downloader/utils"
	"github.com/ellypaws/inkbunny/types"
)

const (
	Keywords = 1 << iota
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

		keywordBuilder       strings.Builder
		keywordAutocompletes []inkbunny.KeywordAutocomplete

		toDownload      int
		downloadCaption bool = true
		downloaded      atomic.Int64
		search          inkbunny.SubmissionSearchResponse
	)

	user, err := login()
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

	if strings.ToLower(user.Username) == "guest" {
		if err := changeRatings(user); err != nil {
			log.Fatal("failed to change ratings", "err", err)
		}
	}
	keywordCache := flight.NewCache(keywordCache(user.Ratings))
	usernameCache := flight.NewCache(user.SearchMembers)
	getArtist := func(username *string) (func() []string, *string) {
		return func() []string {
			usernames, err := usernameCache.Get(*username)
			if err != nil {
				return nil
			}
			suggestions := make([]string, len(usernames))
			for i, v := range usernames {
				suggestions[i] = v.Value
			}
			return suggestions
		}, username
	}

	form := huh.NewForm(
		huh.NewGroup(
			huh.NewNote().Title("Logged in as").Description(user.Username),
			huh.NewNote().Title("Ratings").Description(user.Ratings.String()),

			huh.NewInput().Title("Search words").
				Description("Separate words with spaces.\nUse '-' to exclude a keyword, e.g. 'leopard -snow' excludes 'snow leopard'.\nDon't use other punctuation, or words such as 'and', 'or', 'not'.").
				Value(&request.Text).SuggestionsFunc(func() []string {
				keywordAutocompletes, err = keywordCache.Get(request.Text)
				if err != nil {
					return []string{"error" + err.Error()}
				}
				if len(keywordAutocompletes) == 0 {
					return nil
				}
				suggestions := make([]string, len(keywordAutocompletes))
				for i, s := range keywordAutocompletes {
					suggestions[i] = s.Value
				}
				return suggestions
			}, &request.Text).DescriptionFunc(func() string {
				keywordBuilder.Reset()
				keywordBuilder.WriteString("Separate words with spaces.\nUse '-' to exclude a keyword, e.g. 'leopard -snow' excludes 'snow leopard'.\nDon't use other punctuation, or words such as 'and', 'or', 'not'.")
				if len(keywordAutocompletes) == 0 {
					return keywordBuilder.String()
				}
				for i, s := range keywordAutocompletes {
					switch i {
					case 0:
						keywordBuilder.WriteString("\nsuggestions: ")
					case 10:
						keywordBuilder.WriteString(", ...")
						return keywordBuilder.String()
					default:
						keywordBuilder.WriteString(", ")
					}
					keywordBuilder.WriteString(s.Value)
				}
				return keywordBuilder.String()
			}, &keywordAutocompletes),

			huh.NewSelect[types.JoinType]().
				Title("Find").
				Options(
					huh.NewOption("Find all keywords together", types.JoinTypeAnd),
					huh.NewOption("Find any one of the words", types.JoinTypeOr),
					huh.NewOption("Contains the exact phrase", types.JoinTypeExact),
				).Value(&request.StringJoinType),

			huh.NewMultiSelect[int]().
				Title("Search in").
				Options(
					huh.NewOption("Keywords", Keywords).Selected(true),
					huh.NewOption("Title", Title).Selected(true),
					huh.NewOption("Description or Story", Description),
					huh.NewOption("MD5 Hash", MD5),
				).Value(&searchIn).
				Validate(minimum[int](1)),

			huh.NewInput().
				Title("Artist name").
				Description("search only submissions by this user (optional)").
				Value(&request.Username).SuggestionsFunc(getArtist(&request.Username)),

			huh.NewInput().
				Title("Search Favorites by").
				Description("search only work favorited by this user (optional)").
				Value(&favBy).SuggestionsFunc(getArtist(&favBy)),

			huh.NewSelect[types.IntString]().
				Title("Time Range").
				Options(
					huh.NewOption("Any Time", types.IntString(0)).Selected(true),
					huh.NewOption("24 Hrs", types.IntString(1)),
					huh.NewOption("3 Days", types.IntString(3)),
					huh.NewOption("1 Week", types.IntString(7)),
					huh.NewOption("2 Weeks", types.IntString(14)),
					huh.NewOption("1 Month", types.IntString(30)),
					huh.NewOption("3 Months", types.IntString(90)),
					huh.NewOption("6 Months", types.IntString(180)),
					huh.NewOption("1 Year", types.IntString(365)),
				).Value(&request.DaysLimit),

			huh.NewMultiSelect[inkbunny.SubmissionType]().
				Title("Submission type").
				Options(
					huh.NewOption("Any", inkbunny.SubmissionTypeAny).Selected(true),
					huh.NewOption("Picture/Pinup", inkbunny.SubmissionTypePicturePinup),
					huh.NewOption("Sketch", inkbunny.SubmissionTypeSketch),
					huh.NewOption("Picture Series", inkbunny.SubmissionTypePictureSeries),
					huh.NewOption("Comic", inkbunny.SubmissionTypeComic),
					huh.NewOption("Portfolio", inkbunny.SubmissionTypePortfolio),
					huh.NewOption("Shockwave/Flash - Animation", inkbunny.SubmissionTypeShockwaveFlashAnimation),
					huh.NewOption("Shockwave/Flash - Interactive", inkbunny.SubmissionTypeShockwaveFlashInteractive),
					huh.NewOption("Video - Feature Length", inkbunny.SubmissionTypeVideoFeatureLength),
					huh.NewOption("Video - Animation/3D/CGI", inkbunny.SubmissionTypeVideoAnimation3DCGI),
					huh.NewOption("Music - Single Track", inkbunny.SubmissionTypeMusicSingleTrack),
					huh.NewOption("Music - Album", inkbunny.SubmissionTypeMusicAlbum),
					huh.NewOption("Writing - Document", inkbunny.SubmissionTypeWritingDocument),
					huh.NewOption("Character Sheet", inkbunny.SubmissionTypeCharacterSheet),
					huh.NewOption("Photography - Fursuit/Sculpture/Jewelry/etc", inkbunny.SubmissionTypePhotography),
				).Value((*[]inkbunny.SubmissionType)(&request.Type)).
				DescriptionFunc(func() string {
					switch len(request.Type) {
					case 0, 15:
						return "Any"
					case 1:
						if request.Type[0] == inkbunny.SubmissionTypeAny {
							return "Any"
						}
					case 14:
						if !slices.Contains(request.Type, inkbunny.SubmissionTypeAny) {
							return "Any"
						}
					}
					return ""
				}, &request.Type),

			huh.NewSelect[string]().
				Title("Order by").
				Options(
					huh.NewOption("Newest First", types.OrderByCreateDatetime).Selected(true),
					huh.NewOption("Most Popular First (by Favs)", types.OrderByFavs),
					huh.NewOption("Most Popular First (by Views)", types.OrderByViews),
				).Value(&request.OrderBy),

			huh.NewInput().
				Title("Max number of submissions to download").
				Description("This is just a soft limit").
				Placeholder("Unlimited").
				Value(&maxDownloads).
				Validate(func(s string) error {
					if s == "" {
						return nil
					}
					_, err := strconv.Atoi(s)
					return err
				}),

			huh.NewConfirm().Title("Download keywords as .txt").Value(&downloadCaption),
		),
	)

Search:
	if err := form.Run(); err != nil {
		log.Fatal(err)
	}

	request.Keywords = false
	request.Title = false
	request.Description = false
	request.MD5 = false

	for _, v := range searchIn {
		switch v {
		case Keywords:
			request.Keywords = true
		case Title:
			request.Title = true
		case Description:
			request.Description = true
		case MD5:
			request.MD5 = true
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

	spinner.New().
		Title("Searching...").
		Action(func() {
			search, err = user.SearchSubmissions(request)
		}).Run()
	if err != nil {
		log.Fatal("failed to search submissions", "err", err)
	}
	log.Infof("Total number of submissions: %d", search.ResultsCountAll)
	log.Infof("To download: %d", toDownload)

	client := &http.Client{
		Timeout: 5 * time.Minute,
	}

	downloader := utils.NewWorkerPool(runtime.NumCPU(), func(details inkbunny.SubmissionDetails) error {
		var keywords bytes.Buffer
		for i, keyword := range details.Keywords {
			if i > 0 {
				keywords.WriteString(", ")
			}
			keywords.WriteString(keyword.KeywordName)
		}
		numOfFiles := len(details.Files)
		if numOfFiles == 0 {
			return nil
		}
		submissionURL := fmt.Sprintf("https://inkbunny.net/s/%d", details.SubmissionID)
		padding := (numOfFiles / 10) + 1
		log.Debug("Downloading submission", "url", submissionURL, "files", numOfFiles)
		for i, file := range details.Files {
			if int(downloaded.Load()) >= toDownload {
				return nil
			}
			if !strings.HasPrefix(file.MimeType, "image") {
				log.Warn("Skipping file", "url", file.FileURLFull, "mimetype", file.MimeType)
				continue
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

			resp, err := client.Get(file.FileURLFull)
			if err != nil {
				return err
			}
			defer resp.Body.Close()

			_, err = io.Copy(f, resp.Body)
			if err != nil {
				return err
			}

			if downloadCaption && keywords.Len() > 0 {
				c, err := os.Create(strings.TrimSuffix(filename, filepath.Ext(filename)) + ".txt")
				if err != nil {
					return err
				}
				_, err = io.Copy(c, &keywords)
				if err != nil {
					return err
				}
			}

			log.Debug(fmt.Sprintf("Downloaded file %0*d/%0*d", padding, i+1, padding, numOfFiles), "url", file.FileURLFull)
			downloaded.Add(1)
		}
		if downloadCaption && keywords.Len() < 1 {
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

func fileExists(path string) bool {
	_, err := os.Stat(path)
	return !errors.Is(err, fs.ErrNotExist)
}

func keywordCache(ratings types.Ratings) func(string) ([]inkbunny.KeywordAutocomplete, error) {
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

	if err != nil {
		log.Error("Failed to login", "err", err)
	} else {
		log.Info("Logged in", "username", username)
	}

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
		General = 1 << iota
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

	var ratings types.Ratings
	ratings.General = &types.Yes
	ratings.Nudity = (*types.BooleanYN)(pointer(slices.Contains(chosenRatings, Nudity)))
	ratings.MildViolence = (*types.BooleanYN)(pointer(slices.Contains(chosenRatings, MildViolence)))
	ratings.MildViolence = (*types.BooleanYN)(pointer(slices.Contains(chosenRatings, MildViolence)))
	ratings.Sexual = (*types.BooleanYN)(pointer(slices.Contains(chosenRatings, Sexual)))
	ratings.StrongViolence = (*types.BooleanYN)(pointer(slices.Contains(chosenRatings, StrongViolence)))

	var err error
	spinner.New().
		Title("Changing ratings...").
		Action(func() {
			err = user.ChangeRatings(ratings)
		}).Run()

	return err
}
