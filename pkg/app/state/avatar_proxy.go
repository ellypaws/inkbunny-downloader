package state

import (
	apputils "github.com/ellypaws/inkbunny/cmd/downloader/pkg/app/utils"
)

func (a *App) ProxyAvatarImageURL(raw string) (string, error) {
	normalized := apputils.NormalizeInkbunnyURL(raw)
	if !apputils.LooksLikeUserIconURL(normalized) {
		return normalized, nil
	}
	return normalized, nil
}
