package state

import (
	"errors"
	"net/url"
	"strings"

	apputils "github.com/ellypaws/inkbunny/cmd/downloader/pkg/app/utils"
	baseutils "github.com/ellypaws/inkbunny/cmd/downloader/pkg/utils"
)

var (
	errRemoteURLRequired    = errors.New("resource url is required")
	errRemoteURLInvalid     = errors.New("invalid resource url")
	errRemoteURLUnsupported = errors.New("unsupported resource url")
)

func (a *App) ResolveRemoteURL(raw string) string {
	trimmed := apputils.NormalizeInkbunnyURL(raw)
	if trimmed == "" {
		return ""
	}

	if !shouldAttachSessionID(trimmed) {
		return trimmed
	}

	sid := a.currentSessionSID()
	if sid == "" {
		return baseutils.StripSID(trimmed)
	}
	return baseutils.SetSID(trimmed, sid)
}

func (a *App) currentSessionSID() string {
	a.mu.RLock()
	defer a.mu.RUnlock()
	if a.user == nil {
		return ""
	}
	return strings.TrimSpace(a.user.SID)
}

func ParseApprovedRemoteURL(raw string) (*url.URL, error) {
	target := strings.TrimSpace(raw)
	if target == "" {
		return nil, errRemoteURLRequired
	}

	parsed, err := url.Parse(target)
	if err != nil || parsed == nil {
		return nil, errRemoteURLInvalid
	}
	if parsed.Scheme != "https" || !isApprovedRemoteHost(parsed) {
		return nil, errRemoteURLUnsupported
	}
	return parsed, nil
}

func shouldAttachSessionID(raw string) bool {
	parsed, err := url.Parse(apputils.NormalizeInkbunnyURL(raw))
	if err != nil {
		return false
	}
	return isApprovedRemoteHost(parsed)
}

func isApprovedRemoteHost(parsed *url.URL) bool {
	if parsed == nil {
		return false
	}
	host := strings.ToLower(parsed.Hostname())
	if host == "" {
		return false
	}
	return host == "inkbunny.net" ||
		strings.HasSuffix(host, ".inkbunny.net") ||
		strings.HasSuffix(host, ".ib.metapix.net") ||
		host == "ib.metapix.net" ||
		strings.HasSuffix(host, ".metapix.net")
}
