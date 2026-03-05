package tui

import (
	"fmt"
	"strings"

	tea "charm.land/bubbletea/v2"
	"github.com/charmbracelet/bubbles/textinput"
	"github.com/charmbracelet/lipgloss"

	"github.com/ellypaws/inkbunny"
)

var (
	activeColor   = lipgloss.Color("#E04080")
	hoverColor    = lipgloss.Color("#5F7FFF")
	inactiveColor = lipgloss.Color("#6B6B6B")
	textColor     = lipgloss.Color("#E0E0E0")
	dimTextColor  = lipgloss.Color("#888888")
	panelBg       = lipgloss.Color("#2A2A2A")
	sectionBg     = lipgloss.Color("#1E1E1E")

	panelStyle = lipgloss.NewStyle().
			Background(panelBg).
			Padding(1, 2).
			MarginBottom(1)

	inputActiveStyle   = lipgloss.NewStyle().Border(lipgloss.RoundedBorder()).BorderForeground(activeColor).Padding(0, 1)
	inputInactiveStyle = lipgloss.NewStyle().Border(lipgloss.RoundedBorder()).BorderForeground(inactiveColor).Padding(0, 1)
	inputHoverStyle    = lipgloss.NewStyle().Border(lipgloss.RoundedBorder()).BorderForeground(hoverColor).Padding(0, 1)

	labelStyle    = lipgloss.NewStyle().Foreground(textColor).Width(22).Align(lipgloss.Right).MarginRight(1)
	subLabelStyle = lipgloss.NewStyle().Foreground(dimTextColor).Width(22).Align(lipgloss.Right).MarginRight(1)

	checkboxStyle       = lipgloss.NewStyle().Foreground(textColor)
	activeCheckboxStyle = lipgloss.NewStyle().Foreground(activeColor).Bold(true)
	hoverCheckboxStyle  = lipgloss.NewStyle().Foreground(hoverColor)

	buttonStyle      = lipgloss.NewStyle().Foreground(lipgloss.Color("#FFFFFF")).Background(lipgloss.Color("#444444")).Padding(0, 3).Bold(true)
	hoverButtonStyle = buttonStyle.Background(hoverColor)

	linkStyle      = lipgloss.NewStyle().Foreground(hoverColor).Underline(true)
	linkHoverStyle = lipgloss.NewStyle().Foreground(activeColor).Underline(true)

	helperTextStyle = lipgloss.NewStyle().Foreground(dimTextColor).MarginLeft(23)

	sugStyle       = lipgloss.NewStyle().Foreground(textColor).PaddingLeft(1).PaddingRight(1)
	sugHoverStyle  = lipgloss.NewStyle().Foreground(lipgloss.Color("#FFFFFF")).Background(hoverColor).PaddingLeft(1).PaddingRight(1)
	sugActiveStyle = lipgloss.NewStyle().Foreground(lipgloss.Color("#FFFFFF")).Background(activeColor).PaddingLeft(1).PaddingRight(1)
	sugBoxStyle    = lipgloss.NewStyle().Border(lipgloss.RoundedBorder()).BorderForeground(inactiveColor).MarginLeft(23)
)

