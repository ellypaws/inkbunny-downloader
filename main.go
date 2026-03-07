package main

import (
	"embed"

	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"

	"github.com/ellypaws/inkbunny/cmd/downloader/pkg/app"
)

//go:embed all:app/dist
var assets embed.FS

func main() {
	app := desktopapp.NewApp()

	err := wails.Run(&options.App{
		Title:     "Inkbunny Downloader",
		MinWidth:  1280,
		MinHeight: 860,
		Width:     1440,
		Height:    960,
		AssetServer: &assetserver.Options{
			Assets: assets,
		},
		BackgroundColour: &options.RGBA{R: 20, G: 17, B: 44, A: 1},
		OnStartup:        app.Startup,
		OnShutdown:       app.Shutdown,
		Bind: []interface{}{
			app,
		},
	})
	if err != nil {
		println("Error:", err.Error())
	}
}
