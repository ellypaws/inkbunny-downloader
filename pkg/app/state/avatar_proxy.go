package state

import (
	"encoding/base64"

	apputils "github.com/ellypaws/inkbunny/cmd/downloader/pkg/app/utils"
)

func (a *App) ProxyAvatarImageURL(raw string) (string, error) {
	normalized := apputils.NormalizeInkbunnyURL(raw)
	if !apputils.LooksLikeUserIconURL(normalized) {
		return normalized, nil
	}

	body, contentType, err := apputils.FetchUserIconBytes(a.ctx, normalized)
	if err != nil {
		return "", err
	}

	encoded := base64.StdEncoding.EncodeToString(body)
	return "data:" + contentType + ";base64," + encoded, nil
}
