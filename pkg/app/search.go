package desktopapp

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strconv"
	"strings"
	"time"

	"github.com/ellypaws/inkbunny"

	"github.com/ellypaws/inkbunny/cmd/downloader/pkg/flight"
	"github.com/ellypaws/inkbunny/cmd/downloader/pkg/utils"
)

type searchState struct {
	ID              string
	RID             string
	SID             string
	ExpiresAt       time.Time
	PagesCount      int
	ClientPage      int
	NextServerPage  int
	DeliveredCount  int
	MaxDownloads    int
	PerPage         int
	PendingResults  []inkbunny.SubmissionSearch
	RawResultsCount int
	ArtistFilters   []string
	ArtistFilterSet map[string]struct{}
	Request         inkbunny.SubmissionSearchRequest
	CacheKey        searchCacheKey
}

const defaultSearchPerPage = 30

func (a *App) Search(params SearchParams) (resp SearchResponse, err error) {
	startedAt := time.Now()
	a.emitDebugLog("debug", "search.run", "search requested", debugSearchParamsFields(params))
	defer func() {
		fields := withDebugDuration(debugSearchParamsFields(params), startedAt)
		if err != nil {
			a.emitDebugLog("error", "search.run", "search failed", withDebugError(fields, err))
			return
		}
		fields["searchId"] = resp.SearchID
		fields["page"] = resp.Page
		fields["pagesCount"] = resp.PagesCount
		fields["resultsCount"] = resp.ResultsCount
		fields["returnedResults"] = len(resp.Results)
		a.emitDebugLog("info", "search.run", "search completed", fields)
	}()

	ctx, finish := a.beginSearchOperation()
	defer finish()

	user, err := a.ensureSearchSession()
	if err != nil {
		return SearchResponse{}, err
	}
	artistFilters, err := a.resolveArtistFilters(ctx, user, params)
	if err != nil {
		return SearchResponse{}, err
	}
	a.emitDebugLog("debug", "search.run", "artist filters resolved", map[string]any{
		"artistFilters":       artistFilters,
		"artistCount":         len(artistFilters),
		"useWatchingArtists":  params.UseWatchingArtists,
		"requestedArtistList": params.ArtistNames,
	})
	req, err := a.buildSearchRequest(ctx, user, params, artistFilters)
	if err != nil {
		return SearchResponse{}, err
	}
	ratingsMask := userRatingsMask(user)
	key, normalizedReq, err := makeSearchCacheKey(user, ratingsMask, req)
	if err != nil {
		return SearchResponse{}, err
	}
	entry, err := a.cachedSearchResponse(ctx, user, key)
	if err != nil {
		a.emitDebugLog("warn", "search.run", "cached search fetch failed, checking session state", map[string]any{
			"query": params.Query,
			"error": err.Error(),
		})
		if a.handleSessionError(err) {
			user, err = a.ensureSearchSession()
			if err != nil {
				return SearchResponse{}, err
			}
			ratingsMask = userRatingsMask(user)
			key, normalizedReq, err = makeSearchCacheKey(user, ratingsMask, req)
			if err != nil {
				return SearchResponse{}, err
			}
			entry, err = a.cachedSearchResponse(ctx, user, key)
		}
		if err != nil {
			return SearchResponse{}, err
		}
	}
	response := entry.Response
	perPage := int(normalizedReq.SubmissionsPerPage)
	if perPage <= 0 {
		perPage = defaultSearchPerPage
	}
	a.emitDebugLog("debug", "search.run", "search response cached", map[string]any{
		"rawResultsCount":  int(response.ResultsCountAll),
		"serverPagesCount": int(response.PagesCount),
		"perPage":          perPage,
		"query":            params.Query,
	})

	searchID := a.newSearchID()
	state := &searchState{
		ID:              searchID,
		RID:             response.RID,
		SID:             response.SID,
		ExpiresAt:       response.RIDExpiry,
		PagesCount:      int(response.PagesCount),
		ClientPage:      1,
		MaxDownloads:    max(params.MaxDownloads, 0),
		PerPage:         perPage,
		RawResultsCount: int(response.ResultsCountAll),
		ArtistFilters:   artistFilters,
		ArtistFilterSet: buildArtistFilterSet(artistFilters),
		Request:         normalizedReq,
		CacheKey:        key,
	}
	visible, nextServerPage, hasMore, err := a.collectVisibleSearchPage(ctx, user, state, &response)
	if err != nil {
		return SearchResponse{}, err
	}
	state.DeliveredCount = len(visible)
	state.NextServerPage = nextServerPage

	a.mu.Lock()
	a.searches[searchID] = state
	a.lastSearchID = searchID
	a.mu.Unlock()
	_ = a.persist()

	cards, err := a.buildSubmissionCards(ctx, user, visible)
	if err != nil {
		return SearchResponse{}, err
	}

	resp = SearchResponse{
		SearchID:     searchID,
		Page:         state.ClientPage,
		PagesCount:   searchPageCount(state.ClientPage, hasMore),
		ResultsCount: searchResultsCount(state, hasMore),
		Results:      cards,
		Session:      a.GetSession(),
	}
	return resp, nil
}

