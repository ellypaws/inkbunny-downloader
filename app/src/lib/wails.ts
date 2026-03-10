import type {
  AppNotification,
  AppSettings,
  BackendCapabilities,
  BackendDebugEvent,
  BuildInfo,
  DebugResetResult,
  DebugResetScope,
  DownloadOptions,
  DownloadSelection,
  KeywordSuggestion,
  QueueSnapshot,
  QueueStateUpdate,
  ReleaseStatus,
  RemoteAccessInfo,
  SearchParams,
  SearchResultsHydratedUpdate,
  SearchResponse,
  SessionInfo,
  SessionStateUpdate,
  SharedSnapshot,
  UsernameSuggestion,
  WorkspaceState,
  WorkspaceStateUpdate,
  SettingsStateUpdate,
} from './types'

type BackendApi = {
  GetSession(): Promise<SessionInfo>
  Login(username: string, password: string): Promise<SessionInfo>
  EnsureGuestSession(): Promise<SessionInfo>
  Logout(): Promise<SessionInfo>
  UpdateRatings(mask: string): Promise<SessionInfo>
  OpenDownloadDirectory(): Promise<void>
  OpenExternalURL(url: string): Promise<void>
  ProxyAvatarImageURL(url: string): Promise<string>
  Search(params: SearchParams): Promise<SearchResponse>
  CancelSearchRequests(): Promise<void>
  GetUnreadSubmissionCount(): Promise<number>
  RefreshSearch(searchId: string): Promise<SearchResponse>
  LoadMoreResults(searchId: string, page: number): Promise<SearchResponse>
  GetKeywordSuggestions(query: string): Promise<KeywordSuggestion[]>
  GetUsernameSuggestions(query: string): Promise<UsernameSuggestion[]>
  GetWatching(): Promise<UsernameSuggestion[]>
  GetReleaseStatus(): Promise<ReleaseStatus>
  GetBuildInfo(): Promise<BuildInfo>
  GetRemoteAccessInfo(): Promise<RemoteAccessInfo>
  EnableRemoteAccess(): Promise<RemoteAccessInfo>
  DisableRemoteAccess(): Promise<RemoteAccessInfo>
  SelectRemoteAccessHost(host: string): Promise<RemoteAccessInfo>
  EnqueueDownloads(
    searchId: string,
    selection: DownloadSelection,
    options: DownloadOptions,
  ): Promise<QueueSnapshot>
  GetQueueSnapshot(): Promise<QueueSnapshot>
  GetWorkspaceState(): Promise<WorkspaceState>
  SaveWorkspaceState(state: WorkspaceState): Promise<void>
  CancelDownload(jobId: string): Promise<QueueSnapshot>
  CancelSubmission(submissionId: string): Promise<QueueSnapshot>
  RetryDownload(jobId: string): Promise<QueueSnapshot>
  RetrySubmission(submissionId: string): Promise<QueueSnapshot>
  RetryAllDownloads(): Promise<QueueSnapshot>
  PauseAllDownloads(): Promise<QueueSnapshot>
  ResumeAllDownloads(): Promise<QueueSnapshot>
  StopAllDownloads(): Promise<QueueSnapshot>
  ClearQueue(): Promise<QueueSnapshot>
  ClearCompletedDownloads(): Promise<QueueSnapshot>
  ClearCompletedSubmissions(submissionIds: string[]): Promise<QueueSnapshot>
  PickDownloadDirectory(): Promise<string>
  SkipReleaseTag(tag: string): Promise<AppSettings>
  UpdateSettings(settings: AppSettings): Promise<AppSettings>
  DebugResetState(scope: DebugResetScope): Promise<DebugResetResult>
}

type BackendEventMap = {
  'snapshot.initial': SharedSnapshot
  'session.updated': SessionStateUpdate
  'settings.updated': SettingsStateUpdate
  'workspace.updated': WorkspaceStateUpdate
  'queue.updated': QueueStateUpdate
  'search.resultsHydrated': SearchResultsHydratedUpdate
  notification: AppNotification
  debug: BackendDebugEvent
}

