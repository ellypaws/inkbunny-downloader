package state

import (
	"sync"
	"sync/atomic"

	wruntime "github.com/wailsapp/wails/v2/pkg/runtime"

	"github.com/ellypaws/inkbunny/cmd/downloader/pkg/app/types"
)

const (
	sessionUpdatedEvent        = "session.updated"
	settingsUpdatedEvent       = "settings.updated"
	workspaceUpdatedEvent      = "workspace.updated"
	queueUpdatedEvent          = "queue.updated"
	downloadJobUpdatedEvent    = "download.jobUpdated"
	searchResultsHydratedEvent = "search.resultsHydrated"
	notificationEvent          = "notification"
	debugEvent                 = "debug"
	snapshotInitialEvent       = "snapshot.initial"
)

type sharedEvent struct {
	Type    string `json:"type"`
	Payload any    `json:"payload,omitempty"`
}

type sharedEventHub struct {
	mu          sync.RWMutex
	nextID      atomic.Uint64
	subscribers map[uint64]chan sharedEvent
}

func newSharedEventHub() *sharedEventHub {
	return &sharedEventHub{
		subscribers: make(map[uint64]chan sharedEvent),
	}
}

func (h *sharedEventHub) subscribe(buffer int) (uint64, <-chan sharedEvent, func()) {
	if buffer <= 0 {
		buffer = 1
	}
	id := h.nextID.Add(1)
	ch := make(chan sharedEvent, buffer)
	h.mu.Lock()
	h.subscribers[id] = ch
	h.mu.Unlock()
	return id, ch, func() {
		h.mu.Lock()
		existing := h.subscribers[id]
		delete(h.subscribers, id)
		h.mu.Unlock()
		if existing != nil {
			close(existing)
		}
	}
}

func (h *sharedEventHub) publish(event sharedEvent) {
	h.mu.RLock()
	defer h.mu.RUnlock()
	for _, subscriber := range h.subscribers {
		select {
		case subscriber <- event:
		default:
			select {
			case <-subscriber:
			default:
			}
			select {
			case subscriber <- event:
			default:
			}
		}
	}
}

func (a *App) emitRuntimeEvent(event string, payload any) {
	if a.ctx != nil && a.ctx.Value("events") != nil {
		wruntime.EventsEmit(a.ctx, event, payload)
	}
}

func (a *App) publishSharedEvent(eventType string, payload any) {
	if a.eventHub == nil {
		return
	}
	a.eventHub.publish(sharedEvent{
		Type:    eventType,
		Payload: payload,
	})
}

func (a *App) SubscribeSharedEvents(buffer int) (<-chan sharedEvent, func()) {
	if a.eventHub == nil {
		a.eventHub = newSharedEventHub()
	}
	_, ch, cancel := a.eventHub.subscribe(buffer)
	return ch, cancel
}

func (a *App) SharedSnapshot() types.SharedSnapshot {
	a.mu.RLock()
	session := a.GetSession()
	settings := a.settings
	workspace := a.workspace
	a.mu.RUnlock()
	return types.SharedSnapshot{
		BuildInfo:         a.GetBuildInfo(),
		SessionRevision:   a.sessionRevision.Load(),
		Session:           session,
		SettingsRevision:  a.settingsRevision.Load(),
		Settings:          settings,
		WorkspaceRevision: a.workspaceRevision.Load(),
		Workspace:         workspace,
		QueueRevision:     a.queueRevision.Load(),
		Queue:             a.GetQueueSnapshot(),
	}
}

func (a *App) nextSessionRevision() int64 {
	return a.sessionRevision.Add(1)
}

func (a *App) nextSettingsRevision() int64 {
	return a.settingsRevision.Add(1)
}

func (a *App) nextWorkspaceRevision() int64 {
	return a.workspaceRevision.Add(1)
}

func (a *App) nextQueueRevision() int64 {
	return a.queueRevision.Add(1)
}

func (a *App) broadcastSessionState() {
	update := types.SessionStateUpdate{
		Revision: a.nextSessionRevision(),
		Session:  a.GetSession(),
	}
	a.emitRuntimeEvent(sessionUpdatedEvent, update)
	a.publishSharedEvent(sessionUpdatedEvent, update)
}

func (a *App) broadcastSettingsState() {
	a.mu.RLock()
	settings := a.settings
	a.mu.RUnlock()
	update := types.SettingsStateUpdate{
		Revision: a.nextSettingsRevision(),
		Settings: settings,
	}
	a.emitRuntimeEvent(settingsUpdatedEvent, update)
	a.publishSharedEvent(settingsUpdatedEvent, update)
}

func (a *App) broadcastWorkspaceState() {
	a.mu.RLock()
	workspace := a.workspace
	a.mu.RUnlock()
	update := types.WorkspaceStateUpdate{
		Revision:  a.nextWorkspaceRevision(),
		Workspace: workspace,
	}
	a.emitRuntimeEvent(workspaceUpdatedEvent, update)
	a.publishSharedEvent(workspaceUpdatedEvent, update)
}

func (a *App) broadcastQueueState() {
	a.broadcastQueueStateFromSnapshot(a.GetQueueSnapshot())
}

func (a *App) broadcastQueueStateFromSnapshot(snapshot types.QueueSnapshot) {
	update := types.QueueStateUpdate{
		Revision: a.nextQueueRevision(),
		Queue:    snapshot,
	}
	a.emitRuntimeEvent(queueUpdatedEvent, update)
	a.publishSharedEvent(queueUpdatedEvent, update)
}

func (a *App) broadcastSearchResultsHydrated(update types.SearchResultsHydratedUpdate) {
	a.emitRuntimeEvent(searchResultsHydratedEvent, update)
	a.publishSharedEvent(searchResultsHydratedEvent, update)
}

func extractQueueSnapshot(payload any) types.QueueSnapshot {
	progress, ok := payload.(types.DownloadProgressEvent)
	if ok {
		return progress.Queue
	}
	return types.EmptyQueueSnapshot()
}
