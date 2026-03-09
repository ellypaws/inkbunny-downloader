package desktopapp

import (
	"fmt"
	"io"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"time"
	"unicode"

	"github.com/ellypaws/inkbunny"
)

const defaultDownloadPattern = "inkbunny/{artist}/{file_name_full}"

var downloadPatternTokenRE = regexp.MustCompile(`\{([a-z0-9_]+)\}`)

type downloadPathContext struct {
	Submission inkbunny.SubmissionDetails
	File       inkbunny.File
	Pool       *inkbunny.Pool
	Time       time.Time
	Number     int
}

func normalizeDownloadPattern(pattern string) string {
	trimmed := strings.TrimSpace(pattern)
	if trimmed == "" {
		return defaultDownloadPattern
	}
	return trimmed
}

func resolveDownloadDestinations(
	root string,
	pattern string,
	submission inkbunny.SubmissionDetails,
	file inkbunny.File,
) []string {
	cleanRoot := filepath.Clean(strings.TrimSpace(root))
	if cleanRoot == "" {
		return nil
	}

	pattern = normalizeDownloadPattern(pattern)
	baseContext := downloadPathContext{
		Submission: submission,
		File:       file,
		Time:       resolveDownloadTimestamp(submission, file),
		Number:     resolveFileNumber(file),
	}

	if !patternUsesPoolTokens(pattern) || len(submission.Pools) == 0 {
		return []string{renderDownloadDestination(cleanRoot, pattern, baseContext)}
	}

	destinations := make([]string, 0, len(submission.Pools))
	for i := range submission.Pools {
		pool := submission.Pools[i]
		ctx := baseContext
		ctx.Pool = &pool
		destinations = append(destinations, renderDownloadDestination(cleanRoot, pattern, ctx))
	}
	return uniqueNonEmptyPaths(destinations)
}

func renderDownloadDestination(root, pattern string, ctx downloadPathContext) string {
	normalizedPattern := strings.ReplaceAll(normalizeDownloadPattern(pattern), "\\", "/")
	rawParts := strings.Split(normalizedPattern, "/")
	segments := make([]string, 0, len(rawParts)+1)
	lastPartHasValue := false

	for i, rawPart := range rawParts {
		rendered := sanitizePathComponent(renderDownloadComponent(rawPart, ctx))
		if i == len(rawParts)-1 && rendered != "" {
			lastPartHasValue = true
		}
		if rendered == "" {
			continue
		}
		segments = append(segments, rendered)
	}

	if !lastPartHasValue {
		fallback := sanitizePathComponent(filepath.Base(ctx.File.FileName))
		if fallback == "" {
			fallback = fmt.Sprintf("file_%s", ctx.File.FileID.String())
		}
		segments = append(segments, fallback)
	}

	if len(segments) == 0 {
		segments = []string{
			"inkbunny",
			sanitizePathComponent(filepath.Base(ctx.File.FileName)),
		}
	}

	return filepath.Clean(filepath.Join(root, filepath.Join(segments...)))
}

func renderDownloadComponent(component string, ctx downloadPathContext) string {
	return downloadPatternTokenRE.ReplaceAllStringFunc(component, func(match string) string {
		name := downloadPatternTokenRE.FindStringSubmatch(match)
		if len(name) != 2 {
			return match
		}

		value, ok := downloadTokenValue(name[1], ctx)
		if !ok {
			return match
		}
		return value
	})
}

