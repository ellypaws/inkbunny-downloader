package state

import (
	"errors"
	"path/filepath"
	"strings"

	"github.com/ellypaws/inkbunny/cmd/downloader/pkg/app/storage"
)

var errInvalidDownloadDirectory = errors.New("invalid download directory")

func normalizeDownloadDirectory(raw string) (string, error) {
	candidate := strings.TrimSpace(raw)
	if candidate == "" {
		candidate = storage.DefaultDownloadDirectory()
	}

	clean := filepath.Clean(candidate)
	if clean == "." || clean == "" || !filepath.IsAbs(clean) {
		return "", errInvalidDownloadDirectory
	}
	return clean, nil
}

func (a *App) resolveDownloadDirectory(raw string) (string, error) {
	candidate := strings.TrimSpace(raw)
	if candidate == "" {
		a.mu.RLock()
		candidate = a.settings.DownloadDirectory
		a.mu.RUnlock()
	}
	return normalizeDownloadDirectory(candidate)
}
