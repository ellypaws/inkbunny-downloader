package utils

import (
	"os/exec"
	"path/filepath"
	"runtime"
)

func OpenPathInFileManager(target string) error {
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

func RevealPathInFileManager(target string) error {
	clean := filepath.Clean(target)

	switch runtime.GOOS {
	case "windows":
		return exec.Command("explorer.exe", "/select,", clean).Start()
	case "darwin":
		return exec.Command("open", "-R", clean).Start()
	default:
		return exec.Command("xdg-open", filepath.Dir(clean)).Start()
	}
}