func (m *Model) View() tea.View {
	var sections []string

	sections = append(sections, m.renderUserBar())
	sections = append(sections, panelStyle.Render(m.renderTopSection()))
	sections = append(sections, panelStyle.Render(m.renderMiddleSection()))
	sections = append(sections, panelStyle.Render(m.renderBottomSection()))
	sections = append(sections, panelStyle.Render(m.renderFooterSection()))

	rendered := lipgloss.JoinVertical(lipgloss.Left, sections...)

	outer := lipgloss.NewStyle().Background(sectionBg).Padding(1, 2)
	full := outer.Render(rendered)

	lines := strings.Split(full, "\n")
	m.contentLines = len(lines)
	m.clampScroll()

	height := m.Height
	if height <= 0 {
		height = len(lines)
	}

	start := m.ScrollOffset
	if start > len(lines) {
		start = len(lines)
	}
	end := start + height
	if end > len(lines) {
		end = len(lines)
	}

	visible := lines[start:end]

	if m.contentLines > height && height > 0 {
		trackHeight := height
		thumbSize := max(1, trackHeight*height/m.contentLines)
		maxOffset := m.contentLines - height
		thumbPos := 0
		if maxOffset > 0 {
			thumbPos = m.ScrollOffset * (trackHeight - thumbSize) / maxOffset
		}

		thumbStyle := lipgloss.NewStyle().Foreground(activeColor)
		trackStyle := lipgloss.NewStyle().Foreground(inactiveColor)

		for i := range visible {
			gutter := trackStyle.Render("│")
			if i >= thumbPos && i < thumbPos+thumbSize {
				gutter = thumbStyle.Render("┃")
			}
			visible[i] = visible[i] + " " + gutter
		}
	}

	content := strings.Join(visible, "\n")
	content = m.ZoneManager.Scan(content)

	v := tea.NewView(content)
	v.AltScreen = true
	v.MouseMode = tea.MouseModeAllMotion
	return v
}

func (m *Model) renderTopSection() string {
	inputBox := m.renderInput("search_words", m.SearchWords, FieldSearchWords)
	searchBtn := m.renderButton("btn_search_top", "Search")
	row1 := lipgloss.JoinHorizontal(lipgloss.Top,
		labelStyle.Render("Search words:"),
		inputBox,
		"  ",
		searchBtn,
	)

	helper := helperTextStyle.Render(
		"Separate words with spaces.\n" +
			"Use '-' to exclude a keyword, e.g. 'leopard -snow' excludes 'snow leopard'.\n" +
			"Don't use other punctuation, or words such as 'and', 'or', 'not'.",
	)

	var sugBlock string
	if len(m.Suggestions) > 0 && m.SuggestionField == FieldSearchWords && m.ActiveField == FieldSearchWords {
		sugBlock = m.renderSuggestions()
	}

	findLabel := labelStyle.Render("Find:")
	r1 := m.renderRadio("rad_and", m.StringJoinType == inkbunny.JoinTypeAnd, "Find all the words together")
	r2 := m.renderRadio("rad_or", m.StringJoinType == inkbunny.JoinTypeOr, "Find any one of the words")
	r3 := m.renderRadio("rad_exact", m.StringJoinType == inkbunny.JoinTypeExact, "Contains the exact phrase")
	row2 := lipgloss.JoinHorizontal(lipgloss.Top, findLabel, r1, "   ", r2, "   ", r3)

	searchInLabel := labelStyle.Render("Search in:")
	c1 := m.renderCheckbox("chk_keywords", m.SearchInKeywords, "Keywords")
	c2 := m.renderCheckbox("chk_title", m.SearchInTitle, "Title")
	c3 := m.renderCheckbox("chk_desc", m.SearchInDesc, "Description or Story")
	c4 := m.renderCheckbox("chk_md5", m.SearchInMD5, "MD5 Hash")
	row3 := lipgloss.JoinHorizontal(lipgloss.Top, searchInLabel, c1, "   ", c2, "   ", c3, "   ", c4)

	parts := []string{row1, helper}
	if sugBlock != "" {
		parts = append(parts, sugBlock)
	}
	parts = append(parts, "", row2, "", row3)
	return lipgloss.JoinVertical(lipgloss.Left, parts...)
}

