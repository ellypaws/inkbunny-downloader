package tui

import (
	"fmt"
	"os"
	"strings"

	tea "charm.land/bubbletea/v2"
	"github.com/charmbracelet/bubbles/textinput"
	teaV1 "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/log"
	"github.com/pkg/browser"

	"github.com/ellypaws/inkbunny"
	apptypes "github.com/ellypaws/inkbunny/cmd/downloader/pkg/app/types"
)

func (m *Model) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	var cmd tea.Cmd
	var cmds []tea.Cmd
	prevPersistentSettings := m.PersistentSettings()

	switch msg := msg.(type) {
	case tea.WindowSizeMsg:
		m.Width = msg.Width
		m.Height = msg.Height
		m.clampScroll()
		m.ensureFocusVisible()
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
				// If no suggestion selected, fall through to default enter behavior
			case "esc":
				m.Suggestions = nil
				m.SuggestionIndex = -1
				return m, nil
			}
		}

		switch msg.String() {
		case "ctrl+c", "esc":
			m.Aborted = true
			return m, tea.Quit
		case "tab", "down":
			m.moveFocus(1)
			return m, nil
		case "shift+tab", "up":
			m.moveFocus(-1)
			return m, nil
		case "right":
			if m.ActiveField == FieldNone {
				m.moveFocus(1)
				return m, nil
			}
		case "left":
			if m.ActiveField == FieldNone {
				m.moveFocus(-1)
				return m, nil
			}
		case " ", "space":
			if m.ActiveField == FieldNone {
				return m.triggerZone(m.currentFocusZone())
			}
		case "enter":
			zone := m.currentFocusZone()
			if zone == "btn_search_top" || zone == "btn_search_bottom" || zone == "btn_unread" || zone == "btn_logout" || zone == "btn_update_open" || zone == "btn_update_later" || zone == "btn_update_skip" {
				return m.triggerZone(zone)
			}
			m.moveFocus(1)
			return m, nil
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
		res, c := m.handleMouse(msg)
		return res, c

	case teaV1.MouseMsg:
		if msg.Type == teaV1.MouseWheelUp {
			m.ScrollOffset -= 3
		} else if msg.Type == teaV1.MouseWheelDown {
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
	if !m.UseWatchingArtist {
		m.ArtistName, cmd = updateInput(m.ArtistName, msg)
		cmds = append(cmds, cmd)
	}
	m.FavBy, cmd = updateInput(m.FavBy, msg)
	cmds = append(cmds, cmd)
	m.PoolID, cmd = updateInput(m.PoolID, msg)
	cmds = append(cmds, cmd)
	m.ResultsPerPage, cmd = updateInput(m.ResultsPerPage, msg)
	cmds = append(cmds, cmd)
	m.MaxDownloads, cmd = updateInput(m.MaxDownloads, msg)
	cmds = append(cmds, cmd)
	m.MaxActive, cmd = updateInput(m.MaxActive, msg)
	cmds = append(cmds, cmd)
	m.DownloadDir, cmd = updateInput(m.DownloadDir, msg)
	cmds = append(cmds, cmd)
	m.DownloadPath, cmd = updateInput(m.DownloadPath, msg)
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
		if !m.UseWatchingArtist {
			if c := m.fetchUsernameSuggestions(FieldArtistName, currentUserToken(q)); c != nil {
				cmds = append(cmds, c)
			} else {
				m.Suggestions = nil
			}
		} else {
			m.Suggestions = nil
		}
	}
	if q := m.FavBy.Value(); q != prevFav && m.ActiveField == FieldFavBy {
		if c := m.fetchUsernameSuggestions(FieldFavBy, currentUserToken(q)); c != nil {
			cmds = append(cmds, c)
		} else {
			m.Suggestions = nil
		}
	}
	m.persistSettingsIfChanged(prevPersistentSettings)

	return m, tea.Batch(cmds...)
}

