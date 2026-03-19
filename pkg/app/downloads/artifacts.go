package downloads

import (
	"errors"
	"os"
	"path/filepath"
	"strings"
)

var errInvalidArtifactPath = errors.New("invalid artifact path")

func DeleteTaskArtifacts(task Task) error {
	destinations, err := taskDestinations(task)
	if err != nil {
		return err
	}
	for _, destination := range destinations {
		if err := os.Remove(destination); err != nil && !os.IsNotExist(err) {
			return err
		}
		if !task.SaveKeywords {
			continue
		}
		metadataPath, ok := trustedArtifactPath(task.DownloadRoot, submissionMetadataPath(destination))
		if !ok {
			return errInvalidArtifactPath
		}
		if err := os.Remove(metadataPath); err != nil && !os.IsNotExist(err) {
			return err
		}
	}
	return nil
}

func taskDestinations(task Task) ([]string, error) {
	root := filepath.Clean(strings.TrimSpace(task.DownloadRoot))
	if root == "." || root == "" || !filepath.IsAbs(root) {
		return nil, errInvalidArtifactPath
	}

	destinations := uniqueNonEmptyPaths(task.Destinations)
	if len(destinations) > 0 {
		trusted := make([]string, 0, len(destinations))
		for _, destination := range destinations {
			cleanDestination, ok := trustedArtifactPath(root, destination)
			if !ok {
				return nil, errInvalidArtifactPath
			}
			trusted = append(trusted, cleanDestination)
		}
		return trusted, nil
	}

	fallback := downloadFilePath(root, sanitizePathComponent(task.Username), task.FileName)
	if fallback == "" {
		return nil, nil
	}
	return []string{fallback}, nil
}

func trustedArtifactPath(root string, candidate string) (string, bool) {
	cleanRoot := filepath.Clean(strings.TrimSpace(root))
	cleanCandidate := filepath.Clean(strings.TrimSpace(candidate))
	if cleanRoot == "." || cleanRoot == "" || cleanCandidate == "." || cleanCandidate == "" {
		return "", false
	}
	if !filepath.IsAbs(cleanRoot) || !filepath.IsAbs(cleanCandidate) {
		return "", false
	}

	relative, err := filepath.Rel(cleanRoot, cleanCandidate)
	if err != nil || relative == "." || filepath.IsAbs(relative) {
		return "", false
	}
	if relative == ".." || strings.HasPrefix(relative, ".."+string(filepath.Separator)) {
		return "", false
	}
	return cleanCandidate, true
}