func (m *Model) renderMiddleSection() string {
	artistLabel := labelStyle.Render("Artist name:")
	artistSub := subLabelStyle.Render("search only submissions by\nthis user (optional)")
	artistInput := m.renderInput("artist_name", m.ArtistName, FieldArtistName)
	artistLink := m.renderLink("link_use_my_name_artist", "Use my name", "(Search my uploads only)")

	var artistSugBlock string
	if len(m.Suggestions) > 0 && m.SuggestionField == FieldArtistName && m.ActiveField == FieldArtistName {
		artistSugBlock = m.renderSuggestions()
	}

	artistParts := []string{
		lipgloss.JoinHorizontal(lipgloss.Top, artistLabel, artistInput),
		lipgloss.JoinHorizontal(lipgloss.Top, subLabelStyle.Render(""), artistLink),
	}
	if artistSugBlock != "" {
		artistParts = append(artistParts, artistSugBlock)
	}
	artistParts = append(artistParts, artistSub)
	artistCol := lipgloss.JoinVertical(lipgloss.Left, artistParts...)

	favLabel := labelStyle.Render("Search favorites by:")
	favSub := subLabelStyle.Render("search only work favorited\nby this user (optional)")
	favInput := m.renderInput("fav_by", m.FavBy, FieldFavBy)
	favLink := m.renderLink("link_use_my_name_fav", "Use my name", "(Search my favorites only)")

	var favSugBlock string
	if len(m.Suggestions) > 0 && m.SuggestionField == FieldFavBy && m.ActiveField == FieldFavBy {
		favSugBlock = m.renderSuggestions()
	}

	favParts := []string{
		lipgloss.JoinHorizontal(lipgloss.Top, favLabel, favInput),
		lipgloss.JoinHorizontal(lipgloss.Top, subLabelStyle.Render(""), favLink),
	}
	if favSugBlock != "" {
		favParts = append(favParts, favSugBlock)
	}
	favParts = append(favParts, favSub)
	favCol := lipgloss.JoinVertical(lipgloss.Left, favParts...)

	return lipgloss.JoinHorizontal(lipgloss.Top, artistCol, "      ", favCol)
}

func (m *Model) renderBottomSection() string {
	timeLabel := labelStyle.Render("Time Range:")
	timeCycle := m.renderCycle("cycle_time", m.TimeRangeLabels[m.TimeRangeIndex])
	timeBlock := lipgloss.JoinHorizontal(lipgloss.Top, timeLabel, timeCycle)

	rateLabel := labelStyle.Render("Find Content Rated:")
	rateSub := subLabelStyle.Render("select at least one")
	r1 := m.renderCheckbox("chk_rate_gen", m.RatingGeneral, "General")
	r2 := m.renderCheckbox("chk_rate_nudity", m.RatingNudity, "Mature - Nudity")
	r3 := m.renderCheckbox("chk_rate_mildv", m.RatingMildViolence, "Mature - Violence")
	r4 := m.renderCheckbox("chk_rate_sex", m.RatingSexual, "Adult - Sexual Themes")
	r5 := m.renderCheckbox("chk_rate_strongv", m.RatingStrongViolence, "Adult - Strong Violence")
	rateBlock := lipgloss.JoinVertical(lipgloss.Left, rateLabel, rateSub, "", r1, r2, r3, r4, r5)

	leftCol := lipgloss.JoinVertical(lipgloss.Left, timeBlock, "", rateBlock)

	typeLabel := labelStyle.Render("Submission type:")
	radAny := m.renderRadio("rad_type_any", m.TypeAny, "Any")
	orText := lipgloss.NewStyle().Foreground(dimTextColor).MarginLeft(24).Render("or")

	typeChecks := lipgloss.JoinVertical(lipgloss.Left,
		m.renderCheckbox("chk_type_pic", m.TypePicture, "Picture/Pinup"),
		m.renderCheckbox("chk_type_sketch", m.TypeSketch, "Sketch"),
		m.renderCheckbox("chk_type_picseries", m.TypePictureSeries, "Picture Series"),
		m.renderCheckbox("chk_type_comic", m.TypeComic, "Comic"),
		m.renderCheckbox("chk_type_port", m.TypePortfolio, "Portfolio"),
		m.renderCheckbox("chk_type_swfanim", m.TypeSWFAnimation, "Shockwave/Flash - Animation"),
		m.renderCheckbox("chk_type_swfint", m.TypeSWFInteract, "Shockwave/Flash - Interactive"),
		m.renderCheckbox("chk_type_vidanim", m.TypeVideoAnim, "Video - Animation/3D/CGI"),
		m.renderCheckbox("chk_type_musicsing", m.TypeMusicSingle, "Music - Single Track"),
		m.renderCheckbox("chk_type_musicalb", m.TypeMusicAlbum, "Music - Album"),
		m.renderCheckbox("chk_type_vidfeat", m.TypeVideoFeature, "Video - Feature Length"),
		m.renderCheckbox("chk_type_writing", m.TypeWriting, "Writing - Document"),
		m.renderCheckbox("chk_type_char", m.TypeCharSheet, "Character Sheet"),
		m.renderCheckbox("chk_type_photo", m.TypePhotography, "Photography - Fursuit/Sculpture/Jewelry/etc"),
	)

	rightCol := lipgloss.JoinVertical(lipgloss.Left, typeLabel, radAny, orText, "", typeChecks)

	return lipgloss.JoinHorizontal(lipgloss.Top, leftCol, "          ", rightCol)
}