type BackendEventName = keyof BackendEventMap

type WindowGoNamespace = {
  App?: Partial<BackendApi>
}

declare global {
  interface Window {
    go?: Record<string, WindowGoNamespace | undefined>
    runtime?: {
      EventsOn?: (
        eventName: string,
        callback: (payload: unknown) => void,
      ) => () => void
      EventsOff?: (eventName?: string) => void
    }
  }
}

const backendMethodNames = [
  'GetSession',
  'Login',
  'EnsureGuestSession',
  'Logout',
  'UpdateRatings',
  'OpenDownloadDirectory',
  'OpenExternalURL',
  'ProxyAvatarImageURL',
  'Search',
  'CancelSearchRequests',
  'GetUnreadSubmissionCount',
  'RefreshSearch',
  'LoadMoreResults',
  'GetKeywordSuggestions',
  'GetUsernameSuggestions',
  'GetWatching',
  'GetReleaseStatus',
  'GetBuildInfo',
  'GetRemoteAccessInfo',
  'EnableRemoteAccess',
  'DisableRemoteAccess',
  'SelectRemoteAccessHost',
  'EnqueueDownloads',
  'GetQueueSnapshot',
  'GetWorkspaceState',
  'SaveWorkspaceState',
  'CancelDownload',
  'CancelSubmission',
  'RetryDownload',
  'RetrySubmission',
  'RetryAllDownloads',
  'PauseAllDownloads',
  'ResumeAllDownloads',
  'StopAllDownloads',
  'ClearQueue',
  'ClearCompletedDownloads',
  'ClearCompletedSubmissions',
  'PickDownloadDirectory',
  'SkipReleaseTag',
  'UpdateSettings',
  'DebugResetState',
] as const satisfies readonly (keyof BackendApi)[]

const desktopCapabilities: BackendCapabilities = {
  nativeDialogs: true,
  openLocalPaths: true,
  remoteAccessHost: true,
}

const browserCapabilities: BackendCapabilities = {
  nativeDialogs: false,
  openLocalPaths: false,
  remoteAccessHost: false,
}

let cachedDesktopBackend: BackendApi | null = null
function isDesktopRuntimeAvailable(): boolean {
  return Boolean(window.go && typeof window.go === 'object')
}

function normalizeSearchResponse(response: SearchResponse): SearchResponse {
  const results = Array.isArray(response?.results) ? response.results : []
  return {
    ...response,
    results,
    resultsCount: Math.max(response?.resultsCount ?? results.length, results.length),
  }
}

function getDesktopBackend(): BackendApi {
  if (cachedDesktopBackend) {
    return cachedDesktopBackend
  }

  const namespaces = window.go
  if (!namespaces || typeof namespaces !== 'object') {
    throw new Error('Wails backend unavailable: window.go is missing')
  }

  const candidates = Object.entries(namespaces)
    .map(([namespace, value]) => ({
      namespace,
      app: value?.App,
    }))
    .filter(
      (
        candidate,
      ): candidate is {
        namespace: string
        app: Partial<BackendApi>
      } => candidate.app !== undefined && candidate.app !== null,
    )
    .map((candidate) => {
      const availableMethods = backendMethodNames.filter(
        (methodName) => typeof candidate.app[methodName] === 'function',
      )
      return {
        ...candidate,
        availableMethods,
        missingMethods: backendMethodNames.filter(
          (methodName) => typeof candidate.app[methodName] !== 'function',
        ),
      }
    })
    .sort((left, right) => {
      if (right.availableMethods.length !== left.availableMethods.length) {
        return right.availableMethods.length - left.availableMethods.length
      }
      return left.namespace.localeCompare(right.namespace)
    })

  const bestCandidate = candidates[0]
  if (!bestCandidate) {
    throw new Error(
      'Wails backend unavailable: no bound App namespace was found on window.go',
    )
  }
  if (bestCandidate.missingMethods.length > 0) {
    throw new Error(
      `Wails backend binding "${bestCandidate.namespace}.App" is incomplete. Missing methods: ${bestCandidate.missingMethods.join(', ')}`,
    )
  }

  cachedDesktopBackend = bestCandidate.app as BackendApi
  return cachedDesktopBackend
}