func downloadTokenValue(name string, ctx downloadPathContext) (string, bool) {
	fileBase := filepath.Base(ctx.File.FileName)
	fileStem := strings.TrimSuffix(fileBase, filepath.Ext(fileBase))
	ext := strings.TrimPrefix(strings.ToLower(filepath.Ext(fileBase)), ".")

	switch name {
	case "artist":
		return ctx.Submission.Username, true
	case "artist_id":
		return ctx.Submission.UserID.String(), true
	case "title":
		return ctx.Submission.Title, true
	case "rating":
		return coarseSubmissionRating(ctx.Submission), true
	case "public":
		return ternary(ctx.Submission.Public.Bool(), "public", "private"), true
	case "submission_type":
		return normalizedSubmissionType(ctx.Submission.SubmissionTypeID.Int()), true
	case "year":
		return formatTimePart(ctx.Time, "2006"), true
	case "month":
		return formatTimePart(ctx.Time, "01"), true
	case "day":
		return formatTimePart(ctx.Time, "02"), true
	case "hour":
		return formatTimePart(ctx.Time, "15"), true
	case "minute":
		return formatTimePart(ctx.Time, "04"), true
	case "file_name_full":
		return fileBase, true
	case "file_name":
		return fileStem, true
	case "file_name_ext":
		return fileStem, true
	case "file_id":
		return ctx.File.FileID.String(), true
	case "number":
		return fmt.Sprintf("%d", ctx.Number), true
	case "ext":
		return ext, true
	case "extension":
		return ext, true
	case "submission_id":
		return ctx.Submission.SubmissionID.String(), true
	case "pool_id":
		if ctx.Pool == nil {
			return "", true
		}
		return ctx.Pool.PoolID.String(), true
	case "pool_name":
		if ctx.Pool == nil {
			return "", true
		}
		return ctx.Pool.Name, true
	default:
		return "", false
	}
}

func downloadTargetsMatch(destinations []string, expectedMD5 string) (bool, int64, string, error) {
	unique := uniqueNonEmptyPaths(destinations)
	if len(unique) == 0 {
		return false, 0, "", nil
	}

	allMatch := true
	var size int64
	source := ""
	for _, destination := range unique {
		result, err := verifyDownloadedFile(destination, expectedMD5)
		if err != nil {
			return false, 0, "", err
		}
		if result.Matches {
			if source == "" {
				source = destination
				size = result.Size
			}
			continue
		}
		allMatch = false
	}
	return allMatch, size, source, nil
}

func ensureDownloadTargetsFromSource(source string, destinations []string, expectedMD5 string) error {
	if strings.TrimSpace(source) == "" {
		return nil
	}

	cleanSource := filepath.Clean(source)
	for _, destination := range uniqueNonEmptyPaths(destinations) {
		cleanDestination := filepath.Clean(destination)
		if cleanDestination == cleanSource {
			continue
		}

		result, err := verifyDownloadedFile(cleanDestination, expectedMD5)
		if err != nil {
			return err
		}
		if result.Matches {
			continue
		}
		if result.Exists {
			if err := os.Remove(cleanDestination); err != nil && !os.IsNotExist(err) {
				return err
			}
		}
		if err := os.MkdirAll(filepath.Dir(cleanDestination), 0o755); err != nil {
			return err
		}
		if err := copyFile(cleanSource, cleanDestination); err != nil {
			return err
		}
	}

	return nil
}

func writeKeywordSidecars(destinations []string, keywords string) error {
	if strings.TrimSpace(keywords) == "" {
		return nil
	}
	for _, destination := range uniqueNonEmptyPaths(destinations) {
		sidecar := stringsTrimExt(destination) + ".txt"
		if err := os.MkdirAll(filepath.Dir(sidecar), 0o755); err != nil {
			return err
		}
		if err := os.WriteFile(sidecar, []byte(keywords), 0o600); err != nil {
			return err
		}
	}
	return nil
}

func copyFile(source, destination string) error {
	in, err := os.Open(source)
	if err != nil {
		return err
	}
	defer in.Close()

	out, err := os.Create(destination)
	if err != nil {
		return err
	}
	defer func() {
		_ = out.Close()
	}()

	if _, err := io.Copy(out, in); err != nil {
		return err
	}
	return out.Sync()
}

func uniqueNonEmptyPaths(paths []string) []string {
	seen := make(map[string]struct{}, len(paths))
	unique := make([]string, 0, len(paths))
	for _, path := range paths {
		clean := filepath.Clean(strings.TrimSpace(path))
		if clean == "." || clean == "" {
			continue
		}
		if _, ok := seen[clean]; ok {
			continue
		}
		seen[clean] = struct{}{}
		unique = append(unique, clean)
	}
	return unique
}

