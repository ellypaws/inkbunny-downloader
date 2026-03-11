package state

import (
	"crypto/sha1"
	"encoding/hex"
	"maps"
	"strconv"
	"strings"
	"time"

	"github.com/ellypaws/inkbunny"

	"github.com/ellypaws/inkbunny/cmd/downloader/pkg/app/types"
)

const backendDebugEventName = "app-debug-log"

func (a *App) emitDebugLog(level, scope, message string, fields map[string]any) {
	event := types.BackendDebugEvent{
		Timestamp: time.Now().UTC().Format(time.RFC3339Nano),
		Level:     normalizeDebugLevel(level),
		Scope:     scope,
		Message:   message,
		Fields:    cloneDebugFields(fields),
	}
	a.emitRuntimeEvent(backendDebugEventName, event)
	a.emitRuntimeEvent(debugEvent, event)
	a.publishSharedEvent(debugEvent, event)
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
	maps.Copy(cloned, fields)
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

func mergeDebugFields(parts ...map[string]any) map[string]any {
	var merged map[string]any
	for _, part := range parts {
		if len(part) == 0 {
			continue
		}
		if merged == nil {
			merged = make(map[string]any, len(part))
		}
		maps.Copy(merged, part)
	}
	return merged
}

func debugToken(value string) string {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return ""
	}
	if len(trimmed) <= 12 {
		return trimmed
	}
	return trimmed[:6] + "..." + trimmed[len(trimmed)-4:]
}

func debugHashText(value string) string {
	if strings.TrimSpace(value) == "" {
		return ""
	}
	sum := sha1.Sum([]byte(value))
	return hex.EncodeToString(sum[:6])
}

func debugBooleanYNPointer(value *inkbunny.BooleanYN) string {
	if value == nil {
		return "default"
	}
	return value.String()
}

func debugSubmissionTypes(values inkbunny.SubmissionTypes) []int {
	if len(values) == 0 {
		return nil
	}
	types := make([]int, 0, len(values))
	for _, value := range values {
		types = append(types, int(value))
	}
	return types
}

func debugSearchRequestFields(req inkbunny.SubmissionSearchRequest) map[string]any {
	return map[string]any{
		"sid":                 debugToken(req.SID),
		"rid":                 debugToken(req.RID),
		"hasRID":              strings.TrimSpace(req.RID) != "",
		"getRID":              req.GetRID == inkbunny.Yes,
		"page":                req.Page.Int(),
		"perPage":             req.SubmissionsPerPage.Int(),
		"text":                req.Text,
		"joinType":            req.StringJoinType,
		"searchInKeywords":    debugBooleanYNPointer(req.SearchInKeywords),
		"searchInTitle":       debugBooleanYNPointer(req.Title),
		"searchInDescription": debugBooleanYNPointer(req.Description),
		"searchInMD5":         debugBooleanYNPointer(req.MD5),
		"username":            req.Username,
		"userId":              req.UserID.Int(),
		"favoritesUserId":     req.FavsUserID.Int(),
		"unreadSubmissions":   req.UnreadSubmissions == inkbunny.Yes,
		"submissionTypes":     debugSubmissionTypes(req.Type),
		"poolId":              req.PoolID.Int(),
		"daysLimit":           req.DaysLimit.Int(),
		"orderBy":             req.OrderBy,
		"scraps":              req.Scraps,
	}
}

func debugSearchResponseFields(resp inkbunny.SubmissionSearchResponse) map[string]any {
	fields := map[string]any{
		"sid":             debugToken(resp.SID),
		"rid":             debugToken(resp.RID),
		"page":            resp.Page.Int(),
		"pagesCount":      resp.PagesCount.Int(),
		"resultsCountAll": resp.ResultsCountAll.Int(),
		"returnedCount":   len(resp.Submissions),
	}
	if !resp.RIDExpiry.IsZero() {
		fields["ridExpiry"] = resp.RIDExpiry.UTC().Format(time.RFC3339Nano)
		fields["ridExpired"] = time.Now().After(resp.RIDExpiry)
	}
	return fields
}

func debugSearchCacheKeyFields(key searchCacheKey) map[string]any {
	fields := map[string]any{
		"scope":        key.Scope,
		"ratingsMask":  key.RatingsMask,
		"requestHash":  debugHashText(key.RequestJSON),
		"requestBytes": len(key.RequestJSON),
	}
	if strings.TrimSpace(key.RequestJSON) == "" {
		return fields
	}
	req, err := unmarshalSearchRequest([]byte(key.RequestJSON))
	if err != nil {
		fields["requestUnmarshalError"] = err.Error()
		return fields
	}
	fields["request"] = debugSearchRequestFields(req)
	return fields
}

func debugLoadMoreCacheKeyFields(key loadMoreCacheKey) map[string]any {
	return map[string]any{
		"sid":  debugToken(key.SID),
		"rid":  debugToken(key.RID),
		"page": key.Page,
		"key":  debugHashText(key.SID + "|" + key.RID + "|" + strconv.Itoa(key.Page)),
	}
}

func debugSearchStateFields(state *searchState) map[string]any {
	if state == nil {
		return nil
	}
	fields := map[string]any{
		"searchId":          state.ID,
		"sid":               debugToken(state.SID),
		"rid":               debugToken(state.RID),
		"pagesCount":        state.PagesCount,
		"clientPage":        state.ClientPage,
		"nextServerPage":    state.NextServerPage,
		"deliveredCount":    state.DeliveredCount,
		"pendingCount":      len(state.PendingResults),
		"rawResultsCount":   state.RawResultsCount,
		"perPage":           state.PerPage,
		"maxDownloads":      state.MaxDownloads,
		"artistCount":       len(state.ArtistFilters),
		"artistSearchCount": len(state.ArtistSearches),
		"request":           debugSearchRequestFields(state.Request),
	}
	if state.CacheKey.RequestJSON != "" {
		fields["cache"] = debugSearchCacheKeyFields(state.CacheKey)
	}
	if !state.ExpiresAt.IsZero() {
		fields["expiresAt"] = state.ExpiresAt.UTC().Format(time.RFC3339Nano)
		fields["expired"] = time.Now().After(state.ExpiresAt)
	}
	return fields
}

func debugSearchParamsFields(params types.SearchParams) map[string]any {
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
