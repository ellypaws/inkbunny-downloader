package desktopapp

type SessionInfo struct {
	HasSession     bool        `json:"hasSession"`
	Username       string      `json:"username"`
	IsGuest        bool        `json:"isGuest"`
	AvatarURL      string      `json:"avatarUrl"`
	RatingsMask    string      `json:"ratingsMask"`
	Settings       AppSettings `json:"settings"`
	LastSearchID   string      `json:"lastSearchId,omitempty"`
	EffectiveTheme string      `json:"effectiveTheme,omitempty"`
}

type UsernameSuggestion struct {
	UserID    string `json:"userId"`
	Value     string `json:"value"`
	Username  string `json:"username"`
	AvatarURL string `json:"avatarUrl"`
}

type AppSettings struct {
	DownloadDirectory  string `json:"downloadDirectory"`
	DownloadPattern    string `json:"downloadPattern"`
	MaxActive          int    `json:"maxActive"`
	DarkMode           bool   `json:"darkMode"`
	MotionEnabled      bool   `json:"motionEnabled"`
	AutoClearCompleted bool   `json:"autoClearCompleted"`
	SkippedReleaseTag  string `json:"skippedReleaseTag"`
	HasLoggedInBefore  bool   `json:"hasLoggedInBefore"`
}

type SearchParams struct {
	Query               string   `json:"query"`
	JoinType            string   `json:"joinType"`
	SearchInKeywords    bool     `json:"searchInKeywords"`
	SearchInTitle       bool     `json:"searchInTitle"`
	SearchInDescription bool     `json:"searchInDescription"`
	SearchInMD5         bool     `json:"searchInMD5"`
	UnreadSubmissions   bool     `json:"unreadSubmissions"`
	ArtistNames         []string `json:"artistNames"`
	UseWatchingArtists  bool     `json:"useWatchingArtists"`
	FavoritesBy         string   `json:"favoritesBy"`
	PoolID              int      `json:"poolId"`
	Scraps              string   `json:"scraps"`
	TimeRangeDays       int      `json:"timeRangeDays"`
	SubmissionTypes     []int    `json:"submissionTypes"`
	OrderBy             string   `json:"orderBy"`
	Page                int      `json:"page"`
	PerPage             int      `json:"perPage"`
	MaxDownloads        int      `json:"maxDownloads"`
	MaxActive           int      `json:"maxActive"`
	SaveKeywords        bool     `json:"saveKeywords"`
}

type SearchResponse struct {
	SearchID     string           `json:"searchId"`
	Page         int              `json:"page"`
	PagesCount   int              `json:"pagesCount"`
	ResultsCount int              `json:"resultsCount"`
	Results      []SubmissionCard `json:"results"`
	Session      SessionInfo      `json:"session"`
}

type SubmissionCard struct {
	SubmissionID       string   `json:"submissionId"`
	Title              string   `json:"title"`
	Username           string   `json:"username"`
	TypeName           string   `json:"typeName"`
	SubmissionTypeID   int      `json:"submissionTypeId"`
	RatingName         string   `json:"ratingName"`
	IsPublic           bool     `json:"isPublic"`
	PageCount          int      `json:"pageCount"`
	Updated            bool     `json:"updated"`
	FileName           string   `json:"fileName,omitempty"`
	MimeType           string   `json:"mimeType,omitempty"`
	LatestMimeType     string   `json:"latestMimeType,omitempty"`
	PreviewURL         string   `json:"previewUrl,omitempty"`
	LatestPreviewURL   string   `json:"latestPreviewUrl,omitempty"`
	ScreenURL          string   `json:"screenUrl,omitempty"`
	FullURL            string   `json:"fullUrl,omitempty"`
	ThumbnailURL       string   `json:"thumbnailUrl,omitempty"`
	LatestThumbnailURL string   `json:"latestThumbnailUrl,omitempty"`
	BadgeText          string   `json:"badgeText,omitempty"`
	Accent             string   `json:"accent,omitempty"`
	FileIDs            []string `json:"fileIds,omitempty"`
	Downloaded         bool     `json:"downloaded"`
}

type SelectedSubmission struct {
	SubmissionID string   `json:"submissionId"`
	FileIDs      []string `json:"fileIds,omitempty"`
}

type DownloadSelection struct {
	Submissions []SelectedSubmission `json:"submissions"`
}

type DownloadOptions struct {
	SaveKeywords      bool   `json:"saveKeywords"`
	MaxActive         int    `json:"maxActive"`
	DownloadDirectory string `json:"downloadDirectory"`
	DownloadPattern   string `json:"downloadPattern"`
}

type QueueSnapshot struct {
	Jobs           []DownloadJobSnapshot `json:"jobs"`
	QueuedCount    int                   `json:"queuedCount"`
	ActiveCount    int                   `json:"activeCount"`
	CompletedCount int                   `json:"completedCount"`
	FailedCount    int                   `json:"failedCount"`
	CancelledCount int                   `json:"cancelledCount"`
}

type DownloadJobSnapshot struct {
	ID           string  `json:"id"`
	SubmissionID string  `json:"submissionId"`
	FileID       string  `json:"fileId"`
	Title        string  `json:"title"`
	Username     string  `json:"username"`
	FileName     string  `json:"fileName"`
	PreviewURL   string  `json:"previewUrl,omitempty"`
	FileExists   bool    `json:"fileExists"`
	Status       string  `json:"status"`
	BytesWritten int64   `json:"bytesWritten"`
	TotalBytes   int64   `json:"totalBytes"`
	Progress     float64 `json:"progress"`
	Error        string  `json:"error,omitempty"`
	Attempt      int     `json:"attempt"`
	CreatedAt    string  `json:"createdAt"`
	UpdatedAt    string  `json:"updatedAt"`
}

type DownloadProgressEvent struct {
	Job   DownloadJobSnapshot `json:"job"`
	Queue QueueSnapshot       `json:"queue"`
}

type AppNotification struct {
	ID           string `json:"id"`
	Level        string `json:"level"`
	Message      string `json:"message"`
	Scope        string `json:"scope"`
	DedupeKey    string `json:"dedupeKey,omitempty"`
	RetryAfterMS int64  `json:"retryAfterMs,omitempty"`
}

type BackendDebugEvent struct {
	Timestamp string         `json:"timestamp"`
	Level     string         `json:"level"`
	Scope     string         `json:"scope"`
	Message   string         `json:"message"`
	Fields    map[string]any `json:"fields,omitempty"`
}

type ReleaseStatus struct {
	CurrentVersion  string `json:"currentVersion"`
	CurrentTag      string `json:"currentTag"`
	LatestTag       string `json:"latestTag,omitempty"`
	ReleaseURL      string `json:"releaseURL,omitempty"`
	UpdateAvailable bool   `json:"updateAvailable"`
}

type storedState struct {
	Session  SessionInfo `json:"session"`
	User     sessionUser `json:"user"`
	Settings AppSettings `json:"settings"`
}

type sessionUser struct {
	SID      string `json:"sid"`
	Username string `json:"username"`
	Ratings  string `json:"ratings"`
}
