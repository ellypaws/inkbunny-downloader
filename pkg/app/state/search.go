package state

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/url"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/ellypaws/inkbunny"

	"github.com/ellypaws/inkbunny/cmd/downloader/pkg/app/downloads"
	"github.com/ellypaws/inkbunny/cmd/downloader/pkg/app/types"
	apputils "github.com/ellypaws/inkbunny/cmd/downloader/pkg/app/utils"
	"github.com/ellypaws/inkbunny/cmd/downloader/pkg/flight"
	baseutils "github.com/ellypaws/inkbunny/cmd/downloader/pkg/utils"
)

type searchState struct {
	mu              sync.Mutex
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
	SeenResults     map[string]inkbunny.SubmissionSearch
	RawResultsCount int
	ArtistFilters   []string
	ArtistFilterSet map[string]struct{}
	ArtistSearches  []artistSearchState
	Request         inkbunny.SubmissionSearchRequest
	CacheKey        searchCacheKey
}

const orderByUnreadDatetimeReverse inkbunny.OrderBy = "unread_datetime_reverse"

func normalizeSearchOrderBy(
	orderBy inkbunny.OrderBy,
	favsUserID inkbunny.IntString,
	unreadSubmissions inkbunny.BooleanYN,
) inkbunny.OrderBy {
	normalizedOrderBy := strings.TrimSpace(orderBy)
	defaultOrderBy := inkbunny.OrderByCreateDatetime
	if unreadSubmissions == inkbunny.Yes {
		defaultOrderBy = inkbunny.OrderByUnreadDatetime
	}
	if normalizedOrderBy == "" {
		return defaultOrderBy
	}
	if unreadSubmissions == inkbunny.Yes && normalizedOrderBy == inkbunny.OrderByCreateDatetime {
		normalizedOrderBy = inkbunny.OrderByUnreadDatetime
	}
	if unreadSubmissions != inkbunny.Yes && (normalizedOrderBy == inkbunny.OrderByUnreadDatetime || normalizedOrderBy == orderByUnreadDatetimeReverse) {
		normalizedOrderBy = inkbunny.OrderByCreateDatetime
	}
	if favsUserID <= 0 && (normalizedOrderBy == inkbunny.OrderByFavDatetime || normalizedOrderBy == inkbunny.OrderByFavStars) {
		return defaultOrderBy
	}
	return normalizedOrderBy
}

type artistSearchState struct {
	Username           string
	RID                string
	SID                string
	ExpiresAt          time.Time
	PagesCount         int
	NextServerPage     int
	RawResultsCount    int
	FetchedResultCount int
	Request            inkbunny.SubmissionSearchRequest
	CacheKey           searchCacheKey
}

const defaultSearchPerPage = 30
const maxSearchPerPage = 100

