package desktopapp

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"runtime"
	"sync"

	"github.com/ellypaws/inkbunny"
)

type stateStore struct {
	root string
	path string
	mu   sync.Mutex
}

func newStateStore() (*stateStore, error) {
	base, err := os.UserConfigDir()
	if err != nil {
		return nil, err
	}
	root := filepath.Join(base, "inkbunny-downloader")
	if err := os.MkdirAll(root, 0o755); err != nil {
		return nil, err
	}
	return &stateStore{
		root: root,
		path: filepath.Join(root, "state.json"),
	}, nil
}

func (s *stateStore) Load() (storedState, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	var state storedState
	data, err := os.ReadFile(s.path)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return defaultStoredState(), nil
		}
		return state, err
	}
	if err := json.Unmarshal(data, &state); err != nil {
		return state, err
	}
	if state.Settings.MaxActive <= 0 {
		state.Settings.MaxActive = defaultMaxActive()
	}
	if state.Settings.DownloadDirectory == "" {
		state.Settings.DownloadDirectory = defaultDownloadDirectory()
	}
	if state.Session.EffectiveTheme == "" {
		state.Session.EffectiveTheme = ternary(state.Settings.DarkMode, "dark", "light")
	}
	if state.Session.AvatarURL == "" {
		state.Session.AvatarURL = defaultAvatarURL
	}
	return state, nil
}

func (s *stateStore) Save(state storedState) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if err := os.MkdirAll(s.root, 0o755); err != nil {
		return err
	}
	data, err := json.MarshalIndent(state, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(s.path, data, 0o600)
}

func defaultStoredState() storedState {
	settings := AppSettings{
		DownloadDirectory: defaultDownloadDirectory(),
		MaxActive:         defaultMaxActive(),
		DarkMode:          true,
		MotionEnabled:     true,
	}
	return storedState{
		Settings: settings,
		Session: SessionInfo{
			Settings:       settings,
			EffectiveTheme: "dark",
			AvatarURL:      defaultAvatarURL,
		},
	}
}

func defaultMaxActive() int {
	value := runtime.NumCPU() / 6
	if value < 1 {
		value = 1
	}
	if value > 6 {
		value = 6
	}
	return value
}

func defaultDownloadDirectory() string {
	home, err := os.UserHomeDir()
	if err != nil {
		return "inkbunny"
	}
	return filepath.Join(home, "Downloads", "inkbunny")
}

func restoreUser(stored sessionUser) *inkbunny.User {
	if stored.SID == "" {
		return nil
	}
	user := &inkbunny.User{
		SID:      stored.SID,
		Username: stored.Username,
	}
	if stored.Ratings != "" {
		user.Ratings = inkbunny.ParseMask(stored.Ratings)
	}
	return user
}

func toStoredUser(user *inkbunny.User) sessionUser {
	if user == nil {
		return sessionUser{}
	}
	return sessionUser{
		SID:      user.SID,
		Username: user.Username,
		Ratings:  user.Ratings.String(),
	}
}