func (m *Model) persistSettingsIfChanged(previous apptypes.AppSettings) {
	current := m.PersistentSettings()
	if samePersistentSettings(current, previous) || samePersistentSettings(current, m.SavedSettings) {
		return
	}
	if m.PersistSettings == nil {
		m.SavedSettings = current
		return
	}
	if err := m.PersistSettings(current); err != nil {
		log.Warn("failed to persist tui settings", "err", err)
		return
	}
	m.SavedSettings = current
}

func (m *Model) applySuggestion(value string) {
	switch m.SuggestionField {
	case FieldSearchWords:
		m.SearchWords.SetValue(value + " ")
		m.SearchWords.CursorEnd()
	case FieldArtistName:
		next := replaceCurrentUserToken(m.ArtistName.Value(), value)
		m.ArtistName.SetValue(next + ", ")
		m.ArtistName.CursorEnd()
	case FieldFavBy:
		next := replaceCurrentUserToken(m.FavBy.Value(), value)
		m.FavBy.SetValue(next + ", ")
		m.FavBy.CursorEnd()
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

		for _, id := range m.focusableZones() {
			if inBounds(id) {
				m.FocusIndex = m.focusIndexForZone(id)
				m.updateActiveField()
				m.focusActiveField()
				m.ensureFocusVisible()
				return m.triggerZone(id)
			}
		}

		return m, nil
	}

	m.HoveredZone = ""

	for i := range m.Suggestions {
		if hoverCheck(fmt.Sprintf("sug_%d", i)) {
			break
		}
	}

	if m.HoveredZone == "" {
		_ = hoverCheck("btn_update_open") || hoverCheck("btn_update_later") || hoverCheck("btn_update_skip") ||
			hoverCheck("btn_logout") || hoverCheck("btn_unread") || hoverCheck("search_words") || hoverCheck("artist_name") || hoverCheck("fav_by") || hoverCheck("pool_id") || hoverCheck("per_page") || hoverCheck("max_dl") || hoverCheck("max_active") || hoverCheck("download_dir") || hoverCheck("download_pattern") ||
			hoverCheck("btn_search_top") || hoverCheck("btn_search_bottom") ||
			hoverCheck("link_use_my_name_artist") || hoverCheck("link_use_my_watches_artist") || hoverCheck("link_use_my_name_fav") ||
			hoverCheck("rad_and") || hoverCheck("rad_or") || hoverCheck("rad_exact") ||
			hoverCheck("chk_keywords") || hoverCheck("chk_title") || hoverCheck("chk_desc") || hoverCheck("chk_md5") ||
			hoverCheck("chk_rate_gen") || hoverCheck("chk_rate_nudity") || hoverCheck("chk_rate_mildv") || hoverCheck("chk_rate_sex") || hoverCheck("chk_rate_strongv") ||
			hoverCheck("rad_type_any") || hoverCheck("chk_type_pic") || hoverCheck("chk_type_sketch") || hoverCheck("chk_type_picseries") || hoverCheck("chk_type_comic") || hoverCheck("chk_type_port") || hoverCheck("chk_type_swfanim") || hoverCheck("chk_type_swfint") || hoverCheck("chk_type_vidfeat") || hoverCheck("chk_type_vidanim") || hoverCheck("chk_type_musicsing") || hoverCheck("chk_type_musicalb") || hoverCheck("chk_type_writing") || hoverCheck("chk_type_char") || hoverCheck("chk_type_photo") ||
			hoverCheck("cycle_time") || hoverCheck("cycle_scraps") || hoverCheck("cycle_order") || hoverCheck("chk_dl_caption")
	}

	return m, nil
}