func (a *App) Search(params types.SearchParams) (resp types.SearchResponse, err error) {
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

	ctx, finish := a.beginSearchOperation(params.ClientOperationID)
	defer finish()

	user, err := a.ensureSearchSession()
	if err != nil {
		return types.SearchResponse{}, err
	}
	artistFilters, err := a.resolveArtistFilters(ctx, user, params)
	if err != nil {
		return types.SearchResponse{}, err
	}
	a.emitDebugLog("debug", "search.run", "artist filters resolved", map[string]any{
		"artistFilters":       artistFilters,
		"artistCount":         len(artistFilters),
		"useWatchingArtists":  params.UseWatchingArtists,
		"requestedArtistList": params.ArtistNames,
	})
	if len(artistFilters) > 1 {
		return a.searchMultipleArtists(ctx, user, params, artistFilters)
	}
	req, err := a.buildSearchRequest(ctx, user, params, artistFilters)
	if err != nil {
		return types.SearchResponse{}, err
	}
	a.emitDebugLog("debug", "search.run", "search request built", map[string]any{
		"artistFilters": artistFilters,
		"request":       debugSearchRequestFields(req),
	})
	ratingsMask := userRatingsMask(user)
	key, normalizedReq, err := makeSearchCacheKey(user, ratingsMask, req)
	if err != nil {
		return types.SearchResponse{}, err
	}
	a.emitDebugLog("debug", "search.run", "search cache key prepared", map[string]any{
		"cache": debugSearchCacheKeyFields(key),
	})
	entry, err := a.cachedSearchResponse(ctx, user, key)
	if err != nil {
		a.emitDebugLog("warn", "search.run", "cached search fetch failed, checking session state", map[string]any{
			"query": params.Query,
			"cache": debugSearchCacheKeyFields(key),
			"error": err.Error(),
		})
		if a.handleSessionError(err) {
			user, err = a.ensureSearchSession()
			if err != nil {
				return types.SearchResponse{}, err
			}
			ratingsMask = userRatingsMask(user)
			key, normalizedReq, err = makeSearchCacheKey(user, ratingsMask, req)
			if err != nil {
				return types.SearchResponse{}, err
			}
			entry, err = a.cachedSearchResponse(ctx, user, key)
		}
		if err != nil {
			return types.SearchResponse{}, err
		}
	}
	response := entry.Response
	perPage := normalizeSearchPerPage(int(normalizedReq.SubmissionsPerPage))
	a.emitDebugLog("debug", "search.run", "search response cached", map[string]any{
		"query":    params.Query,
		"cache":    debugSearchCacheKeyFields(key),
		"response": debugSearchResponseFields(response),
		"perPage":  perPage,
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
	a.emitDebugLog("debug", "search.run", "search state initialized", debugSearchStateFields(state))
	visible, nextServerPage, hasMore, err := a.collectVisibleSearchPage(ctx, user, state, &response)
	if err != nil {
		return types.SearchResponse{}, err
	}
	rememberSearchResults(state, visible)
	state.DeliveredCount = len(visible)
	state.NextServerPage = nextServerPage

	a.mu.Lock()
	a.searches[searchID] = state
	a.lastSearchID = searchID
	a.mu.Unlock()
	_ = a.persist()
	a.broadcastSessionState()

	cards, missingSubmissionIDs := a.buildSubmissionCards(user, visible)
	a.hydrateSubmissionCardsAsync(searchID, user, visible, missingSubmissionIDs)

	resp = types.SearchResponse{
		SearchID:     searchID,
		Page:         state.ClientPage,
		PagesCount:   searchPageCount(state),
		ResultsCount: searchResultsCount(state, hasMore),
		Results:      cards,
		Session:      a.GetSession(),
	}
	return resp, nil
}

func (a *App) searchMultipleArtists(
	ctx context.Context,
	user *inkbunny.User,
	params types.SearchParams,
	artistFilters []string,
) (types.SearchResponse, error) {
	requests, err := a.buildArtistSearchRequests(ctx, user, params, artistFilters)
	if err != nil {
		return types.SearchResponse{}, err
	}

	perPage := normalizeSearchPerPage(params.PerPage)
	ratingsMask := userRatingsMask(user)
	streams := make([]artistSearchState, 0, len(requests))
	pending := make([]inkbunny.SubmissionSearch, 0, perPage*len(requests))
	totalRaw := 0

	for index, req := range requests {
		key, normalizedReq, entry, fetchErr := a.loadArtistSearchEntry(ctx, user, req, false)
		if fetchErr != nil {
			return types.SearchResponse{}, fetchErr
		}
		filtered := filterSearchSubmissions(
			entry.Response.Submissions,
			ratingsMask,
			nil,
			normalizedReq.UnreadSubmissions == inkbunny.Yes,
		)
		pageNumber := int(entry.Response.Page)
		if pageNumber <= 0 {
			pageNumber = 1
		}
		streams = append(streams, artistSearchState{
			Username:           artistFilters[index],
			RID:                entry.Response.RID,
			SID:                entry.Response.SID,
			ExpiresAt:          entry.Response.RIDExpiry,
			PagesCount:         int(entry.Response.PagesCount),
			NextServerPage:     pageNumber + 1,
			RawResultsCount:    int(entry.Response.ResultsCountAll),
			FetchedResultCount: len(filtered),
			Request:            normalizedReq,
			CacheKey:           key,
		})
		totalRaw += int(entry.Response.ResultsCountAll)
		pending = append(pending, filtered...)
	}

	searchID := a.newSearchID()
	state := &searchState{
		ID:              searchID,
		ClientPage:      1,
		MaxDownloads:    max(params.MaxDownloads, 0),
		PerPage:         perPage,
		PendingResults:  pending,
		RawResultsCount: totalRaw,
		ArtistFilters:   artistFilters,
		ArtistFilterSet: buildArtistFilterSet(artistFilters),
		ArtistSearches:  streams,
		Request:         streams[0].Request,
	}

	visible, _, hasMore, err := a.collectVisibleSearchPage(ctx, user, state, nil)
	if err != nil {
		return types.SearchResponse{}, err
	}
	rememberSearchResults(state, visible)
	state.DeliveredCount = len(visible)

	cards, missingSubmissionIDs := a.buildSubmissionCards(user, visible)
	a.hydrateSubmissionCardsAsync(searchID, user, visible, missingSubmissionIDs)

	a.mu.Lock()
	a.searches[searchID] = state
	a.lastSearchID = searchID
	a.mu.Unlock()

	return types.SearchResponse{
		SearchID:     searchID,
		Page:         1,
		PagesCount:   searchPageCount(state),
		ResultsCount: searchResultsCount(state, hasMore),
		Results:      cards,
		Session:      a.GetSession(),
	}, nil
}

func (a *App) RefreshSearch(searchID string, operationID string) (resp types.SearchResponse, err error) {
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

	ctx, finish := a.beginSearchOperation(operationID)
	defer finish()

	a.mu.RLock()
	state := a.searches[searchID]
	a.mu.RUnlock()
	if state == nil {
		return types.SearchResponse{}, fmt.Errorf("unknown search ID: %s", searchID)
	}
	state.mu.Lock()
	defer state.mu.Unlock()
	a.emitDebugLog("debug", "search.refresh", "refresh state snapshot", debugSearchStateFields(state))

	user, err := a.ensureSearchSession()
	if err != nil {
		return types.SearchResponse{}, err
	}
	if len(state.ArtistSearches) > 0 {
		if err := a.resetMultiArtistSearchState(ctx, user, state, true); err != nil {
			return types.SearchResponse{}, err
		}

		visible, _, hasMore, err := a.collectVisibleSearchPage(ctx, user, state, nil)
		if err != nil {
			return types.SearchResponse{}, err
		}
		state.SeenResults = nil
		rememberSearchResults(state, visible)

		a.mu.Lock()
		state.ClientPage = 1
		state.DeliveredCount = len(visible)
		a.mu.Unlock()

		cards, missingSubmissionIDs := a.buildSubmissionCards(user, visible)
		a.hydrateSubmissionCardsAsync(searchID, user, visible, missingSubmissionIDs)

		resp = types.SearchResponse{
			SearchID:     searchID,
			Page:         1,
			PagesCount:   searchPageCount(state),
			ResultsCount: searchResultsCount(state, hasMore),
			Results:      cards,
			Session:      a.GetSession(),
		}
		return resp, nil
	}

	key, normalizedReq, err := makeSearchCacheKey(user, userRatingsMask(user), state.Request)
	if err != nil {
		return types.SearchResponse{}, err
	}

	a.ensureCaches(user)
	a.searchCache.Delete(key)
	a.emitDebugLog("debug", "search.refresh", "search cache invalidated before refresh", map[string]any{
		"cache": debugSearchCacheKeyFields(key),
	})

	entry, err := a.cachedSearchResponse(ctx, user, key)
	if err != nil {
		if a.handleSessionError(err) {
			user, err = a.ensureSearchSession()
			if err != nil {
				return types.SearchResponse{}, err
			}
			key, normalizedReq, err = makeSearchCacheKey(user, userRatingsMask(user), state.Request)
			if err != nil {
				return types.SearchResponse{}, err
			}
			a.ensureCaches(user)
			a.searchCache.Delete(key)
			entry, err = a.cachedSearchResponse(ctx, user, key)
		}
		if err != nil {
			return types.SearchResponse{}, err
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
		return types.SearchResponse{}, err
	}
	state.SeenResults = nil
	rememberSearchResults(state, visible)

	a.mu.Lock()
	state.ClientPage = 1
	state.NextServerPage = nextServerPage
	state.DeliveredCount = len(visible)
	a.mu.Unlock()

	cards, missingSubmissionIDs := a.buildSubmissionCards(user, visible)
	a.hydrateSubmissionCardsAsync(searchID, user, visible, missingSubmissionIDs)

	resp = types.SearchResponse{
		SearchID:     searchID,
		Page:         1,
		PagesCount:   searchPageCount(state),
		ResultsCount: searchResultsCount(state, hasMore),
		Results:      cards,
		Session:      a.GetSession(),
	}
	return resp, nil
}

func (a *App) LoadMoreResults(searchID string, page int, operationID string) (resp types.SearchResponse, err error) {
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

	ctx, finish := a.beginSearchOperation(operationID)
	defer finish()

	a.mu.RLock()
	state := a.searches[searchID]
	a.mu.RUnlock()
	if state == nil {
		return types.SearchResponse{}, fmt.Errorf("unknown search ID: %s", searchID)
	}
	state.mu.Lock()
	defer state.mu.Unlock()
	a.emitDebugLog("debug", "search.loadMore", "load more state snapshot", mergeDebugFields(
		map[string]any{
			"requestedPage": requestedPage,
		},
		debugSearchStateFields(state),
	))
	if page <= 0 {
		page = state.ClientPage + 1
	}
	user, err := a.ensureSearchSession()
	if err != nil {
		return types.SearchResponse{}, err
	}
	if len(state.ArtistSearches) > 0 {
		if multiArtistSearchExpired(state) {
			a.emitDebugLog("info", "search.loadMore", "artist search RID expired before load more, refreshing search state", mergeDebugFields(
				map[string]any{
					"requestedPage": page,
				},
				debugSearchStateFields(state),
			))
			if err := a.refreshSearchState(ctx, user, state); err != nil {
				return types.SearchResponse{}, err
			}
		}

		visible, _, hasMore, err := a.collectVisibleSearchPage(ctx, user, state, nil)
		if err != nil {
			if a.handleSessionError(err) {
				a.emitDebugLog("warn", "search.loadMore", "artist load more hit session error, refreshing search state", withDebugError(mergeDebugFields(
					map[string]any{
						"requestedPage": page,
					},
					debugSearchStateFields(state),
				), err))
				user, err = a.ensureSearchSession()
				if err != nil {
					return types.SearchResponse{}, err
				}
				if err := a.refreshSearchState(ctx, user, state); err != nil {
					return types.SearchResponse{}, err
				}
				visible, _, hasMore, err = a.collectVisibleSearchPage(ctx, user, state, nil)
			} else if a.handleRIDExpiredError(err) {
				a.emitDebugLog("warn", "search.loadMore", "artist load more hit RID error, forcing refresh", withDebugError(mergeDebugFields(
					map[string]any{
						"requestedPage": page,
					},
					debugSearchStateFields(state),
				), err))
				if err := a.refreshSearchStateForced(ctx, user, state); err != nil {
					return types.SearchResponse{}, err
				}
				visible, _, hasMore, err = a.collectVisibleSearchPage(ctx, user, state, nil)
			}
		}
		if err != nil {
			return types.SearchResponse{}, err
		}
		rememberSearchResults(state, visible)

		a.mu.Lock()
		state.ClientPage = page
		state.DeliveredCount += len(visible)
		a.mu.Unlock()

		cards, missingSubmissionIDs := a.buildSubmissionCards(user, visible)
		a.hydrateSubmissionCardsAsync(searchID, user, visible, missingSubmissionIDs)

		resp = types.SearchResponse{
			SearchID:     searchID,
			Page:         page,
			PagesCount:   searchPageCount(state),
			ResultsCount: searchResultsCount(state, hasMore),
			Results:      cards,
			Session:      a.GetSession(),
		}
		return resp, nil
	}
	if !state.ExpiresAt.IsZero() && time.Now().After(state.ExpiresAt) {
		a.emitDebugLog("info", "search.loadMore", "stored RID expired before load more, refreshing search state", mergeDebugFields(
			map[string]any{
				"requestedPage": page,
			},
			debugSearchStateFields(state),
		))
		if err := a.refreshSearchState(ctx, user, state); err != nil {
			return types.SearchResponse{}, err
		}
	}

	visible, nextServerPage, hasMore, err := a.collectVisibleSearchPage(ctx, user, state, nil)
	if err != nil {
		if a.handleSessionError(err) {
			a.emitDebugLog("warn", "search.loadMore", "load more hit session error, refreshing search state", withDebugError(mergeDebugFields(
				map[string]any{
					"requestedPage": page,
				},
				debugSearchStateFields(state),
			), err))
			user, err = a.ensureSearchSession()
			if err != nil {
				return types.SearchResponse{}, err
			}
			if err := a.refreshSearchState(ctx, user, state); err != nil {
				return types.SearchResponse{}, err
			}
			visible, nextServerPage, hasMore, err = a.collectVisibleSearchPage(ctx, user, state, nil)
		} else if a.handleRIDExpiredError(err) {
			a.emitDebugLog("warn", "search.loadMore", "load more hit RID error, forcing refresh", withDebugError(mergeDebugFields(
				map[string]any{
					"requestedPage": page,
				},
				debugSearchStateFields(state),
			), err))
			if err := a.refreshSearchStateForced(ctx, user, state); err != nil {
				return types.SearchResponse{}, err
			}
			visible, nextServerPage, hasMore, err = a.collectVisibleSearchPage(ctx, user, state, nil)
		}
	}
	if err != nil {
		return types.SearchResponse{}, err
	}
	rememberSearchResults(state, visible)

	a.mu.Lock()
	state.ClientPage = page
	state.NextServerPage = nextServerPage
	state.DeliveredCount += len(visible)
	a.mu.Unlock()

	cards, missingSubmissionIDs := a.buildSubmissionCards(user, visible)
	a.hydrateSubmissionCardsAsync(searchID, user, visible, missingSubmissionIDs)

	resp = types.SearchResponse{
		SearchID:     searchID,
		Page:         page,
		PagesCount:   searchPageCount(state),
		ResultsCount: searchResultsCount(state, hasMore),
		Results:      cards,
		Session:      a.GetSession(),
	}
	return resp, nil
}

func (a *App) GetKeywordSuggestions(query string) (values []types.KeywordSuggestion, err error) {
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
	values = make([]types.KeywordSuggestion, 0, minInt(len(items), 10))
	for i, item := range items {
		if i >= 10 {
			break
		}
		values = append(values, types.KeywordSuggestion{
			Value:            item.Value,
			SubmissionsCount: item.SubmissionsCount.Int(),
		})
	}
	return values, nil
}

func (a *App) GetUsernameSuggestions(query string) (values []types.UsernameSuggestion, err error) {
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
	values = make([]types.UsernameSuggestion, 0, minInt(len(items), 10))
	for i, item := range items {
		if i >= 10 {
			break
		}
		values = append(values, item)
	}
	return values, nil
}

func (a *App) GetWatching() (items []types.UsernameSuggestion, err error) {
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

func (a *App) getWatching(ctx context.Context) ([]types.UsernameSuggestion, error) {
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

func (a *App) GetSubmissionDescription(submissionID string) (types.SubmissionDescription, error) {
	id := strings.TrimSpace(submissionID)
	if id == "" {
		return types.SubmissionDescription{}, errors.New("submission id is required")
	}

	user, err := a.ensureSearchSession()
	if err != nil {
		return types.SubmissionDescription{}, err
	}

	details, err := a.cachedSubmissionDetails(user, []string{id})
	if err != nil {
		if a.handleSessionError(err) {
			user, err = a.ensureSearchSession()
			if err != nil {
				return types.SubmissionDescription{}, err
			}
			details, err = a.cachedSubmissionDetails(user, []string{id})
		}
		if err != nil {
			return types.SubmissionDescription{}, err
		}
	}

	for _, detail := range details.Submissions {
		if detail.SubmissionID.String() == id {
			return mapSubmissionDescription(
				id,
				detail,
				user.SID,
				detail.Public.Bool(),
			), nil
		}
	}

	return types.SubmissionDescription{}, fmt.Errorf("submission %s not found", id)
}

func (a *App) buildSearchRequest(
	ctx context.Context,
	user *inkbunny.User,
	params types.SearchParams,
	artistFilters []string,
) (inkbunny.SubmissionSearchRequest, error) {
	perPage := normalizeSearchPerPage(params.PerPage)
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
	if keywordID := strings.TrimSpace(params.KeywordID); keywordID != "" {
		parsedKeywordID, parseErr := strconv.Atoi(keywordID)
		if parseErr != nil || parsedKeywordID <= 0 {
			return inkbunny.SubmissionSearchRequest{}, fmt.Errorf("invalid keyword id: %q", keywordID)
		}
		req.KeywordID = inkbunny.IntString(parsedKeywordID)
		req.Text = ""
	}
	if params.Randomize {
		req.Random = inkbunny.Yes
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
	req.OrderBy = normalizeSearchOrderBy(req.OrderBy, req.FavsUserID, req.UnreadSubmissions)

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

func normalizeSearchPerPage(perPage int) int {
	if perPage <= 0 {
		return defaultSearchPerPage
	}
	if perPage > maxSearchPerPage {
		return maxSearchPerPage
	}
	return perPage
}

func (a *App) buildArtistSearchRequests(
	ctx context.Context,
	user *inkbunny.User,
	params types.SearchParams,
	artistFilters []string,
) ([]inkbunny.SubmissionSearchRequest, error) {
	if len(artistFilters) == 0 {
		req, err := a.buildSearchRequest(ctx, user, params, nil)
		if err != nil {
			return nil, err
		}
		return []inkbunny.SubmissionSearchRequest{req}, nil
	}

	requests := make([]inkbunny.SubmissionSearchRequest, 0, len(artistFilters))
	for _, artist := range artistFilters {
		req, err := a.buildSearchRequest(ctx, user, params, []string{artist})
		if err != nil {
			return nil, err
		}
		requests = append(requests, req)
	}
	return requests, nil
}

func (a *App) loadArtistSearchEntry(
	ctx context.Context,
	user *inkbunny.User,
	req inkbunny.SubmissionSearchRequest,
	force bool,
) (searchCacheKey, inkbunny.SubmissionSearchRequest, cachedSearchResult, error) {
	ratingsMask := userRatingsMask(user)
	key, normalizedReq, err := makeSearchCacheKey(user, ratingsMask, req)
	if err != nil {
		return searchCacheKey{}, inkbunny.SubmissionSearchRequest{}, cachedSearchResult{}, err
	}
	a.emitDebugLog("debug", "search.artist", "artist search cache key prepared", map[string]any{
		"force":   force,
		"cache":   debugSearchCacheKeyFields(key),
		"request": debugSearchRequestFields(req),
	})
	if force {
		a.ensureCaches(user)
		a.searchCache.Delete(key)
		a.emitDebugLog("debug", "search.artist", "artist search cache invalidated", map[string]any{
			"cache": debugSearchCacheKeyFields(key),
		})
	}
	entry, err := a.cachedSearchResponse(ctx, user, key)
	if err != nil {
		if a.handleSessionError(err) {
			a.emitDebugLog("warn", "search.artist", "artist search hit session error, rebuilding cache key", withDebugError(map[string]any{
				"cache": debugSearchCacheKeyFields(key),
			}, err))
			user, err = a.ensureSearchSession()
			if err != nil {
				return searchCacheKey{}, inkbunny.SubmissionSearchRequest{}, cachedSearchResult{}, err
			}
			key, normalizedReq, err = makeSearchCacheKey(user, userRatingsMask(user), req)
			if err != nil {
				return searchCacheKey{}, inkbunny.SubmissionSearchRequest{}, cachedSearchResult{}, err
			}
			if force {
				a.ensureCaches(user)
				a.searchCache.Delete(key)
			}
			entry, err = a.cachedSearchResponse(ctx, user, key)
		}
		if err != nil {
			return searchCacheKey{}, inkbunny.SubmissionSearchRequest{}, cachedSearchResult{}, err
		}
	}
	return key, normalizedReq, entry, nil
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

func (a *App) fetchSearchCacheEntry(
	ctx context.Context,
	key searchCacheKey,
) (cachedSearchResult, error) {
	return apputils.ExecuteWithRateLimitRetry(ctx, a.rateLimiter, "search", func() (cachedSearchResult, error) {
		req, err := unmarshalSearchRequest([]byte(key.RequestJSON))
		if err != nil {
			a.emitDebugLog("error", "search.cache", "failed to unmarshal cached search request", withDebugError(map[string]any{
				"cache": debugSearchCacheKeyFields(key),
			}, err))
			return cachedSearchResult{}, err
		}
		current, err := a.ensureSearchSession()
		if err != nil {
			return cachedSearchResult{}, err
		}
		req.SID = current.SID
		fields := map[string]any{
			"cache":   debugSearchCacheKeyFields(key),
			"request": debugSearchRequestFields(req),
		}
		a.emitDebugLog("debug", "search.cache", "cache miss executing search", fields)
		response, err := current.SearchSubmissions(req)
		if err != nil {
			a.emitDebugLog("warn", "search.cache", "search fetch failed", withDebugError(fields, err))
			return cachedSearchResult{}, err
		}
		a.emitDebugLog("debug", "search.cache", "search fetch completed", map[string]any{
			"cache":    debugSearchCacheKeyFields(key),
			"response": debugSearchResponseFields(response),
		})
		return cachedSearchResult{
			Request:  req,
			Response: response,
		}, nil
	})
}

func (a *App) newSearchCache() flight.Cache[searchCacheKey, cachedSearchResult] {
	return flight.NewCache(func(ctx context.Context, key searchCacheKey) (cachedSearchResult, error) {
		return a.fetchSearchCacheEntry(ctx, key)
	})
}

func (a *App) fetchLoadMoreCacheEntry(
	ctx context.Context,
	key loadMoreCacheKey,
) (inkbunny.SubmissionSearchResponse, error) {
	return apputils.ExecuteWithRateLimitRetry(ctx, a.rateLimiter, "search results", func() (inkbunny.SubmissionSearchResponse, error) {
		req := inkbunny.SubmissionSearchRequest{
			SID:  key.SID,
			RID:  key.RID,
			Page: inkbunny.IntString(key.Page),
		}
		fields := map[string]any{
			"cache":   debugLoadMoreCacheKeyFields(key),
			"request": debugSearchRequestFields(req),
		}
		a.emitDebugLog("debug", "search.loadMore.cache", "cache miss executing load more", fields)
		response, err := inkbunny.SearchSubmissions(req)
		if err != nil {
			a.emitDebugLog("warn", "search.loadMore.cache", "load more fetch failed", withDebugError(fields, err))
			return inkbunny.SubmissionSearchResponse{}, err
		}
		a.emitDebugLog("debug", "search.loadMore.cache", "load more fetch completed", map[string]any{
			"cache":    debugLoadMoreCacheKeyFields(key),
			"response": debugSearchResponseFields(response),
		})
		return response, nil
	})
}

func (a *App) newLoadMoreCache() flight.Cache[loadMoreCacheKey, inkbunny.SubmissionSearchResponse] {
	return flight.NewCache(func(ctx context.Context, key loadMoreCacheKey) (inkbunny.SubmissionSearchResponse, error) {
		return a.fetchLoadMoreCacheEntry(ctx, key)
	})
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

func (a *App) buildSubmissionCards(user *inkbunny.User, submissions []inkbunny.SubmissionSearch) ([]types.SubmissionCard, []string) {
	if len(submissions) == 0 || user == nil {
		return []types.SubmissionCard{}, []string{}
	}

	a.ensureCaches(user)
	detailsByID := make(map[string]inkbunny.SubmissionDetails, len(submissions))
	missingSubmissionIDs := make([]string, 0, len(submissions))
	downloadedSubmissions := make(map[string]bool, len(submissions))
	downloadRoot := strings.TrimSpace(a.GetSession().Settings.DownloadDirectory)
	downloadPattern := downloads.NormalizePattern(a.GetSession().Settings.DownloadPattern)

	for _, submission := range submissions {
		submissionID := submission.SubmissionID.String()
		if submissionID == "" {
			continue
		}
		detail, ok := a.detailsCache.Peek(submissionDetailsCacheKey{
			SID:          user.SID,
			SubmissionID: submissionID,
		})
		if !ok {
			missingSubmissionIDs = append(missingSubmissionIDs, submissionID)
			continue
		}
		detailsByID[submissionID] = detail
		if downloadRoot != "" {
			downloadedSubmissions[submissionID] = submissionFilesDownloaded(
				downloadRoot,
				downloadPattern,
				detail,
			)
		}
	}

	return mapSubmissionCards(submissions, user.SID, downloadedSubmissions, detailsByID), missingSubmissionIDs
}

func (a *App) hydrateSubmissionCardsAsync(
	searchID string,
	user *inkbunny.User,
	submissions []inkbunny.SubmissionSearch,
	missingSubmissionIDs []string,
) {
	if user == nil || len(submissions) == 0 || len(missingSubmissionIDs) == 0 {
		return
	}

	submissionsByID := make(map[string]inkbunny.SubmissionSearch, len(submissions))
	for _, submission := range submissions {
		submissionID := submission.SubmissionID.String()
		if submissionID == "" {
			continue
		}
		submissionsByID[submissionID] = submission
	}

	missingSubmissions := make([]inkbunny.SubmissionSearch, 0, len(missingSubmissionIDs))
	for _, submissionID := range missingSubmissionIDs {
		submission, ok := submissionsByID[submissionID]
		if !ok {
			continue
		}
		missingSubmissions = append(missingSubmissions, submission)
	}
	if len(missingSubmissions) == 0 {
		return
	}

	go func(searchID string, user *inkbunny.User, submissions []inkbunny.SubmissionSearch, submissionIDs []string) {
		ctx := a.ctx
		if ctx == nil {
			ctx = context.Background()
		}

		details, err := a.cachedSubmissionDetailsBatchedWithContext(ctx, user, submissionIDs)
		if err != nil {
			a.emitDebugLog("warn", "search.hydrate", "submission detail hydration failed", withDebugError(map[string]any{
				"searchId":        searchID,
				"submissionCount": len(submissionIDs),
			}, err))
			return
		}

		detailsByID := make(map[string]inkbunny.SubmissionDetails, len(details.Submissions))
		downloadedSubmissions := make(map[string]bool, len(details.Submissions))
		downloadRoot := strings.TrimSpace(a.GetSession().Settings.DownloadDirectory)
		downloadPattern := downloads.NormalizePattern(a.GetSession().Settings.DownloadPattern)
		for _, submission := range details.Submissions {
			submissionID := submission.SubmissionID.String()
			detailsByID[submissionID] = submission
			if downloadRoot != "" {
				downloadedSubmissions[submissionID] = submissionFilesDownloaded(
					downloadRoot,
					downloadPattern,
					submission,
				)
			}
		}

		a.broadcastSearchResultsHydrated(types.SearchResultsHydratedUpdate{
			SearchID: searchID,
			Results:  mapSubmissionCards(submissions, user.SID, downloadedSubmissions, detailsByID),
		})
	}(searchID, user, missingSubmissions, missingSubmissionIDs)
}

func mapSubmissionCards(
	submissions []inkbunny.SubmissionSearch,
	sid string,
	downloadedSubmissions map[string]bool,
	detailsByID map[string]inkbunny.SubmissionDetails,
) []types.SubmissionCard {
	cards := make([]types.SubmissionCard, 0, len(submissions))
	accents := []string{"rose", "mint", "lavender", "sky"}

	for index, submission := range submissions {
		submissionID := submission.SubmissionID.String()
		detail := detailsByID[submissionID]
		primaryFile, hasPrimaryFile := primarySubmissionFile(detail.Files)
		primaryMimeType := ""
		primaryFileName := ""
		if hasPrimaryFile {
			primaryMimeType = strings.TrimSpace(primaryFile.MimeType)
			primaryFileName = strings.TrimSpace(primaryFile.FileName)
		}
		if primaryMimeType == "" {
			primaryMimeType = strings.TrimSpace(detail.MimeType)
		}
		if primaryFileName == "" {
			primaryFileName = strings.TrimSpace(detail.FileName.String())
		}
		if primaryMimeType == "" {
			primaryMimeType = strings.TrimSpace(submission.MimeType)
		}
		if primaryFileName == "" {
			primaryFileName = strings.TrimSpace(submission.FileName.String())
		}
		previewURL := ""
		screenURL := ""
		latestPreviewURL := ""
		if supportsResizedAssetVariants(primaryMimeType, primaryFileName) {
			previewURL = firstNonEmpty(
				submissionResourceURL(detail.FileURLPreview.String(), sid, submission.Public.Bool()),
				submissionMediaFileResourceURL(primaryFile.FileURLPreview.String(), sid, submission.Public.Bool(), hasPrimaryFile),
			)
			screenURL = firstNonEmpty(
				submissionResourceURL(detail.FileURLScreen.String(), sid, submission.Public.Bool()),
				submissionMediaFileResourceURL(primaryFile.FileURLScreen.String(), sid, submission.Public.Bool(), hasPrimaryFile),
			)
			latestPreviewURL = submissionResourceURL(detail.LatestFileURLPreview, sid, submission.Public.Bool())
		}
		fullURL := firstNonEmpty(
			submissionResourceURL(detail.FileURLFull.String(), sid, submission.Public.Bool()),
			submissionMediaFileResourceURL(primaryFile.FileURLFull.String(), sid, submission.Public.Bool(), hasPrimaryFile),
		)
		thumbnail := firstNonEmpty(
			detail.ThumbnailURLHuge,
			detail.ThumbnailURLLarge,
			detail.ThumbnailURLMedium,
			detail.ThumbnailURLHugeNonCustom,
			detail.ThumbnailURLLargeNonCustom,
			detail.ThumbnailURLMediumNonCustom,
			submissionMediaFileValue(primaryFile.ThumbnailURLHuge, hasPrimaryFile),
			submissionMediaFileValue(primaryFile.ThumbnailURLLarge, hasPrimaryFile),
			submissionMediaFileValue(primaryFile.ThumbnailURLMedium, hasPrimaryFile),
			submissionMediaFileValue(primaryFile.ThumbnailURLHugeNonCustom, hasPrimaryFile),
			submissionMediaFileValue(primaryFile.ThumbnailURLLargeNonCustom, hasPrimaryFile),
			submissionMediaFileValue(primaryFile.ThumbnailURLMediumNonCustom, hasPrimaryFile),
		)
		latestThumbnail := firstNonEmpty(
			detail.LatestThumbnailURLHuge,
			detail.LatestThumbnailURLLarge,
			detail.LatestThumbnailURLMedium,
			detail.LatestThumbnailURLHugeNonCustom,
			detail.LatestThumbnailURLLargeNonCustom,
			detail.LatestThumbnailURLMediumNonCustom,
		)

		badge := submission.TypeName
		if badge == "" {
			badge = submission.RatingName
		}

		cards = append(cards, types.SubmissionCard{
			SubmissionID:     submissionID,
			SubmissionURL:    submissionPageURL(submissionID),
			Title:            submission.Title,
			Username:         submission.Username,
			UserURL:          userPageURL(submission.Username),
			TypeName:         submission.TypeName,
			SubmissionTypeID: int(submission.SubmissionTypeID),
			RatingName:       submission.RatingName,
			IsPublic:         submission.Public.Bool(),
			PageCount:        int(submission.PageCount),
			Updated:          submission.Updated.Bool(),
			FileName:         submission.FileName.String(),
			MimeType:         submission.MimeType,
			LatestMimeType:   submission.LatestMimeType,
			PreviewURL:       previewURL,
			LatestPreviewURL: latestPreviewURL,
			ScreenURL:        screenURL,
			FullURL:          fullURL,
			ThumbnailURL:     submissionResourceURL(thumbnail, sid, submission.Public.Bool()),
			LatestThumbnailURL: submissionResourceURL(
				latestThumbnail,
				sid,
				submission.Public.Bool(),
			),
			ThumbnailURLMedium: firstNonEmpty(
				submissionResourceURL(detail.ThumbnailURLMedium, sid, submission.Public.Bool()),
				submissionMediaFileResourceURL(primaryFile.ThumbnailURLMedium, sid, submission.Public.Bool(), hasPrimaryFile),
			),
			ThumbnailURLLarge: firstNonEmpty(
				submissionResourceURL(detail.ThumbnailURLLarge, sid, submission.Public.Bool()),
				submissionMediaFileResourceURL(primaryFile.ThumbnailURLLarge, sid, submission.Public.Bool(), hasPrimaryFile),
			),
			ThumbnailURLHuge: firstNonEmpty(
				submissionResourceURL(detail.ThumbnailURLHuge, sid, submission.Public.Bool()),
				submissionMediaFileResourceURL(primaryFile.ThumbnailURLHuge, sid, submission.Public.Bool(), hasPrimaryFile),
			),
			ThumbnailURLMediumNonCustom: firstNonEmpty(
				submissionResourceURL(detail.ThumbnailURLMediumNonCustom, sid, submission.Public.Bool()),
				submissionMediaFileResourceURL(primaryFile.ThumbnailURLMediumNonCustom, sid, submission.Public.Bool(), hasPrimaryFile),
			),
			ThumbnailURLLargeNonCustom: firstNonEmpty(
				submissionResourceURL(detail.ThumbnailURLLargeNonCustom, sid, submission.Public.Bool()),
				submissionMediaFileResourceURL(primaryFile.ThumbnailURLLargeNonCustom, sid, submission.Public.Bool(), hasPrimaryFile),
			),
			ThumbnailURLHugeNonCustom: firstNonEmpty(
				submissionResourceURL(detail.ThumbnailURLHugeNonCustom, sid, submission.Public.Bool()),
				submissionMediaFileResourceURL(primaryFile.ThumbnailURLHugeNonCustom, sid, submission.Public.Bool(), hasPrimaryFile),
			),
			ThumbMediumX:          firstNonZeroInt(int(detail.ThumbMediumX), submissionMediaFileInt(int(primaryFile.ThumbMediumX), hasPrimaryFile)),
			ThumbLargeX:           firstNonZeroInt(int(detail.ThumbLargeX), submissionMediaFileInt(int(primaryFile.ThumbLargeX), hasPrimaryFile)),
			ThumbHugeX:            firstNonZeroInt(int(detail.ThumbHugeX), submissionMediaFileInt(int(primaryFile.ThumbHugeX), hasPrimaryFile)),
			ThumbMediumNonCustomX: firstNonZeroInt(int(detail.ThumbMediumNonCustomX), submissionMediaFileInt(int(primaryFile.ThumbMediumNonCustomX), hasPrimaryFile)),
			ThumbLargeNonCustomX:  firstNonZeroInt(int(detail.ThumbLargeNonCustomX), submissionMediaFileInt(int(primaryFile.ThumbLargeNonCustomX), hasPrimaryFile)),
			ThumbHugeNonCustomX:   firstNonZeroInt(int(detail.ThumbHugeNonCustomX), submissionMediaFileInt(int(primaryFile.ThumbHugeNonCustomX), hasPrimaryFile)),
			UserIconURLSmall:      submissionResourceURL(detail.UserIconURLs.Small, sid, submission.Public.Bool()),
			UserIconURLMedium:     submissionResourceURL(detail.UserIconURLs.Medium, sid, submission.Public.Bool()),
			UserIconURLLarge:      submissionResourceURL(detail.UserIconURLs.Large, sid, submission.Public.Bool()),
			Favorite:              detail.Favorite.Bool(),
			FavoritesCount:        int(detail.FavoritesCount),
			ViewsCount:            int(detail.Views),
			BadgeText:             badge,
			Accent:                accents[index%len(accents)],
			MediaFiles:            mapSubmissionMediaFiles(detail.Files, sid, submission.Public.Bool()),
			Downloaded:            downloadedSubmissions[submissionID],
		})
	}
	return cards
}

func primarySubmissionFile(files []inkbunny.File) (inkbunny.File, bool) {
	if len(files) == 0 {
		return inkbunny.File{}, false
	}

	primary := files[0]
	for _, file := range files[1:] {
		if int(file.SubmissionFileOrder) < int(primary.SubmissionFileOrder) {
			primary = file
		}
	}
	return primary, true
}

func submissionMediaFileResourceURL(raw string, sid string, isPublic bool, enabled bool) string {
	if !enabled {
		return ""
	}
	return submissionResourceURL(raw, sid, isPublic)
}

func submissionMediaFileValue(value string, enabled bool) string {
	if !enabled {
		return ""
	}
	return value
}

func submissionMediaFileInt(value int, enabled bool) int {
	if !enabled {
		return 0
	}
	return value
}

func mapSubmissionMediaFiles(files []inkbunny.File, sid string, isPublic bool) []types.SubmissionMediaFile {
	if len(files) == 0 {
		return nil
	}

	sorted := append([]inkbunny.File(nil), files...)
	sort.SliceStable(sorted, func(left, right int) bool {
		return int(sorted[left].SubmissionFileOrder) < int(sorted[right].SubmissionFileOrder)
	})

	mediaFiles := make([]types.SubmissionMediaFile, 0, len(sorted))
	for _, file := range sorted {
		thumbnail := firstNonEmpty(
			file.ThumbnailURLHuge,
			file.ThumbnailURLLarge,
			file.ThumbnailURLMedium,
			file.ThumbnailURLHugeNonCustom,
			file.ThumbnailURLLargeNonCustom,
			file.ThumbnailURLMediumNonCustom,
		)
		previewURL := ""
		screenURL := ""
		if supportsResizedAssetVariants(file.MimeType, file.FileName) {
			previewURL = submissionResourceURL(file.FileURLPreview.String(), sid, isPublic)
			screenURL = submissionResourceURL(file.FileURLScreen.String(), sid, isPublic)
		}
		mediaFiles = append(mediaFiles, types.SubmissionMediaFile{
			FileID:                      file.FileID.String(),
			FileName:                    file.FileName,
			MimeType:                    file.MimeType,
			Order:                       int(file.SubmissionFileOrder),
			PreviewURL:                  previewURL,
			ScreenURL:                   screenURL,
			FullURL:                     submissionResourceURL(file.FileURLFull.String(), sid, isPublic),
			ThumbnailURL:                submissionResourceURL(thumbnail, sid, isPublic),
			ThumbnailURLMedium:          submissionResourceURL(file.ThumbnailURLMedium, sid, isPublic),
			ThumbnailURLLarge:           submissionResourceURL(file.ThumbnailURLLarge, sid, isPublic),
			ThumbnailURLHuge:            submissionResourceURL(file.ThumbnailURLHuge, sid, isPublic),
			ThumbnailURLMediumNonCustom: submissionResourceURL(file.ThumbnailURLMediumNonCustom, sid, isPublic),
			ThumbnailURLLargeNonCustom:  submissionResourceURL(file.ThumbnailURLLargeNonCustom, sid, isPublic),
			ThumbnailURLHugeNonCustom:   submissionResourceURL(file.ThumbnailURLHugeNonCustom, sid, isPublic),
			ThumbMediumX:                int(file.ThumbMediumX),
			ThumbLargeX:                 int(file.ThumbLargeX),
			ThumbHugeX:                  int(file.ThumbHugeX),
			ThumbMediumNonCustomX:       int(file.ThumbMediumNonCustomX),
			ThumbLargeNonCustomX:        int(file.ThumbLargeNonCustomX),
			ThumbHugeNonCustomX:         int(file.ThumbHugeNonCustomX),
		})
	}

	return mediaFiles
}

func submissionFilesDownloaded(downloadRoot, downloadPattern string, submission inkbunny.SubmissionDetails) bool {
	return downloads.SubmissionFilesDownloaded(downloadRoot, downloadPattern, submission)
}

func submissionPageURL(submissionID string) string {
	id := strings.TrimSpace(submissionID)
	if id == "" {
		return ""
	}
	return "https://inkbunny.net/s/" + id
}

func userPageURL(username string) string {
	name := strings.TrimSpace(username)
	if name == "" {
		return ""
	}
	return "https://inkbunny.net/" + url.PathEscape(name)
}

func mapSubmissionDescription(
	submissionID string,
	detail inkbunny.SubmissionDetails,
	sid string,
	isPublic bool,
) types.SubmissionDescription {
	keywords := make([]types.SubmissionKeyword, 0, len(detail.Keywords))
	for _, keyword := range detail.Keywords {
		keywords = append(keywords, types.SubmissionKeyword{
			KeywordID:        keyword.KeywordID.String(),
			KeywordName:      strings.TrimSpace(keyword.KeywordName),
			SubmissionsCount: keyword.Count.Int(),
		})
	}

	return types.SubmissionDescription{
		SubmissionID: submissionID,
		Description: firstNonEmpty(
			strings.TrimSpace(detail.Description),
			strings.TrimSpace(detail.SalesDescription),
		),
		DescriptionHTML: firstNonEmpty(
			apputils.NormalizeSubmissionDescriptionHTML(
				strings.TrimSpace(detail.DescriptionBBCodeParsed),
				sid,
				isPublic,
			),
		),
		Writing: strings.TrimSpace(detail.Writing),
		WritingHTML: firstNonEmpty(
			apputils.NormalizeSubmissionDescriptionHTML(
				strings.TrimSpace(detail.WritingBBCodeParsed),
				sid,
				isPublic,
			),
		),
		Keywords: keywords,
	}
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return value
		}
	}
	return ""
}

func firstNonZeroInt(values ...int) int {
	for _, value := range values {
		if value != 0 {
			return value
		}
	}
	return 0
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
	if len(state.ArtistSearches) > 0 {
		return a.collectVisibleMultiArtistPage(ctx, user, state)
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
		remaining := min(len(pendingResults), target)
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

func (a *App) collectVisibleMultiArtistPage(
	ctx context.Context,
	user *inkbunny.User,
	state *searchState,
) ([]inkbunny.SubmissionSearch, int, bool, error) {
	remainingLimit := remainingVisibleLimit(state)
	if remainingLimit == 0 {
		return nil, 0, false, nil
	}

	target := state.PerPage
	if remainingLimit > 0 && remainingLimit < target {
		target = remainingLimit
	}
	if target <= 0 {
		target = state.PerPage
	}

	requiredCount := state.DeliveredCount + target
	if err := a.ensureMultiArtistResults(ctx, user, state, requiredCount); err != nil {
		return nil, 0, false, err
	}
	if err := a.sortPendingSearchResults(ctx, user, state); err != nil {
		return nil, 0, false, err
	}

	visible := make([]inkbunny.SubmissionSearch, 0, target)
	if len(state.PendingResults) > 0 {
		remaining := minInt(target, len(state.PendingResults))
		visible = append(visible, state.PendingResults[:remaining]...)
		state.PendingResults = state.PendingResults[remaining:]
	}

	hasMore := len(state.PendingResults) > 0 || multiArtistSearchHasMore(state)
	if remainingLimit > 0 && len(visible) >= remainingLimit {
		hasMore = false
	}
	return visible, 0, hasMore, nil
}

func rememberSearchResults(state *searchState, results []inkbunny.SubmissionSearch) {
	if state == nil || len(results) == 0 {
		return
	}
	if state.SeenResults == nil {
		state.SeenResults = make(map[string]inkbunny.SubmissionSearch, len(results))
	}
	for _, result := range results {
		submissionID := result.SubmissionID.String()
		if submissionID == "" {
			continue
		}
		state.SeenResults[submissionID] = result
	}
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

	response, err := apputils.ExecuteWithRateLimitRetry(a.ctx, a.rateLimiter, "unread submissions", func() (inkbunny.SubmissionSearchResponse, error) {
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
			response, err = apputils.ExecuteWithRateLimitRetry(a.ctx, a.rateLimiter, "unread submissions", func() (inkbunny.SubmissionSearchResponse, error) {
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
	if len(state.ArtistSearches) > 0 {
		return limitedResultsCount(state.RawResultsCount, state.MaxDownloads)
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

func searchPageCount(state *searchState) int {
	if state == nil {
		return 1
	}
	currentPage := max(state.ClientPage, 1)
	perPage := normalizeSearchPerPage(state.PerPage)
	totalResults := limitedResultsCount(state.RawResultsCount, state.MaxDownloads)
	if totalResults <= 0 {
		return currentPage
	}
	totalPages := (totalResults + perPage - 1) / perPage
	if totalPages < currentPage {
		return currentPage
	}
	return totalPages
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
	return baseutils.ResourceURL(raw, sid, isPublic)
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

func mapWatchingSuggestions(items []inkbunny.UsernameID) []types.UsernameSuggestion {
	suggestions := make([]types.UsernameSuggestion, 0, len(items))
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
		suggestions = append(suggestions, types.UsernameSuggestion{
			UserID:    strings.TrimSpace(item.UserID),
			Value:     username,
			Username:  username,
			AvatarURL: apputils.DefaultAvatarURL,
		})
	}
	return suggestions
}

func (a *App) resolveArtistFilters(
	ctx context.Context,
	user *inkbunny.User,
	params types.SearchParams,
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
			return apputils.ExecuteWithRateLimitRetry(ctx, a.rateLimiter, "keyword suggestions", func() ([]inkbunny.KeywordAutocomplete, error) {
				ratings := inkbunny.ParseMask(key.RatingsMask)
				return inkbunny.KeywordSuggestion(key.Query, ratings, key.Underscore)
			})
		})
		a.keywordCache = &cache
	}
	if a.usernameCache == nil {
		cache := flight.NewCache(func(ctx context.Context, key usernameCacheKey) ([]types.UsernameSuggestion, error) {
			return apputils.ExecuteWithRateLimitRetry(ctx, a.rateLimiter, "username suggestions", func() ([]types.UsernameSuggestion, error) {
				current, err := a.ensureSearchSession()
				if err != nil {
					return nil, err
				}
				items, err := current.SearchMembers(key.Query)
				if err != nil {
					return nil, err
				}
				suggestions := mapUsernameSuggestions(items)
				avatar := apputils.DefaultAvatarURL
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
			return apputils.ExecuteWithRateLimitRetry(ctx, a.rateLimiter, "avatar lookups", func() (string, error) {
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
				return apputils.DefaultAvatarURL, nil
			})
		})
		a.avatarCache = &cache
	}
	if a.watchingCache == nil {
		cache := flight.NewCache(func(ctx context.Context, key watchingCacheKey) ([]types.UsernameSuggestion, error) {
			return apputils.ExecuteWithRateLimitRetry(ctx, a.rateLimiter, "watch list", func() ([]types.UsernameSuggestion, error) {
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
		cache := a.newSearchCache()
		a.searchCache = &cache
	}
	if a.loadMoreCache == nil {
		cache := a.newLoadMoreCache()
		a.loadMoreCache = &cache
	}
	if a.detailsCache == nil {
		cache := flight.NewCache(func(ctx context.Context, key submissionDetailsCacheKey) (inkbunny.SubmissionDetails, error) {
			response, err := a.fetchSubmissionDetailsBatch(ctx, user, []string{key.SubmissionID})
			if err != nil {
				return inkbunny.SubmissionDetails{}, err
			}
			for _, submission := range response.Submissions {
				if submission.SubmissionID.String() == key.SubmissionID {
					return submission, nil
				}
			}
			return inkbunny.SubmissionDetails{}, fmt.Errorf("submission %s not found", key.SubmissionID)
		})
		a.detailsCache = &cache
	}
}

func (a *App) resetCaches(user *inkbunny.User) {
	a.cacheMu.Lock()
	defer a.cacheMu.Unlock()

	keywordCache := flight.NewCache(func(ctx context.Context, key keywordCacheKey) ([]inkbunny.KeywordAutocomplete, error) {
		return apputils.ExecuteWithRateLimitRetry(ctx, a.rateLimiter, "keyword suggestions", func() ([]inkbunny.KeywordAutocomplete, error) {
			ratings := inkbunny.ParseMask(key.RatingsMask)
			return inkbunny.KeywordSuggestion(key.Query, ratings, key.Underscore)
		})
	})
	usernameCache := flight.NewCache(func(ctx context.Context, key usernameCacheKey) ([]types.UsernameSuggestion, error) {
		return apputils.ExecuteWithRateLimitRetry(ctx, a.rateLimiter, "username suggestions", func() ([]types.UsernameSuggestion, error) {
			current, err := a.ensureSearchSession()
			if err != nil {
				return nil, err
			}
			items, err := current.SearchMembers(key.Query)
			if err != nil {
				return nil, err
			}
			suggestions := mapUsernameSuggestions(items)
			avatar := apputils.DefaultAvatarURL
			a.mu.RLock()
			if a.sessionAvatar != "" {
				avatar = a.sessionAvatar
			}
			a.mu.RUnlock()
			return prependCurrentUserSuggestion(suggestions, current, avatar, key.Query), nil
		})
	})
	avatarCache := flight.NewCache(func(ctx context.Context, key avatarCacheKey) (string, error) {
		return apputils.ExecuteWithRateLimitRetry(ctx, a.rateLimiter, "avatar lookups", func() (string, error) {
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
			return apputils.DefaultAvatarURL, nil
		})
	})
	watchingCache := flight.NewCache(func(ctx context.Context, key watchingCacheKey) ([]types.UsernameSuggestion, error) {
		return apputils.ExecuteWithRateLimitRetry(ctx, a.rateLimiter, "watch list", func() ([]types.UsernameSuggestion, error) {
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
	searchCache := a.newSearchCache()
	loadMoreCache := a.newLoadMoreCache()
	detailsCache := flight.NewCache(func(ctx context.Context, key submissionDetailsCacheKey) (inkbunny.SubmissionDetails, error) {
		response, err := a.fetchSubmissionDetailsBatch(ctx, user, []string{key.SubmissionID})
		if err != nil {
			return inkbunny.SubmissionDetails{}, err
		}
		for _, submission := range response.Submissions {
			if submission.SubmissionID.String() == key.SubmissionID {
				return submission, nil
			}
		}
		return inkbunny.SubmissionDetails{}, fmt.Errorf("submission %s not found", key.SubmissionID)
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
) (types.UsernameSuggestion, bool, error) {
	a.ensureCaches(user)
	items, err := a.usernameCache.GetWithContext(ctx, usernameCacheKey{
		Scope: sessionScope(user),
		Query: normalizeUsername(username),
	})
	if err != nil {
		return types.UsernameSuggestion{}, false, err
	}
	for _, item := range items {
		if matchUsernameSuggestion(item, username) {
			return item, true, nil
		}
	}
	return types.UsernameSuggestion{}, false, nil
}

func (a *App) cachedSearchResponse(
	ctx context.Context,
	user *inkbunny.User,
	key searchCacheKey,
) (cachedSearchResult, error) {
	a.ensureCaches(user)
	hit := false
	if _, ok := a.searchCache.Peek(key); ok {
		hit = true
	}
	a.emitDebugLog("debug", "search.cache", "search cache lookup", map[string]any{
		"hit":   hit,
		"cache": debugSearchCacheKeyFields(key),
	})
	entry, err := a.searchCache.GetWithContext(ctx, key)
	if err != nil {
		a.emitDebugLog("warn", "search.cache", "search cache lookup failed", withDebugError(map[string]any{
			"hit":   hit,
			"cache": debugSearchCacheKeyFields(key),
		}, err))
		return cachedSearchResult{}, err
	}
	if !entry.Response.RIDExpiry.IsZero() && time.Now().After(entry.Response.RIDExpiry) {
		a.emitDebugLog("info", "search.cache", "search cache entry expired by RID expiry, refetching", map[string]any{
			"cache":          debugSearchCacheKeyFields(key),
			"cachedResponse": debugSearchResponseFields(entry.Response),
		})
		a.searchCache.Delete(key)
		entry, err = a.searchCache.GetWithContext(ctx, key)
		if err != nil {
			a.emitDebugLog("warn", "search.cache", "search cache refetch failed", withDebugError(map[string]any{
				"cache": debugSearchCacheKeyFields(key),
			}, err))
			return cachedSearchResult{}, err
		}
	}
	if hit {
		a.emitDebugLog("debug", "search.cache", "search cache hit served", map[string]any{
			"cache":    debugSearchCacheKeyFields(key),
			"response": debugSearchResponseFields(entry.Response),
		})
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
	if len(state.ArtistSearches) > 0 {
		totalRaw := 0
		for index := range state.ArtistSearches {
			stream := &state.ArtistSearches[index]
			key, normalizedReq, entry, err := a.loadArtistSearchEntry(ctx, user, stream.Request, force)
			if err != nil {
				return err
			}
			stream.RID = entry.Response.RID
			stream.SID = entry.Response.SID
			stream.ExpiresAt = entry.Response.RIDExpiry
			stream.PagesCount = int(entry.Response.PagesCount)
			stream.RawResultsCount = int(entry.Response.ResultsCountAll)
			stream.Request = normalizedReq
			stream.CacheKey = key
			totalRaw += stream.RawResultsCount
		}
		state.RawResultsCount = totalRaw
		return nil
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

func (a *App) resetMultiArtistSearchState(
	ctx context.Context,
	user *inkbunny.User,
	state *searchState,
	force bool,
) error {
	if state == nil {
		return errors.New("search state is missing")
	}
	ratingsMask := userRatingsMask(user)
	pending := make([]inkbunny.SubmissionSearch, 0, state.PerPage*max(len(state.ArtistSearches), 1))
	totalRaw := 0

	for index := range state.ArtistSearches {
		stream := &state.ArtistSearches[index]
		key, normalizedReq, entry, err := a.loadArtistSearchEntry(ctx, user, stream.Request, force)
		if err != nil {
			return err
		}
		filtered := filterSearchSubmissions(
			entry.Response.Submissions,
			ratingsMask,
			nil,
			normalizedReq.UnreadSubmissions == inkbunny.Yes,
		)
		pageNumber := int(entry.Response.Page)
		if pageNumber <= 0 {
			pageNumber = 1
		}
		stream.RID = entry.Response.RID
		stream.SID = entry.Response.SID
		stream.ExpiresAt = entry.Response.RIDExpiry
		stream.PagesCount = int(entry.Response.PagesCount)
		stream.NextServerPage = pageNumber + 1
		stream.RawResultsCount = int(entry.Response.ResultsCountAll)
		stream.FetchedResultCount = len(filtered)
		stream.Request = normalizedReq
		stream.CacheKey = key
		totalRaw += stream.RawResultsCount
		pending = append(pending, filtered...)
	}

	state.ClientPage = 1
	state.DeliveredCount = 0
	state.PendingResults = pending
	state.RawResultsCount = totalRaw
	if len(state.ArtistSearches) > 0 {
		state.Request = state.ArtistSearches[0].Request
	}
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
	key := loadMoreCacheKey{
		SID:  state.SID,
		RID:  state.RID,
		Page: page,
	}
	hit := false
	if _, ok := a.loadMoreCache.Peek(key); ok {
		hit = true
	}
	a.emitDebugLog("debug", "search.loadMore.cache", "load more cache lookup", map[string]any{
		"hit":      hit,
		"cache":    debugLoadMoreCacheKeyFields(key),
		"searchId": state.ID,
	})
	response, err := a.loadMoreCache.GetWithContext(ctx, key)
	if err != nil {
		a.emitDebugLog("warn", "search.loadMore.cache", "load more cache lookup failed", withDebugError(map[string]any{
			"hit":      hit,
			"cache":    debugLoadMoreCacheKeyFields(key),
			"searchId": state.ID,
		}, err))
		return inkbunny.SubmissionSearchResponse{}, err
	}
	if hit {
		a.emitDebugLog("debug", "search.loadMore.cache", "load more cache hit served", map[string]any{
			"cache":    debugLoadMoreCacheKeyFields(key),
			"searchId": state.ID,
			"response": debugSearchResponseFields(response),
		})
	}
	return response, nil
}

func (a *App) cachedLoadMoreArtist(
	ctx context.Context,
	stream *artistSearchState,
	page int,
) (inkbunny.SubmissionSearchResponse, error) {
	if stream == nil {
		return inkbunny.SubmissionSearchResponse{}, errors.New("artist search stream is missing")
	}
	a.ensureCaches(a.user)
	key := loadMoreCacheKey{
		SID:  stream.SID,
		RID:  stream.RID,
		Page: page,
	}
	hit := false
	if _, ok := a.loadMoreCache.Peek(key); ok {
		hit = true
	}
	a.emitDebugLog("debug", "search.loadMore.cache", "artist load more cache lookup", map[string]any{
		"hit":      hit,
		"cache":    debugLoadMoreCacheKeyFields(key),
		"username": stream.Username,
	})
	response, err := a.loadMoreCache.GetWithContext(ctx, key)
	if err != nil {
		a.emitDebugLog("warn", "search.loadMore.cache", "artist load more cache lookup failed", withDebugError(map[string]any{
			"hit":      hit,
			"cache":    debugLoadMoreCacheKeyFields(key),
			"username": stream.Username,
		}, err))
		return inkbunny.SubmissionSearchResponse{}, err
	}
	if hit {
		a.emitDebugLog("debug", "search.loadMore.cache", "artist load more cache hit served", map[string]any{
			"cache":    debugLoadMoreCacheKeyFields(key),
			"username": stream.Username,
			"response": debugSearchResponseFields(response),
		})
	}
	return response, nil
}

func (a *App) ensureMultiArtistResults(
	ctx context.Context,
	user *inkbunny.User,
	state *searchState,
	requiredCount int,
) error {
	if state == nil {
		return errors.New("search state is missing")
	}
	ratingsMask := userRatingsMask(user)
	totalRaw := 0
	for index := range state.ArtistSearches {
		stream := &state.ArtistSearches[index]
		for stream.FetchedResultCount < requiredCount && stream.NextServerPage > 0 && stream.NextServerPage <= stream.PagesCount {
			if err := ctx.Err(); err != nil {
				return err
			}
			response, err := a.cachedLoadMoreArtist(ctx, stream, stream.NextServerPage)
			if err != nil {
				return err
			}
			filtered := filterSearchSubmissions(
				response.Submissions,
				ratingsMask,
				nil,
				stream.Request.UnreadSubmissions == inkbunny.Yes,
			)
			state.PendingResults = append(state.PendingResults, filtered...)
			stream.FetchedResultCount += len(filtered)
			stream.PagesCount = int(response.PagesCount)
			stream.RawResultsCount = int(response.ResultsCountAll)
			pageNumber := int(response.Page)
			if pageNumber <= 0 {
				pageNumber = stream.NextServerPage
			}
			stream.NextServerPage = pageNumber + 1
		}
		totalRaw += stream.RawResultsCount
	}
	state.RawResultsCount = totalRaw
	return nil
}

func (a *App) sortPendingSearchResults(
	ctx context.Context,
	user *inkbunny.User,
	state *searchState,
) error {
	if state == nil || len(state.PendingResults) < 2 {
		return nil
	}
	orderBy := normalizeSearchOrderBy(state.Request.OrderBy, state.Request.FavsUserID, state.Request.UnreadSubmissions)

	detailsByID := map[string]inkbunny.SubmissionDetails{}
	if orderBy == inkbunny.OrderByFavs || orderBy == inkbunny.OrderByViews {
		submissionIDs := make([]string, 0, len(state.PendingResults))
		for _, submission := range state.PendingResults {
			if id := submission.SubmissionID.String(); id != "" {
				submissionIDs = append(submissionIDs, id)
			}
		}
		details, err := a.cachedSubmissionDetailsBatchedWithContext(ctx, user, submissionIDs)
		if err != nil {
			return err
		}
		detailsByID = make(map[string]inkbunny.SubmissionDetails, len(details.Submissions))
		for _, submission := range details.Submissions {
			detailsByID[submission.SubmissionID.String()] = submission
		}
	}

	sort.SliceStable(state.PendingResults, func(i, j int) bool {
		left := state.PendingResults[i]
		right := state.PendingResults[j]
		return compareSearchSubmissions(left, right, orderBy, detailsByID)
	})
	return nil
}

func compareSearchSubmissions(
	left inkbunny.SubmissionSearch,
	right inkbunny.SubmissionSearch,
	orderBy string,
	detailsByID map[string]inkbunny.SubmissionDetails,
) bool {
	switch orderBy {
	case inkbunny.OrderByFavs:
		leftDetails := detailsByID[left.SubmissionID.String()]
		rightDetails := detailsByID[right.SubmissionID.String()]
		if leftDetails.FavoritesCount != rightDetails.FavoritesCount {
			return leftDetails.FavoritesCount > rightDetails.FavoritesCount
		}
	case inkbunny.OrderByViews:
		leftDetails := detailsByID[left.SubmissionID.String()]
		rightDetails := detailsByID[right.SubmissionID.String()]
		if leftDetails.Views != rightDetails.Views {
			return leftDetails.Views > rightDetails.Views
		}
	case inkbunny.OrderByFavStars:
		if left.Stars != right.Stars {
			return left.Stars > right.Stars
		}
	case inkbunny.OrderByUnreadDatetime:
		if left.UnreadDateSystem != right.UnreadDateSystem {
			return left.UnreadDateSystem > right.UnreadDateSystem
		}
	case string(orderByUnreadDatetimeReverse):
		if left.UnreadDateSystem != right.UnreadDateSystem {
			return left.UnreadDateSystem < right.UnreadDateSystem
		}
	}

	if left.CreateDateSystem != right.CreateDateSystem {
		return left.CreateDateSystem > right.CreateDateSystem
	}
	return left.SubmissionID > right.SubmissionID
}

func multiArtistSearchExpired(state *searchState) bool {
	if state == nil {
		return false
	}
	for _, stream := range state.ArtistSearches {
		if !stream.ExpiresAt.IsZero() && time.Now().After(stream.ExpiresAt) {
			return true
		}
	}
	return false
}

func multiArtistSearchHasMore(state *searchState) bool {
	if state == nil {
		return false
	}
	for _, stream := range state.ArtistSearches {
		if stream.NextServerPage > 0 && stream.NextServerPage <= stream.PagesCount {
			return true
		}
	}
	return false
}
