package buildinfo

import "strings"

// Version is injected at build time for release binaries.
var Version = "dev"

// Commit is injected at build time for dev branch binaries.
var Commit = ""

func DisplayVersion() string {
	if Version != "dev" {
		return Version
	}

	commit := strings.TrimSpace(Commit)
	if commit == "" {
		return Version
	}

	return Version + " " + commit
}
