import type { QueueSnapshot, SearchParams, SessionInfo } from './types'
import { DEFAULT_DOWNLOAD_PATTERN } from './downloadPattern'

export const DEFAULT_AVATAR_URL = 'https://inkbunny.net/images80/usericons/large/noicon.png'
export const MIN_CONCURRENT_DOWNLOADS = 1
export const MAX_CONCURRENT_DOWNLOADS = 16
export const DEFAULT_ORDER_BY = 'create_datetime'
export const UNREAD_DEFAULT_ORDER_BY = 'unread_datetime'
export const UNREAD_OLDEST_ORDER_BY = 'unread_datetime_reverse'
export const FAVORITES_ORDER_VALUES = new Set(['fav_datetime', 'fav_stars'])
export const UNREAD_ONLY_ORDER_VALUES = new Set([
  UNREAD_DEFAULT_ORDER_BY,
  UNREAD_OLDEST_ORDER_BY,
])

export function isFavoritesOnlyOrderValue(orderBy: string) {
  return FAVORITES_ORDER_VALUES.has(orderBy.trim())
}

export function normalizeOrderByValue(
  orderBy: string,
  favoritesBy: string,
  unreadMode: boolean,
) {
  const defaultOrderBy = unreadMode ? UNREAD_DEFAULT_ORDER_BY : DEFAULT_ORDER_BY
  let normalizedOrderBy = orderBy.trim() || defaultOrderBy
  if (unreadMode && normalizedOrderBy === DEFAULT_ORDER_BY) {
    normalizedOrderBy = UNREAD_DEFAULT_ORDER_BY
  }
  if (!unreadMode && UNREAD_ONLY_ORDER_VALUES.has(normalizedOrderBy)) {
    normalizedOrderBy = DEFAULT_ORDER_BY
  }
  if (!favoritesBy.trim() && isFavoritesOnlyOrderValue(normalizedOrderBy)) {
    return defaultOrderBy
  }
  return normalizedOrderBy
}

export const TIME_OPTIONS = [
  { label: 'Any Time', value: 0 },
  { label: '24 Hours', value: 1 },
  { label: '3 Days', value: 3 },
  { label: '1 Week', value: 7 },
  { label: '2 Weeks', value: 14 },
  { label: '1 Month', value: 30 },
  { label: '3 Months', value: 90 },
  { label: '6 Months', value: 180 },
  { label: '1 Year', value: 365 },
]

export const ORDER_OPTIONS = [
  { label: 'Newest First', value: 'create_datetime' },
  { label: 'Oldest First', value: UNREAD_OLDEST_ORDER_BY },
  { label: 'Most Popular by Favs', value: 'favs' },
  { label: 'Most Popular by Views', value: 'views' },
  { label: 'Sort by Faved Date', value: 'fav_datetime' },
  { label: 'Sort by Stars', value: 'fav_stars' },
  { label: 'Sort by Artist', value: 'username' },
]

export const SCRAPS_OPTIONS = [
  { label: 'Include scraps', value: 'both' },
  { label: 'Exclude scraps', value: 'no' },
  { label: 'Scraps only', value: 'only' },
]

export const FIND_OPTIONS = [
  { label: 'Find all of the words together', value: 'and' },
  { label: 'Find any one of the words', value: 'or' },
  { label: 'Contains the exact phrase', value: 'exact' },
]

export const TYPE_OPTIONS = [
  { label: 'Picture/Pinup', value: 1 },
  { label: 'Sketch', value: 2 },
  { label: 'Picture Series', value: 3 },
  { label: 'Comic', value: 4 },
  { label: 'Portfolio', value: 5 },
  { label: 'Shockwave/Flash - Animation', value: 6 },
  { label: 'Shockwave/Flash - Interactive', value: 7 },
  { label: 'Video - Animation/3D/CGI', value: 9 },
  { label: 'Music - Single Track', value: 10 },
  { label: 'Music - Album', value: 11 },
  { label: 'Video - Feature Length', value: 8 },
  { label: 'Writing - Document', value: 12 },
  { label: 'Character Sheet', value: 13 },
  { label: 'Photography - Fursuit/Sculpture/Jewelry/etc', value: 14 },
]

export const RATING_OPTIONS = [
  { label: 'General', index: 0 },
  { label: 'Mature - Nudity', index: 1 },
  { label: 'Mature - Violence', index: 2 },
  { label: 'Adult - Sexual Themes', index: 3 },
  { label: 'Adult - Strong Violence', index: 4 },
]

export const DEFAULT_SEARCH: SearchParams = {
  query: '',
  keywordId: '',
  joinType: 'and',
  searchInKeywords: true,
  searchInTitle: true,
  searchInDescription: false,
  searchInMD5: false,
  unreadSubmissions: false,
  artistNames: [],
  useWatchingArtists: false,
  favoritesBy: '',
  poolId: 0,
  scraps: 'both',
  timeRangeDays: 0,
  submissionTypes: [],
  orderBy: DEFAULT_ORDER_BY,
  randomize: false,
  page: 1,
  perPage: 30,
  maxDownloads: 0,
  maxActive: 4,
  saveKeywords: false,
}

export const EMPTY_SESSION: SessionInfo = {
  hasSession: false,
  username: '',
  isGuest: false,
  avatarUrl: DEFAULT_AVATAR_URL,
  ratingsMask: '',
  settings: {
    downloadDirectory: '',
    downloadPattern: DEFAULT_DOWNLOAD_PATTERN,
    maxActive: 4,
    darkMode: false,
    motionEnabled: true,
    autoClearCompleted: false,
    skippedReleaseTag: '',
    hasLoggedInBefore: false,
  },
}

export const EMPTY_QUEUE: QueueSnapshot = {
  jobs: [],
  paused: false,
  queuedCount: 0,
  activeCount: 0,
  completedCount: 0,
  failedCount: 0,
  cancelledCount: 0,
}
