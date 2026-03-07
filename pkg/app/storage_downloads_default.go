//go:build !windows

package desktopapp

import (
	"os"
	"path/filepath"
)

var resolveDownloadsDirectory = systemDownloadsDirectory

func systemDownloadsDirectory() (string, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(home, "Downloads"), nil
}
