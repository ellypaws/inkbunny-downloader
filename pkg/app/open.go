package desktopapp

import (
	"errors"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
)

func (a *App) OpenDownloadDirectory() error {
	a.mu.RLock()
	target := a.settings.DownloadDirectory
	a.mu.RUnlock()

	target = strings.TrimSpace(target)
	if target == "" {
		target = defaultDownloadDirectory()
	}
	if target == "" {
		return errors.New("download folder not set")
	}
	if err := os.MkdirAll(target, 0o755); err != nil {
		return err
	}
	return openPathInFileManager(target)
}

func openPathInFileManager(target string) error {
	clean := filepath.Clean(target)

	switch runtime.GOOS {
	case "windows":
		return exec.Command("explorer.exe", clean).Start()
	case "darwin":
		return exec.Command("open", clean).Start()
	default:
		return exec.Command("xdg-open", clean).Start()
	}
}
