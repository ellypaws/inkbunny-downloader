package state

import (
	"errors"
	"net/url"
	"os"
	"strings"

	"github.com/pkg/browser"

	"github.com/ellypaws/inkbunny/cmd/downloader/pkg/app/storage"
	apputils "github.com/ellypaws/inkbunny/cmd/downloader/pkg/app/utils"
)

func (a *App) OpenDownloadDirectory() error {
	a.mu.RLock()
	target := a.settings.DownloadDirectory
	a.mu.RUnlock()

	target = strings.TrimSpace(target)
	if target == "" {
		target = storage.DefaultDownloadDirectory()
	}
	if target == "" {
		return errors.New("download folder not set")
	}
	if err := os.MkdirAll(target, 0o755); err != nil {
		return err
	}
	return apputils.OpenPathInFileManager(target)
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
