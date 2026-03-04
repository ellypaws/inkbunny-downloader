package tui

import (
	"fmt"
	"strings"

	tea "charm.land/bubbletea/v2"
	"github.com/charmbracelet/bubbles/textinput"
	teaV1 "github.com/charmbracelet/bubbletea"

	"github.com/ellypaws/inkbunny"
)

func (m *Model) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	var cmd tea.Cmd
	var cmds []tea.Cmd

	switch msg := msg.(type) {
	case tea.WindowSizeMsg:
		m.Width = msg.Width
		m.Height = msg.Height
		m.clampScroll()
		return m, nil

	case tea.KeyPressMsg:
		if len(m.Suggestions) > 0 {
			switch msg.String() {
			case "up":
				m.SuggestionIndex--
				if m.SuggestionIndex < 0 {
					m.SuggestionIndex = len(m.Suggestions) - 1
				}
				return m, nil
			case "down":
				m.SuggestionIndex++
				if m.SuggestionIndex >= len(m.Suggestions) {
					m.SuggestionIndex = 0
				}
				return m, nil
			case "enter":
				if m.SuggestionIndex >= 0 && m.SuggestionIndex < len(m.Suggestions) {
					m.applySuggestion(m.Suggestions[m.SuggestionIndex])
					m.Suggestions = nil
					m.SuggestionIndex = -1
					return m, nil
				}
				return m, tea.Quit
			case "esc":
				m.Suggestions = nil
				m.SuggestionIndex = -1
				return m, nil
			}
		}

		switch msg.String() {
		case "ctrl+c":
			m.Aborted = true
			return m, tea.Quit
		case "esc":
			m.Aborted = true
			return m, tea.Quit
		case "tab", "down":
			m.ActiveField++
			if m.ActiveField > FieldMaxDownloads {
				m.ActiveField = FieldSearchWords
			}
			m.focusActiveField()
			m.Suggestions = nil
			m.SuggestionIndex = -1
			return m, nil
		case "shift+tab", "up":
			m.ActiveField--
			if m.ActiveField < FieldSearchWords {
				m.ActiveField = FieldMaxDownloads
			}
			m.focusActiveField()
			m.Suggestions = nil
			m.SuggestionIndex = -1
			return m, nil
		case "enter":
			return m, tea.Quit
		case "pgdown":
			m.ScrollOffset += m.Height / 2
			m.clampScroll()
			return m, nil
		case "pgup":
			m.ScrollOffset -= m.Height / 2
			m.clampScroll()
			return m, nil
		}

	case SuggestKeywordMsg:
		if m.ActiveField == FieldSearchWords {
			m.Suggestions = msg.Suggestions
			m.SuggestionField = FieldSearchWords
			m.SuggestionIndex = -1
		}
		return m, nil

	case SuggestUsernameMsg:
		if m.ActiveField == msg.Field {
			m.Suggestions = msg.Suggestions
			m.SuggestionField = msg.Field
			m.SuggestionIndex = -1
		}
		return m, nil

	case tea.MouseWheelMsg:
		if msg.Mouse().Button == tea.MouseWheelUp {
			m.ScrollOffset -= 3
		} else if msg.Mouse().Button == tea.MouseWheelDown {
			m.ScrollOffset += 3
		}
		m.clampScroll()
		return m, nil

	case tea.MouseMsg:
		res, c := m.handleMouse(msg)
		return res, c
	}

	prevSearch := m.SearchWords.Value()
	prevArtist := m.ArtistName.Value()
	prevFav := m.FavBy.Value()

	m.SearchWords, cmd = updateInput(m.SearchWords, msg)
	cmds = append(cmds, cmd)
	m.ArtistName, cmd = updateInput(m.ArtistName, msg)
	cmds = append(cmds, cmd)
	m.FavBy, cmd = updateInput(m.FavBy, msg)
	cmds = append(cmds, cmd)
	m.MaxDownloads, cmd = updateInput(m.MaxDownloads, msg)
	cmds = append(cmds, cmd)

	if q := m.SearchWords.Value(); q != prevSearch && q != m.lastQuery {
		m.lastQuery = q
		if c := m.fetchKeywordSuggestions(q); c != nil {
			cmds = append(cmds, c)
		} else {
			m.Suggestions = nil
		}
	}
	if q := m.ArtistName.Value(); q != prevArtist && m.ActiveField == FieldArtistName {
		if c := m.fetchUsernameSuggestions(FieldArtistName, q); c != nil {
			cmds = append(cmds, c)
		} else {
			m.Suggestions = nil
		}
	}
	if q := m.FavBy.Value(); q != prevFav && m.ActiveField == FieldFavBy {
		if c := m.fetchUsernameSuggestions(FieldFavBy, q); c != nil {
			cmds = append(cmds, c)
		} else {
			m.Suggestions = nil
		}
	}

	return m, tea.Batch(cmds...)
}

