package modes

import (
	"errors"
	"fmt"
	"os"
	"strings"

	"github.com/charmbracelet/log"

	"github.com/ellypaws/inkbunny"

	"github.com/ellypaws/inkbunny/cmd/downloader/pkg/flags"
)

type authSource string

const (
	authSourceProvidedSID         authSource = "provided_sid"
	authSourceProvidedCredentials authSource = "provided_credentials"
	authSourceSavedSession        authSource = "saved_session"
	authSourcePrompt              authSource = "prompt"
)

var (
	errHeadlessAuthRequired = errors.New("headless mode requires a saved session or explicit authentication flags (--sid or --username/--password)")
	errUsernameRequired     = errors.New("username is required when --password is provided")
	errPasswordRequired     = errors.New("password is required when --username is provided, unless the username is guest")
	errLoginPromptAborted   = errors.New("login prompt aborted")
)

func authenticateUser(config flags.Config, allowPrompt bool) (*inkbunny.User, authSource, bool, error) {
	if err := validateAuthInputs(config); err != nil {
		return nil, "", false, err
	}

	if sid := strings.TrimSpace(config.SID); sid != "" {
		return &inkbunny.User{
			SID:      sid,
			Username: strings.TrimSpace(config.Username),
		}, authSourceProvidedSID, false, nil
	}

	username := strings.TrimSpace(config.Username)
	if username != "" || config.Password != "" {
		user, err := loginWithCredentials(username, config.Password)
		return user, authSourceProvidedCredentials, shouldPersistSession(user), err
	}

	user, err := loadSession()
	if err == nil {
		return user, authSourceSavedSession, false, nil
	}
	if !allowPrompt {
		return nil, "", false, fmt.Errorf("%w: %v", errHeadlessAuthRequired, err)
	}

	user, err = promptLogin()
	return user, authSourcePrompt, shouldPersistSession(user), err
}

func validateAuthInputs(config flags.Config) error {
	if strings.TrimSpace(config.SID) != "" {
		return nil
	}

	username := strings.TrimSpace(config.Username)
	switch {
	case username == "" && config.Password != "":
		return errUsernameRequired
	case username != "" && !strings.EqualFold(username, "guest") && config.Password == "":
		return errPasswordRequired
	default:
		return nil
	}
}

func shouldPersistSession(user *inkbunny.User) bool {
	return user != nil && user.SID != "" && !strings.EqualFold(user.Username, "guest")
}

func logAuthenticatedUser(user *inkbunny.User, source authSource) {
	username := ""
	if user != nil {
		username = strings.TrimSpace(user.Username)
	}

	switch source {
	case authSourceSavedSession:
		if username != "" {
			log.Info("Logged in as", "username", username)
			return
		}
		log.Info("Using saved session")
	case authSourceProvidedSID:
		if username != "" {
			log.Info("Using provided session ID", "username", username)
			return
		}
		log.Info("Using provided session ID")
	default:
		if username != "" {
			log.Info("Logged in", "username", username)
			return
		}
		log.Info("Authenticated")
	}
}

func invalidateAuthSource(config *flags.Config, source authSource) {
	switch source {
	case authSourceProvidedSID:
		config.SID = ""
		if !hasUsableCredentials(*config) {
			config.Username = ""
			config.Password = ""
		}
	case authSourceSavedSession, authSourceProvidedCredentials, authSourcePrompt:
		if err := os.Remove(sidFile); err != nil && !errors.Is(err, os.ErrNotExist) {
			log.Warn("failed to remove session file", "err", err)
		}
	}
}

func hasUsableCredentials(config flags.Config) bool {
	username := strings.TrimSpace(config.Username)
	if username == "" {
		return false
	}
	if strings.EqualFold(username, "guest") {
		return true
	}
	return config.Password != ""
}
