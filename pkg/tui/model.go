package tui

import (
	tea "charm.land/bubbletea/v2"
	"github.com/charmbracelet/bubbles/textinput"
	zone "github.com/lrstanley/bubblezone"

	"github.com/ellypaws/inkbunny"
)

type activeField int

const (
	FieldSearchWords activeField = iota
	FieldArtistName
	FieldFavBy
	FieldMaxDownloads
)

type Model struct {
	ZoneManager *zone.Manager

	SearchWords  textinput.Model
	ArtistName   textinput.Model
	FavBy        textinput.Model
	MaxDownloads textinput.Model

	ActiveField activeField
	HoveredZone string

	// Options
	StringJoinType inkbunny.JoinType // inkbunny.JoinTypeAnd, inkbunny.JoinTypeOr, inkbunny.JoinTypeExact

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
}

func NewModel(user *inkbunny.User) Model {
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

	return Model{
		ZoneManager:  zm,
		SearchWords:  searchWords,
		ArtistName:   artistName,
		FavBy:        favBy,
		MaxDownloads: maxDownloads,

		StringJoinType:   inkbunny.JoinTypeAnd,
		SearchInKeywords: true,
		SearchInTitle:    true,

		TimeRangeLabels: []string{"Any Time", "24 Hrs", "3 Days", "1 Week", "2 Weeks", "1 Month", "3 Months", "6 Months", "1 Year"},
		TimeRangeValues: []inkbunny.IntString{0, 1, 3, 7, 14, 30, 90, 180, 365},

		OrderByLabels: []string{"Newest First", "Most Popular First (by Favs)", "Most Popular First (by Views)"},
		OrderByValues: []string{inkbunny.OrderByCreateDatetime, inkbunny.OrderByFavs, inkbunny.OrderByViews},

		DownloadCaption: true,
		ActiveField:     FieldSearchWords,

		RatingGeneral:        true,
		RatingNudity:         true,
		RatingMildViolence:   true,
		RatingSexual:         true,
		RatingStrongViolence: true,

		TypeAny: true,
	}
}

// Helpers for main.go
func (m Model) TimeRange() inkbunny.IntString {
	return m.TimeRangeValues[m.TimeRangeIndex]
}

func (m Model) OrderBy() string {
	return m.OrderByValues[m.OrderByIndex]
}

func (m Model) SubmissionType() []inkbunny.SubmissionType {
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

func (m Model) Init() tea.Cmd {
	return func() tea.Msg { return textinput.Blink() }
}