function ensureSuccess(response: Response): Promise<Response> {
  if (response.ok) {
    return Promise.resolve(response)
  }
  return response
    .json()
    .catch(() => ({ error: `Request failed with status ${response.status}` }))
    .then((body) => {
      throw new Error(
        typeof body?.error === 'string'
          ? body.error
          : `Request failed with status ${response.status}`,
      )
    })
}

async function requestJSON<T>(
  method: string,
  url: string,
  body?: unknown,
): Promise<T> {
  const response = await fetch(url, {
    method,
    credentials: 'same-origin',
    headers:
      body === undefined
        ? undefined
        : {
            'Content-Type': 'application/json',
          },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  await ensureSuccess(response)
  if (response.status === 204) {
    return undefined as T
  }
  return response.json() as Promise<T>
}

type Listener<E extends BackendEventName> = (payload: BackendEventMap[E]) => void

class BrowserEventBus {
  private listeners = new Map<BackendEventName, Set<Listener<BackendEventName>>>()
  private socket: WebSocket | null = null
  private reconnectTimer = 0

  subscribe<E extends BackendEventName>(
    eventName: E,
    listener: Listener<E>,
  ): () => void {
    const set = this.listeners.get(eventName) ?? new Set()
    set.add(listener as Listener<BackendEventName>)
    this.listeners.set(eventName, set)
    this.ensureConnected()
    return () => {
      const current = this.listeners.get(eventName)
      if (!current) {
        return
      }
      current.delete(listener as Listener<BackendEventName>)
      if (current.size === 0) {
        this.listeners.delete(eventName)
      }
      this.maybeClose()
    }
  }

  private emit<E extends BackendEventName>(
    eventName: E,
    payload: BackendEventMap[E],
  ): void {
    const listeners = this.listeners.get(eventName)
    if (!listeners) {
      return
    }
    for (const listener of listeners) {
      listener(payload)
    }
  }

  private ensureConnected(): void {
    if (this.socket || this.listeners.size === 0) {
      return
    }
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    this.socket = new WebSocket(`${protocol}//${window.location.host}/ws`)
    this.socket.onmessage = (event) => {
      const message = JSON.parse(event.data) as {
        type?: BackendEventName
        payload?: unknown
      }
      if (!message.type) {
        return
      }
      this.emit(
        message.type,
        message.payload as BackendEventMap[typeof message.type],
      )
    }
    this.socket.onclose = () => {
      this.socket = null
      if (this.listeners.size > 0) {
        this.reconnectTimer = window.setTimeout(() => {
          this.reconnectTimer = 0
          this.ensureConnected()
        }, 1500)
      }
    }
  }

  private maybeClose(): void {
    if (this.listeners.size > 0) {
      return
    }
    if (this.reconnectTimer) {
      window.clearTimeout(this.reconnectTimer)
      this.reconnectTimer = 0
    }
    if (this.socket) {
      this.socket.close()
      this.socket = null
    }
  }
}

const browserEvents = new BrowserEventBus()

function buildRemoteResourceURL(url: string): string {
  return `/api/resource?url=${encodeURIComponent(url)}`
}

function buildRemoteOpenURL(url: string): string {
  return `/api/open?url=${encodeURIComponent(url)}`
}

const browserBackend: BackendApi = {
  async GetSession() {
    return requestJSON<SessionInfo>('GET', '/api/session')
  },
  async Login(username: string, password: string) {
    return requestJSON<SessionInfo>('POST', '/api/session/login', {
      username,
      password,
    })
  },
  async EnsureGuestSession() {
    return requestJSON<SessionInfo>('POST', '/api/session/guest')
  },
  async Logout() {
    return requestJSON<SessionInfo>('POST', '/api/session/logout')
  },
  async UpdateRatings(mask: string) {
    return requestJSON<SessionInfo>('POST', '/api/session/ratings', { mask })
  },
  async OpenDownloadDirectory() {
    throw new Error('Opening the local download folder is only available on desktop.')
  },
  async OpenExternalURL(url: string) {
    window.open(buildRemoteOpenURL(url), '_blank', 'noopener,noreferrer')
  },
  async ProxyAvatarImageURL(url: string) {
    const response = await requestJSON<{ value: string }>(
      'GET',
      `/api/avatar/proxy?url=${encodeURIComponent(url)}`,
    )
    return response.value
  },
  async Search(params: SearchParams) {
    return requestJSON<SearchResponse>('POST', '/api/search', params)
  },
  async CancelSearchRequests() {
    await requestJSON<void>('POST', '/api/search/cancel')
  },
  async GetUnreadSubmissionCount() {
    const response = await requestJSON<{ value: number }>(
      'GET',
      '/api/search/unread-count',
    )
    return response.value
  },
  async RefreshSearch(searchId: string) {
    return requestJSON<SearchResponse>('POST', '/api/search/refresh', {
      searchId,
    })
  },
  async LoadMoreResults(searchId: string, page: number) {
    return requestJSON<SearchResponse>('POST', '/api/search/load-more', {
      searchId,
      page,
    })
  },
  async GetKeywordSuggestions(query: string) {
    return requestJSON<KeywordSuggestion[]>(
      'GET',
      `/api/search/keywords?q=${encodeURIComponent(query)}`,
    )
  },
  async GetUsernameSuggestions(query: string) {
    return requestJSON<UsernameSuggestion[]>(
      'GET',
      `/api/search/usernames?q=${encodeURIComponent(query)}`,
    )
  },
  async GetWatching() {
    return requestJSON<UsernameSuggestion[]>('GET', '/api/search/watching')
  },
  async GetReleaseStatus() {
    return requestJSON<ReleaseStatus>('GET', '/api/release-status')
  },
  async GetBuildInfo() {
    return requestJSON<BuildInfo>('GET', '/api/build-info')
  },
  async GetRemoteAccessInfo() {
    return requestJSON<RemoteAccessInfo>('GET', '/api/remote-access')
  },
  async EnableRemoteAccess() {
    throw new Error('Remote access can only be enabled from the desktop app.')
  },
  async DisableRemoteAccess() {
    throw new Error('Remote access can only be disabled from the desktop app.')
  },
  async SelectRemoteAccessHost() {
    throw new Error('Remote access host selection is only available on desktop.')
  },
  async EnqueueDownloads(
    searchId: string,
    selection: DownloadSelection,
    options: DownloadOptions,
  ) {
    return requestJSON<QueueSnapshot>('POST', '/api/queue/enqueue', {
      searchId,
      selection,
      options,
    })
  },
  async GetQueueSnapshot() {
    return requestJSON<QueueSnapshot>('GET', '/api/queue')
  },
  async GetWorkspaceState() {
    return requestJSON<WorkspaceState>('GET', '/api/workspace')
  },
  async SaveWorkspaceState(state: WorkspaceState) {
    await requestJSON<void>('POST', '/api/workspace', state)
  },
  async CancelDownload(jobId: string) {
    return requestJSON<QueueSnapshot>('POST', '/api/queue/cancel-download', {
      jobId,
    })
  },
  async CancelSubmission(submissionId: string) {
    return requestJSON<QueueSnapshot>('POST', '/api/queue/cancel-submission', {
      submissionId,
    })
  },
  async RetryDownload(jobId: string) {
    return requestJSON<QueueSnapshot>('POST', '/api/queue/retry-download', {
      jobId,
    })
  },
  async RetrySubmission(submissionId: string) {
    return requestJSON<QueueSnapshot>('POST', '/api/queue/retry-submission', {
      submissionId,
    })
  },
  async RetryAllDownloads() {
    return requestJSON<QueueSnapshot>('POST', '/api/queue/retry-all')
  },
  async PauseAllDownloads() {
    return requestJSON<QueueSnapshot>('POST', '/api/queue/pause')
  },
  async ResumeAllDownloads() {
    return requestJSON<QueueSnapshot>('POST', '/api/queue/resume')
  },
  async StopAllDownloads() {
    return requestJSON<QueueSnapshot>('POST', '/api/queue/stop')
  },
  async ClearQueue() {
    return requestJSON<QueueSnapshot>('POST', '/api/queue/clear')
  },
  async ClearCompletedDownloads() {
    return requestJSON<QueueSnapshot>('POST', '/api/queue/clear-completed')
  },
  async ClearCompletedSubmissions(submissionIds: string[]) {
    return requestJSON<QueueSnapshot>(
      'POST',
      '/api/queue/clear-completed-submissions',
      { submissionIds },
    )
  },
  async PickDownloadDirectory() {
    throw new Error('Picking a local directory is only available on desktop.')
  },
  async SkipReleaseTag(tag: string) {
    return requestJSON<AppSettings>('POST', '/api/settings/skip-release', {
      tag,
    })
  },
  async UpdateSettings(settings: AppSettings) {
    return requestJSON<AppSettings>('POST', '/api/settings', settings)
  },
  async DebugResetState(scope: DebugResetScope) {
    return requestJSON<DebugResetResult>('POST', '/api/debug/reset', {
      scope,
    })
  },
}

function getBackend(): BackendApi {
  return isDesktopRuntimeAvailable() ? getDesktopBackend() : browserBackend
}

function subscribeDesktopEvent<E extends BackendEventName>(
  eventName: E,
  callback: Listener<E>,
): () => void {
  if (!window.runtime?.EventsOn) {
    return () => undefined
  }
  return window.runtime.EventsOn(eventName, (payload) =>
    callback(payload as BackendEventMap[E]),
  )
}

export const backend = {
  capabilities: isDesktopRuntimeAvailable()
    ? desktopCapabilities
    : browserCapabilities,
  isDesktopRuntime: isDesktopRuntimeAvailable(),
  async getSession(): Promise<SessionInfo> {
    return getBackend().GetSession()
  },
  async login(username: string, password: string): Promise<SessionInfo> {
    return getBackend().Login(username, password)
  },
  async ensureGuestSession(): Promise<SessionInfo> {
    return getBackend().EnsureGuestSession()
  },
  async logout(): Promise<SessionInfo> {
    return getBackend().Logout()
  },
  async updateRatings(mask: string): Promise<SessionInfo> {
    return getBackend().UpdateRatings(mask)
  },
  async openDownloadDirectory(): Promise<void> {
    return getBackend().OpenDownloadDirectory()
  },
  async openExternalURL(url: string): Promise<void> {
    return getBackend().OpenExternalURL(url)
  },
  async proxyAvatarImageURL(url: string): Promise<string> {
    return getBackend().ProxyAvatarImageURL(url)
  },
  async search(params: SearchParams): Promise<SearchResponse> {
    return normalizeSearchResponse(await getBackend().Search(params))
  },
  async cancelSearchRequests(): Promise<void> {
    return getBackend().CancelSearchRequests()
  },
  async getUnreadSubmissionCount(): Promise<number> {
    return getBackend().GetUnreadSubmissionCount()
  },
  async refreshSearch(searchId: string): Promise<SearchResponse> {
    return normalizeSearchResponse(await getBackend().RefreshSearch(searchId))
  },
  async loadMoreResults(
    searchId: string,
    page: number,
  ): Promise<SearchResponse> {
    return normalizeSearchResponse(await getBackend().LoadMoreResults(searchId, page))
  },
  async getKeywordSuggestions(query: string): Promise<KeywordSuggestion[]> {
    return getBackend().GetKeywordSuggestions(query)
  },
  async getUsernameSuggestions(query: string): Promise<UsernameSuggestion[]> {
    return getBackend().GetUsernameSuggestions(query)
  },
  async getWatching(): Promise<UsernameSuggestion[]> {
    return getBackend().GetWatching()
  },
  async getReleaseStatus(): Promise<ReleaseStatus> {
    return getBackend().GetReleaseStatus()
  },
  async getBuildInfo(): Promise<BuildInfo> {
    return getBackend().GetBuildInfo()
  },
  async getRemoteAccessInfo(): Promise<RemoteAccessInfo> {
    return getBackend().GetRemoteAccessInfo()
  },
  async enableRemoteAccess(): Promise<RemoteAccessInfo> {
    return getBackend().EnableRemoteAccess()
  },
  async disableRemoteAccess(): Promise<RemoteAccessInfo> {
    return getBackend().DisableRemoteAccess()
  },
  async selectRemoteAccessHost(host: string): Promise<RemoteAccessInfo> {
    return getBackend().SelectRemoteAccessHost(host)
  },
  async enqueueDownloads(
    searchId: string,
    selection: DownloadSelection,
    options: DownloadOptions,
  ): Promise<QueueSnapshot> {
    return getBackend().EnqueueDownloads(searchId, selection, options)
  },
  async getQueueSnapshot(): Promise<QueueSnapshot> {
    return getBackend().GetQueueSnapshot()
  },
  async getWorkspaceState(): Promise<WorkspaceState> {
    return getBackend().GetWorkspaceState()
  },
  async saveWorkspaceState(state: WorkspaceState): Promise<void> {
    return getBackend().SaveWorkspaceState(state)
  },
  async cancelDownload(jobId: string): Promise<QueueSnapshot> {
    return getBackend().CancelDownload(jobId)
  },
  async cancelSubmission(submissionId: string): Promise<QueueSnapshot> {
    return getBackend().CancelSubmission(submissionId)
  },
  async retryDownload(jobId: string): Promise<QueueSnapshot> {
    return getBackend().RetryDownload(jobId)
  },
  async retrySubmission(submissionId: string): Promise<QueueSnapshot> {
    return getBackend().RetrySubmission(submissionId)
  },
  async retryAllDownloads(): Promise<QueueSnapshot> {
    return getBackend().RetryAllDownloads()
  },
  async pauseAllDownloads(): Promise<QueueSnapshot> {
    return getBackend().PauseAllDownloads()
  },
  async resumeAllDownloads(): Promise<QueueSnapshot> {
    return getBackend().ResumeAllDownloads()
  },
  async stopAllDownloads(): Promise<QueueSnapshot> {
    return getBackend().StopAllDownloads()
  },
  async clearQueue(): Promise<QueueSnapshot> {
    return getBackend().ClearQueue()
  },
  async clearCompletedDownloads(): Promise<QueueSnapshot> {
    return getBackend().ClearCompletedDownloads()
  },
  async clearCompletedSubmissions(submissionIds: string[]): Promise<QueueSnapshot> {
    return getBackend().ClearCompletedSubmissions(submissionIds)
  },
  async pickDownloadDirectory(): Promise<string> {
    return getBackend().PickDownloadDirectory()
  },
  async skipReleaseTag(tag: string): Promise<AppSettings> {
    return getBackend().SkipReleaseTag(tag)
  },
  async updateSettings(settings: AppSettings): Promise<AppSettings> {
    return getBackend().UpdateSettings(settings)
  },
  async debugResetState(scope: DebugResetScope): Promise<DebugResetResult> {
    return getBackend().DebugResetState(scope)
  },
}

export function subscribeBackendEvent<E extends BackendEventName>(
  eventName: E,
  callback: Listener<E>,
): () => void {
  if (isDesktopRuntimeAvailable()) {
    return subscribeDesktopEvent(eventName, callback)
  }
  return browserEvents.subscribe(eventName, callback)
}

export function resolveMediaURL(url?: string): string | undefined {
  if (!url) {
    return url
  }
  return isDesktopRuntimeAvailable() ? url : buildRemoteResourceURL(url)
}

export function resolveMediaSrcSet(srcSet?: string): string | undefined {
  if (!srcSet || isDesktopRuntimeAvailable()) {
    return srcSet
  }

  return srcSet
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const [url, ...descriptor] = entry.split(/\s+/)
      const resolved = resolveMediaURL(url)
      return [resolved, ...descriptor].filter(Boolean).join(' ')
    })
    .join(', ')
}

export function resolveExternalLinkURL(url?: string): string | undefined {
  if (!url) {
    return url
  }
  return isDesktopRuntimeAvailable() ? url : buildRemoteOpenURL(url)
}
