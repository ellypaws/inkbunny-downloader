package state

import (
	"fmt"
	"strings"

	apputils "github.com/ellypaws/inkbunny/cmd/downloader/pkg/app/utils"

	"github.com/ellypaws/inkbunny/cmd/downloader/pkg/app/storage"
	"github.com/ellypaws/inkbunny/cmd/downloader/pkg/app/types"
)

type debugResetPlan struct {
	scope          string
	resetCaches    bool
	resetSession   bool
	resetSettings  bool
	resetWorkspace bool
	resetQueue     bool
}

func (a *App) DebugResetState(scope string) (types.DebugResetResult, error) {
	plan, err := makeDebugResetPlan(scope)
	if err != nil {
		return types.DebugResetResult{}, err
	}

	a.CancelSearchRequests()

	var queue types.QueueSnapshot
	if plan.resetQueue && a.downloadManager != nil {
		queue = a.downloadManager.Reset()
	}

	defaultState := storage.DefaultStoredState()

	a.mu.Lock()
	if plan.resetSession {
		a.user = nil
		a.sessionAvatar = apputils.DefaultAvatarURL
	}
	if plan.resetSettings {
		a.settings = defaultState.Settings
	}
	if plan.resetWorkspace {
		a.workspace = defaultState.Workspace
	}
	if plan.resetCaches {
		a.searches = make(map[string]*searchState)
		a.lastSearchID = ""
	}
	user := a.user
	settings := a.settings
	workspace := a.workspace
	a.mu.Unlock()

	if plan.resetCaches {
		a.resetCaches(user)
		a.rateLimiter.Reset()
	}
	if plan.resetSettings && a.downloadManager != nil {
		a.downloadManager.SetMaxActive(settings.MaxActive)
	}
	if !plan.resetQueue {
		queue = a.GetQueueSnapshot()
	}
	if err := a.persist(); err != nil {
		return types.DebugResetResult{}, err
	}

	result := types.DebugResetResult{
		Scope:         plan.scope,
		CachesCleared: plan.resetCaches,
		Session:       a.GetSession(),
		Settings:      settings,
		Workspace:     workspace,
		Queue:         queue,
	}
	a.emitDebugLog("info", "debug.reset", "debug reset completed", map[string]any{
		"scope":         result.Scope,
		"cachesCleared": result.CachesCleared,
		"hasSession":    result.Session.HasSession,
		"tabCount":      len(result.Workspace.Tabs),
		"queueJobs":     len(result.Queue.Jobs),
	})
	return result, nil
}

func makeDebugResetPlan(scope string) (debugResetPlan, error) {
	switch strings.ToLower(strings.TrimSpace(scope)) {
	case "", "all":
		return debugResetPlan{
			scope:          "all",
			resetCaches:    true,
			resetSession:   true,
			resetSettings:  true,
			resetWorkspace: true,
			resetQueue:     true,
		}, nil
	case "cache":
		return debugResetPlan{scope: "cache", resetCaches: true}, nil
	case "login", "session":
		return debugResetPlan{
			scope:        "login",
			resetCaches:  true,
			resetSession: true,
		}, nil
	case "state":
		return debugResetPlan{
			scope:          "state",
			resetCaches:    true,
			resetSettings:  true,
			resetWorkspace: true,
		}, nil
	case "settings":
		return debugResetPlan{scope: "settings", resetSettings: true}, nil
	case "workspace":
		return debugResetPlan{
			scope:          "workspace",
			resetCaches:    true,
			resetWorkspace: true,
		}, nil
	case "queue":
		return debugResetPlan{scope: "queue", resetQueue: true}, nil
	default:
		return debugResetPlan{}, fmt.Errorf("unknown debug reset scope: %s", scope)
	}
}
