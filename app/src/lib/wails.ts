import type {
  AppSettings,
  DownloadOptions,
  DownloadSelection,
  QueueSnapshot,
  ReleaseStatus,
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
  OpenExternalURL(url: string): Promise<void>
  Search(params: SearchParams): Promise<SearchResponse>
  RefreshSearch(searchId: string): Promise<SearchResponse>
  LoadMoreResults(searchId: string, page: number): Promise<SearchResponse>
  GetKeywordSuggestions(query: string): Promise<string[]>
  GetUsernameSuggestions(query: string): Promise<UsernameSuggestion[]>
  GetReleaseStatus(): Promise<ReleaseStatus>
  EnqueueDownloads(
    searchId: string,
    selection: DownloadSelection,
    options: DownloadOptions,
  ): Promise<QueueSnapshot>
  GetQueueSnapshot(): Promise<QueueSnapshot>
  CancelDownload(jobId: string): Promise<QueueSnapshot>
  CancelSubmission(submissionId: string): Promise<QueueSnapshot>
  ClearQueue(): Promise<QueueSnapshot>
  ClearCompletedDownloads(): Promise<QueueSnapshot>
  PickDownloadDirectory(): Promise<string>
  SkipReleaseTag(tag: string): Promise<AppSettings>
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
  async openExternalURL(url: string): Promise<void> {
    return getBackend().OpenExternalURL(url)
  },
  async search(params: SearchParams): Promise<SearchResponse> {
    return getBackend().Search(params)
  },
  async refreshSearch(searchId: string): Promise<SearchResponse> {
    return getBackend().RefreshSearch(searchId)
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
  async getReleaseStatus(): Promise<ReleaseStatus> {
    return getBackend().GetReleaseStatus()
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
  async cancelSubmission(submissionId: string): Promise<QueueSnapshot> {
    return getBackend().CancelSubmission(submissionId)
  },
  async clearQueue(): Promise<QueueSnapshot> {
    return getBackend().ClearQueue()
  },
  async clearCompletedDownloads(): Promise<QueueSnapshot> {
    return getBackend().ClearCompletedDownloads()
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
