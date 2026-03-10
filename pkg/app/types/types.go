package types

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

type KeywordSuggestion struct {
	Value            string `json:"value"`
	SubmissionsCount int    `json:"submissionsCount"`
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

type SavedSearchTab struct {
	ID                           string            `json:"id"`
	Mode                         string            `json:"mode"`
	SearchParams                 SearchParams      `json:"searchParams"`
	ArtistDraft                  string            `json:"artistDraft"`
	ArtistAvatars                map[string]string `json:"artistAvatars"`
	ArtistValidation             map[string]string `json:"artistValidation,omitempty"`
	SearchResponse               *SearchResponse   `json:"searchResponse,omitempty"`
	Results                      []SubmissionCard  `json:"results"`
	ActiveSubmissionID           string            `json:"activeSubmissionId"`
	SelectedSubmissionIDs        []string          `json:"selectedSubmissionIds"`
	SearchCollapsed              bool              `json:"searchCollapsed"`
	ShowCustomThumbnails         bool              `json:"showCustomThumbnails"`
	AutoQueueEnabled             bool              `json:"autoQueueEnabled"`
	TrackedDownloadSubmissionIDs []string          `json:"trackedDownloadSubmissionIds"`
	AutoQueueNextRunAt           int64             `json:"autoQueueNextRunAt"`
}

type WorkspaceState struct {
	ActiveTabID string           `json:"activeTabId"`
	Tabs        []SavedSearchTab `json:"tabs"`
}

type SubmissionCard struct {
	SubmissionID                string                `json:"submissionId"`
	SubmissionURL               string                `json:"submissionUrl,omitempty"`
	Title                       string                `json:"title"`
	Description                 string                `json:"description,omitempty"`
	DescriptionHTML             string                `json:"descriptionHtml,omitempty"`
	Username                    string                `json:"username"`
	UserURL                     string                `json:"userUrl,omitempty"`
	TypeName                    string                `json:"typeName"`
	SubmissionTypeID            int                   `json:"submissionTypeId"`
	RatingName                  string                `json:"ratingName"`
	IsPublic                    bool                  `json:"isPublic"`
	PageCount                   int                   `json:"pageCount"`
	Updated                     bool                  `json:"updated"`
	FileName                    string                `json:"fileName,omitempty"`
	MimeType                    string                `json:"mimeType,omitempty"`
	LatestMimeType              string                `json:"latestMimeType,omitempty"`
	PreviewURL                  string                `json:"previewUrl,omitempty"`
	LatestPreviewURL            string                `json:"latestPreviewUrl,omitempty"`
	ScreenURL                   string                `json:"screenUrl,omitempty"`
	FullURL                     string                `json:"fullUrl,omitempty"`
	ThumbnailURL                string                `json:"thumbnailUrl,omitempty"`
	LatestThumbnailURL          string                `json:"latestThumbnailUrl,omitempty"`
	ThumbnailURLMedium          string                `json:"thumbnailUrlMedium,omitempty"`
	ThumbnailURLLarge           string                `json:"thumbnailUrlLarge,omitempty"`
	ThumbnailURLHuge            string                `json:"thumbnailUrlHuge,omitempty"`
	ThumbnailURLMediumNonCustom string                `json:"thumbnailUrlMediumNonCustom,omitempty"`
	ThumbnailURLLargeNonCustom  string                `json:"thumbnailUrlLargeNonCustom,omitempty"`
	ThumbnailURLHugeNonCustom   string                `json:"thumbnailUrlHugeNonCustom,omitempty"`
	ThumbMediumX                int                   `json:"thumbMediumX,omitempty"`
	ThumbLargeX                 int                   `json:"thumbLargeX,omitempty"`
	ThumbHugeX                  int                   `json:"thumbHugeX,omitempty"`
	ThumbMediumNonCustomX       int                   `json:"thumbMediumNonCustomX,omitempty"`
	ThumbLargeNonCustomX        int                   `json:"thumbLargeNonCustomX,omitempty"`
	ThumbHugeNonCustomX         int                   `json:"thumbHugeNonCustomX,omitempty"`
	UserIconURLSmall            string                `json:"userIconUrlSmall,omitempty"`
	UserIconURLMedium           string                `json:"userIconUrlMedium,omitempty"`
	UserIconURLLarge            string                `json:"userIconUrlLarge,omitempty"`
	Favorite                    bool                  `json:"favorite"`
	FavoritesCount              int                   `json:"favoritesCount"`
	ViewsCount                  int                   `json:"viewsCount"`
	BadgeText                   string                `json:"badgeText,omitempty"`
	Accent                      string                `json:"accent,omitempty"`
	MediaFiles                  []SubmissionMediaFile `json:"mediaFiles,omitempty"`
	FileIDs                     []string              `json:"fileIds,omitempty"`
	Downloaded                  bool                  `json:"downloaded"`
}

type SubmissionMediaFile struct {
	FileID                      string `json:"fileId,omitempty"`
	FileName                    string `json:"fileName,omitempty"`
	MimeType                    string `json:"mimeType,omitempty"`
	Order                       int    `json:"order"`
	PreviewURL                  string `json:"previewUrl,omitempty"`
	ScreenURL                   string `json:"screenUrl,omitempty"`
	FullURL                     string `json:"fullUrl,omitempty"`
	ThumbnailURL                string `json:"thumbnailUrl,omitempty"`
	ThumbnailURLMedium          string `json:"thumbnailUrlMedium,omitempty"`
	ThumbnailURLLarge           string `json:"thumbnailUrlLarge,omitempty"`
	ThumbnailURLHuge            string `json:"thumbnailUrlHuge,omitempty"`
	ThumbnailURLMediumNonCustom string `json:"thumbnailUrlMediumNonCustom,omitempty"`
	ThumbnailURLLargeNonCustom  string `json:"thumbnailUrlLargeNonCustom,omitempty"`
	ThumbnailURLHugeNonCustom   string `json:"thumbnailUrlHugeNonCustom,omitempty"`
	ThumbMediumX                int    `json:"thumbMediumX,omitempty"`
	ThumbLargeX                 int    `json:"thumbLargeX,omitempty"`
	ThumbHugeX                  int    `json:"thumbHugeX,omitempty"`
	ThumbMediumNonCustomX       int    `json:"thumbMediumNonCustomX,omitempty"`
	ThumbLargeNonCustomX        int    `json:"thumbLargeNonCustomX,omitempty"`
	ThumbHugeNonCustomX         int    `json:"thumbHugeNonCustomX,omitempty"`
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
	Paused         bool                  `json:"paused"`
	QueuedCount    int                   `json:"queuedCount"`
	ActiveCount    int                   `json:"activeCount"`
	CompletedCount int                   `json:"completedCount"`
	FailedCount    int                   `json:"failedCount"`
	CancelledCount int                   `json:"cancelledCount"`
}

func EmptyQueueSnapshot() QueueSnapshot {
	return QueueSnapshot{
		Jobs: []DownloadJobSnapshot{},
	}
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

type BuildInfo struct {
	Version        string `json:"version"`
	Commit         string `json:"commit,omitempty"`
	DisplayVersion string `json:"displayVersion"`
	IsDev          bool   `json:"isDev"`
}

type RemoteAccessInfo struct {
	Enabled        bool     `json:"enabled"`
	ListenAddress  string   `json:"listenAddress,omitempty"`
	PairingURL     string   `json:"pairingUrl,omitempty"`
	PairingToken   string   `json:"pairingToken,omitempty"`
	SelectedHost   string   `json:"selectedHost,omitempty"`
	AvailableHosts []string `json:"availableHosts,omitempty"`
	QRCodeDataURL  string   `json:"qrCodeDataUrl,omitempty"`
}

type SessionStateUpdate struct {
	Revision int64       `json:"revision"`
	Session  SessionInfo `json:"session"`
}

type SettingsStateUpdate struct {
	Revision int64       `json:"revision"`
	Settings AppSettings `json:"settings"`
}

type WorkspaceStateUpdate struct {
	Revision  int64          `json:"revision"`
	Workspace WorkspaceState `json:"workspace"`
}

type QueueStateUpdate struct {
	Revision int64         `json:"revision"`
	Queue    QueueSnapshot `json:"queue"`
}

type SearchResultsHydratedUpdate struct {
	SearchID string           `json:"searchId"`
	Results  []SubmissionCard `json:"results"`
}

type SharedSnapshot struct {
	BuildInfo         BuildInfo      `json:"buildInfo"`
	SessionRevision   int64          `json:"sessionRevision"`
	Session           SessionInfo    `json:"session"`
	SettingsRevision  int64          `json:"settingsRevision"`
	Settings          AppSettings    `json:"settings"`
	WorkspaceRevision int64          `json:"workspaceRevision"`
	Workspace         WorkspaceState `json:"workspace"`
	QueueRevision     int64          `json:"queueRevision"`
	Queue             QueueSnapshot  `json:"queue"`
}

type DebugResetResult struct {
	Scope         string         `json:"scope"`
	CachesCleared bool           `json:"cachesCleared"`
	Session       SessionInfo    `json:"session"`
	Settings      AppSettings    `json:"settings"`
	Workspace     WorkspaceState `json:"workspace"`
	Queue         QueueSnapshot  `json:"queue"`
}

type StoredState struct {
	Session   SessionInfo    `json:"session"`
	User      SessionUser    `json:"user"`
	Settings  AppSettings    `json:"settings"`
	Workspace WorkspaceState `json:"workspace"`
}

type SessionUser struct {
	SID      string `json:"sid"`
	Username string `json:"username"`
	Ratings  string `json:"ratings"`
}
