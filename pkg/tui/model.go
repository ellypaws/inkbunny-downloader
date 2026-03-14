package tui

import (
	"runtime"
	"strconv"
	"strings"

	tea "charm.land/bubbletea/v2"
	"github.com/charmbracelet/bubbles/textinput"
	zone "github.com/lrstanley/bubblezone"

	"github.com/ellypaws/inkbunny"
	apptypes "github.com/ellypaws/inkbunny/cmd/downloader/pkg/app/types"
	"github.com/ellypaws/inkbunny/cmd/downloader/pkg/flight"
)

type activeField int

const (
	FieldSearchWords activeField = iota
	FieldArtistName
	FieldFavBy
	FieldPoolID
	FieldMaxDownloads
	FieldMaxActive
	FieldDownloadDirectory
	FieldDownloadPattern
	FieldNone
)

var FocusableZones = []string{
	"btn_update_open", "btn_update_later", "btn_update_skip",
	"search_words", "btn_search_top",
	"rad_and", "rad_or", "rad_exact",
	"chk_keywords", "chk_title", "chk_desc", "chk_md5",
	"artist_name", "link_use_my_name_artist", "link_use_my_watches_artist",
	"fav_by", "link_use_my_name_fav",
	"cycle_time", "pool_id", "cycle_scraps",
	"chk_rate_gen", "chk_rate_nudity", "chk_rate_mildv", "chk_rate_sex", "chk_rate_strongv",
	"rad_type_any", "chk_type_pic", "chk_type_sketch", "chk_type_picseries", "chk_type_comic",
	"chk_type_port", "chk_type_swfanim", "chk_type_swfint", "chk_type_vidfeat", "chk_type_vidanim",
	"chk_type_musicsing", "chk_type_musicalb", "chk_type_writing", "chk_type_char", "chk_type_photo",
	"cycle_order", "max_dl", "max_active", "download_dir", "download_pattern", "chk_dl_caption",
	"btn_search_bottom", "btn_unread", "btn_logout",
}

type SuggestKeywordMsg struct {
	Suggestions []string
}

type SuggestUsernameMsg struct {
	Field       activeField
	Suggestions []string
}

type Model struct {
	ZoneManager     *zone.Manager
	User            *inkbunny.User
	Username        string
	ReleaseStatus   apptypes.ReleaseStatus
	PersistSettings func(apptypes.AppSettings) error
	SavedSettings   apptypes.AppSettings

	NeedsLogin            bool
	ShowUpdateNotice      bool
	UpdateNoticeDismissed bool
	SkippedReleaseTag     string

	Width        int
	Height       int
	ScrollOffset int
	contentLines int

	SearchWords  textinput.Model
	ArtistName   textinput.Model
	FavBy        textinput.Model
	PoolID       textinput.Model
	MaxDownloads textinput.Model
	MaxActive    textinput.Model
	DownloadDir  textinput.Model
	DownloadPath textinput.Model

	ActiveField activeField
	HoveredZone string
	FocusIndex  int

	KeywordCache  *flight.Cache[string, []inkbunny.KeywordAutocomplete]
	UsernameCache *flight.Cache[string, []inkbunny.Autocomplete]

	Suggestions     []string
	SuggestionField activeField
	SuggestionIndex int
	lastQuery       string

	// Options
	StringJoinType inkbunny.JoinType

	SearchInKeywords bool
	SearchInTitle    bool
	SearchInDesc     bool
	SearchInMD5      bool

	TimeRangeIndex  int
	TimeRangeLabels []string
	TimeRangeValues []inkbunny.IntString

	ScrapsIndex  int
	ScrapsLabels []string
	ScrapsValues []inkbunny.Scraps

	OrderByIndex  int
	OrderByLabels []string
	OrderByValues []string

	DownloadCaption   bool
	UnreadMode        bool
	UnreadCount       int
	CanUseUnread      bool
	CanUseWatching    bool
	WatchingUsers     []string
	UseWatchingArtist bool

	// Ratings
	RatingGeneral        bool
	RatingNudity         bool
	RatingMildViolence   bool
	RatingSexual         bool
	RatingStrongViolence bool

	// Types
	TypeAny           bool
	TypePicture       bool
	TypeSketch        bool
	TypePictureSeries bool
	TypeComic         bool
	TypePortfolio     bool
	TypeSWFAnimation  bool
	TypeSWFInteract   bool
	TypeVideoFeature  bool
	TypeVideoAnim     bool
	TypeMusicSingle   bool
	TypeMusicAlbum    bool
	TypeWriting       bool
	TypeCharSheet     bool
	TypePhotography   bool

	Aborted bool

	measuringFocus bool
}

