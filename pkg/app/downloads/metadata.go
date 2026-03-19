package downloads

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"

	"github.com/ellypaws/inkbunny"
)

type SubmissionFileMetadata struct {
	File inkbunny.File `json:"file"`
	inkbunny.SubmissionDetails
	Files []inkbunny.File `json:"files,omitzero"`
}

func NewSubmissionFileMetadata(submission inkbunny.SubmissionDetails, file inkbunny.File) SubmissionFileMetadata {
	submission.Files = nil
	return SubmissionFileMetadata{
		File:              file,
		SubmissionDetails: submission,
		Files:             nil,
	}
}

func MetadataSubmissionDetailsRequest() inkbunny.SubmissionDetailsRequest {
	return inkbunny.SubmissionDetailsRequest{
		ShowDescription:             inkbunny.Yes,
		ShowDescriptionBbcodeParsed: inkbunny.Yes,
		ShowWriting:                 inkbunny.Yes,
		ShowWritingBbcodeParsed:     inkbunny.Yes,
		ShowPools:                   inkbunny.Yes,
	}
}

func WriteSubmissionMetadata(destinations []string, details SubmissionFileMetadata) error {
	payload, err := json.MarshalIndent(details, "", "  ")
	if err != nil {
		return err
	}
	payload = append(payload, '\n')

	for _, destination := range uniqueNonEmptyPaths(destinations) {
		metadataPath := submissionMetadataPath(destination)
		if metadataPath == "" {
			continue
		}
		if err := os.MkdirAll(filepath.Dir(metadataPath), 0o755); err != nil {
			return err
		}
		if err := os.WriteFile(metadataPath, payload, 0o600); err != nil {
			return err
		}
	}
	return nil
}

func submissionMetadataPath(destination string) string {
	clean := filepath.Clean(strings.TrimSpace(destination))
	if clean == "." || clean == "" {
		return ""
	}

	ext := filepath.Ext(clean)
	if ext == "" {
		return clean + ".json"
	}
	return strings.TrimSuffix(clean, ext) + ".json"
}