func (a *App) RefreshSearch(searchID string) (resp SearchResponse, err error) {
	startedAt := time.Now()
	a.emitDebugLog("debug", "search.refresh", "refresh requested", map[string]any{
		"searchId": searchID,
	})
	defer func() {
		fields := withDebugDuration(map[string]any{
			"searchId": searchID,
		}, startedAt)
		if err != nil {
			a.emitDebugLog("error", "search.refresh", "refresh failed", withDebugError(fields, err))
			return
		}
		fields["page"] = resp.Page
		fields["pagesCount"] = resp.PagesCount
		fields["resultsCount"] = resp.ResultsCount
		fields["returnedResults"] = len(resp.Results)
		a.emitDebugLog("info", "search.refresh", "refresh completed", fields)
	}()

	ctx, finish := a.beginSearchOperation()
	defer finish()

	a.mu.RLock()
	state := a.searches[searchID]
	a.mu.RUnlock()
	if state == nil {
		return SearchResponse{}, fmt.Errorf("unknown search ID: %s", searchID)
	}

	user, err := a.ensureSearchSession()
	if err != nil {
		return SearchResponse{}, err
	}

	key, normalizedReq, err := makeSearchCacheKey(user, userRatingsMask(user), state.Request)
	if err != nil {
		return SearchResponse{}, err
	}

	a.ensureCaches(user)
	a.searchCache.Delete(key)

	entry, err := a.cachedSearchResponse(ctx, user, key)
	if err != nil {
		if a.handleSessionError(err) {
			user, err = a.ensureSearchSession()
			if err != nil {
				return SearchResponse{}, err
			}
			key, normalizedReq, err = makeSearchCacheKey(user, userRatingsMask(user), state.Request)
			if err != nil {
				return SearchResponse{}, err
			}
			a.ensureCaches(user)
			a.searchCache.Delete(key)
			entry, err = a.cachedSearchResponse(ctx, user, key)
		}
		if err != nil {
			return SearchResponse{}, err
		}
	}

	a.mu.Lock()
	state.RID = entry.Response.RID
	state.SID = entry.Response.SID
	state.ExpiresAt = entry.Response.RIDExpiry
	state.PagesCount = int(entry.Response.PagesCount)
	state.ClientPage = 1
	state.NextServerPage = 0
	state.DeliveredCount = 0
	state.PendingResults = nil
	state.RawResultsCount = int(entry.Response.ResultsCountAll)
	state.ArtistFilterSet = buildArtistFilterSet(state.ArtistFilters)
	state.Request = normalizedReq
	state.CacheKey = key
	a.mu.Unlock()

	visible, nextServerPage, hasMore, err := a.collectVisibleSearchPage(ctx, user, state, &entry.Response)
	if err != nil {
		return SearchResponse{}, err
	}

	a.mu.Lock()
	state.ClientPage = 1
	state.NextServerPage = nextServerPage
	state.DeliveredCount = len(visible)
	a.mu.Unlock()

	cards, err := a.buildSubmissionCards(ctx, user, visible)
	if err != nil {
		return SearchResponse{}, err
	}

	resp = SearchResponse{
		SearchID:     searchID,
		Page:         1,
		PagesCount:   searchPageCount(1, hasMore),
		ResultsCount: searchResultsCount(state, hasMore),
		Results:      cards,
		Session:      a.GetSession(),
	}
	return resp, nil
}

func (a *App) LoadMoreResults(searchID string, page int) (resp SearchResponse, err error) {
	requestedPage := page
	startedAt := time.Now()
	a.emitDebugLog("debug", "search.loadMore", "load more requested", map[string]any{
		"searchId": searchID,
		"page":     requestedPage,
	})
	defer func() {
		fields := withDebugDuration(map[string]any{
			"searchId": searchID,
			"page":     requestedPage,
		}, startedAt)
		if err != nil {
			a.emitDebugLog("error", "search.loadMore", "load more failed", withDebugError(fields, err))
			return
		}
		fields["resolvedPage"] = resp.Page
		fields["pagesCount"] = resp.PagesCount
		fields["resultsCount"] = resp.ResultsCount
		fields["returnedResults"] = len(resp.Results)
		a.emitDebugLog("info", "search.loadMore", "load more completed", fields)
	}()

	ctx, finish := a.beginSearchOperation()
	defer finish()

	a.mu.RLock()
	state := a.searches[searchID]
	a.mu.RUnlock()
	if state == nil {
		return SearchResponse{}, fmt.Errorf("unknown search ID: %s", searchID)
	}
	if page <= 0 {
		page = state.ClientPage + 1
	}
	user, err := a.ensureSearchSession()
	if err != nil {
		return SearchResponse{}, err
	}
	if !state.ExpiresAt.IsZero() && time.Now().After(state.ExpiresAt) {
		if err := a.refreshSearchState(ctx, user, state); err != nil {
			return SearchResponse{}, err
		}
	}

	visible, nextServerPage, hasMore, err := a.collectVisibleSearchPage(ctx, user, state, nil)
	if err != nil {
		if a.handleSessionError(err) {
			user, err = a.ensureSearchSession()
			if err != nil {
				return SearchResponse{}, err
			}
			if err := a.refreshSearchState(ctx, user, state); err != nil {
				return SearchResponse{}, err
			}
			visible, nextServerPage, hasMore, err = a.collectVisibleSearchPage(ctx, user, state, nil)
		} else if a.handleRIDExpiredError(err) {
			if err := a.refreshSearchStateForced(ctx, user, state); err != nil {
				return SearchResponse{}, err
			}
			visible, nextServerPage, hasMore, err = a.collectVisibleSearchPage(ctx, user, state, nil)
		}
	}
	if err != nil {
		return SearchResponse{}, err
	}

	a.mu.Lock()
	state.ClientPage = page
	state.NextServerPage = nextServerPage
	state.DeliveredCount += len(visible)
	a.mu.Unlock()

	cards, err := a.buildSubmissionCards(ctx, user, visible)
	if err != nil {
		return SearchResponse{}, err
	}

	resp = SearchResponse{
		SearchID:     searchID,
		Page:         page,
		PagesCount:   searchPageCount(page, hasMore),
		ResultsCount: searchResultsCount(state, hasMore),
		Results:      cards,
		Session:      a.GetSession(),
	}
	return resp, nil
}

func (a *App) GetKeywordSuggestions(query string) (values []string, err error) {
	query = strings.TrimSpace(query)
	if query == "" {
		return nil, nil
	}
	startedAt := time.Now()
	defer func() {
		fields := withDebugDuration(map[string]any{
			"query": query,
		}, startedAt)
		if err != nil {
			a.emitDebugLog("error", "suggestions.keyword", "keyword suggestions failed", withDebugError(fields, err))
			return
		}
		fields["count"] = len(values)
		a.emitDebugLog("debug", "suggestions.keyword", "keyword suggestions completed", fields)
	}()

	user, err := a.ensureSearchSession()
	if err != nil {
		return nil, err
	}
	a.ensureCaches(user)

	items, err := a.keywordCache.Get(keywordSuggestionCacheKey(user, query))
	if err != nil {
		return nil, err
	}
	values = make([]string, 0, minInt(len(items), 10))
	for i, item := range items {
		if i >= 10 {
			break
		}
		values = append(values, item.Value)
	}
	return values, nil
}

