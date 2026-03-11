package state

import (
	"errors"
	"net/url"
	"strings"

	apputils "github.com/ellypaws/inkbunny/cmd/downloader/pkg/app/utils"
)

var (
	errRemoteURLRequired    = errors.New("resource url is required")
	errRemoteURLInvalid     = errors.New("invalid resource url")
	errRemoteURLUnsupported = errors.New("unsupported resource url")
)

func (a *App) ResolveApprovedRemoteURL(raw string) (*url.URL, error) {
	target, err := ParseApprovedRemoteURL(raw)
	if err != nil || target == nil {
		return nil, err
	}

	if !shouldAttachSessionID(target) {
		return target, nil
	}

	sid := a.currentSessionSID()
	return withRemoteSessionID(target, sid), nil
}

func (a *App) ResolveRemoteURL(raw string) string {
	target, err := a.ResolveApprovedRemoteURL(raw)
	if err != nil || target == nil {
		return ""
	}
	return target.String()
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

	parsed, err := apputils.ParseApprovedInkbunnyURL(target)
	if err != nil {
		switch {
		case errors.Is(err, apputils.ErrApprovedURLRequired):
			return nil, errRemoteURLRequired
		case errors.Is(err, apputils.ErrApprovedURLInvalid):
			return nil, errRemoteURLInvalid
		default:
			return nil, errRemoteURLUnsupported
		}
	}
	return parsed, nil
}

func shouldAttachSessionID(target *url.URL) bool {
	return isApprovedRemoteHost(target)
}

func isApprovedRemoteHost(parsed *url.URL) bool {
	if parsed == nil {
		return false
	}
	return apputils.IsApprovedInkbunnyHost(parsed.Hostname())
}

func withRemoteSessionID(target *url.URL, sid string) *url.URL {
	if target == nil {
		return nil
	}
	clone := *target
	query := clone.Query()
	if strings.TrimSpace(sid) == "" {
		query.Del("sid")
	} else {
		query.Set("sid", sid)
	}
	clone.RawQuery = query.Encode()
	return &clone
}