func NewModel(
	user *inkbunny.User,
	username string,
	unreadCount int,
	canUseUnread bool,
	canUseWatching bool,
	watchingUsers []string,
	releaseStatus apptypes.ReleaseStatus,
	showUpdateNotice bool,
	defaultDownloadDir string,
	defaultDownloadPattern string,
	settings apptypes.AppSettings,
	persistSettings func(apptypes.AppSettings) error,
	keywordCache *flight.Cache[string, []inkbunny.KeywordAutocomplete],
	usernameCache *flight.Cache[string, []inkbunny.Autocomplete],
) *Model {
	zm := zone.New()
	defaultMaxActive := min(max(1, runtime.NumCPU()/6), 6)

	searchWords := textinput.New()
	searchWords.Placeholder = "Separate words with spaces."
	searchWords.Prompt = ""
	searchWords.Focus()

	artistName := textinput.New()
	artistName.Placeholder = "search only submissions by this user"
	artistName.Prompt = ""

	favBy := textinput.New()
	favBy.Placeholder = "search only work favorited by this user"
	favBy.Prompt = ""

	poolID := textinput.New()
	poolID.Placeholder = "12345"
	poolID.Validate = func(s string) error {
		if s == "" {
			return nil
		}
		_, err := strconv.Atoi(s)
		return err
	}
	poolID.Prompt = ""

	maxDownloads := textinput.New()
	maxDownloads.Placeholder = "Unlimited"
	maxDownloads.Prompt = ""

	maxActive := textinput.New()
	maxActive.Placeholder = strconv.Itoa(defaultMaxActive)
	maxActive.Validate = func(s string) error {
		if s == "" {
			return nil
		}
		_, err := strconv.Atoi(s)
		return err
	}
	maxActive.Prompt = ""
	if settings.MaxActive > 0 && settings.MaxActive != defaultMaxActive {
		maxActive.SetValue(strconv.Itoa(settings.MaxActive))
	}

	downloadDir := textinput.New()
	downloadDir.Placeholder = defaultDownloadDir
	downloadDir.Prompt = ""
	if value := strings.TrimSpace(settings.DownloadDirectory); value != "" && value != strings.TrimSpace(defaultDownloadDir) {
		downloadDir.SetValue(value)
	}

	downloadPattern := textinput.New()
	downloadPattern.Placeholder = defaultDownloadPattern
	downloadPattern.Prompt = ""
	if value := strings.TrimSpace(settings.DownloadPattern); value != "" && value != strings.TrimSpace(defaultDownloadPattern) {
		downloadPattern.SetValue(value)
	}

	model := &Model{
		ZoneManager:      zm,
		User:             user,
		Username:         username,
		ReleaseStatus:    releaseStatus,
		PersistSettings:  persistSettings,
		ShowUpdateNotice: showUpdateNotice,
		SearchWords:      searchWords,
		ArtistName:       artistName,
		FavBy:            favBy,
		PoolID:           poolID,
		MaxDownloads:     maxDownloads,
		MaxActive:        maxActive,
		DownloadDir:      downloadDir,
		DownloadPath:     downloadPattern,
		KeywordCache:     keywordCache,
		UsernameCache:    usernameCache,

		SuggestionIndex: -1,

		StringJoinType:   inkbunny.JoinTypeAnd,
		SearchInKeywords: true,
		SearchInTitle:    true,

		TimeRangeLabels: []string{"Any Time", "24 Hrs", "3 Days", "1 Week", "2 Weeks", "1 Month", "3 Months", "6 Months", "1 Year"},
		TimeRangeValues: []inkbunny.IntString{0, 1, 3, 7, 14, 30, 90, 180, 365},

		ScrapsLabels: []string{"Include scraps", "Exclude scraps", "Scraps only"},
		ScrapsValues: []inkbunny.Scraps{inkbunny.ScrapsBoth, inkbunny.ScrapsNo, inkbunny.ScrapsOnly},

		OrderByLabels: []string{"Newest First", "Most Popular First (by Favs)", "Most Popular First (by Views)"},
		OrderByValues: []string{inkbunny.OrderByCreateDatetime, inkbunny.OrderByFavs, inkbunny.OrderByViews},

		DownloadCaption: false,
		UnreadCount:     unreadCount,
		CanUseUnread:    canUseUnread,
		CanUseWatching:  canUseWatching,
		WatchingUsers:   append([]string(nil), watchingUsers...),
		ActiveField:     FieldSearchWords,
		FocusIndex:      0,

		RatingGeneral:        true,
		RatingNudity:         true,
		RatingMildViolence:   true,
		RatingSexual:         true,
		RatingStrongViolence: true,

		TypeAny: true,
	}

	model.SavedSettings = model.PersistentSettings()
	return model
}

