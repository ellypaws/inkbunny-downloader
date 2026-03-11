package state

import (
	"encoding/base64"

	apputils "github.com/ellypaws/inkbunny/cmd/downloader/pkg/app/utils"
)

func (a *App) ProxyAvatarImageURL(raw string) (string, error) {
	target, err := apputils.ParseApprovedUserIconURL(raw)
	if err != nil {
		return apputils.NormalizeInkbunnyURL(raw), nil
	}

	body, contentType, err := apputils.FetchUserIconBytes(a.ctx, target.String())
	if err != nil {
		return "", err
	}

	encoded := base64.StdEncoding.EncodeToString(body)
	return "data:" + contentType + ";base64," + encoded, nil
}