func (m *Model) applySuggestion(value string) {
	switch m.SuggestionField {
	case FieldSearchWords:
		text := m.SearchWords.Value()
		parts := strings.Fields(text)
		if len(parts) > 0 {
			parts[len(parts)-1] = value
		} else {
			parts = []string{value}
		}
		m.SearchWords.SetValue(strings.Join(parts, " ") + " ")
		m.SearchWords.CursorEnd()
	case FieldArtistName:
		m.ArtistName.SetValue(value)
	case FieldFavBy:
		m.FavBy.SetValue(value)
	}
}

func (m *Model) handleMouse(msg tea.MouseMsg) (tea.Model, tea.Cmd) {
	v1msg := teaV1.MouseMsg{X: msg.Mouse().X, Y: msg.Mouse().Y}

	inBounds := func(id string) bool { return m.ZoneManager.Get(id).InBounds(v1msg) }
	hoverCheck := func(id string) bool {
		if inBounds(id) {
			m.HoveredZone = id
			return true
		}
		return false
	}

	if mRelease, ok := msg.(tea.MouseReleaseMsg); ok && mRelease.Button == tea.MouseLeft {
		for i := range m.Suggestions {
			id := fmt.Sprintf("sug_%d", i)
			if inBounds(id) {
				m.applySuggestion(m.Suggestions[i])
				m.Suggestions = nil
				m.SuggestionIndex = -1
				return m, nil
			}
		}

		if inBounds("search_words") {
			m.ActiveField = FieldSearchWords
			m.focusActiveField()
			return m, nil
		}
		if inBounds("artist_name") {
			m.ActiveField = FieldArtistName
			m.focusActiveField()
			return m, nil
		}
		if inBounds("fav_by") {
			m.ActiveField = FieldFavBy
			m.focusActiveField()
			return m, nil
		}
		if inBounds("max_dl") {
			m.ActiveField = FieldMaxDownloads
			m.focusActiveField()
			return m, nil
		}

		if inBounds("btn_search_top") || inBounds("btn_search_bottom") {
			return m, tea.Quit
		}

		if inBounds("link_use_my_name_artist") {
			m.ArtistName.SetValue(m.Username)
			return m, nil
		}
		if inBounds("link_use_my_name_fav") {
			m.FavBy.SetValue(m.Username)
			return m, nil
		}

		if inBounds("rad_and") {
			m.StringJoinType = inkbunny.JoinTypeAnd
		}
		if inBounds("rad_or") {
			m.StringJoinType = inkbunny.JoinTypeOr
		}
		if inBounds("rad_exact") {
			m.StringJoinType = inkbunny.JoinTypeExact
		}

		if inBounds("chk_keywords") {
			m.SearchInKeywords = !m.SearchInKeywords
		}
		if inBounds("chk_title") {
			m.SearchInTitle = !m.SearchInTitle
		}
		if inBounds("chk_desc") {
			m.SearchInDesc = !m.SearchInDesc
		}
		if inBounds("chk_md5") {
			m.SearchInMD5 = !m.SearchInMD5
		}

		if inBounds("chk_rate_gen") {
			m.RatingGeneral = !m.RatingGeneral
		}
		if inBounds("chk_rate_nudity") {
			m.RatingNudity = !m.RatingNudity
		}
		if inBounds("chk_rate_mildv") {
			m.RatingMildViolence = !m.RatingMildViolence
		}
		if inBounds("chk_rate_sex") {
			m.RatingSexual = !m.RatingSexual
		}
		if inBounds("chk_rate_strongv") {
			m.RatingStrongViolence = !m.RatingStrongViolence
		}

		if inBounds("rad_type_any") {
			m.TypeAny = true
			m.clearTypes()
		} else {
			if inBounds("chk_type_pic") {
				m.TypePicture = !m.TypePicture
				m.TypeAny = false
			}
			if inBounds("chk_type_sketch") {
				m.TypeSketch = !m.TypeSketch
				m.TypeAny = false
			}
			if inBounds("chk_type_picseries") {
				m.TypePictureSeries = !m.TypePictureSeries
				m.TypeAny = false
			}
			if inBounds("chk_type_comic") {
				m.TypeComic = !m.TypeComic
				m.TypeAny = false
			}
			if inBounds("chk_type_port") {
				m.TypePortfolio = !m.TypePortfolio
				m.TypeAny = false
			}
			if inBounds("chk_type_swfanim") {
				m.TypeSWFAnimation = !m.TypeSWFAnimation
				m.TypeAny = false
			}
			if inBounds("chk_type_swfint") {
				m.TypeSWFInteract = !m.TypeSWFInteract
				m.TypeAny = false
			}
			if inBounds("chk_type_vidfeat") {
				m.TypeVideoFeature = !m.TypeVideoFeature
				m.TypeAny = false
			}
			if inBounds("chk_type_vidanim") {
				m.TypeVideoAnim = !m.TypeVideoAnim
				m.TypeAny = false
			}
			if inBounds("chk_type_musicsing") {
				m.TypeMusicSingle = !m.TypeMusicSingle
				m.TypeAny = false
			}
			if inBounds("chk_type_musicalb") {
				m.TypeMusicAlbum = !m.TypeMusicAlbum
				m.TypeAny = false
			}
			if inBounds("chk_type_writing") {
				m.TypeWriting = !m.TypeWriting
				m.TypeAny = false
			}
			if inBounds("chk_type_char") {
				m.TypeCharSheet = !m.TypeCharSheet
				m.TypeAny = false
			}
			if inBounds("chk_type_photo") {
				m.TypePhotography = !m.TypePhotography
				m.TypeAny = false
			}
		}

		if inBounds("cycle_time") {
			m.TimeRangeIndex = (m.TimeRangeIndex + 1) % len(m.TimeRangeLabels)
		}
		if inBounds("cycle_order") {
			m.OrderByIndex = (m.OrderByIndex + 1) % len(m.OrderByLabels)
		}

		if inBounds("chk_dl_caption") {
			m.DownloadCaption = !m.DownloadCaption
		}

		return m, nil
	}

	if _, ok := msg.(tea.MouseMotionMsg); ok {
		m.HoveredZone = ""

		for i := range m.Suggestions {
			if hoverCheck(fmt.Sprintf("sug_%d", i)) {
				break
			}
		}

		if m.HoveredZone == "" {
			_ = hoverCheck("search_words") || hoverCheck("artist_name") || hoverCheck("fav_by") || hoverCheck("max_dl") ||
				hoverCheck("btn_search_top") || hoverCheck("btn_search_bottom") ||
				hoverCheck("link_use_my_name_artist") || hoverCheck("link_use_my_name_fav") ||
				hoverCheck("rad_and") || hoverCheck("rad_or") || hoverCheck("rad_exact") ||
				hoverCheck("chk_keywords") || hoverCheck("chk_title") || hoverCheck("chk_desc") || hoverCheck("chk_md5") ||
				hoverCheck("chk_rate_gen") || hoverCheck("chk_rate_nudity") || hoverCheck("chk_rate_mildv") || hoverCheck("chk_rate_sex") || hoverCheck("chk_rate_strongv") ||
				hoverCheck("rad_type_any") || hoverCheck("chk_type_pic") || hoverCheck("chk_type_sketch") || hoverCheck("chk_type_picseries") || hoverCheck("chk_type_comic") || hoverCheck("chk_type_port") || hoverCheck("chk_type_swfanim") || hoverCheck("chk_type_swfint") || hoverCheck("chk_type_vidfeat") || hoverCheck("chk_type_vidanim") || hoverCheck("chk_type_musicsing") || hoverCheck("chk_type_musicalb") || hoverCheck("chk_type_writing") || hoverCheck("chk_type_char") || hoverCheck("chk_type_photo") ||
				hoverCheck("cycle_time") || hoverCheck("cycle_order") || hoverCheck("chk_dl_caption")
		}
	}

	return m, nil
}