func (m *Model) fetchKeywordSuggestions(query string) tea.Cmd {
	if m.KeywordCache == nil || strings.TrimSpace(query) == "" {
		return nil
	}
	cache := m.KeywordCache
	return func() tea.Msg {
		results, err := cache.Get(query)
		if err != nil || len(results) == 0 {
			return SuggestKeywordMsg{}
		}
		suggestions := make([]string, 0, len(results))
		for _, r := range results {
			if len(suggestions) >= 10 {
				break
			}
			suggestions = append(suggestions, r.Value)
		}
		return SuggestKeywordMsg{Suggestions: suggestions}
	}
}

func (m *Model) fetchUsernameSuggestions(field activeField, query string) tea.Cmd {
	if m.UsernameCache == nil || strings.TrimSpace(query) == "" {
		return nil
	}
	cache := m.UsernameCache
	return func() tea.Msg {
		results, err := cache.Get(query)
		if err != nil || len(results) == 0 {
			return SuggestUsernameMsg{Field: field}
		}
		suggestions := make([]string, 0, len(results))
		for _, r := range results {
			if len(suggestions) >= 10 {
				break
			}
			suggestions = append(suggestions, r.Value)
		}
		return SuggestUsernameMsg{Field: field, Suggestions: suggestions}
	}
}

// Helpers for main.go
func (m *Model) TimeRange() inkbunny.IntString {
	return m.TimeRangeValues[m.TimeRangeIndex]
}

func (m *Model) OrderBy() string {
	return m.OrderByValues[m.OrderByIndex]
}

func (m *Model) Scraps() inkbunny.Scraps {
	return m.ScrapsValues[m.ScrapsIndex]
}

func (m *Model) PoolIDValue() inkbunny.IntString {
	value := strings.TrimSpace(m.PoolID.Value())
	if value == "" {
		return 0
	}
	parsed, err := strconv.Atoi(value)
	if err != nil {
		return 0
	}
	return inkbunny.IntString(parsed)
}

func (m *Model) DownloadDirectoryValue() string {
	value := strings.TrimSpace(m.DownloadDir.Value())
	if value != "" {
		return value
	}
	return strings.TrimSpace(m.DownloadDir.Placeholder)
}

func (m *Model) DownloadPatternValue() string {
	value := strings.TrimSpace(m.DownloadPath.Value())
	if value != "" {
		return value
	}
	return strings.TrimSpace(m.DownloadPath.Placeholder)
}

func (m *Model) MaxActiveValue() int {
	value := strings.TrimSpace(m.MaxActive.Value())
	if value == "" {
		value = strings.TrimSpace(m.MaxActive.Placeholder)
	}
	parsed, err := strconv.Atoi(value)
	if err != nil || parsed <= 0 {
		return min(max(1, runtime.NumCPU()/6), 6)
	}
	return parsed
}

func (m *Model) PersistentSettings() apptypes.AppSettings {
	return apptypes.AppSettings{
		DownloadDirectory: m.DownloadDirectoryValue(),
		DownloadPattern:   m.DownloadPatternValue(),
		MaxActive:         m.MaxActiveValue(),
	}
}

func samePersistentSettings(a, b apptypes.AppSettings) bool {
	return strings.TrimSpace(a.DownloadDirectory) == strings.TrimSpace(b.DownloadDirectory) &&
		strings.TrimSpace(a.DownloadPattern) == strings.TrimSpace(b.DownloadPattern) &&
		a.MaxActive == b.MaxActive
}

func (m *Model) ArtistFilters() []string {
	if m.UseWatchingArtist {
		return append([]string(nil), m.WatchingUsers...)
	}
	return normalizeUserFilters(m.ArtistName.Value())
}

func (m *Model) FavoriteFilters() []string {
	return normalizeUserFilters(m.FavBy.Value())
}

