package state

import (
	"errors"

	"github.com/ellypaws/inkbunny/cmd/downloader/pkg/app/info"
	"github.com/ellypaws/inkbunny/cmd/downloader/pkg/app/types"
)

func (a *App) GetReleaseStatus() types.ReleaseStatus {
	return info.GetReleaseStatus()
}

func (a *App) SkipReleaseTag(tag string) (types.AppSettings, error) {
	normalized := info.NormalizeReleaseTag(tag)
	if normalized == "" {
		return a.GetSession().Settings, errors.New("invalid release tag")
	}

	a.mu.Lock()
	a.settings.SkippedReleaseTag = normalized
	current := a.settings
	a.mu.Unlock()

	return current, a.persist()
}
