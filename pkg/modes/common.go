package modes

import (
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"os"
	"slices"
	"strings"

	"github.com/charmbracelet/huh"
	"github.com/charmbracelet/huh/spinner"
	"github.com/charmbracelet/log"
	"github.com/muesli/termenv"

	"github.com/ellypaws/inkbunny"

	"github.com/ellypaws/inkbunny/cmd/downloader/pkg/utils"
)

const sidFile = "sid.txt"

func InitLogging() func() {
	restore := utils.LogOutput(os.Stdout)
	log.SetLevel(log.DebugLevel)
	log.SetReportTimestamp(true)
	log.SetColorProfile(termenv.TrueColor)
	return restore
}

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
	return os.WriteFile(sidFile, bin, 0o600)
}

func normalizedRatingsMask(mask string) string {
	base := strings.TrimSpace(mask)
	if base == "" {
		return "10000"
	}
	if len(base) < 5 {
		base += strings.Repeat("0", 5-len(base))
	}
	base = base[:5]
	if !strings.Contains(base, "1") {
		return "10000"
	}
	return base
}

func syncUserRatingsMask(user *inkbunny.User, mask string) (bool, error) {
	if user == nil || user.SID == "" {
		return false, nil
	}

	targetMask := normalizedRatingsMask(mask)
	currentMask := normalizedRatingsMask(user.Ratings.String())
	if targetMask == currentMask {
		return false, nil
	}

	ratings := inkbunny.ParseMask(targetMask)
	var err error
	spinner.New().
		Title("Updating ratings...").
		Action(func() {
			err = user.ChangeRatings(ratings)
		}).Run()
	if err != nil {
		return false, err
	}

	user.Ratings = ratings
	if shouldPersistSession(user) {
		if err := saveSession(user); err != nil {
			log.Warn("failed to save session after ratings update", "err", err)
		}
	}
	return true, nil
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

func promptLogin() (*inkbunny.User, error) {
	var (
		username string
		password string
	)
	form := huh.NewForm(
		huh.NewGroup(
			huh.NewInput().Title("Username").Value(&username),
			huh.NewInput().Title("Password").Value(&password).EchoMode(huh.EchoModePassword),
		),
	)
	if err := form.Run(); err != nil {
		return nil, fmt.Errorf("%w: %w", errLoginPromptAborted, err)
	}

	return loginWithCredentials(username, password)
}

func loginWithCredentials(username, password string) (*inkbunny.User, error) {
	username = strings.TrimSpace(username)

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

func prepareGuestSession(user *inkbunny.User, allowInteractive bool) func() {
	if user == nil {
		return func() {}
	}
	if strings.ToLower(user.Username) != "guest" {
		return func() {}
	}

	if allowInteractive {
		if err := changeRatings(user); err != nil {
			log.Fatal("failed to change ratings", "err", err)
		}
	} else {
		log.Info("Running headless with a guest session; default guest ratings will be used")
	}

	return func() {
		var err error
		spinner.New().
			Title(fmt.Sprintf("Logging out %q...", user.Username)).
			Action(func() {
				err = user.Logout()
			}).Run()
		if err != nil {
			log.Fatal("failed to logout", "err", err)
		}
		if err := os.Remove(sidFile); err != nil && !errors.Is(err, fs.ErrNotExist) {
			log.Warn("failed to remove session file", "err", err)
		}
	}
}
