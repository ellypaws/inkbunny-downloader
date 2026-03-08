package desktopapp

import (
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/ellypaws/inkbunny/cmd/downloader/pkg/buildinfo"
)

const defaultReleaseURL = "https://github.com/ellypaws/inkbunny-downloader/releases"

var (
	appVersion              = buildinfo.Version
	latestReleaseAPIURL     = "https://api.github.com/repos/ellypaws/inkbunny-downloader/releases/latest"
	releaseStatusHTTPClient = &http.Client{Timeout: 5 * time.Second}
)

type githubLatestRelease struct {
	TagName string `json:"tag_name"`
	HTMLURL string `json:"html_url"`
}

func (a *App) GetReleaseStatus() ReleaseStatus {
	currentVersion, ok := normalizeReleaseVersion(appVersion)
	if !ok {
		return ReleaseStatus{}
	}

	status := ReleaseStatus{
		CurrentVersion: currentVersion,
		CurrentTag:     releaseTagFromVersion(currentVersion),
	}

	request, err := http.NewRequest(http.MethodGet, latestReleaseAPIURL, nil)
	if err != nil {
		return status
	}
	request.Header.Set("Accept", "application/vnd.github+json")
	request.Header.Set("User-Agent", "inkbunny-downloader/"+currentVersion)

	response, err := releaseStatusHTTPClient.Do(request)
	if err != nil {
		return status
	}
	defer response.Body.Close()

	if response.StatusCode != http.StatusOK {
		return status
	}

	var payload githubLatestRelease
	if err := json.NewDecoder(response.Body).Decode(&payload); err != nil {
		return status
	}

	latestVersion, ok := normalizeReleaseVersion(payload.TagName)
	if !ok {
		return status
	}

	status.LatestTag = releaseTagFromVersion(latestVersion)
	status.ReleaseURL = strings.TrimSpace(payload.HTMLURL)
	if status.ReleaseURL == "" {
		status.ReleaseURL = defaultReleaseURL
	}
	status.UpdateAvailable = compareReleaseVersions(currentVersion, latestVersion) < 0
	return status
}

func (a *App) SkipReleaseTag(tag string) (AppSettings, error) {
	normalized := normalizeReleaseTag(tag)
	if normalized == "" {
		return a.GetSession().Settings, errors.New("invalid release tag")
	}

	a.mu.Lock()
	a.settings.SkippedReleaseTag = normalized
	current := a.settings
	a.mu.Unlock()

	return current, a.persist()
}

func normalizeReleaseTag(tag string) string {
	version, ok := normalizeReleaseVersion(tag)
	if !ok {
		return ""
	}
	return releaseTagFromVersion(version)
}

func releaseTagFromVersion(version string) string {
	return "v" + version
}

func normalizeReleaseVersion(value string) (string, bool) {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" || strings.EqualFold(trimmed, "dev") {
		return "", false
	}

	trimmed = strings.TrimPrefix(strings.ToLower(trimmed), "v")
	parts := strings.Split(trimmed, ".")
	if len(parts) != 3 {
		return "", false
	}

	normalized := make([]string, 0, len(parts))
	for _, part := range parts {
		if part == "" {
			return "", false
		}
		number, err := strconv.Atoi(part)
		if err != nil || number < 0 {
			return "", false
		}
		normalized = append(normalized, strconv.Itoa(number))
	}

	return strings.Join(normalized, "."), true
}

func compareReleaseVersions(left, right string) int {
	leftVersion, ok := normalizeReleaseVersion(left)
	if !ok {
		return 0
	}
	rightVersion, ok := normalizeReleaseVersion(right)
	if !ok {
		return 0
	}

	leftParts := strings.Split(leftVersion, ".")
	rightParts := strings.Split(rightVersion, ".")
	for index := range leftParts {
		leftNumber, _ := strconv.Atoi(leftParts[index])
		rightNumber, _ := strconv.Atoi(rightParts[index])
		if leftNumber < rightNumber {
			return -1
		}
		if leftNumber > rightNumber {
			return 1
		}
	}

	return 0
}
