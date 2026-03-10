//go:build windows

package storage

import "golang.org/x/sys/windows"

var resolveDownloadsDirectory = systemDownloadsDirectory

func systemDownloadsDirectory() (string, error) {
	return windows.KnownFolderPath(windows.FOLDERID_Downloads, windows.KF_FLAG_DEFAULT)
}
