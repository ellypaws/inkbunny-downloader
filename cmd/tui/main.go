package main

import (
	"github.com/ellypaws/inkbunny/cmd/downloader/pkg/app/buildinfo"
	"github.com/ellypaws/inkbunny/cmd/downloader/pkg/flags"
	"github.com/ellypaws/inkbunny/cmd/downloader/pkg/modes"
)

var _ = buildinfo.Version

func main() {
	defer modes.InitLogging()()
	config := flags.Parse()
	config.NoTUI = false
	config.Headless = false
	config.TUI = true
	modes.RunTUI(config)
}
