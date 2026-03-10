package state

import (
	"net/url"
	"strings"

	apputils "github.com/ellypaws/inkbunny/cmd/downloader/pkg/app/utils"
	baseutils "github.com/ellypaws/inkbunny/cmd/downloader/pkg/utils"
)

func (a *App) ResolveRemoteURL(raw string) string {
	trimmed := apputils.NormalizeInkbunnyURL(raw)
	if trimmed == "" {
		return ""
	}

	sid := a.currentSessionSID()
	if sid == "" {
		return trimmed
	}
	if !shouldAttachSessionID(trimmed) {
		return trimmed
	}
	return baseutils.AppendSID(trimmed, sid)
}

func (a *App) currentSessionSID() string {
	a.mu.RLock()
	defer a.mu.RUnlock()
	if a.user == nil {
		return ""
	}
	return strings.TrimSpace(a.user.SID)
}

func shouldAttachSessionID(raw string) bool {
	parsed, err := url.Parse(apputils.NormalizeInkbunnyURL(raw))
	if err != nil {
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