func (a *App) GetUsernameSuggestions(query string) (values []UsernameSuggestion, err error) {
	query = strings.TrimSpace(query)
	if query == "" {
		return nil, nil
	}
	startedAt := time.Now()
	defer func() {
		fields := withDebugDuration(map[string]any{
			"query": query,
		}, startedAt)
		if err != nil {
			a.emitDebugLog("error", "suggestions.username", "username suggestions failed", withDebugError(fields, err))
			return
		}
		fields["count"] = len(values)
		a.emitDebugLog("debug", "suggestions.username", "username suggestions completed", fields)
	}()

	user, err := a.ensureSearchSession()
	if err != nil {
		return nil, err
	}
	a.ensureCaches(user)

	items, err := a.usernameCache.Get(usernameCacheKey{
		Scope: sessionScope(user),
		Query: normalizeUsername(query),
	})
	if err != nil {
		return nil, err
	}
	values = make([]UsernameSuggestion, 0, minInt(len(items), 10))
	for i, item := range items {
		if i >= 10 {
			break
		}
		values = append(values, item)
	}
	return values, nil
}

func (a *App) GetWatching() (items []UsernameSuggestion, err error) {
	startedAt := time.Now()
	defer func() {
		fields := withDebugDuration(nil, startedAt)
		if err != nil {
			a.emitDebugLog("error", "watching", "watching lookup failed", withDebugError(fields, err))
			return
		}
		fields["count"] = len(items)
		a.emitDebugLog("debug", "watching", "watching lookup completed", fields)
	}()
	return a.getWatching(context.Background())
}

func (a *App) getWatching(ctx context.Context) ([]UsernameSuggestion, error) {
	user, err := a.ensureSearchSession()
	if err != nil {
		return nil, err
	}
	if strings.EqualFold(user.Username, "guest") {
		return nil, errors.New("sign in with a member account to use My watches")
	}

	a.ensureCaches(user)
	items, err := a.watchingCache.GetWithContext(ctx, watchingCacheKey{
		Scope: sessionScope(user),
	})
	if err != nil {
		if a.handleSessionError(err) {
			user, err = a.ensureSearchSession()
			if err != nil {
				return nil, err
			}
			a.ensureCaches(user)
			items, err = a.watchingCache.GetWithContext(ctx, watchingCacheKey{
				Scope: sessionScope(user),
			})
		}
		if err != nil {
			return nil, err
		}
	}
	return items, nil
}

func (a *App) buildSearchRequest(
	ctx context.Context,
	user *inkbunny.User,
	params SearchParams,
	artistFilters []string,
) (inkbunny.SubmissionSearchRequest, error) {
	perPage := params.PerPage
	if perPage <= 0 || perPage > 100 {
		perPage = defaultSearchPerPage
	}
	page := params.Page
	if page <= 0 {
		page = 1
	}
	req := inkbunny.SubmissionSearchRequest{
		SID:                user.SID,
		Text:               strings.TrimSpace(params.Query),
		StringJoinType:     strings.ToLower(strings.TrimSpace(params.JoinType)),
		DaysLimit:          inkbunny.IntString(params.TimeRangeDays),
		OrderBy:            params.OrderBy,
		GetRID:             inkbunny.Yes,
		Page:               inkbunny.IntString(page),
		SubmissionsPerPage: inkbunny.IntString(perPage),
		Scraps:             normalizeScrapsMode(params.Scraps),
	}
	if params.UnreadSubmissions {
		req.UnreadSubmissions = inkbunny.Yes
	}
	if params.PoolID > 0 {
		req.PoolID = inkbunny.IntString(params.PoolID)
	}
	if req.StringJoinType == "" {
		req.StringJoinType = inkbunny.JoinTypeAnd
	}
	if req.OrderBy == "" {
		req.OrderBy = inkbunny.OrderByCreateDatetime
	}
	if !params.UseWatchingArtists && len(artistFilters) == 1 {
		req.Username = artistFilters[0]
	}

	if params.SearchInKeywords {
		req.SearchInKeywords = &inkbunny.Yes
	}
	if params.SearchInTitle {
		req.Title = &inkbunny.Yes
	}
	if params.SearchInDescription {
		req.Description = &inkbunny.Yes
	}
	if params.SearchInMD5 {
		req.MD5 = &inkbunny.Yes
	}
	if req.SearchInKeywords == nil && req.Title == nil && req.Description == nil && req.MD5 == nil {
		req.SearchInKeywords = &inkbunny.Yes
		req.Title = &inkbunny.Yes
	}

	if len(params.SubmissionTypes) > 0 {
		req.Type = make([]inkbunny.SubmissionType, 0, len(params.SubmissionTypes))
		for _, value := range params.SubmissionTypes {
			req.Type = append(req.Type, inkbunny.SubmissionType(value))
		}
	} else {
		req.Type = []inkbunny.SubmissionType{inkbunny.SubmissionTypeAny}
	}

	if favBy := strings.TrimSpace(params.FavoritesBy); favBy != "" {
		member, ok, err := a.lookupUsernameSuggestion(ctx, user, favBy)
		if err != nil {
			return req, err
		}
		if ok {
			favsUserID, convErr := strconv.Atoi(member.UserID)
			if convErr == nil {
				req.FavsUserID = inkbunny.IntString(favsUserID)
			}
		}
	}

	if req.Username != "" {
		member, ok, err := a.lookupUsernameSuggestion(ctx, user, req.Username)
		if err != nil {
			return req, err
		}
		if ok {
			userID, convErr := strconv.Atoi(member.UserID)
			if convErr == nil {
				req.UserID = inkbunny.IntString(userID)
			}
		}
	}

	return req, nil
}

