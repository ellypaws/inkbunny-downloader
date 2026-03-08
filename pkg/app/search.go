package desktopapp

import (
	"encoding/json"
	"errors"
	"fmt"
	"strconv"
	"strings"
	"time"

	"github.com/ellypaws/inkbunny"

	"github.com/ellypaws/inkbunny/cmd/downloader/pkg/flight"
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
	Request         inkbunny.SubmissionSearchRequest
	CacheKey        searchCacheKey
}

const defaultSearchPerPage = 30

func (a *App) Search(params SearchParams) (SearchResponse, error) {
	user, err := a.ensureSearchSession()
	if err != nil {
		return SearchResponse{}, err
	}
	req, err := a.buildSearchRequest(user, params)
	if err != nil {
		return SearchResponse{}, err
	}
	ratingsMask := userRatingsMask(user)
	key, normalizedReq, err := makeSearchCacheKey(user, ratingsMask, req)
	if err != nil {
		return SearchResponse{}, err
	}
	entry, err := a.cachedSearchResponse(user, key)
	if err != nil {
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
			entry, err = a.cachedSearchResponse(user, key)
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
		Request:         normalizedReq,
		CacheKey:        key,
	}
	visible, nextServerPage, hasMore, err := a.collectVisibleSearchPage(user, state, &response)
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

	cards, err := a.buildSubmissionCards(user, visible)
	if err != nil {
		return SearchResponse{}, err
	}

	return SearchResponse{
		SearchID:     searchID,
		Page:         state.ClientPage,
		PagesCount:   searchPageCount(state.ClientPage, hasMore),
		ResultsCount: limitedResultsCount(state.RawResultsCount, state.MaxDownloads),
		Results:      cards,
		Session:      a.GetSession(),
	}, nil
}

func (a *App) RefreshSearch(searchID string) (SearchResponse, error) {
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

	entry, err := a.cachedSearchResponse(user, key)
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
			entry, err = a.cachedSearchResponse(user, key)
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
	state.Request = normalizedReq
	state.CacheKey = key
	a.mu.Unlock()

	visible, nextServerPage, hasMore, err := a.collectVisibleSearchPage(user, state, &entry.Response)
	if err != nil {
		return SearchResponse{}, err
	}

	a.mu.Lock()
	state.ClientPage = 1
	state.NextServerPage = nextServerPage
	state.DeliveredCount = len(visible)
	a.mu.Unlock()

	cards, err := a.buildSubmissionCards(user, visible)
	if err != nil {
		return SearchResponse{}, err
	}

	return SearchResponse{
		SearchID:     searchID,
		Page:         1,
		PagesCount:   searchPageCount(1, hasMore),
		ResultsCount: limitedResultsCount(state.RawResultsCount, state.MaxDownloads),
		Results:      cards,
		Session:      a.GetSession(),
	}, nil
}

