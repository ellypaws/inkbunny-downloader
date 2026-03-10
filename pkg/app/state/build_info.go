package state

import (
	"github.com/ellypaws/inkbunny/cmd/downloader/pkg/app/buildinfo"
	"github.com/ellypaws/inkbunny/cmd/downloader/pkg/app/types"
)

func (a *App) GetBuildInfo() types.BuildInfo {
	return types.BuildInfo{
		Version:        buildinfo.Version,
		Commit:         buildinfo.Commit,
		DisplayVersion: buildinfo.DisplayVersion(),
		IsDev:          buildinfo.IsDevBuild(),
	}
}