func unmarshalSearchRequest(data []byte) (inkbunny.SubmissionSearchRequest, error) {
	var req inkbunny.SubmissionSearchRequest
	if err := json.Unmarshal(data, &req); err != nil {
		return inkbunny.SubmissionSearchRequest{}, err
	}

	var raw struct {
		Type string `json:"type"`
	}
	if err := json.Unmarshal(data, &raw); err != nil {
		return inkbunny.SubmissionSearchRequest{}, err
	}
	if strings.TrimSpace(raw.Type) == "" {
		return req, nil
	}

	parts := strings.Split(raw.Type, ",")
	req.Type = make(inkbunny.SubmissionTypes, 0, len(parts))
	for _, part := range parts {
		value := strings.TrimSpace(part)
		if value == "" {
			continue
		}
		number, err := strconv.Atoi(value)
		if err != nil {
			return inkbunny.SubmissionSearchRequest{}, fmt.Errorf("parse submission type %q: %w", value, err)
		}
		req.Type = append(req.Type, inkbunny.SubmissionType(number))
	}

	return req, nil
}

func normalizeScrapsMode(value string) inkbunny.Scraps {
	switch inkbunny.Scraps(strings.ToLower(strings.TrimSpace(value))) {
	case inkbunny.ScrapsNo:
		return inkbunny.ScrapsNo
	case inkbunny.ScrapsOnly:
		return inkbunny.ScrapsOnly
	default:
		return inkbunny.ScrapsBoth
	}
}

func (a *App) buildSubmissionCards(
	ctx context.Context,
	user *inkbunny.User,
	submissions []inkbunny.SubmissionSearch,
) ([]SubmissionCard, error) {
	downloadedSubmissions, err := a.lookupDownloadedSubmissions(ctx, user, submissions)
	if err != nil {
		if a.handleSessionError(err) {
			user, err = a.ensureSearchSession()
			if err != nil {
				return nil, err
			}
			downloadedSubmissions, err = a.lookupDownloadedSubmissions(ctx, user, submissions)
		}
		if err != nil {
			return nil, err
		}
	}
	return mapSubmissionCards(submissions, user.SID, downloadedSubmissions), nil
}

func mapSubmissionCards(submissions []inkbunny.SubmissionSearch, sid string, downloadedSubmissions map[string]bool) []SubmissionCard {
	cards := make([]SubmissionCard, 0, len(submissions))
	accents := []string{"rose", "mint", "lavender", "sky"}

	for index, submission := range submissions {
		thumbnail := firstNonEmpty(
			submission.ThumbnailURLHuge,
			submission.ThumbnailURLLarge,
			submission.ThumbnailURLMedium,
			submission.ThumbnailURLHugeNonCustom,
			submission.ThumbnailURLLargeNonCustom,
			submission.ThumbnailURLMediumNonCustom,
		)
		latestThumbnail := firstNonEmpty(
			submission.LatestThumbnailURLHuge,
			submission.LatestThumbnailURLLarge,
			submission.LatestThumbnailURLMedium,
			submission.LatestThumbnailURLHugeNonCustom,
			submission.LatestThumbnailURLLargeNonCustom,
			submission.LatestThumbnailURLMediumNonCustom,
		)

		badge := submission.TypeName
		if badge == "" {
			badge = submission.RatingName
		}

		cards = append(cards, SubmissionCard{
			SubmissionID:     submission.SubmissionID.String(),
			Title:            submission.Title,
			Username:         submission.Username,
			TypeName:         submission.TypeName,
			SubmissionTypeID: int(submission.SubmissionTypeID),
			RatingName:       submission.RatingName,
			IsPublic:         submission.Public.Bool(),
			PageCount:        int(submission.PageCount),
			Updated:          submission.Updated.Bool(),
			FileName:         submission.FileName.String(),
			MimeType:         submission.MimeType,
			LatestMimeType:   submission.LatestMimeType,
			PreviewURL:       submissionResourceURL(submission.FileURLPreview.String(), sid, submission.Public.Bool()),
			ScreenURL:        submissionResourceURL(submission.FileURLScreen.String(), sid, submission.Public.Bool()),
			FullURL:          submissionResourceURL(submission.FileURLFull.String(), sid, submission.Public.Bool()),
			ThumbnailURL:     submissionResourceURL(thumbnail, sid, submission.Public.Bool()),
			LatestThumbnailURL: submissionResourceURL(
				latestThumbnail,
				sid,
				submission.Public.Bool(),
			),
			BadgeText:  badge,
			Accent:     accents[index%len(accents)],
			Downloaded: downloadedSubmissions[submission.SubmissionID.String()],
		})
	}
	return cards
}

func (a *App) lookupDownloadedSubmissions(
	ctx context.Context,
	user *inkbunny.User,
	submissions []inkbunny.SubmissionSearch,
) (map[string]bool, error) {
	downloaded := make(map[string]bool, len(submissions))
	if len(submissions) == 0 {
		return downloaded, nil
	}

	downloadRoot := strings.TrimSpace(a.GetSession().Settings.DownloadDirectory)
	if downloadRoot == "" {
		return downloaded, nil
	}

	submissionIDs := make([]string, 0, len(submissions))
	for _, submission := range submissions {
		id := submission.SubmissionID.String()
		if id == "" {
			continue
		}
		submissionIDs = append(submissionIDs, id)
	}
	if len(submissionIDs) == 0 {
		return downloaded, nil
	}

	details, err := a.cachedSubmissionDetailsBatchedWithContext(ctx, user, submissionIDs)
	if err != nil {
		return nil, err
	}

	downloadPattern := normalizeDownloadPattern(a.GetSession().Settings.DownloadPattern)
	for _, submission := range details.Submissions {
		downloaded[submission.SubmissionID.String()] = submissionFilesDownloaded(downloadRoot, downloadPattern, submission)
	}

	return downloaded, nil
}

func submissionFilesDownloaded(downloadRoot, downloadPattern string, submission inkbunny.SubmissionDetails) bool {
	if len(submission.Files) == 0 {
		return false
	}

	for _, file := range submission.Files {
		matches, _, _, err := downloadTargetsMatch(
			resolveDownloadDestinations(downloadRoot, downloadPattern, submission, file),
			file.FullFileMD5,
		)
		if err != nil || !matches {
			return false
		}
	}

	return true
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return value
		}
	}
	return ""
}

