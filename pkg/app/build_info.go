package desktopapp

import "github.com/ellypaws/inkbunny/cmd/downloader/pkg/buildinfo"

func (a *App) GetBuildInfo() BuildInfo {
	return BuildInfo{
		Version:        buildinfo.Version,
		Commit:         buildinfo.Commit,
		DisplayVersion: buildinfo.DisplayVersion(),
		IsDev:          buildinfo.IsDevBuild(),
	}
}
