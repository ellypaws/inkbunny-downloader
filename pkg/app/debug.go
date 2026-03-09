package desktopapp

import (
	"time"

	wruntime "github.com/wailsapp/wails/v2/pkg/runtime"
)

const backendDebugEventName = "app-debug-log"

func (a *App) emitDebugLog(level, scope, message string, fields map[string]any) {
	if a.ctx == nil {
		return
	}
	wruntime.EventsEmit(a.ctx, backendDebugEventName, BackendDebugEvent{
		Timestamp: time.Now().UTC().Format(time.RFC3339Nano),
		Level:     normalizeDebugLevel(level),
		Scope:     scope,
		Message:   message,
		Fields:    cloneDebugFields(fields),
	})
}

func normalizeDebugLevel(level string) string {
	switch level {
	case "error", "warn", "info", "debug":
		return level
	default:
		return "debug"
	}
}

func cloneDebugFields(fields map[string]any) map[string]any {
	if len(fields) == 0 {
		return nil
	}
	cloned := make(map[string]any, len(fields))
	for key, value := range fields {
		cloned[key] = value
	}
	return cloned
}

func withDebugDuration(fields map[string]any, startedAt time.Time) map[string]any {
	next := cloneDebugFields(fields)
	if next == nil {
		next = make(map[string]any, 1)
	}
	next["durationMs"] = time.Since(startedAt).Milliseconds()
	return next
}

func withDebugError(fields map[string]any, err error) map[string]any {
	next := cloneDebugFields(fields)
	if next == nil {
		next = make(map[string]any, 1)
	}
	if err != nil {
		next["error"] = err.Error()
	}
	return next
}

func debugSearchParamsFields(params SearchParams) map[string]any {
	return map[string]any{
		"query":               params.Query,
		"joinType":            params.JoinType,
		"searchInKeywords":    params.SearchInKeywords,
		"searchInTitle":       params.SearchInTitle,
		"searchInDescription": params.SearchInDescription,
		"searchInMD5":         params.SearchInMD5,
		"unreadSubmissions":   params.UnreadSubmissions,
		"artistNames":         params.ArtistNames,
		"artistCount":         len(params.ArtistNames),
		"useWatchingArtists":  params.UseWatchingArtists,
		"favoritesBy":         params.FavoritesBy,
		"poolId":              params.PoolID,
		"scraps":              params.Scraps,
		"timeRangeDays":       params.TimeRangeDays,
		"submissionTypes":     params.SubmissionTypes,
		"orderBy":             params.OrderBy,
		"page":                params.Page,
		"perPage":             params.PerPage,
		"maxDownloads":        params.MaxDownloads,
		"maxActive":           params.MaxActive,
		"saveKeywords":        params.SaveKeywords,
	}
}