func (a *App) collectVisibleSearchPage(
	ctx context.Context,
	user *inkbunny.User,
	state *searchState,
	initial *inkbunny.SubmissionSearchResponse,
) ([]inkbunny.SubmissionSearch, int, bool, error) {
	if state == nil {
		return nil, 0, false, errors.New("search state is missing")
	}

	remainingLimit := remainingVisibleLimit(state)
	if remainingLimit == 0 {
		return nil, state.NextServerPage, false, nil
	}

	target := state.PerPage
	if remainingLimit > 0 && remainingLimit < target {
		target = remainingLimit
	}
	if target <= 0 {
		target = state.PerPage
	}

	ratingsMask := userRatingsMask(user)
	visible := make([]inkbunny.SubmissionSearch, 0, target)
	nextServerPage := state.NextServerPage
	pagesCount := state.PagesCount
	rawResultsCount := state.RawResultsCount
	pendingResults := state.PendingResults

	if len(pendingResults) > 0 {
		remaining := target
		if len(pendingResults) < remaining {
			remaining = len(pendingResults)
		}
		visible = append(visible, pendingResults[:remaining]...)
		pendingResults = pendingResults[remaining:]
	}

	appendVisible := func(response inkbunny.SubmissionSearchResponse) {
		if rawResultsCount == 0 {
			rawResultsCount = int(response.ResultsCountAll)
		}
		pagesCount = int(response.PagesCount)
		filtered := filterSearchSubmissions(
			response.Submissions,
			ratingsMask,
			state.ArtistFilterSet,
			state.Request.UnreadSubmissions == inkbunny.Yes,
		)
		remaining := target - len(visible)
		if remaining <= 0 {
			pendingResults = append(pendingResults, filtered...)
		} else if len(filtered) > remaining {
			pendingResults = append(pendingResults, filtered[remaining:]...)
			filtered = filtered[:remaining]
		}
		visible = append(visible, filtered...)
		pageNumber := int(response.Page)
		if pageNumber <= 0 {
			pageNumber = 1
		}
		nextServerPage = pageNumber + 1
	}

	if initial != nil {
		appendVisible(*initial)
	}

	for len(visible) < target && nextServerPage > 0 && nextServerPage <= pagesCount {
		if err := ctx.Err(); err != nil {
			return nil, 0, false, err
		}
		response, err := a.cachedLoadMore(ctx, state, nextServerPage)
		if err != nil {
			return nil, 0, false, err
		}
		appendVisible(response)
	}

	state.PagesCount = pagesCount
	state.PendingResults = pendingResults
	state.RawResultsCount = rawResultsCount
	hasMore := len(pendingResults) > 0 || (nextServerPage > 0 && nextServerPage <= pagesCount)
	if remainingLimit > 0 && len(visible) >= remainingLimit {
		hasMore = false
	}

	return visible, nextServerPage, hasMore, nil
}

func (a *App) GetUnreadSubmissionCount() (int, error) {
	user, err := a.ensureSearchSession()
	if err != nil {
		return 0, err
	}

	req := inkbunny.SubmissionSearchRequest{
		SID:                user.SID,
		UnreadSubmissions:  inkbunny.Yes,
		NoSubmissions:      inkbunny.Yes,
		SubmissionsPerPage: 1,
		Page:               1,
	}

	response, err := executeWithRateLimitRetry(a.ctx, a.rateLimiter, "unread submissions", func() (inkbunny.SubmissionSearchResponse, error) {
		current, ensureErr := a.ensureSearchSession()
		if ensureErr != nil {
			return inkbunny.SubmissionSearchResponse{}, ensureErr
		}
		req.SID = current.SID
		return current.SearchSubmissions(req)
	})
	if err != nil {
		if a.handleSessionError(err) {
			user, err = a.ensureSearchSession()
			if err != nil {
				return 0, err
			}
			req.SID = user.SID
			response, err = executeWithRateLimitRetry(a.ctx, a.rateLimiter, "unread submissions", func() (inkbunny.SubmissionSearchResponse, error) {
				return user.SearchSubmissions(req)
			})
		}
		if err != nil {
			return 0, err
		}
	}

	return int(response.ResultsCountAll), nil
}

func remainingVisibleLimit(state *searchState) int {
	if state == nil || state.MaxDownloads <= 0 {
		return -1
	}
	remaining := state.MaxDownloads - state.DeliveredCount
	if remaining < 0 {
		return 0
	}
	return remaining
}

func limitedResultsCount(raw, limit int) int {
	if raw == 0 {
		return 0
	}
	if limit > 0 && limit < raw {
		return limit
	}
	return raw
}

func searchResultsCount(state *searchState, hasMore bool) int {
	if state == nil {
		return 0
	}
	if len(state.ArtistFilterSet) == 0 || strings.TrimSpace(state.Request.Username) != "" {
		return limitedResultsCount(state.RawResultsCount, state.MaxDownloads)
	}
	count := state.DeliveredCount + len(state.PendingResults)
	if state.MaxDownloads > 0 && count > state.MaxDownloads {
		count = state.MaxDownloads
	}
	if !hasMore {
		return count
	}
	return max(count, state.DeliveredCount)
}

func searchPageCount(currentPage int, hasMore bool) int {
	if !hasMore {
		return currentPage
	}
	return currentPage + 1
}

func userRatingsMask(user *inkbunny.User) string {
	if user == nil {
		return effectiveRatingsMask("")
	}
	return effectiveRatingsMask(user.Ratings.String())
}

func keywordSuggestionCacheKey(user *inkbunny.User, query string) keywordCacheKey {
	trimmed := strings.TrimSpace(query)
	return keywordCacheKey{
		Query:       trimmed,
		RatingsMask: userRatingsMask(user),
		Underscore:  strings.Contains(trimmed, "_"),
	}
}

func effectiveRatingsMask(mask string) string {
	canonical := [5]byte{'1', '0', '0', '0', '0'}
	trimmed := strings.TrimSpace(mask)
	if trimmed != "" {
		canonical[0] = '0'
	}
	for index := 0; index < len(trimmed) && index < len(canonical); index++ {
		if trimmed[index] == '1' {
			canonical[index] = '1'
		}
	}
	matureEnabled := canonical[1] == '1' || canonical[2] == '1'
	adultEnabled := canonical[3] == '1' || canonical[4] == '1'
	if matureEnabled {
		canonical[1] = '1'
		canonical[2] = '1'
	} else {
		canonical[1] = '0'
		canonical[2] = '0'
	}
	if adultEnabled {
		canonical[3] = '1'
		canonical[4] = '1'
	} else {
		canonical[3] = '0'
		canonical[4] = '0'
	}
	if canonical[0] != '1' && !matureEnabled && !adultEnabled {
		canonical[0] = '1'
	}
	return string(canonical[:])
}