func (m *Model) clearTypes() {
	m.TypePicture = false
	m.TypeSketch = false
	m.TypePictureSeries = false
	m.TypeComic = false
	m.TypePortfolio = false
	m.TypeSWFAnimation = false
	m.TypeSWFInteract = false
	m.TypeVideoFeature = false
	m.TypeVideoAnim = false
	m.TypeMusicSingle = false
	m.TypeMusicAlbum = false
	m.TypeWriting = false
	m.TypeCharSheet = false
	m.TypePhotography = false
}

func updateInput(in textinput.Model, msg tea.Msg) (textinput.Model, tea.Cmd) {
	v1Msg := toV1Msg(msg)
	if v1Msg == nil {
		return in, nil
	}
	model, c := in.Update(v1Msg)
	if c == nil {
		return model, nil
	}
	cmd := func() tea.Msg {
		return c()
	}
	return model, cmd
}

func toV1Msg(msg tea.Msg) teaV1.Msg {
	switch msg := msg.(type) {
	case tea.KeyPressMsg:
		return toV1KeyMsg(msg)
	}
	return nil
}

func toV1KeyMsg(msg tea.KeyPressMsg) teaV1.Msg {
	v1 := teaV1.KeyMsg{
		Alt: msg.Mod.Contains(tea.ModAlt),
	}

	if len(msg.Text) > 0 && !msg.Mod.Contains(tea.ModCtrl) {
		v1.Type = teaV1.KeyRunes
		v1.Runes = []rune(msg.Text)
		return v1
	}

	if msg.Mod.Contains(tea.ModCtrl) {
		switch msg.Code {
		case 'a':
			v1.Type = teaV1.KeyCtrlA
		case 'b':
			v1.Type = teaV1.KeyCtrlB
		case 'd':
			v1.Type = teaV1.KeyCtrlD
		case 'e':
			v1.Type = teaV1.KeyCtrlE
		case 'f':
			v1.Type = teaV1.KeyCtrlF
		case 'h':
			v1.Type = teaV1.KeyCtrlH
		case 'k':
			v1.Type = teaV1.KeyCtrlK
		case 'u':
			v1.Type = teaV1.KeyCtrlU
		case 'w':
			v1.Type = teaV1.KeyCtrlW
		default:
			return nil
		}
		return v1
	}

	switch msg.Code {
	case tea.KeyBackspace:
		v1.Type = teaV1.KeyBackspace
	case tea.KeyEnter:
		v1.Type = teaV1.KeyEnter
	case tea.KeyTab:
		v1.Type = teaV1.KeyTab
	case tea.KeyEscape:
		v1.Type = teaV1.KeyEscape
	case tea.KeyLeft:
		v1.Type = teaV1.KeyLeft
	case tea.KeyRight:
		v1.Type = teaV1.KeyRight
	case tea.KeyUp:
		v1.Type = teaV1.KeyUp
	case tea.KeyDown:
		v1.Type = teaV1.KeyDown
	case tea.KeyHome:
		v1.Type = teaV1.KeyHome
	case tea.KeyEnd:
		v1.Type = teaV1.KeyEnd
	case tea.KeyDelete:
		v1.Type = teaV1.KeyDelete
	case tea.KeySpace:
		v1.Type = teaV1.KeyRunes
		v1.Runes = []rune{' '}
	default:
		return nil
	}

	return v1
}

func (m *Model) focusActiveField() {
	m.SearchWords.Blur()
	m.ArtistName.Blur()
	m.FavBy.Blur()
	m.MaxDownloads.Blur()

	switch m.ActiveField {
	case FieldSearchWords:
		m.SearchWords.Focus()
	case FieldArtistName:
		m.ArtistName.Focus()
	case FieldFavBy:
		m.FavBy.Focus()
	case FieldMaxDownloads:
		m.MaxDownloads.Focus()
	}
}