func (m *Model) triggerZone(id string) (tea.Model, tea.Cmd) {
	switch id {
	case "search_words":
		m.ActiveField = FieldSearchWords
		m.focusActiveField()
	case "artist_name":
		m.ActiveField = FieldArtistName
		m.focusActiveField()
	case "fav_by":
		m.ActiveField = FieldFavBy
		m.focusActiveField()
	case "pool_id":
		m.ActiveField = FieldPoolID
		m.focusActiveField()
	case "per_page":
		m.ActiveField = FieldResultsPerPage
		m.focusActiveField()
	case "max_dl":
		m.ActiveField = FieldMaxDownloads
		m.focusActiveField()
	case "max_active":
		m.ActiveField = FieldMaxActive
		m.focusActiveField()
	case "download_dir":
		m.ActiveField = FieldDownloadDirectory
		m.focusActiveField()
	case "download_pattern":
		m.ActiveField = FieldDownloadPattern
		m.focusActiveField()
	case "btn_logout":
		if m.User != nil {
			_ = m.User.Logout()
		}
		m.User = nil
		m.Username = ""
		m.NeedsLogin = true
		if err := os.Remove("sid.txt"); err != nil {
			log.Warn("failed to remove session file", "err", err)
		}
		return m, tea.Quit
	case "btn_search_top", "btn_search_bottom":
		return m, tea.Quit
	case "btn_update_open":
		if url := strings.TrimSpace(m.ReleaseStatus.ReleaseURL); url != "" {
			if err := browser.OpenURL(url); err != nil {
				log.Warn("failed to open release url", "err", err)
			}
		}
	case "btn_update_later":
		m.ShowUpdateNotice = false
		m.UpdateNoticeDismissed = true
	case "btn_update_skip":
		m.ShowUpdateNotice = false
		m.UpdateNoticeDismissed = true
		m.SkippedReleaseTag = m.ReleaseStatus.LatestTag
	case "btn_unread":
		if m.CanUseUnread {
			m.UnreadMode = !m.UnreadMode
		}
	case "link_use_my_name_artist":
		m.UseWatchingArtist = false
		m.ArtistName.SetValue(appendUniqueUserFilter(m.ArtistName.Value(), m.Username))
		m.ArtistName.CursorEnd()
	case "link_use_my_watches_artist":
		if m.CanUseWatching {
			m.UseWatchingArtist = !m.UseWatchingArtist
			m.Suggestions = nil
			m.SuggestionIndex = -1
		}
	case "link_use_my_name_fav":
		m.FavBy.SetValue(appendUniqueUserFilter(m.FavBy.Value(), m.Username))
		m.FavBy.CursorEnd()
	case "rad_and":
		m.StringJoinType = inkbunny.JoinTypeAnd
	case "rad_or":
		m.StringJoinType = inkbunny.JoinTypeOr
	case "rad_exact":
		m.StringJoinType = inkbunny.JoinTypeExact
	case "chk_keywords":
		m.SearchInKeywords = !m.SearchInKeywords
	case "chk_title":
		m.SearchInTitle = !m.SearchInTitle
	case "chk_desc":
		m.SearchInDesc = !m.SearchInDesc
	case "chk_md5":
		m.SearchInMD5 = !m.SearchInMD5
	case "chk_rate_gen":
		m.RatingGeneral = !m.RatingGeneral
	case "chk_rate_nudity":
		m.RatingNudity = !m.RatingNudity
	case "chk_rate_mildv":
		m.RatingMildViolence = !m.RatingMildViolence
	case "chk_rate_sex":
		m.RatingSexual = !m.RatingSexual
	case "chk_rate_strongv":
		m.RatingStrongViolence = !m.RatingStrongViolence
	case "rad_type_any":
		m.TypeAny = true
		m.clearTypes()
	case "chk_type_pic":
		m.TypePicture = !m.TypePicture
		m.TypeAny = false
	case "chk_type_sketch":
		m.TypeSketch = !m.TypeSketch
		m.TypeAny = false
	case "chk_type_picseries":
		m.TypePictureSeries = !m.TypePictureSeries
		m.TypeAny = false
	case "chk_type_comic":
		m.TypeComic = !m.TypeComic
		m.TypeAny = false
	case "chk_type_port":
		m.TypePortfolio = !m.TypePortfolio
		m.TypeAny = false
	case "chk_type_swfanim":
		m.TypeSWFAnimation = !m.TypeSWFAnimation
		m.TypeAny = false
	case "chk_type_swfint":
		m.TypeSWFInteract = !m.TypeSWFInteract
		m.TypeAny = false
	case "chk_type_vidfeat":
		m.TypeVideoFeature = !m.TypeVideoFeature
		m.TypeAny = false
	case "chk_type_vidanim":
		m.TypeVideoAnim = !m.TypeVideoAnim
		m.TypeAny = false
	case "chk_type_musicsing":
		m.TypeMusicSingle = !m.TypeMusicSingle
		m.TypeAny = false
	case "chk_type_musicalb":
		m.TypeMusicAlbum = !m.TypeMusicAlbum
		m.TypeAny = false
	case "chk_type_writing":
		m.TypeWriting = !m.TypeWriting
		m.TypeAny = false
	case "chk_type_char":
		m.TypeCharSheet = !m.TypeCharSheet
		m.TypeAny = false
	case "chk_type_photo":
		m.TypePhotography = !m.TypePhotography
		m.TypeAny = false
	case "cycle_time":
		m.TimeRangeIndex = (m.TimeRangeIndex + 1) % len(m.TimeRangeLabels)
	case "cycle_scraps":
		m.ScrapsIndex = (m.ScrapsIndex + 1) % len(m.ScrapsLabels)
	case "cycle_order":
		m.OrderByIndex = (m.OrderByIndex + 1) % len(m.OrderByLabels)
	case "chk_dl_caption":
		m.DownloadCaption = !m.DownloadCaption
	}
	return m, nil
}

