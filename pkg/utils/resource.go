package utils

import (
	"net/url"
	"strings"
)

var privateResourceHints = []string{
	"/private_files/",
	"/private_thumbnails/",
}

// HasSID reports whether the URL already carries a sid query parameter.
func HasSID(raw string) bool {
	if strings.TrimSpace(raw) == "" {
		return false
	}

	parsed, err := url.Parse(raw)
	if err == nil {
		return parsed.Query().Get("sid") != ""
	}
	return strings.Contains(raw, "sid=")
}

// AppendSID appends sid to the URL if one is not already present.
func AppendSID(raw string, sid string) string {
	if raw == "" || strings.TrimSpace(sid) == "" || HasSID(raw) {
		return raw
	}

	parsed, err := url.Parse(raw)
	if err != nil {
		if strings.Contains(raw, "?") {
			return raw + "&sid=" + sid
		}
		return raw + "?sid=" + sid
	}

	query := parsed.Query()
	query.Set("sid", sid)
	parsed.RawQuery = query.Encode()
	return parsed.String()
}

// LooksPrivate reports whether the resource path clearly points at a private asset.
func LooksPrivate(raw string) bool {
	lower := strings.ToLower(strings.TrimSpace(raw))
	if lower == "" {
		return false
	}

	for _, hint := range privateResourceHints {
		if strings.Contains(lower, hint) {
			return true
		}
	}
	return false
}

// ResourceURL preserves public URLs unless the resource path clearly indicates a private asset.
func ResourceURL(raw string, sid string, isPublic bool) string {
	if strings.TrimSpace(raw) == "" {
		return raw
	}
	if isPublic && !LooksPrivate(raw) {
		return raw
	}
	return AppendSID(raw, sid)
}
