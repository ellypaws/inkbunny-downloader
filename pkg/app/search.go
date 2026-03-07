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
	ID         string
	RID        string
	SID        string
	ExpiresAt  time.Time
	PagesCount int
	LastPage   int
	Request    inkbunny.SubmissionSearchRequest
	CacheKey   searchCacheKey
}

func (a *App) Search(params SearchParams) (SearchResponse, error) {
	user, err := a.ensureSearchSession()
	if err != nil {
		return SearchResponse{}, err
	}
	req, err := a.buildSearchRequest(user, params)
	if err != nil {
		return SearchResponse{}, err
	}
	key, normalizedReq, err := makeSearchCacheKey(user, user.Ratings.String(), req)
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
			key, normalizedReq, err = makeSearchCacheKey(user, user.Ratings.String(), req)
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

	searchID := a.newSearchID()
	page := int(response.Page)
	if page <= 0 {
		page = 1
	}

	a.mu.Lock()
	a.searches[searchID] = &searchState{
		ID:         searchID,
		RID:        response.RID,
		SID:        response.SID,
		ExpiresAt:  response.RIDExpiry,
		PagesCount: int(response.PagesCount),
		LastPage:   page,
		Request:    normalizedReq,
		CacheKey:   key,
	}
	a.lastSearchID = searchID
	a.mu.Unlock()
	_ = a.persist()

	return SearchResponse{
		SearchID:     searchID,
		Page:         page,
		PagesCount:   int(response.PagesCount),
		ResultsCount: int(response.ResultsCountAll),
		Results:      mapSubmissionCards(response.Submissions),
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
		page = state.LastPage + 1
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

	response, err := a.cachedLoadMore(state, page)
	if err != nil {
		if a.handleSessionError(err) {
			user, err = a.ensureSearchSession()
			if err != nil {
				return SearchResponse{}, err
			}
			if err := a.refreshSearchState(user, state); err != nil {
				return SearchResponse{}, err
			}
			response, err = a.cachedLoadMore(state, page)
		}
	}
	if err != nil {
		return SearchResponse{}, err
	}

	a.mu.Lock()
	state.LastPage = page
	a.mu.Unlock()

	return SearchResponse{
		SearchID:     searchID,
		Page:         page,
		PagesCount:   int(response.PagesCount),
		ResultsCount: int(response.ResultsCountAll),
		Results:      mapSubmissionCards(response.Submissions),
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

	items, err := a.keywordCache.Get(keywordCacheKey{
		Query:       query,
		RatingsMask: user.Ratings.String(),
		Underscore:  strings.Contains(query, "_"),
	})
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
		perPage = 24
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
		Scraps:             inkbunny.ScrapsBoth,
	}
	if params.MaxDownloads > 0 {
		req.CountLimit = inkbunny.IntString(params.MaxDownloads)
	}
	if req.StringJoinType == "" {
		req.StringJoinType = inkbunny.JoinTypeAnd
	}
	if req.OrderBy == "" {
		req.OrderBy = inkbunny.OrderByCreateDatetime
	}

	if params.SearchInKeywords {
		req.Keywords = &inkbunny.Yes
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
	if req.Keywords == nil && req.Title == nil && req.Description == nil && req.MD5 == nil {
		req.Keywords = &inkbunny.Yes
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

func mapSubmissionCards(submissions []inkbunny.SubmissionSearch) []SubmissionCard {
	cards := make([]SubmissionCard, 0, len(submissions))
	accents := []string{"rose", "mint", "lavender", "sky"}

	for index, submission := range submissions {
		thumbnail := submission.ThumbnailURLHuge
		if thumbnail == "" {
			thumbnail = submission.ThumbnailURLLarge
		}
		if thumbnail == "" {
			thumbnail = submission.ThumbnailURLMedium
		}

		badge := submission.TypeName
		if badge == "" {
			badge = submission.RatingName
		}

		cards = append(cards, SubmissionCard{
			SubmissionID: submission.SubmissionID.String(),
			Title:        submission.Title,
			Username:     submission.Username,
			TypeName:     submission.TypeName,
			RatingName:   submission.RatingName,
			IsPublic:     submission.Public.Bool(),
			PageCount:    int(submission.PageCount),
			Updated:      submission.Updated.Bool(),
			FileName:     submission.FileName.String(),
			PreviewURL:   submission.FileURLPreview.String(),
			ScreenURL:    submission.FileURLScreen.String(),
			FullURL:      submission.FileURLFull.String(),
			ThumbnailURL: thumbnail,
			BadgeText:    badge,
			Accent:       accents[index%len(accents)],
		})
	}
	return cards
}

func (a *App) ensureCaches(user *inkbunny.User) {
	a.cacheMu.Lock()
	defer a.cacheMu.Unlock()

	if a.keywordCache == nil {
		cache := flight.NewCache(func(key keywordCacheKey) ([]inkbunny.KeywordAutocomplete, error) {
			ratings := inkbunny.ParseMask(key.RatingsMask)
			return inkbunny.KeywordSuggestion(key.Query, ratings, key.Underscore)
		})
		a.keywordCache = &cache
	}
	if a.usernameCache == nil {
		cache := flight.NewCache(func(key usernameCacheKey) ([]UsernameSuggestion, error) {
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
		a.usernameCache = &cache
	}
	if a.avatarCache == nil {
		cache := flight.NewCache(func(key avatarCacheKey) (string, error) {
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
		a.avatarCache = &cache
	}
	if a.searchCache == nil {
		cache := flight.NewCache(func(key searchCacheKey) (cachedSearchResult, error) {
			var req inkbunny.SubmissionSearchRequest
			if err := json.Unmarshal([]byte(key.RequestJSON), &req); err != nil {
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
		a.searchCache = &cache
	}
	if a.loadMoreCache == nil {
		cache := flight.NewCache(func(key loadMoreCacheKey) (inkbunny.SubmissionSearchResponse, error) {
			return inkbunny.SearchSubmissions(inkbunny.SubmissionSearchRequest{
				SID:  key.SID,
				RID:  key.RID,
				Page: inkbunny.IntString(key.Page),
			})
		})
		a.loadMoreCache = &cache
	}
	if a.detailsCache == nil {
		cache := flight.NewCache(func(key detailsCacheKey) (inkbunny.SubmissionDetailsResponse, error) {
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
		a.detailsCache = &cache
	}
}

func (a *App) resetCaches(user *inkbunny.User) {
	a.cacheMu.Lock()
	defer a.cacheMu.Unlock()

	keywordCache := flight.NewCache(func(key keywordCacheKey) ([]inkbunny.KeywordAutocomplete, error) {
		ratings := inkbunny.ParseMask(key.RatingsMask)
		return inkbunny.KeywordSuggestion(key.Query, ratings, key.Underscore)
	})
	usernameCache := flight.NewCache(func(key usernameCacheKey) ([]UsernameSuggestion, error) {
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
	avatarCache := flight.NewCache(func(key avatarCacheKey) (string, error) {
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
	searchCache := flight.NewCache(func(key searchCacheKey) (cachedSearchResult, error) {
		var req inkbunny.SubmissionSearchRequest
		if err := json.Unmarshal([]byte(key.RequestJSON), &req); err != nil {
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
	loadMoreCache := flight.NewCache(func(key loadMoreCacheKey) (inkbunny.SubmissionSearchResponse, error) {
		return inkbunny.SearchSubmissions(inkbunny.SubmissionSearchRequest{
			SID:  key.SID,
			RID:  key.RID,
			Page: inkbunny.IntString(key.Page),
		})
	})
	detailsCache := flight.NewCache(func(key detailsCacheKey) (inkbunny.SubmissionDetailsResponse, error) {
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
	a.keywordCache = &keywordCache
	a.usernameCache = &usernameCache
	a.avatarCache = &avatarCache
	a.searchCache = &searchCache
	a.loadMoreCache = &loadMoreCache
	a.detailsCache = &detailsCache
}

func (a *App) handleSessionError(err error) bool {
	var apiErr inkbunny.ErrorResponse
	if errors.As(err, &apiErr) && apiErr.Code != nil && *apiErr.Code == inkbunny.ErrInvalidSessionID {
		a.clearSession()
		return true
	}
	return false
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
	if state == nil {
		return errors.New("search state is missing")
	}
	key, normalizedReq, err := makeSearchCacheKey(user, user.Ratings.String(), state.Request)
	if err != nil {
		return err
	}
	entry, err := a.cachedSearchResponse(user, key)
	if err != nil {
		return err
	}
	state.RID = entry.Response.RID
	state.SID = entry.Response.SID
	state.ExpiresAt = entry.Response.RIDExpiry
	state.PagesCount = int(entry.Response.PagesCount)
	state.LastPage = 1
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