func (m *Model) updateActiveField() {
	id := m.currentFocusZone()
	switch id {
	case "search_words":
		m.ActiveField = FieldSearchWords
	case "artist_name":
		m.ActiveField = FieldArtistName
	case "fav_by":
		m.ActiveField = FieldFavBy
	case "pool_id":
		m.ActiveField = FieldPoolID
	case "per_page":
		m.ActiveField = FieldResultsPerPage
	case "max_dl":
		m.ActiveField = FieldMaxDownloads
	case "max_active":
		m.ActiveField = FieldMaxActive
	case "download_dir":
		m.ActiveField = FieldDownloadDirectory
	case "download_pattern":
		m.ActiveField = FieldDownloadPattern
	default:
		m.ActiveField = FieldNone
	}
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
	case tea.PasteMsg:
		return teaV1.KeyMsg{
			Type:  teaV1.KeyRunes,
			Runes: []rune(msg.Content),
		}
	}
	return nil
}

func toV2Cmd(cmd teaV1.Cmd) tea.Cmd {
	return func() tea.Msg {
		return cmd()
	}
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
		case tea.KeyLeft:
			v1.Type = teaV1.KeyCtrlLeft
			return v1
		case tea.KeyRight:
			v1.Type = teaV1.KeyCtrlRight
			return v1
		case tea.KeyBackspace:
			// bubbles textinput binds word delete backward to alt+backspace.
			v1.Type = teaV1.KeyBackspace
			v1.Alt = true
			return v1
		case tea.KeyDelete:
			// bubbles textinput binds word delete forward to alt+delete.
			v1.Type = teaV1.KeyDelete
			v1.Alt = true
			return v1
		}
		switch msg.Code {
		case 'a':
			v1.Type = teaV1.KeyCtrlA
		case 'b':
			v1.Type = teaV1.KeyCtrlB
		case 'v':
			v1.Type = teaV1.KeyCtrlV
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
	m.PoolID.Blur()
	m.ResultsPerPage.Blur()
	m.MaxDownloads.Blur()
	m.MaxActive.Blur()
	m.DownloadDir.Blur()
	m.DownloadPath.Blur()

	switch m.ActiveField {
	case FieldSearchWords:
		m.SearchWords.Focus()
	case FieldArtistName:
		m.ArtistName.Focus()
	case FieldFavBy:
		m.FavBy.Focus()
	case FieldPoolID:
		m.PoolID.Focus()
	case FieldResultsPerPage:
		m.ResultsPerPage.Focus()
	case FieldMaxDownloads:
		m.MaxDownloads.Focus()
	case FieldMaxActive:
		m.MaxActive.Focus()
	case FieldDownloadDirectory:
		m.DownloadDir.Focus()
	case FieldDownloadPattern:
		m.DownloadPath.Focus()
	}
}
