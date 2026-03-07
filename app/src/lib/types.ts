export type AppSettings = {
  downloadDirectory: string
  maxActive: number
  darkMode: boolean
  motionEnabled: boolean
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

export type UsernameSuggestion = {
  userId: string
  value: string
  username: string
  avatarUrl: string
}

export type SearchParams = {
  query: string
  joinType: string
  searchInKeywords: boolean
  searchInTitle: boolean
  searchInDescription: boolean
  searchInMD5: boolean
  artistName: string
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
  title: string
  username: string
  typeName: string
  ratingName: string
  isPublic: boolean
  pageCount: number
  updated: boolean
  fileName?: string
  previewUrl?: string
  screenUrl?: string
  fullUrl?: string
  thumbnailUrl?: string
  badgeText?: string
  accent?: string
  fileIds?: string[]
}

export type SearchResponse = {
  searchId: string
  page: number
  pagesCount: number
  resultsCount: number
  results: SubmissionCard[]
  session: SessionInfo
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
