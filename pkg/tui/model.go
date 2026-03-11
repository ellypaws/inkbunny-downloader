package tui

import (
	"runtime"
	"strconv"
	"strings"

	tea "charm.land/bubbletea/v2"
	"github.com/charmbracelet/bubbles/textinput"
	zone "github.com/lrstanley/bubblezone"

	"github.com/ellypaws/inkbunny"
	"github.com/ellypaws/inkbunny/cmd/downloader/pkg/flight"
)

type activeField int

const (
	FieldSearchWords activeField = iota
	FieldArtistName
	FieldFavBy
	FieldMaxDownloads
	FieldMaxActive
	FieldNone
)

var FocusableZones = []string{
	"search_words", "btn_search_top",
	"rad_and", "rad_or", "rad_exact",
	"chk_keywords", "chk_title", "chk_desc", "chk_md5",
	"artist_name", "link_use_my_name_artist",
	"fav_by", "link_use_my_name_fav",
	"cycle_time",
	"chk_rate_gen", "chk_rate_nudity", "chk_rate_mildv", "chk_rate_sex", "chk_rate_strongv",
	"rad_type_any", "chk_type_pic", "chk_type_sketch", "chk_type_picseries", "chk_type_comic",
	"chk_type_port", "chk_type_swfanim", "chk_type_swfint", "chk_type_vidfeat", "chk_type_vidanim",
	"chk_type_musicsing", "chk_type_musicalb", "chk_type_writing", "chk_type_char", "chk_type_photo",
	"cycle_order", "max_dl", "max_active", "chk_dl_caption",
	"btn_search_bottom", "btn_logout",
}

type SuggestKeywordMsg struct {
	Suggestions []string
}

type SuggestUsernameMsg struct {
	Field       activeField
	Suggestions []string
}

type Model struct {
	ZoneManager *zone.Manager
	User        *inkbunny.User
	Username    string

	NeedsLogin bool

	Width        int
	Height       int
	ScrollOffset int
	contentLines int

	SearchWords  textinput.Model
	ArtistName   textinput.Model
	FavBy        textinput.Model
	MaxDownloads textinput.Model
	MaxActive    textinput.Model

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

	OrderByIndex  int
	OrderByLabels []string
	OrderByValues []string

	DownloadCaption bool

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
}

func NewModel(
	user *inkbunny.User,
	username string,
	keywordCache *flight.Cache[string, []inkbunny.KeywordAutocomplete],
	usernameCache *flight.Cache[string, []inkbunny.Autocomplete],
) *Model {
	zm := zone.New()

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

	maxDownloads := textinput.New()
	maxDownloads.Placeholder = "Unlimited"
	maxDownloads.Prompt = ""

	maxActive := textinput.New()
	maxActive.Placeholder = strconv.Itoa(min(max(1, runtime.NumCPU()/6), 6))
	maxActive.Validate = func(s string) error {
		if s == "" {
			return nil
		}
		_, err := strconv.Atoi(s)
		return err
	}
	maxActive.Prompt = ""

	return &Model{
		ZoneManager:   zm,
		User:          user,
		Username:      username,
		SearchWords:   searchWords,
		ArtistName:    artistName,
		FavBy:         favBy,
		MaxDownloads:  maxDownloads,
		MaxActive:     maxActive,
		KeywordCache:  keywordCache,
		UsernameCache: usernameCache,

		SuggestionIndex: -1,

		StringJoinType:   inkbunny.JoinTypeAnd,
		SearchInKeywords: true,
		SearchInTitle:    true,

		TimeRangeLabels: []string{"Any Time", "24 Hrs", "3 Days", "1 Week", "2 Weeks", "1 Month", "3 Months", "6 Months", "1 Year"},
		TimeRangeValues: []inkbunny.IntString{0, 1, 3, 7, 14, 30, 90, 180, 365},

		OrderByLabels: []string{"Newest First", "Most Popular First (by Favs)", "Most Popular First (by Views)"},
		OrderByValues: []string{inkbunny.OrderByCreateDatetime, inkbunny.OrderByFavs, inkbunny.OrderByViews},

		DownloadCaption: false,
		ActiveField:     FieldSearchWords,
		FocusIndex:      0,

		RatingGeneral:        true,
		RatingNudity:         true,
		RatingMildViolence:   true,
		RatingSexual:         true,
		RatingStrongViolence: true,

		TypeAny: true,
	}
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

func (m *Model) Init() tea.Cmd {
	return tea.Batch(
		func() tea.Msg { return textinput.Blink() },
		func() tea.Msg { return tea.RequestWindowSize() },
	)
}
