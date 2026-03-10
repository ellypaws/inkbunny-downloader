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
