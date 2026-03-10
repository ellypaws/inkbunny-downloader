package storage

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"sync"

	"github.com/ellypaws/inkbunny"

	"github.com/ellypaws/inkbunny/cmd/downloader/pkg/app/downloads"
	"github.com/ellypaws/inkbunny/cmd/downloader/pkg/app/types"
	apputils "github.com/ellypaws/inkbunny/cmd/downloader/pkg/app/utils"
)

type StateStore struct {
	root string
	path string
	mu   sync.Mutex
}

func NewStateStore() (*StateStore, error) {
	base, err := os.UserConfigDir()
	if err != nil {
		return nil, err
	}
	root := filepath.Join(base, "inkbunny-downloader")
	if err := os.MkdirAll(root, 0o755); err != nil {
		return nil, err
	}
	return &StateStore{
		root: root,
		path: filepath.Join(root, "state.json"),
	}, nil
}

func (s *StateStore) Load() (types.StoredState, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	var state types.StoredState
	data, err := os.ReadFile(s.path)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return DefaultStoredState(), nil
		}
		return state, err
	}
	if err := json.Unmarshal(data, &state); err != nil {
		return state, err
	}
	state.Settings.MaxActive = apputils.NormalizeMaxActive(state.Settings.MaxActive)
	if state.Settings.DownloadDirectory == "" {
		state.Settings.DownloadDirectory = DefaultDownloadDirectory()
	}
	state.Settings.DownloadPattern = downloads.NormalizePattern(state.Settings.DownloadPattern)
	if state.Session.EffectiveTheme == "" {
		state.Session.EffectiveTheme = themeName(state.Settings.DarkMode)
	}
	if state.Session.AvatarURL == "" {
		state.Session.AvatarURL = apputils.DefaultAvatarURL
	}
	state.Session.Settings = state.Settings
	return state, nil
}

func (s *StateStore) Save(state types.StoredState) error {
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

func DefaultStoredState() types.StoredState {
	settings := types.AppSettings{
		DownloadDirectory:  DefaultDownloadDirectory(),
		DownloadPattern:    downloads.DefaultPattern,
		MaxActive:          apputils.DefaultMaxActive(),
		DarkMode:           false,
		MotionEnabled:      true,
		AutoClearCompleted: false,
		SkippedReleaseTag:  "",
		HasLoggedInBefore:  false,
	}
	return types.StoredState{
		Settings: settings,
		Session: types.SessionInfo{
			Settings:       settings,
			EffectiveTheme: "light",
			AvatarURL:      apputils.DefaultAvatarURL,
		},
		Workspace: types.WorkspaceState{},
	}
}

func DefaultDownloadDirectory() string {
	base, err := resolveDownloadsDirectory()
	if err != nil || strings.TrimSpace(base) == "" {
		return "Downloads"
	}
	return filepath.Clean(base)
}

func ResolveDownloadPickerDirectory(current string) string {
	candidate := strings.TrimSpace(current)
	if candidate == "" {
		candidate = DefaultDownloadDirectory()
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

func RestoreUser(stored types.SessionUser) *inkbunny.User {
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

func ToStoredUser(user *inkbunny.User) types.SessionUser {
	if user == nil {
		return types.SessionUser{}
	}
	return types.SessionUser{
		SID:      user.SID,
		Username: user.Username,
		Ratings:  user.Ratings.String(),
	}
}

func themeName(darkMode bool) string {
	if darkMode {
		return "dark"
	}
	return "light"
}
