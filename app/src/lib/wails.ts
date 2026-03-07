import type {
  AppSettings,
  DownloadOptions,
  DownloadSelection,
  QueueSnapshot,
  SearchParams,
  SearchResponse,
  SessionInfo,
  UsernameSuggestion,
} from './types'

type BackendApi = {
  GetSession(): Promise<SessionInfo>
  Login(username: string, password: string): Promise<SessionInfo>
  EnsureGuestSession(): Promise<SessionInfo>
  Logout(): Promise<SessionInfo>
  UpdateRatings(mask: string): Promise<SessionInfo>
  OpenDownloadDirectory(): Promise<void>
  Search(params: SearchParams): Promise<SearchResponse>
  LoadMoreResults(searchId: string, page: number): Promise<SearchResponse>
  GetKeywordSuggestions(query: string): Promise<string[]>
  GetUsernameSuggestions(query: string): Promise<UsernameSuggestion[]>
  EnqueueDownloads(
    searchId: string,
    selection: DownloadSelection,
    options: DownloadOptions,
  ): Promise<QueueSnapshot>
  GetQueueSnapshot(): Promise<QueueSnapshot>
  CancelDownload(jobId: string): Promise<QueueSnapshot>
  ClearQueue(): Promise<QueueSnapshot>
  PickDownloadDirectory(): Promise<string>
  UpdateSettings(settings: AppSettings): Promise<AppSettings>
}

declare global {
  interface Window {
    go?: {
      main?: {
        App?: BackendApi
      }
      desktopapp?: {
        App?: BackendApi
      }
    }
    runtime?: {
      EventsOn?: (
        eventName: string,
        callback: (payload: unknown) => void,
      ) => () => void
      EventsOff?: (eventName?: string) => void
    }
  }
}

function getBackend(): BackendApi {
  const backend = window.go?.main?.App ?? window.go?.desktopapp?.App
  if (!backend) {
    throw new Error('Wails backend unavailable')
  }
  return backend
}

export const backend = {
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
  async search(params: SearchParams): Promise<SearchResponse> {
    return getBackend().Search(params)
  },
  async loadMoreResults(
    searchId: string,
    page: number,
  ): Promise<SearchResponse> {
    return getBackend().LoadMoreResults(searchId, page)
  },
  async getKeywordSuggestions(query: string): Promise<string[]> {
    return getBackend().GetKeywordSuggestions(query)
  },
  async getUsernameSuggestions(query: string): Promise<UsernameSuggestion[]> {
    return getBackend().GetUsernameSuggestions(query)
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
  async cancelDownload(jobId: string): Promise<QueueSnapshot> {
    return getBackend().CancelDownload(jobId)
  },
  async clearQueue(): Promise<QueueSnapshot> {
    return getBackend().ClearQueue()
  },
  async pickDownloadDirectory(): Promise<string> {
    return getBackend().PickDownloadDirectory()
  },
  async updateSettings(settings: AppSettings): Promise<AppSettings> {
    return getBackend().UpdateSettings(settings)
  },
}

export function onRuntimeEvent<T>(
  eventName: string,
  callback: (payload: T) => void,
): () => void {
  if (window.runtime?.EventsOn) {
    return window.runtime.EventsOn(eventName, (payload) =>
      callback(payload as T),
    )
  }
  return () => undefined
}