func (m *Model) SubmissionType() []inkbunny.SubmissionType {
	if m.TypeAny {
		return []inkbunny.SubmissionType{inkbunny.SubmissionTypeAny}
	}
	var res []inkbunny.SubmissionType
	if m.TypePicture {
		res = append(res, inkbunny.SubmissionTypePicturePinup)
	}
	if m.TypeSketch {
		res = append(res, inkbunny.SubmissionTypeSketch)
	}
	if m.TypePictureSeries {
		res = append(res, inkbunny.SubmissionTypePictureSeries)
	}
	if m.TypeComic {
		res = append(res, inkbunny.SubmissionTypeComic)
	}
	if m.TypePortfolio {
		res = append(res, inkbunny.SubmissionTypePortfolio)
	}
	if m.TypeSWFAnimation {
		res = append(res, inkbunny.SubmissionTypeShockwaveFlashAnimation)
	}
	if m.TypeSWFInteract {
		res = append(res, inkbunny.SubmissionTypeShockwaveFlashInteractive)
	}
	if m.TypeVideoFeature {
		res = append(res, inkbunny.SubmissionTypeVideoFeatureLength)
	}
	if m.TypeVideoAnim {
		res = append(res, inkbunny.SubmissionTypeVideoAnimation3DCGI)
	}
	if m.TypeMusicSingle {
		res = append(res, inkbunny.SubmissionTypeMusicSingleTrack)
	}
	if m.TypeMusicAlbum {
		res = append(res, inkbunny.SubmissionTypeMusicAlbum)
	}
	if m.TypeWriting {
		res = append(res, inkbunny.SubmissionTypeWritingDocument)
	}
	if m.TypeCharSheet {
		res = append(res, inkbunny.SubmissionTypeCharacterSheet)
	}
	if m.TypePhotography {
		res = append(res, inkbunny.SubmissionTypePhotography)
	}
	if len(res) == 0 {
		return []inkbunny.SubmissionType{inkbunny.SubmissionTypeAny}
	}
	return res
}

func (m *Model) clampScroll() {
	maxScroll := max(m.contentLines-m.Height, 0)
	if m.ScrollOffset > maxScroll {
		m.ScrollOffset = maxScroll
	}
	if m.ScrollOffset < 0 {
		m.ScrollOffset = 0
	}
}

func (m *Model) focusableZones() []string {
	zones := make([]string, 0, len(FocusableZones))
	for _, id := range FocusableZones {
		if id == "btn_unread" && !m.CanUseUnread {
			continue
		}
		if (id == "btn_update_open" || id == "btn_update_later" || id == "btn_update_skip") && !m.ShowUpdateNotice {
			continue
		}
		zones = append(zones, id)
	}
	return zones
}

func (m *Model) currentFocusZone() string {
	zones := m.focusableZones()
	if len(zones) == 0 {
		return ""
	}
	if m.FocusIndex < 0 {
		m.FocusIndex = 0
	}
	if m.FocusIndex >= len(zones) {
		m.FocusIndex = len(zones) - 1
	}
	return zones[m.FocusIndex]
}

func (m *Model) focusIndexForZone(id string) int {
	for i, zone := range m.focusableZones() {
		if zone == id {
			return i
		}
	}
	return 0
}

func (m *Model) moveFocus(delta int) {
	zones := m.focusableZones()
	if len(zones) == 0 {
		return
	}

	m.FocusIndex = (m.FocusIndex + delta + len(zones)) % len(zones)
	m.updateActiveField()
	m.focusActiveField()
	m.Suggestions = nil
	m.SuggestionIndex = -1
	m.ensureFocusVisible()
}

func normalizeUserFilters(raw string) []string {
	seen := make(map[string]struct{})
	values := make([]string, 0)
	for _, part := range strings.FieldsFunc(raw, func(r rune) bool {
		return r == ',' || r == '\n' || r == '\r'
	}) {
		trimmed := strings.TrimSpace(part)
		if trimmed == "" {
			continue
		}
		key := strings.ToLower(trimmed)
		if _, ok := seen[key]; ok {
			continue
		}
		seen[key] = struct{}{}
		values = append(values, trimmed)
	}
	return values
}

func currentUserToken(raw string) string {
	parts := strings.FieldsFunc(raw, func(r rune) bool {
		return r == ',' || r == '\n' || r == '\r'
	})
	if len(parts) == 0 {
		return strings.TrimSpace(raw)
	}
	return strings.TrimSpace(parts[len(parts)-1])
}

func replaceCurrentUserToken(raw string, value string) string {
	trimmedRaw := strings.TrimRight(raw, " \t\r\n")
	if trimmedRaw == "" {
		return value
	}

	lastSep := strings.LastIndexAny(trimmedRaw, ",\n\r")
	if lastSep < 0 {
		return value
	}
	prefix := strings.TrimRight(trimmedRaw[:lastSep+1], " \t")
	if prefix == "" {
		return value
	}
	return prefix + " " + value
}

func appendUniqueUserFilter(raw string, value string) string {
	values := normalizeUserFilters(raw)
	for _, existing := range values {
		if strings.EqualFold(existing, value) {
			return strings.Join(values, ", ")
		}
	}
	values = append(values, value)
	return strings.Join(values, ", ")
}

func (m *Model) Init() tea.Cmd {
	return tea.Batch(
		func() tea.Msg { return textinput.Blink() },
		func() tea.Msg { return tea.RequestWindowSize() },
	)
}
