package main

import (
	"embed"
	"fmt"
	"os"
	"strings"

	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"

	"github.com/ellypaws/inkbunny/cmd/downloader/pkg/app/buildinfo"
	desktopapp "github.com/ellypaws/inkbunny/cmd/downloader/pkg/app/state"
	"github.com/ellypaws/inkbunny/cmd/downloader/pkg/flags"
	"github.com/ellypaws/inkbunny/cmd/downloader/pkg/modes"
)

//go:embed all:app/dist
var assets embed.FS

func main() {
	config := flags.Parse()
	if forceTUI(os.Args[1:]) || config.TUI {
		defer modes.InitLogging()()
		config.NoTUI = false
		config.Headless = false
		modes.RunTUI(config)
		return
	}
	if config.Headless {
		defer modes.InitLogging()()
		config.NoTUI = true
		modes.RunHeadless(config)
		return
	}

	app := desktopapp.NewApp()

	err := wails.Run(&options.App{
		Title:     fmt.Sprintf("Inkbunny Downloader [%s]", buildinfo.DisplayVersion()),
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

func forceTUI(args []string) bool {
	for _, arg := range args {
		if arg == "--tui" || strings.HasPrefix(arg, "--tui=") {
			return true
		}
	}
	return false
}