func sanitizePathComponent(value string) string {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return ""
	}

	cleaned := strings.Map(func(r rune) rune {
		switch {
		case r == '/' || r == '\\':
			return '_'
		case r == '<' || r == '>' || r == ':' || r == '"' || r == '|' || r == '?' || r == '*':
			return -1
		case unicode.IsControl(r):
			return -1
		default:
			return r
		}
	}, trimmed)

	cleaned = strings.Trim(cleaned, " .")
	if cleaned == "" {
		return ""
	}
	return cleaned
}

func patternUsesPoolTokens(pattern string) bool {
	return strings.Contains(pattern, "{pool_id}") || strings.Contains(pattern, "{pool_name}")
}

func resolveDownloadTimestamp(submission inkbunny.SubmissionDetails, file inkbunny.File) time.Time {
	for _, candidate := range []string{
		submission.CreateDateUser,
		submission.CreateDateSystem,
		file.CreateDateTimeUser,
		file.CreateDateTime,
	} {
		if parsed, ok := parseDownloadTime(candidate); ok {
			return parsed
		}
	}
	return time.Time{}
}

func parseDownloadTime(value string) (time.Time, bool) {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return time.Time{}, false
	}
	layouts := []string{
		"2006-01-02 15:04:05",
		"2006-01-02T15:04:05",
		time.RFC3339,
	}
	for _, layout := range layouts {
		parsed, err := time.Parse(layout, trimmed)
		if err == nil {
			return parsed, true
		}
	}
	return time.Time{}, false
}

func formatTimePart(value time.Time, layout string) string {
	if value.IsZero() {
		return ""
	}
	return value.Format(layout)
}

func resolveFileNumber(file inkbunny.File) int {
	number := file.SubmissionFileOrder.Int() + 1
	if number <= 0 {
		return 1
	}
	return number
}

func coarseSubmissionRating(submission inkbunny.SubmissionDetails) string {
	name := strings.ToLower(strings.TrimSpace(submission.RatingName))
	if strings.Contains(name, "adult") || strings.Contains(name, "sexual") {
		return "adult"
	}
	if strings.Contains(name, "mature") || strings.Contains(name, "nudity") || strings.Contains(name, "violence") {
		return "mature"
	}
	for _, rating := range submission.Ratings {
		tag := strings.ToLower(strings.TrimSpace(rating.Name))
		if strings.Contains(tag, "sexual") {
			return "adult"
		}
		if strings.Contains(tag, "nudity") || strings.Contains(tag, "violence") {
			return "mature"
		}
	}
	return "general"
}

func normalizedSubmissionType(typeID int) string {
	switch typeID {
	case int(inkbunny.SubmissionTypePicturePinup):
		return "picture"
	case int(inkbunny.SubmissionTypeSketch):
		return "sketch"
	case int(inkbunny.SubmissionTypePictureSeries):
		return "series"
	case int(inkbunny.SubmissionTypeComic):
		return "comic"
	case int(inkbunny.SubmissionTypePortfolio):
		return "portfolio"
	case int(inkbunny.SubmissionTypeShockwaveFlashAnimation),
		int(inkbunny.SubmissionTypeShockwaveFlashInteractive),
		int(inkbunny.SubmissionTypeVideoFeatureLength),
		int(inkbunny.SubmissionTypeVideoAnimation3DCGI):
		return "video"
	case int(inkbunny.SubmissionTypeMusicSingleTrack),
		int(inkbunny.SubmissionTypeMusicAlbum):
		return "music"
	case int(inkbunny.SubmissionTypeWritingDocument):
		return "stories"
	case int(inkbunny.SubmissionTypeCharacterSheet):
		return "character_sheet"
	case int(inkbunny.SubmissionTypePhotography):
		return "photography"
	default:
		return "submission"
	}
}
