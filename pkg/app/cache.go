package desktopapp

import (
	"encoding/json"
	"fmt"
	"strings"

	"github.com/ellypaws/inkbunny"
)

const defaultAvatarURL = "https://inkbunny.net/images80/usericons/large/noicon.png"

type keywordCacheKey struct {
	Query       string
	RatingsMask string
	Underscore  bool
}

type usernameCacheKey struct {
	Scope string
	Query string
}

type avatarCacheKey struct {
	Scope    string
	Username string
}

type watchingCacheKey struct {
	Scope string
}

type searchCacheKey struct {
	Scope       string
	RatingsMask string
	RequestJSON string
}

type loadMoreCacheKey struct {
	SID  string
	RID  string
	Page int
}

type detailsCacheKey struct {
	SID           string
	SubmissionIDs string
}

type cachedSearchResult struct {
	Request  inkbunny.SubmissionSearchRequest
	Response inkbunny.SubmissionSearchResponse
}

func sessionScope(user *inkbunny.User) string {
	if user == nil || user.SID == "" {
		return "anonymous"
	}
	return user.SID
}

func normalizeUsername(value string) string {
	return strings.ToLower(strings.TrimSpace(value))
}

func normalizeSearchRequest(req inkbunny.SubmissionSearchRequest) inkbunny.SubmissionSearchRequest {
	normalized := req
	normalized.RID = ""
	normalized.Page = 1
	normalized.GetRID = inkbunny.Yes
	return normalized
}

func makeSearchCacheKey(user *inkbunny.User, ratingsMask string, req inkbunny.SubmissionSearchRequest) (searchCacheKey, inkbunny.SubmissionSearchRequest, error) {
	normalized := normalizeSearchRequest(req)
	if user != nil {
		normalized.SID = user.SID
	}
	if normalized.UnreadSubmissions == inkbunny.Yes {
		ratingsMask = ""
	}
	data, err := json.Marshal(normalized)
	if err != nil {
		return searchCacheKey{}, inkbunny.SubmissionSearchRequest{}, fmt.Errorf("marshal search cache key: %w", err)
	}
	return searchCacheKey{
		Scope:       sessionScope(user),
		RatingsMask: ratingsMask,
		RequestJSON: string(data),
	}, normalized, nil
}

func avatarURLForIcon(icon string) string {
	trimmed := strings.TrimSpace(icon)
	if trimmed == "" {
		return defaultAvatarURL
	}
	if strings.HasPrefix(trimmed, "http://") || strings.HasPrefix(trimmed, "https://") {
		return trimmed
	}
	trimmed = strings.TrimPrefix(trimmed, "/")
	if strings.HasPrefix(trimmed, "usericons/large/") {
		return "https://inkbunny.net/" + trimmed
	}
	return "https://inkbunny.net/usericons/large/" + trimmed
}

func mapUsernameSuggestions(items []inkbunny.Autocomplete) []UsernameSuggestion {
	suggestions := make([]UsernameSuggestion, 0, len(items))
	for _, item := range items {
		username := item.SingleWord
		if username == "" {
			username = strings.TrimSpace(item.Value)
		}
		suggestions = append(suggestions, UsernameSuggestion{
			UserID:    item.ID.String(),
			Value:     item.Value,
			Username:  username,
			AvatarURL: avatarURLForIcon(item.Icon),
		})
	}
	return suggestions
}

func prependCurrentUserSuggestion(items []UsernameSuggestion, user *inkbunny.User, avatarURL string, query string) []UsernameSuggestion {
	if user == nil || user.SID == "" || strings.EqualFold(user.Username, "guest") {
		return items
	}
	needle := normalizeUsername(query)
	if needle != "" && !strings.Contains(normalizeUsername(user.Username), needle) {
		return items
	}
	for _, item := range items {
		if strings.EqualFold(item.Username, user.Username) {
			return items
		}
	}
	if strings.TrimSpace(avatarURL) == "" {
		return items
	}
	suggestion := UsernameSuggestion{
		UserID:    user.UserID.String(),
		Value:     user.Username,
		Username:  user.Username,
		AvatarURL: avatarURL,
	}
	return append([]UsernameSuggestion{suggestion}, items...)
}

func matchUsernameSuggestion(item UsernameSuggestion, username string) bool {
	needle := normalizeUsername(username)
	return normalizeUsername(item.Username) == needle || normalizeUsername(item.Value) == needle
}