func filterSearchSubmissions(
	submissions []inkbunny.SubmissionSearch,
	mask string,
	artistFilters map[string]struct{},
	skipRatings bool,
) []inkbunny.SubmissionSearch {
	allowed := allowedRatings(mask)
	filtered := make([]inkbunny.SubmissionSearch, 0, len(submissions))
	for _, submission := range submissions {
		if len(artistFilters) > 0 {
			if _, ok := artistFilters[normalizeUsername(submission.Username)]; !ok {
				continue
			}
		}
		if !skipRatings && !submissionAllowedByRatings(submission, allowed) {
			continue
		}
		filtered = append(filtered, submission)
	}
	return filtered
}

func allowedRatings(mask string) [3]bool {
	effective := effectiveRatingsMask(mask)
	return [3]bool{
		effective[0] == '1',
		effective[1] == '1' || effective[2] == '1',
		effective[3] == '1' || effective[4] == '1',
	}
}

func submissionAllowedByRatings(submission inkbunny.SubmissionSearch, allowed [3]bool) bool {
	ratingID, ok := submissionRatingID(submission)
	if !ok {
		return true
	}
	if ratingID < 0 || ratingID >= len(allowed) {
		return true
	}
	return allowed[ratingID]
}

func submissionRatingID(submission inkbunny.SubmissionSearch) (int, bool) {
	name := strings.ToLower(strings.TrimSpace(submission.RatingName))
	if name != "" {
		switch {
		case strings.Contains(name, "adult") || strings.Contains(name, "sexual") || strings.Contains(name, "strong violence"):
			return 2, true
		case strings.Contains(name, "mature") || strings.Contains(name, "nudity") || strings.Contains(name, "mild violence"):
			return 1, true
		case strings.Contains(name, "general"):
			return 0, true
		}
	}

	if ratingID := int(submission.RatingID); ratingID >= 0 && ratingID <= 2 {
		return ratingID, true
	}
	return 0, false
}

func submissionResourceURL(raw string, sid string, isPublic bool) string {
	return utils.ResourceURL(raw, sid, isPublic)
}

func normalizeArtistFilters(values []string) []string {
	seen := make(map[string]struct{}, len(values))
	normalized := make([]string, 0, len(values))
	for _, value := range values {
		trimmed := strings.TrimSpace(value)
		if trimmed == "" {
			continue
		}
		key := normalizeUsername(trimmed)
		if _, ok := seen[key]; ok {
			continue
		}
		seen[key] = struct{}{}
		normalized = append(normalized, trimmed)
	}
	return normalized
}

func buildArtistFilterSet(values []string) map[string]struct{} {
	if len(values) == 0 {
		return nil
	}
	filters := make(map[string]struct{}, len(values))
	for _, value := range values {
		key := normalizeUsername(value)
		if key == "" {
			continue
		}
		filters[key] = struct{}{}
	}
	if len(filters) == 0 {
		return nil
	}
	return filters
}

func mapWatchingSuggestions(items []inkbunny.UsernameID) []UsernameSuggestion {
	suggestions := make([]UsernameSuggestion, 0, len(items))
	seen := make(map[string]struct{}, len(items))
	for _, item := range items {
		username := strings.TrimSpace(item.Username)
		if username == "" {
			continue
		}
		key := normalizeUsername(username)
		if _, ok := seen[key]; ok {
			continue
		}
		seen[key] = struct{}{}
		suggestions = append(suggestions, UsernameSuggestion{
			UserID:    strings.TrimSpace(item.UserID),
			Value:     username,
			Username:  username,
			AvatarURL: defaultAvatarURL,
		})
	}
	return suggestions
}

func (a *App) resolveArtistFilters(
	ctx context.Context,
	user *inkbunny.User,
	params SearchParams,
) ([]string, error) {
	if params.UseWatchingArtists {
		items, err := a.getWatching(ctx)
		if err != nil {
			return nil, err
		}
		values := make([]string, 0, len(items))
		for _, item := range items {
			values = append(values, item.Username)
		}
		filters := normalizeArtistFilters(values)
		if len(filters) == 0 {
			return nil, errors.New("your watch list is empty")
		}
		return filters, nil
	}
	return normalizeArtistFilters(params.ArtistNames), nil
}

