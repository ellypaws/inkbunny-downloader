export type AppSettings = {
  downloadDirectory: string
  downloadPattern: string
  maxActive: number
  darkMode: boolean
  motionEnabled: boolean
  autoClearCompleted: boolean
  skippedReleaseTag: string
  hasLoggedInBefore: boolean
}

export type SessionInfo = {
  hasSession: boolean
  username: string
  isGuest: boolean
  avatarUrl: string
  ratingsMask: string
  settings: AppSettings
  lastSearchId?: string
  effectiveTheme?: string
}

export type SearchTabMode = 'default' | 'unread'

export type UsernameSuggestion = {
  userId: string
  value: string
  username: string
  avatarUrl: string
}

export type ArtistValidationState = 'pending' | 'valid' | 'invalid'

export type SearchParams = {
  query: string
  joinType: string
  searchInKeywords: boolean
  searchInTitle: boolean
  searchInDescription: boolean
  searchInMD5: boolean
  unreadSubmissions: boolean
  artistNames: string[]
  useWatchingArtists: boolean
  favoritesBy: string
  poolId: number
  scraps: string
  timeRangeDays: number
  submissionTypes: number[]
  orderBy: string
  page: number
  perPage: number
  maxDownloads: number
  maxActive: number
  saveKeywords: boolean
}

export type SubmissionCard = {
  submissionId: string
  submissionUrl?: string
  title: string
  description?: string
  descriptionHtml?: string
  username: string
  userUrl?: string
  typeName: string
  submissionTypeId: number
  ratingName: string
  isPublic: boolean
  pageCount: number
  updated: boolean
  fileName?: string
  mimeType?: string
  latestMimeType?: string
  previewUrl?: string
  latestPreviewUrl?: string
  screenUrl?: string
  fullUrl?: string
  thumbnailUrl?: string
  latestThumbnailUrl?: string
  thumbnailUrlMedium?: string
  thumbnailUrlLarge?: string
  thumbnailUrlHuge?: string
  thumbnailUrlMediumNonCustom?: string
  thumbnailUrlLargeNonCustom?: string
  thumbnailUrlHugeNonCustom?: string
  thumbMediumX?: number
  thumbLargeX?: number
  thumbHugeX?: number
  thumbMediumNonCustomX?: number
  thumbLargeNonCustomX?: number
  thumbHugeNonCustomX?: number
  userIconUrlSmall?: string
  userIconUrlMedium?: string
  userIconUrlLarge?: string
  favorite: boolean
  favoritesCount: number
  viewsCount: number
  badgeText?: string
  accent?: string
  mediaFiles?: SubmissionMediaFile[]
  fileIds?: string[]
  downloaded: boolean
}

export type SubmissionMediaFile = {
  fileId?: string
  fileName?: string
  mimeType?: string
  order: number
  previewUrl?: string
  screenUrl?: string
  fullUrl?: string
  thumbnailUrl?: string
  thumbnailUrlMedium?: string
  thumbnailUrlLarge?: string
  thumbnailUrlHuge?: string
  thumbnailUrlMediumNonCustom?: string
  thumbnailUrlLargeNonCustom?: string
  thumbnailUrlHugeNonCustom?: string
  thumbMediumX?: number
  thumbLargeX?: number
  thumbHugeX?: number
  thumbMediumNonCustomX?: number
  thumbLargeNonCustomX?: number
  thumbHugeNonCustomX?: number
}

export type SearchResponse = {
  searchId: string
  page: number
  pagesCount: number
  resultsCount: number
  results: SubmissionCard[]
  session: SessionInfo
}

export type SavedSearchTab = {
  id: string
  mode: SearchTabMode
  searchParams: SearchParams
  artistDraft: string
  artistAvatars: Record<string, string>
  artistValidation: Record<string, ArtistValidationState>
  searchResponse: SearchResponse | null
  results: SubmissionCard[]
  activeSubmissionId: string
  selectedSubmissionIds: string[]
  searchCollapsed: boolean
  showCustomThumbnails: boolean
  autoQueueEnabled: boolean
  trackedDownloadSubmissionIds: string[]
  autoQueueNextRunAt: number
}

export type WorkspaceState = {
  activeTabId: string
  tabs: SavedSearchTab[]
}

export type SelectedSubmission = {
  submissionId: string
  fileIds?: string[]
}

export type DownloadSelection = {
  submissions: SelectedSubmission[]
}

export type DownloadOptions = {
  saveKeywords: boolean
  maxActive: number
  downloadDirectory: string
  downloadPattern: string
}

export type DownloadJobSnapshot = {
  id: string
  submissionId: string
  fileId: string
  title: string
  username: string
  fileName: string
  previewUrl?: string
  fileExists: boolean
  status: string
  bytesWritten: number
  totalBytes: number
  progress: number
  error?: string
  attempt: number
  createdAt: string
  updatedAt: string
}

export type QueueSnapshot = {
  jobs: DownloadJobSnapshot[]
  paused: boolean
  queuedCount: number
  activeCount: number
  completedCount: number
  failedCount: number
  cancelledCount: number
}

export type DownloadProgressEvent = {
  job: DownloadJobSnapshot
  queue: QueueSnapshot
}

export type AppNotification = {
  id: string
  level: 'info' | 'success' | 'warning' | 'error'
  message: string
  scope: string
  dedupeKey?: string
  retryAfterMs?: number
}

export type BackendDebugEvent = {
  timestamp: string
  level: 'debug' | 'info' | 'warn' | 'error'
  scope: string
  message: string
  fields?: Record<string, unknown>
}

export type ReleaseStatus = {
  currentVersion: string
  currentTag: string
  latestTag: string
  releaseURL: string
  updateAvailable: boolean
}

export type BuildInfo = {
  version: string
  commit?: string
  displayVersion: string
  isDev: boolean
}
