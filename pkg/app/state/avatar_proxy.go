package state

import (
	"context"

	apputils "github.com/ellypaws/inkbunny/cmd/downloader/pkg/app/utils"
	"github.com/ellypaws/inkbunny/cmd/downloader/pkg/flight"
)

var proxiedUserIconCache = flight.NewCache(func(ctx context.Context, raw string) (string, error) {
	return apputils.FetchUserIconDataURL(ctx, raw)
})

func (a *App) ProxyAvatarImageURL(raw string) (string, error) {
	normalized := apputils.NormalizeInkbunnyURL(raw)
	if !apputils.LooksLikeUserIconURL(normalized) {
		return normalized, nil
	}

	ctx := a.ctx
	if ctx == nil {
		ctx = context.Background()
	}
	return proxiedUserIconCache.GetWithContext(ctx, normalized)
}