func (a *App) ensureCaches(user *inkbunny.User) {
	a.cacheMu.Lock()
	defer a.cacheMu.Unlock()

	if a.keywordCache == nil {
		cache := flight.NewCache(func(ctx context.Context, key keywordCacheKey) ([]inkbunny.KeywordAutocomplete, error) {
			return executeWithRateLimitRetry(ctx, a.rateLimiter, "keyword suggestions", func() ([]inkbunny.KeywordAutocomplete, error) {
				ratings := inkbunny.ParseMask(key.RatingsMask)
				return inkbunny.KeywordSuggestion(key.Query, ratings, key.Underscore)
			})
		})
		a.keywordCache = &cache
	}
	if a.usernameCache == nil {
		cache := flight.NewCache(func(ctx context.Context, key usernameCacheKey) ([]UsernameSuggestion, error) {
			return executeWithRateLimitRetry(ctx, a.rateLimiter, "username suggestions", func() ([]UsernameSuggestion, error) {
				current, err := a.ensureSearchSession()
				if err != nil {
					return nil, err
				}
				items, err := current.SearchMembers(key.Query)
				if err != nil {
					return nil, err
				}
				suggestions := mapUsernameSuggestions(items)
				avatar := defaultAvatarURL
				a.mu.RLock()
				if a.sessionAvatar != "" {
					avatar = a.sessionAvatar
				}
				a.mu.RUnlock()
				return prependCurrentUserSuggestion(suggestions, current, avatar, key.Query), nil
			})
		})
		a.usernameCache = &cache
	}
	if a.avatarCache == nil {
		cache := flight.NewCache(func(ctx context.Context, key avatarCacheKey) (string, error) {
			return executeWithRateLimitRetry(ctx, a.rateLimiter, "avatar lookups", func() (string, error) {
				current, err := a.ensureSearchSession()
				if err != nil {
					return "", err
				}
				member, ok, err := a.lookupUsernameSuggestion(ctx, current, key.Username)
				if err != nil {
					return "", err
				}
				if ok && member.AvatarURL != "" {
					return member.AvatarURL, nil
				}
				return defaultAvatarURL, nil
			})
		})
		a.avatarCache = &cache
	}
	if a.watchingCache == nil {
		cache := flight.NewCache(func(ctx context.Context, key watchingCacheKey) ([]UsernameSuggestion, error) {
			return executeWithRateLimitRetry(ctx, a.rateLimiter, "watch list", func() ([]UsernameSuggestion, error) {
				current, err := a.ensureSearchSession()
				if err != nil {
					return nil, err
				}
				if strings.EqualFold(current.Username, "guest") {
					return nil, errors.New("sign in with a member account to use My watches")
				}
				items, err := current.GetWatching()
				if err != nil {
					return nil, err
				}
				return mapWatchingSuggestions(items), nil
			})
		})
		a.watchingCache = &cache
	}
	if a.searchCache == nil {
		cache := flight.NewCache(func(ctx context.Context, key searchCacheKey) (cachedSearchResult, error) {
			return executeWithRateLimitRetry(ctx, a.rateLimiter, "search", func() (cachedSearchResult, error) {
				req, err := unmarshalSearchRequest([]byte(key.RequestJSON))
				if err != nil {
					return cachedSearchResult{}, err
				}
				current, err := a.ensureSearchSession()
				if err != nil {
					return cachedSearchResult{}, err
				}
				req.SID = current.SID
				response, err := current.SearchSubmissions(req)
				if err != nil {
					return cachedSearchResult{}, err
				}
				return cachedSearchResult{
					Request:  req,
					Response: response,
				}, nil
			})
		})
		a.searchCache = &cache
	}
	if a.loadMoreCache == nil {
		cache := flight.NewCache(func(ctx context.Context, key loadMoreCacheKey) (inkbunny.SubmissionSearchResponse, error) {
			return executeWithRateLimitRetry(ctx, a.rateLimiter, "search results", func() (inkbunny.SubmissionSearchResponse, error) {
				return inkbunny.SearchSubmissions(inkbunny.SubmissionSearchRequest{
					SID:  key.SID,
					RID:  key.RID,
					Page: inkbunny.IntString(key.Page),
				})
			})
		})
		a.loadMoreCache = &cache
	}
	if a.detailsCache == nil {
		cache := flight.NewCache(func(ctx context.Context, key detailsCacheKey) (inkbunny.SubmissionDetailsResponse, error) {
			return executeWithRateLimitRetry(ctx, a.rateLimiter, "submission details", func() (inkbunny.SubmissionDetailsResponse, error) {
				current, err := a.ensureSearchSession()
				if err != nil {
					return inkbunny.SubmissionDetailsResponse{}, err
				}
				ids := strings.Split(key.SubmissionIDs, ",")
				return current.SubmissionDetails(inkbunny.SubmissionDetailsRequest{
					SID:               key.SID,
					SubmissionIDSlice: ids,
					ShowPools:         inkbunny.Yes,
				})
			})
		})
		a.detailsCache = &cache
	}
}

func (a *App) resetCaches(user *inkbunny.User) {
	a.cacheMu.Lock()
	defer a.cacheMu.Unlock()

	keywordCache := flight.NewCache(func(ctx context.Context, key keywordCacheKey) ([]inkbunny.KeywordAutocomplete, error) {
		return executeWithRateLimitRetry(ctx, a.rateLimiter, "keyword suggestions", func() ([]inkbunny.KeywordAutocomplete, error) {
			ratings := inkbunny.ParseMask(key.RatingsMask)
			return inkbunny.KeywordSuggestion(key.Query, ratings, key.Underscore)
		})
	})
	usernameCache := flight.NewCache(func(ctx context.Context, key usernameCacheKey) ([]UsernameSuggestion, error) {
		return executeWithRateLimitRetry(ctx, a.rateLimiter, "username suggestions", func() ([]UsernameSuggestion, error) {
			current, err := a.ensureSearchSession()
			if err != nil {
				return nil, err
			}
			items, err := current.SearchMembers(key.Query)
			if err != nil {
				return nil, err
			}
			suggestions := mapUsernameSuggestions(items)
			avatar := defaultAvatarURL
			a.mu.RLock()
			if a.sessionAvatar != "" {
				avatar = a.sessionAvatar
			}
			a.mu.RUnlock()
			return prependCurrentUserSuggestion(suggestions, current, avatar, key.Query), nil
		})
	})
	avatarCache := flight.NewCache(func(ctx context.Context, key avatarCacheKey) (string, error) {
		return executeWithRateLimitRetry(ctx, a.rateLimiter, "avatar lookups", func() (string, error) {
			current, err := a.ensureSearchSession()
			if err != nil {
				return "", err
			}
			member, ok, err := a.lookupUsernameSuggestion(ctx, current, key.Username)
			if err != nil {
				return "", err
			}
			if ok && member.AvatarURL != "" {
				return member.AvatarURL, nil
			}
			return defaultAvatarURL, nil
		})
	})
	watchingCache := flight.NewCache(func(ctx context.Context, key watchingCacheKey) ([]UsernameSuggestion, error) {
		return executeWithRateLimitRetry(ctx, a.rateLimiter, "watch list", func() ([]UsernameSuggestion, error) {
			current, err := a.ensureSearchSession()
			if err != nil {
				return nil, err
			}
			if strings.EqualFold(current.Username, "guest") {
				return nil, errors.New("sign in with a member account to use My watches")
			}
			items, err := current.GetWatching()
			if err != nil {
				return nil, err
			}
			return mapWatchingSuggestions(items), nil
		})
	})
	searchCache := flight.NewCache(func(ctx context.Context, key searchCacheKey) (cachedSearchResult, error) {
		return executeWithRateLimitRetry(ctx, a.rateLimiter, "search", func() (cachedSearchResult, error) {
			req, err := unmarshalSearchRequest([]byte(key.RequestJSON))
			if err != nil {
				return cachedSearchResult{}, err
			}
			current, err := a.ensureSearchSession()
			if err != nil {
				return cachedSearchResult{}, err
			}
			req.SID = current.SID
			response, err := current.SearchSubmissions(req)
			if err != nil {
				return cachedSearchResult{}, err
			}
			return cachedSearchResult{
				Request:  req,
				Response: response,
			}, nil
		})
	})
	loadMoreCache := flight.NewCache(func(ctx context.Context, key loadMoreCacheKey) (inkbunny.SubmissionSearchResponse, error) {
		return executeWithRateLimitRetry(ctx, a.rateLimiter, "search results", func() (inkbunny.SubmissionSearchResponse, error) {
			return inkbunny.SearchSubmissions(inkbunny.SubmissionSearchRequest{
				SID:  key.SID,
				RID:  key.RID,
				Page: inkbunny.IntString(key.Page),
			})
		})
	})
	detailsCache := flight.NewCache(func(ctx context.Context, key detailsCacheKey) (inkbunny.SubmissionDetailsResponse, error) {
		return executeWithRateLimitRetry(ctx, a.rateLimiter, "submission details", func() (inkbunny.SubmissionDetailsResponse, error) {
			current, err := a.ensureSearchSession()
			if err != nil {
				return inkbunny.SubmissionDetailsResponse{}, err
			}
			ids := strings.Split(key.SubmissionIDs, ",")
			return current.SubmissionDetails(inkbunny.SubmissionDetailsRequest{
				SID:               key.SID,
				SubmissionIDSlice: ids,
				ShowPools:         inkbunny.Yes,
			})
		})
	})
	a.keywordCache = &keywordCache
	a.usernameCache = &usernameCache
	a.avatarCache = &avatarCache
	a.watchingCache = &watchingCache
	a.searchCache = &searchCache
	a.loadMoreCache = &loadMoreCache
	a.detailsCache = &detailsCache
}

