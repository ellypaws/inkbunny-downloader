package downloads

import (
	"os"
	"path/filepath"
)

func DeleteTaskArtifacts(task Task) error {
	for _, destination := range taskDestinations(task) {
		if err := os.Remove(destination); err != nil && !os.IsNotExist(err) {
			return err
		}
		if !task.SaveKeywords {
			continue
		}
		metadataPath := submissionMetadataPath(destination)
		if metadataPath == "" {
			continue
		}
		if err := os.Remove(metadataPath); err != nil && !os.IsNotExist(err) {
			return err
		}
	}
	return nil
}

func taskDestinations(task Task) []string {
	destinations := uniqueNonEmptyPaths(task.Destinations)
	if len(destinations) > 0 {
		return destinations
	}
	return uniqueNonEmptyPaths([]string{
		filepath.Join(task.DownloadRoot, task.Username, filepath.Base(task.FileName)),
	})
}
