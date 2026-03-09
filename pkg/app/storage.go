package desktopapp

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"sync"

	"github.com/ellypaws/inkbunny"
)

type stateStore struct {
	root string
	path string
	mu   sync.Mutex
}

const maxConcurrentDownloads = 16

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
	state.Settings.MaxActive = normalizeMaxActive(state.Settings.MaxActive)
	if state.Settings.DownloadDirectory == "" {
		state.Settings.DownloadDirectory = defaultDownloadDirectory()
	}
	state.Settings.DownloadPattern = normalizeDownloadPattern(state.Settings.DownloadPattern)
	if state.Session.EffectiveTheme == "" {
		state.Session.EffectiveTheme = ternary(state.Settings.DarkMode, "dark", "light")
	}
	if state.Session.AvatarURL == "" {
		state.Session.AvatarURL = defaultAvatarURL
	}
	state.Session.Settings = state.Settings
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
		DownloadDirectory:  defaultDownloadDirectory(),
		DownloadPattern:    defaultDownloadPattern,
		MaxActive:          defaultMaxActive(),
		DarkMode:           false,
		MotionEnabled:      true,
		AutoClearCompleted: false,
		SkippedReleaseTag:  "",
		HasLoggedInBefore:  false,
	}
	return storedState{
		Settings: settings,
		Session: SessionInfo{
			Settings:       settings,
			EffectiveTheme: "light",
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

func normalizeMaxActive(value int) int {
	if value <= 0 {
		return defaultMaxActive()
	}
	if value > maxConcurrentDownloads {
		return maxConcurrentDownloads
	}
	return value
}

func defaultDownloadDirectory() string {
	base, err := resolveDownloadsDirectory()
	if err != nil || strings.TrimSpace(base) == "" {
		return "inkbunny"
	}
	return filepath.Join(base, "inkbunny")
}

func resolveDownloadPickerDirectory(current string) string {
	candidate := strings.TrimSpace(current)
	if candidate == "" {
		candidate = defaultDownloadDirectory()
	}
	candidate = filepath.Clean(candidate)

	for candidate != "" {
		info, err := os.Stat(candidate)
		if err == nil && info.IsDir() {
			return candidate
		}

		parent := filepath.Dir(candidate)
		if parent == candidate || parent == "." || parent == "" {
			break
		}
		candidate = parent
	}

	base, err := resolveDownloadsDirectory()
	if err == nil && strings.TrimSpace(base) != "" {
		return filepath.Clean(base)
	}
	return ""
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