func (m *Model) renderFooterSection() string {
	orderLabel := labelStyle.Render("Order by:")
	orderCycle := m.renderCycle("cycle_order", m.OrderByLabels[m.OrderByIndex])
	orderBlock := lipgloss.JoinHorizontal(lipgloss.Top, orderLabel, orderCycle)

	dlMaxLabel := labelStyle.Render("Max downloads:")
	dlMaxInput := m.renderInput("max_dl", m.MaxDownloads, FieldMaxDownloads)
	dlMaxBlock := lipgloss.JoinHorizontal(lipgloss.Top, dlMaxLabel, dlMaxInput)

	dlCaptionLabel := labelStyle.Render("Download keywords:")
	dlCaptionCheckbox := m.renderCheckbox("chk_dl_caption", m.DownloadCaption, "Save as .txt")
	dlCaptionBlock := lipgloss.JoinHorizontal(lipgloss.Top, dlCaptionLabel, dlCaptionCheckbox)

	searchBtn := m.renderButton("btn_search_bottom", "Search")

	return lipgloss.JoinVertical(lipgloss.Left,
		orderBlock, "",
		dlMaxBlock, "",
		dlCaptionBlock, "",
		searchBtn,
	)
}

func max(a, b int) int {
	if a > b {
		return a
	}
	return b
}

func (m *Model) renderUserBar() string {
	name := m.Username
	if name == "" {
		name = "Guest"
	}

	userBox := lipgloss.NewStyle().
		Border(lipgloss.RoundedBorder()).
		BorderForeground(inactiveColor).
		Padding(0, 1).
		Foreground(activeColor).
		Bold(true).
		Render(name)

	logoutStyle := lipgloss.NewStyle().
		BorderForeground(inactiveColor).
		Padding(0, 1).
		Foreground(lipgloss.Color("#FFFFFF")).
		Background(lipgloss.Color("#444444")).
		Bold(true)
	if m.HoveredZone == "btn_logout" || FocusableZones[m.FocusIndex] == "btn_logout" {
		logoutStyle = logoutStyle.Background(hoverColor).BorderForeground(hoverColor)
	}
	caret := "  "
	if FocusableZones[m.FocusIndex] == "btn_logout" {
		caret = lipgloss.NewStyle().Foreground(activeColor).Bold(true).Render("> ")
	}
	logoutBtn := m.ZoneManager.Mark("btn_logout", caret+logoutStyle.Render("Logout"))

	bar := lipgloss.JoinHorizontal(lipgloss.Center, userBox, " ", logoutBtn)

	return lipgloss.JoinVertical(lipgloss.Left, bar)
}

