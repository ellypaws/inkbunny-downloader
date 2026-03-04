package tui

import (
	tea "charm.land/bubbletea/v2"
	"github.com/charmbracelet/bubbles/textinput"
	teaV1 "github.com/charmbracelet/bubbletea"

	"github.com/ellypaws/inkbunny"
)

func (m Model) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	var cmd tea.Cmd
	var cmds []tea.Cmd

	switch msg := msg.(type) {
	case tea.KeyMsg:
		switch msg.String() {
		case "ctrl+c", "esc":
			return m, tea.Quit
		case "tab", "down":
			m.ActiveField++
			if m.ActiveField > FieldMaxDownloads {
				m.ActiveField = FieldSearchWords
			}
			m.focusActiveField()
			return m, nil
		case "shift+tab", "up":
			m.ActiveField--
			if m.ActiveField < FieldSearchWords {
				m.ActiveField = FieldMaxDownloads
			}
			m.focusActiveField()
			return m, nil
		case "enter":
			return m, tea.Quit // Submit
		}

	case tea.MouseMsg:
		res, c := m.handleMouse(msg)
		return res, c
	}

	// Update inputs
	m.SearchWords, cmd = updateInput(m.SearchWords, msg)
	cmds = append(cmds, cmd)
	m.ArtistName, cmd = updateInput(m.ArtistName, msg)
	cmds = append(cmds, cmd)
	m.FavBy, cmd = updateInput(m.FavBy, msg)
	cmds = append(cmds, cmd)
	m.MaxDownloads, cmd = updateInput(m.MaxDownloads, msg)
	cmds = append(cmds, cmd)

	return m, tea.Batch(cmds...)
}

func (m Model) handleMouse(msg tea.MouseMsg) (tea.Model, tea.Cmd) {
	v1msg := teaV1.MouseMsg{X: msg.Mouse().X, Y: msg.Mouse().Y}

	// Helper macros
	inBounds := func(id string) bool { return m.ZoneManager.Get(id).InBounds(v1msg) }
	hoverCheck := func(id string) bool {
		if inBounds(id) {
			m.HoveredZone = id
			return true
		}
		return false
	}

	if mRelease, ok := msg.(tea.MouseReleaseMsg); ok && mRelease.Button == tea.MouseLeft {
		// Inputs
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

		// Search button
		if inBounds("btn_search_top") || inBounds("btn_search_bottom") {
			return m, tea.Quit
		}

		// Global options
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

		// Ratings
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

		// Types
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

		// Cycles
		if inBounds("cycle_time") {
			m.TimeRangeIndex = (m.TimeRangeIndex + 1) % len(m.TimeRangeLabels)
		}
		if inBounds("cycle_order") {
			m.OrderByIndex = (m.OrderByIndex + 1) % len(m.OrderByLabels)
		}

		// Download options
		if inBounds("chk_dl_caption") {
			m.DownloadCaption = !m.DownloadCaption
		}

		return m, nil
	}

	if _, ok := msg.(tea.MouseMotionMsg); ok {
		m.HoveredZone = ""
		_ = hoverCheck("search_words") || hoverCheck("artist_name") || hoverCheck("fav_by") || hoverCheck("max_dl") ||
			hoverCheck("btn_search_top") || hoverCheck("btn_search_bottom") ||
			hoverCheck("rad_and") || hoverCheck("rad_or") || hoverCheck("rad_exact") ||
			hoverCheck("chk_keywords") || hoverCheck("chk_title") || hoverCheck("chk_desc") || hoverCheck("chk_md5") ||
			hoverCheck("chk_rate_gen") || hoverCheck("chk_rate_nudity") || hoverCheck("chk_rate_mildv") || hoverCheck("chk_rate_sex") || hoverCheck("chk_rate_strongv") ||
			hoverCheck("rad_type_any") || hoverCheck("chk_type_pic") || hoverCheck("chk_type_sketch") || hoverCheck("chk_type_picseries") || hoverCheck("chk_type_comic") || hoverCheck("chk_type_port") || hoverCheck("chk_type_swfanim") || hoverCheck("chk_type_swfint") || hoverCheck("chk_type_vidfeat") || hoverCheck("chk_type_vidanim") || hoverCheck("chk_type_musicsing") || hoverCheck("chk_type_musicalb") || hoverCheck("chk_type_writing") || hoverCheck("chk_type_char") || hoverCheck("chk_type_photo") ||
			hoverCheck("cycle_time") || hoverCheck("cycle_order") || hoverCheck("chk_dl_caption")
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
	model, c := in.Update(msg)
	if c == nil {
		return model, nil
	}
	cmd := func() tea.Msg {
		return c()
	}
	return model, cmd
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