func (a *App) handleSessionError(err error) bool {
	code, ok := inkbunnyErrorCode(err)
	if ok && code == inkbunny.ErrInvalidSessionID {
		a.clearSession()
		return true
	}
	return false
}

func (a *App) handleRIDExpiredError(err error) bool {
	code, ok := inkbunnyErrorCode(err)
	return ok && (code == inkbunny.ErrNoResultsFound || code == inkbunny.ErrInvalidResultsID)
}

func inkbunnyErrorCode(err error) (int, bool) {
	if err == nil {
		return 0, false
	}

	var apiErr inkbunny.ErrorResponse
	if errors.As(err, &apiErr) && apiErr.Code != nil {
		return *apiErr.Code, true
	}

	message := strings.TrimSpace(err.Error())
	if !strings.HasPrefix(message, "[") {
		return 0, false
	}

	end := strings.Index(message, "]")
	if end <= 1 {
		return 0, false
	}

	code, parseErr := strconv.Atoi(message[1:end])
	if parseErr != nil {
		return 0, false
	}
	return code, true
}

func (a *App) newSearchID() string {
	a.searchIDMu.Lock()
	defer a.searchIDMu.Unlock()
	a.searchCounter++
	return fmt.Sprintf("search-%d", a.searchCounter)
}

func minInt(a, b int) int {
	if a < b {
		return a
	}
	return b
}

func (a *App) lookupUsernameSuggestion(
	ctx context.Context,
	user *inkbunny.User,
	username string,
) (UsernameSuggestion, bool, error) {
	a.ensureCaches(user)
	items, err := a.usernameCache.GetWithContext(ctx, usernameCacheKey{
		Scope: sessionScope(user),
		Query: normalizeUsername(username),
	})
	if err != nil {
		return UsernameSuggestion{}, false, err
	}
	for _, item := range items {
		if matchUsernameSuggestion(item, username) {
			return item, true, nil
		}
	}
	return UsernameSuggestion{}, false, nil
}

func (a *App) cachedSearchResponse(
	ctx context.Context,
	user *inkbunny.User,
	key searchCacheKey,
) (cachedSearchResult, error) {
	a.ensureCaches(user)
	entry, err := a.searchCache.GetWithContext(ctx, key)
	if err != nil {
		return cachedSearchResult{}, err
	}
	if !entry.Response.RIDExpiry.IsZero() && time.Now().After(entry.Response.RIDExpiry) {
		a.searchCache.Delete(key)
		return a.searchCache.GetWithContext(ctx, key)
	}
	return entry, nil
}

func (a *App) refreshSearchState(ctx context.Context, user *inkbunny.User, state *searchState) error {
	return a.refreshSearchStateWithOptions(ctx, user, state, false)
}

func (a *App) refreshSearchStateForced(ctx context.Context, user *inkbunny.User, state *searchState) error {
	return a.refreshSearchStateWithOptions(ctx, user, state, true)
}

func (a *App) refreshSearchStateWithOptions(
	ctx context.Context,
	user *inkbunny.User,
	state *searchState,
	force bool,
) error {
	if state == nil {
		return errors.New("search state is missing")
	}
	key, normalizedReq, err := makeSearchCacheKey(user, userRatingsMask(user), state.Request)
	if err != nil {
		return err
	}
	if force {
		a.ensureCaches(user)
		a.searchCache.Delete(key)
	}
	entry, err := a.cachedSearchResponse(ctx, user, key)
	if err != nil {
		return err
	}
	state.RID = entry.Response.RID
	state.SID = entry.Response.SID
	state.ExpiresAt = entry.Response.RIDExpiry
	state.PagesCount = int(entry.Response.PagesCount)
	state.RawResultsCount = int(entry.Response.ResultsCountAll)
	state.Request = normalizedReq
	state.CacheKey = key
	return nil
}

func (a *App) cachedLoadMore(
	ctx context.Context,
	state *searchState,
	page int,
) (inkbunny.SubmissionSearchResponse, error) {
	if state == nil {
		return inkbunny.SubmissionSearchResponse{}, errors.New("search state is missing")
	}
	a.ensureCaches(a.user)
	return a.loadMoreCache.GetWithContext(ctx, loadMoreCacheKey{
		SID:  state.SID,
		RID:  state.RID,
		Page: page,
	})
}