func (m *Model) renderSuggestions() string {
	if len(m.Suggestions) == 0 {
		return ""
	}

	var items []string
	for i, s := range m.Suggestions {
		id := fmt.Sprintf("sug_%d", i)
		style := sugStyle
		prefix := "  "
		if i == m.SuggestionIndex {
			style = sugActiveStyle
			prefix = "> "
		} else if m.HoveredZone == id {
			style = sugHoverStyle
		}
		items = append(items, m.ZoneManager.Mark(id, style.Render(prefix+s)))
	}

	content := strings.Join(items, "\n")
	return sugBoxStyle.Render(content)
}

func (m *Model) renderInput(id string, in textinput.Model, field activeField) string {
	style := inputInactiveStyle
	if m.ActiveField == field {
		style = inputActiveStyle
	} else if m.HoveredZone == id || FocusableZones[m.FocusIndex] == id {
		style = inputHoverStyle
	}
	return m.ZoneManager.Mark(id, style.Render(in.View()))
}

func (m *Model) renderCheckbox(id string, checked bool, label string) string {
	style := checkboxStyle
	markStyle := checkboxStyle
	if m.HoveredZone == id || FocusableZones[m.FocusIndex] == id {
		style = hoverCheckboxStyle
		markStyle = hoverCheckboxStyle
	}
	mark := "☐"
	if checked {
		mark = "✓"
		markStyle = activeCheckboxStyle
	}
	caret := "  "
	if FocusableZones[m.FocusIndex] == id {
		caret = lipgloss.NewStyle().Foreground(activeColor).Bold(true).Render("> ")
	}
	return m.ZoneManager.Mark(id, caret+markStyle.Render(mark)+" "+style.Render(label))
}

func (m *Model) renderRadio(id string, checked bool, label string) string {
	style := checkboxStyle
	markStyle := checkboxStyle
	if m.HoveredZone == id || FocusableZones[m.FocusIndex] == id {
		style = hoverCheckboxStyle
		markStyle = hoverCheckboxStyle
	}
	mark := "○"
	if checked {
		mark = "●"
		markStyle = activeCheckboxStyle
	}
	caret := "  "
	if FocusableZones[m.FocusIndex] == id {
		caret = lipgloss.NewStyle().Foreground(activeColor).Bold(true).Render("> ")
	}
	return m.ZoneManager.Mark(id, caret+markStyle.Render(mark)+" "+style.Render(label))
}

func (m *Model) renderButton(id string, label string) string {
	style := buttonStyle
	if m.HoveredZone == id || FocusableZones[m.FocusIndex] == id {
		style = hoverButtonStyle
	}
	caret := "  "
	if FocusableZones[m.FocusIndex] == id {
		caret = lipgloss.NewStyle().Foreground(activeColor).Bold(true).Render("> ")
	}
	return m.ZoneManager.Mark(id, caret+style.Render(label))
}

func (m *Model) renderCycle(id string, label string) string {
	style := buttonStyle
	if m.HoveredZone == id || FocusableZones[m.FocusIndex] == id {
		style = hoverButtonStyle
	}
	caret := "  "
	if FocusableZones[m.FocusIndex] == id {
		caret = lipgloss.NewStyle().Foreground(activeColor).Bold(true).Render("> ")
	}
	return m.ZoneManager.Mark(id, caret+style.Render(fmt.Sprintf("◀ %s ▶", label)))
}

func (m *Model) renderLink(id string, text string, hint string) string {
	style := linkStyle
	if m.HoveredZone == id || FocusableZones[m.FocusIndex] == id {
		style = linkHoverStyle
	}
	caret := "  "
	if FocusableZones[m.FocusIndex] == id {
		caret = lipgloss.NewStyle().Foreground(activeColor).Bold(true).Render("> ")
	}
	return m.ZoneManager.Mark(id, caret+style.Render(text)) + " " + lipgloss.NewStyle().Foreground(dimTextColor).Render(hint)
}
