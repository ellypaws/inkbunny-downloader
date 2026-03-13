package modes

import (
	"errors"
	"fmt"
	"strings"

	"github.com/charmbracelet/huh"
	"github.com/pkg/browser"

	appinfo "github.com/ellypaws/inkbunny/cmd/downloader/pkg/app/info"
	appstorage "github.com/ellypaws/inkbunny/cmd/downloader/pkg/app/storage"
	"github.com/ellypaws/inkbunny/cmd/downloader/pkg/app/types"
	"github.com/ellypaws/inkbunny/cmd/downloader/pkg/flags"
)

type releasePromptAction string

const (
	releasePromptOpen  releasePromptAction = "open"
	releasePromptLater releasePromptAction = "later"
	releasePromptDefer releasePromptAction = "defer"
)

func loadSkippedReleaseTag() string {
	store, err := appstorage.NewStateStore()
	if err != nil {
		return ""
	}
	state, err := store.Load()
	if err != nil {
		return ""
	}
	return strings.TrimSpace(state.Settings.SkippedReleaseTag)
}

func saveSkippedReleaseTag(tag string) error {
	normalized := appinfo.NormalizeReleaseTag(tag)
	if normalized == "" {
		return errors.New("invalid release tag")
	}

	store, err := appstorage.NewStateStore()
	if err != nil {
		return err
	}
	state, err := store.Load()
	if err != nil {
		return err
	}
	state.Settings.SkippedReleaseTag = normalized
	state.Session.Settings = state.Settings
	return store.Save(state)
}

func shouldShowReleaseNotice(status types.ReleaseStatus, skippedReleaseTag string) bool {
	if !status.UpdateAvailable || strings.TrimSpace(status.LatestTag) == "" {
		return false
	}
	return !strings.EqualFold(strings.TrimSpace(status.LatestTag), strings.TrimSpace(skippedReleaseTag))
}

func needsInteractiveLogin(config flags.Config) bool {
	if err := validateAuthInputs(config); err != nil {
		return false
	}
	if strings.TrimSpace(config.SID) != "" {
		return false
	}
	if strings.TrimSpace(config.Username) != "" || config.Password != "" {
		return false
	}
	_, err := loadSession()
	return err != nil
}

func promptReleaseUpdate(status types.ReleaseStatus) (releasePromptAction, error) {
	var action releasePromptAction = releasePromptLater
	form := huh.NewForm(
		huh.NewGroup(
			huh.NewNote().
				Title("Update available").
				Description(fmt.Sprintf(
					"Current: %s\nLatest: %s\n\nOpen the release page now, continue to login, or defer this version.",
					status.CurrentTag,
					status.LatestTag,
				)),
			huh.NewSelect[releasePromptAction]().
				Title("Release update").
				Options(
					huh.NewOption("Open release page", releasePromptOpen),
					huh.NewOption("Continue to login", releasePromptLater),
					huh.NewOption("Defer this version", releasePromptDefer),
				).
				Value(&action),
		),
	)
	if err := form.Run(); err != nil {
		return releasePromptLater, fmt.Errorf("%w: %w", errLoginPromptAborted, err)
	}

	if action == releasePromptOpen && strings.TrimSpace(status.ReleaseURL) != "" {
		_ = browser.OpenURL(status.ReleaseURL)
	}
	return action, nil
}