func (a *App) LoadMoreResults(searchID string, page int) (SearchResponse, error) {
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
		if err := a.refreshSearchState(user, state); err != nil {
			return SearchResponse{}, err
		}
	}

	visible, nextServerPage, hasMore, err := a.collectVisibleSearchPage(user, state, nil)
	if err != nil {
		if a.handleSessionError(err) {
			user, err = a.ensureSearchSession()
			if err != nil {
				return SearchResponse{}, err
			}
			if err := a.refreshSearchState(user, state); err != nil {
				return SearchResponse{}, err
			}
			visible, nextServerPage, hasMore, err = a.collectVisibleSearchPage(user, state, nil)
		} else if a.handleRIDExpiredError(err) {
			if err := a.refreshSearchStateForced(user, state); err != nil {
				return SearchResponse{}, err
			}
			visible, nextServerPage, hasMore, err = a.collectVisibleSearchPage(user, state, nil)
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

	cards, err := a.buildSubmissionCards(user, visible)
	if err != nil {
		return SearchResponse{}, err
	}

	return SearchResponse{
		SearchID:     searchID,
		Page:         page,
		PagesCount:   searchPageCount(page, hasMore),
		ResultsCount: limitedResultsCount(state.RawResultsCount, state.MaxDownloads),
		Results:      cards,
		Session:      a.GetSession(),
	}, nil
}

func (a *App) GetKeywordSuggestions(query string) ([]string, error) {
	query = strings.TrimSpace(query)
	if query == "" {
		return nil, nil
	}

	user, err := a.ensureSearchSession()
	if err != nil {
		return nil, err
	}
	a.ensureCaches(user)

	items, err := a.keywordCache.Get(keywordSuggestionCacheKey(user, query))
	if err != nil {
		return nil, err
	}
	values := make([]string, 0, minInt(len(items), 10))
	for i, item := range items {
		if i >= 10 {
			break
		}
		values = append(values, item.Value)
	}
	return values, nil
}

func (a *App) GetUsernameSuggestions(query string) ([]UsernameSuggestion, error) {
	query = strings.TrimSpace(query)
	if query == "" {
		return nil, nil
	}

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
	values := make([]UsernameSuggestion, 0, minInt(len(items), 10))
	for i, item := range items {
		if i >= 10 {
			break
		}
		values = append(values, item)
	}
	return values, nil
}

func (a *App) buildSearchRequest(user *inkbunny.User, params SearchParams) (inkbunny.SubmissionSearchRequest, error) {
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
		Username:           strings.TrimSpace(params.ArtistName),
		StringJoinType:     strings.ToLower(strings.TrimSpace(params.JoinType)),
		DaysLimit:          inkbunny.IntString(params.TimeRangeDays),
		OrderBy:            params.OrderBy,
		GetRID:             inkbunny.Yes,
		Page:               inkbunny.IntString(page),
		SubmissionsPerPage: inkbunny.IntString(perPage),
		Scraps:             normalizeScrapsMode(params.Scraps),
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
		member, ok, err := a.lookupUsernameSuggestion(user, favBy)
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
		member, ok, err := a.lookupUsernameSuggestion(user, req.Username)
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

func (a *App) buildSubmissionCards(user *inkbunny.User, submissions []inkbunny.SubmissionSearch) ([]SubmissionCard, error) {
	downloadedSubmissions, err := a.lookupDownloadedSubmissions(user, submissions)
	if err != nil {
		if a.handleSessionError(err) {
			user, err = a.ensureSearchSession()
			if err != nil {
				return nil, err
			}
			downloadedSubmissions, err = a.lookupDownloadedSubmissions(user, submissions)
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
			PreviewURL:       submissionPreviewURL(submission.FileURLPreview.String(), submission.Public.Bool(), sid),
			ScreenURL:        submissionPreviewURL(submission.FileURLScreen.String(), submission.Public.Bool(), sid),
			FullURL:          submissionPreviewURL(submission.FileURLFull.String(), submission.Public.Bool(), sid),
			ThumbnailURL:     submissionPreviewURL(thumbnail, submission.Public.Bool(), sid),
			LatestThumbnailURL: submissionPreviewURL(
				latestThumbnail,
				submission.Public.Bool(),
				sid,
			),
			BadgeText:  badge,
			Accent:     accents[index%len(accents)],
			Downloaded: downloadedSubmissions[submission.SubmissionID.String()],
		})
	}
	return cards
}

func (a *App) lookupDownloadedSubmissions(user *inkbunny.User, submissions []inkbunny.SubmissionSearch) (map[string]bool, error) {
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

	details, err := a.cachedSubmissionDetails(user, submissionIDs)
	if err != nil {
		return nil, err
	}

	for _, submission := range details.Submissions {
		downloaded[submission.SubmissionID.String()] = submissionFilesDownloaded(downloadRoot, submission)
	}

	return downloaded, nil
}

func submissionFilesDownloaded(downloadRoot string, submission inkbunny.SubmissionDetails) bool {
	if len(submission.Files) == 0 {
		return false
	}

	for _, file := range submission.Files {
		result, err := verifyDownloadedFile(
			downloadFilePath(downloadRoot, submission.Username, file.FileName),
			file.FullFileMD5,
		)
		if err != nil || !result.Matches {
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

func (a *App) collectVisibleSearchPage(user *inkbunny.User, state *searchState, initial *inkbunny.SubmissionSearchResponse) ([]inkbunny.SubmissionSearch, int, bool, error) {
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
		filtered := filterSubmissionsByRatings(response.Submissions, ratingsMask)
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
		response, err := a.cachedLoadMore(state, nextServerPage)
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

func filterSubmissionsByRatings(submissions []inkbunny.SubmissionSearch, mask string) []inkbunny.SubmissionSearch {
	allowed := allowedRatings(mask)
	filtered := make([]inkbunny.SubmissionSearch, 0, len(submissions))
	for _, submission := range submissions {
		if submissionAllowedByRatings(submission, allowed) {
			filtered = append(filtered, submission)
		}
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

func submissionPreviewURL(raw string, isPublic bool, sid string) string {
	if raw == "" || isPublic || sid == "" {
		return raw
	}
	if strings.Contains(raw, "?") {
		return raw + "&sid=" + sid
	}
	return raw + "?sid=" + sid
}

func (a *App) ensureCaches(user *inkbunny.User) {
	a.cacheMu.Lock()
	defer a.cacheMu.Unlock()

	if a.keywordCache == nil {
		cache := flight.NewCache(func(key keywordCacheKey) ([]inkbunny.KeywordAutocomplete, error) {
			return executeWithRateLimitRetry(a.ctx, a.rateLimiter, "keyword suggestions", func() ([]inkbunny.KeywordAutocomplete, error) {
				ratings := inkbunny.ParseMask(key.RatingsMask)
				return inkbunny.KeywordSuggestion(key.Query, ratings, key.Underscore)
			})
		})
		a.keywordCache = &cache
	}
	if a.usernameCache == nil {
		cache := flight.NewCache(func(key usernameCacheKey) ([]UsernameSuggestion, error) {
			return executeWithRateLimitRetry(a.ctx, a.rateLimiter, "username suggestions", func() ([]UsernameSuggestion, error) {
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
		cache := flight.NewCache(func(key avatarCacheKey) (string, error) {
			return executeWithRateLimitRetry(a.ctx, a.rateLimiter, "avatar lookups", func() (string, error) {
				current, err := a.ensureSearchSession()
				if err != nil {
					return "", err
				}
				member, ok, err := a.lookupUsernameSuggestion(current, key.Username)
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
	if a.searchCache == nil {
		cache := flight.NewCache(func(key searchCacheKey) (cachedSearchResult, error) {
			return executeWithRateLimitRetry(a.ctx, a.rateLimiter, "search", func() (cachedSearchResult, error) {
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
		cache := flight.NewCache(func(key loadMoreCacheKey) (inkbunny.SubmissionSearchResponse, error) {
			return executeWithRateLimitRetry(a.ctx, a.rateLimiter, "search results", func() (inkbunny.SubmissionSearchResponse, error) {
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
		cache := flight.NewCache(func(key detailsCacheKey) (inkbunny.SubmissionDetailsResponse, error) {
			return executeWithRateLimitRetry(a.ctx, a.rateLimiter, "submission details", func() (inkbunny.SubmissionDetailsResponse, error) {
				current, err := a.ensureSearchSession()
				if err != nil {
					return inkbunny.SubmissionDetailsResponse{}, err
				}
				ids := strings.Split(key.SubmissionIDs, ",")
				return current.SubmissionDetails(inkbunny.SubmissionDetailsRequest{
					SID:               key.SID,
					SubmissionIDSlice: ids,
				})
			})
		})
		a.detailsCache = &cache
	}
}

func (a *App) resetCaches(user *inkbunny.User) {
	a.cacheMu.Lock()
	defer a.cacheMu.Unlock()

	keywordCache := flight.NewCache(func(key keywordCacheKey) ([]inkbunny.KeywordAutocomplete, error) {
		return executeWithRateLimitRetry(a.ctx, a.rateLimiter, "keyword suggestions", func() ([]inkbunny.KeywordAutocomplete, error) {
			ratings := inkbunny.ParseMask(key.RatingsMask)
			return inkbunny.KeywordSuggestion(key.Query, ratings, key.Underscore)
		})
	})
	usernameCache := flight.NewCache(func(key usernameCacheKey) ([]UsernameSuggestion, error) {
		return executeWithRateLimitRetry(a.ctx, a.rateLimiter, "username suggestions", func() ([]UsernameSuggestion, error) {
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
	avatarCache := flight.NewCache(func(key avatarCacheKey) (string, error) {
		return executeWithRateLimitRetry(a.ctx, a.rateLimiter, "avatar lookups", func() (string, error) {
			current, err := a.ensureSearchSession()
			if err != nil {
				return "", err
			}
			member, ok, err := a.lookupUsernameSuggestion(current, key.Username)
			if err != nil {
				return "", err
			}
			if ok && member.AvatarURL != "" {
				return member.AvatarURL, nil
			}
			return defaultAvatarURL, nil
		})
	})
	searchCache := flight.NewCache(func(key searchCacheKey) (cachedSearchResult, error) {
		return executeWithRateLimitRetry(a.ctx, a.rateLimiter, "search", func() (cachedSearchResult, error) {
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
	loadMoreCache := flight.NewCache(func(key loadMoreCacheKey) (inkbunny.SubmissionSearchResponse, error) {
		return executeWithRateLimitRetry(a.ctx, a.rateLimiter, "search results", func() (inkbunny.SubmissionSearchResponse, error) {
			return inkbunny.SearchSubmissions(inkbunny.SubmissionSearchRequest{
				SID:  key.SID,
				RID:  key.RID,
				Page: inkbunny.IntString(key.Page),
			})
		})
	})
	detailsCache := flight.NewCache(func(key detailsCacheKey) (inkbunny.SubmissionDetailsResponse, error) {
		return executeWithRateLimitRetry(a.ctx, a.rateLimiter, "submission details", func() (inkbunny.SubmissionDetailsResponse, error) {
			current, err := a.ensureSearchSession()
			if err != nil {
				return inkbunny.SubmissionDetailsResponse{}, err
			}
			ids := strings.Split(key.SubmissionIDs, ",")
			return current.SubmissionDetails(inkbunny.SubmissionDetailsRequest{
				SID:               key.SID,
				SubmissionIDSlice: ids,
			})
		})
	})
	a.keywordCache = &keywordCache
	a.usernameCache = &usernameCache
	a.avatarCache = &avatarCache
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

func (a *App) lookupUsernameSuggestion(user *inkbunny.User, username string) (UsernameSuggestion, bool, error) {
	a.ensureCaches(user)
	items, err := a.usernameCache.Get(usernameCacheKey{
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

func (a *App) cachedSearchResponse(user *inkbunny.User, key searchCacheKey) (cachedSearchResult, error) {
	a.ensureCaches(user)
	entry, err := a.searchCache.Get(key)
	if err != nil {
		return cachedSearchResult{}, err
	}
	if !entry.Response.RIDExpiry.IsZero() && time.Now().After(entry.Response.RIDExpiry) {
		a.searchCache.Delete(key)
		return a.searchCache.Get(key)
	}
	return entry, nil
}

func (a *App) refreshSearchState(user *inkbunny.User, state *searchState) error {
	return a.refreshSearchStateWithOptions(user, state, false)
}

func (a *App) refreshSearchStateForced(user *inkbunny.User, state *searchState) error {
	return a.refreshSearchStateWithOptions(user, state, true)
}

func (a *App) refreshSearchStateWithOptions(user *inkbunny.User, state *searchState, force bool) error {
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
	entry, err := a.cachedSearchResponse(user, key)
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

func (a *App) cachedLoadMore(state *searchState, page int) (inkbunny.SubmissionSearchResponse, error) {
	if state == nil {
		return inkbunny.SubmissionSearchResponse{}, errors.New("search state is missing")
	}
	a.ensureCaches(a.user)
	return a.loadMoreCache.Get(loadMoreCacheKey{
		SID:  state.SID,
		RID:  state.RID,
		Page: page,
	})
}
