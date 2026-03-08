package desktopapp

import (
	"errors"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"

	"github.com/pkg/browser"
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

func (a *App) OpenExternalURL(target string) error {
	parsed, err := url.Parse(strings.TrimSpace(target))
	if err != nil {
		return err
	}
	if parsed.Scheme != "http" && parsed.Scheme != "https" {
		return errors.New("unsupported external url")
	}
	return browser.OpenURL(parsed.String())
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
