export const DEFAULT_DOWNLOAD_PATTERN = "inkbunny/{artist}/{file_name_full}"

export type DownloadPatternToken = {
  name: string
  label: string
  description: string
  example: string
}

export type DownloadPatternSegment =
  | { kind: "text"; value: string }
  | { kind: "token"; value: string; token: DownloadPatternToken }
  | { kind: "invalid"; value: string; name: string }

const TOKEN_MAP = new Map<string, DownloadPatternToken>()

export const DOWNLOAD_PATTERN_TOKENS: DownloadPatternToken[] = [
  {
    name: "artist",
    label: "Artist",
    description: "Submission artist username.",
    example: "elly",
  },
  {
    name: "artist_id",
    label: "Artist ID",
    description: "Numeric artist account ID.",
    example: "12345",
  },
  {
    name: "title",
    label: "Title",
    description: "Submission title.",
    example: "Star Patrol",
  },
  {
    name: "rating",
    label: "Rating",
    description: "Coarse rating bucket, prioritized as adult, mature, then general.",
    example: "adult",
  },
  {
    name: "public",
    label: "Visibility",
    description: "Submission visibility as public or private.",
    example: "public",
  },
  {
    name: "submission_type",
    label: "Type",
    description: "Sanitized one-word submission type such as picture, series, video, or music.",
    example: "series",
  },
  {
    name: "year",
    label: "Year",
    description: "Submission year from the upload timestamp.",
    example: "2026",
  },
  {
    name: "month",
    label: "Month",
    description: "Submission month using two digits.",
    example: "03",
  },
  {
    name: "day",
    label: "Day",
    description: "Submission day using two digits.",
    example: "09",
  },
  {
    name: "hour",
    label: "Hour",
    description: "Submission hour using 24-hour time.",
    example: "16",
  },
  {
    name: "minute",
    label: "Minute",
    description: "Submission minute using two digits.",
    example: "27",
  },
  {
    name: "file_name_full",
    label: "Full filename",
    description: "Original file name including its extension.",
    example: "27491_elly_star-patrol.png",
  },
  {
    name: "file_name",
    label: "Filename stem",
    description: "Original file name without the extension.",
    example: "27491_elly_star-patrol",
  },
  {
    name: "file_name_ext",
    label: "Filename stem",
    description: "Alias for the file name without the extension.",
    example: "27491_elly_star-patrol",
  },
  {
    name: "file_id",
    label: "File ID",
    description: "Numeric file ID.",
    example: "27491",
  },
  {
    name: "number",
    label: "File number",
    description: "1-based file order inside the submission.",
    example: "3",
  },
  {
    name: "ext",
    label: "Ext",
    description: "File extension without the dot.",
    example: "png",
  },
  {
    name: "extension",
    label: "Extension",
    description: "Alias for the extension without the dot.",
    example: "png",
  },
  {
    name: "submission_id",
    label: "Submission ID",
    description: "Numeric submission ID.",
    example: "908172",
  },
  {
    name: "pool_id",
    label: "Pool ID",
    description:
      "Pool ID. Using pool tokens duplicates files into one folder per pool, and the folder segment is omitted when a submission has no pools.",
    example: "7001",
  },
  {
    name: "pool_name",
    label: "Pool name",
    description:
      "Pool name. Using pool tokens duplicates files into one folder per pool, and the folder segment is omitted when a submission has no pools.",
    example: "season-one",
  },
]

for (const token of DOWNLOAD_PATTERN_TOKENS) {
  TOKEN_MAP.set(token.name, token)
}

const TOKEN_RE = /\{([a-z0-9_]+)\}/g
const PREVIEW_POOLS = [
  { pool_id: "7001", pool_name: "season-one" },
  { pool_id: "7002", pool_name: "favorites" },
]

const PREVIEW_VALUES: Record<string, string> = {
  artist: "elly",
  artist_id: "12345",
  title: "Star Patrol",
  rating: "adult",
  public: "public",
  submission_type: "series",
  year: "2026",
  month: "03",
  day: "09",
  hour: "16",
  minute: "27",
  file_name_full: "27491_elly_star-patrol.png",
  file_name: "27491_elly_star-patrol",
  file_name_ext: "27491_elly_star-patrol",
  file_id: "27491",
  number: "3",
  ext: "png",
  extension: "png",
  submission_id: "908172",
}

export function tokenizeDownloadPattern(value: string): DownloadPatternSegment[] {
  const segments: DownloadPatternSegment[] = []
  let lastIndex = 0

  value.replaceAll(TOKEN_RE, (match, name: string, offset: number) => {
    if (offset > lastIndex) {
      segments.push({ kind: "text", value: value.slice(lastIndex, offset) })
    }

    const token = TOKEN_MAP.get(name)
    if (token) {
      segments.push({ kind: "token", value: match, token })
    } else {
      segments.push({ kind: "invalid", value: match, name })
    }

    lastIndex = offset + match.length
    return match
  })

  if (lastIndex < value.length) {
    segments.push({ kind: "text", value: value.slice(lastIndex) })
  }

  return segments
}

export function collectUnknownDownloadTokens(value: string): string[] {
  const unknown = new Set<string>()

  value.replaceAll(TOKEN_RE, (match, name: string) => {
    if (!TOKEN_MAP.has(name)) {
      unknown.add(match)
    }
    return match
  })

  return [...unknown]
}

export function renderDownloadPatternPreview(pattern: string): string[] {
  const activePattern = pattern.trim() || DEFAULT_DOWNLOAD_PATTERN
  const normalized = activePattern.replaceAll("\\", "/")
  const usesPoolTokens = normalized.includes("{pool_id}") || normalized.includes("{pool_name}")
  const contexts = usesPoolTokens ? PREVIEW_POOLS : [{}]

  return contexts.map((poolValues) => {
    const poolRecord = poolValues as Record<string, string>
    const rendered = normalized.replaceAll(TOKEN_RE, (match, name: string) => {
      if (name in poolRecord) {
        return poolRecord[name] ?? ""
      }
      return PREVIEW_VALUES[name] ?? match
    })
    return normalizePreviewPath(rendered)
  })
}

function normalizePreviewPath(value: string): string {
  const segments = value
    .split(/[\\/]/)
    .map((segment) => sanitizePathComponent(segment))
    .filter(Boolean)

  if (segments.length === 0) {
    return DEFAULT_DOWNLOAD_PATTERN
  }

  return segments.join("/")
}

function sanitizePathComponent(value: string): string {
  return value
    .trim()
    .replace(/[<>:"|?*\u0000-\u001f]/g, "")
    .replace(/[\\/]/g, "_")
    .replace(/[. ]+$/g, "")
}
