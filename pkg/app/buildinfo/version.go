package buildinfo

import "strings"

// Version is injected at build time for release binaries.
var Version = "dev"

// Commit is injected at build time for dev branch binaries.
var Commit = ""

func IsDevBuild() bool {
	return strings.EqualFold(strings.TrimSpace(Version), "dev")
}

func DisplayVersion() string {
	if !IsDevBuild() {
		return Version
	}

	commit := strings.TrimSpace(Commit)
	if commit == "" {
		return Version
	}

	return Version + " " + commit
}
