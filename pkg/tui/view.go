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
	baseStyle = lipgloss.NewStyle().Padding(1, 2)

	activeColor   = lipgloss.Color("205") // Pink (Active)
	hoverColor    = lipgloss.Color("63")  // Blue (Hover)
	inactiveColor = lipgloss.Color("240") // Gray (Inactive)
	textColor     = lipgloss.Color("252") // White

	inputActiveStyle   = lipgloss.NewStyle().Border(lipgloss.RoundedBorder()).BorderForeground(activeColor).Padding(0, 1)
	inputInactiveStyle = lipgloss.NewStyle().Border(lipgloss.RoundedBorder()).BorderForeground(inactiveColor).Padding(0, 1)
	inputHoverStyle    = lipgloss.NewStyle().Border(lipgloss.RoundedBorder()).BorderForeground(hoverColor).Padding(0, 1)

	labelStyle = lipgloss.NewStyle().Foreground(textColor).Width(20)

	checkboxStyle       = lipgloss.NewStyle().Foreground(textColor)
	activeCheckboxStyle = lipgloss.NewStyle().Foreground(activeColor).Bold(true)
	hoverCheckboxStyle  = lipgloss.NewStyle().Foreground(hoverColor)

	buttonStyle       = lipgloss.NewStyle().Foreground(lipgloss.Color("230")).Background(lipgloss.Color("240")).Padding(0, 2)
	activeButtonStyle = buttonStyle.Copy().Background(activeColor)
	hoverButtonStyle  = buttonStyle.Copy().Background(hoverColor)

	dividerStyle = lipgloss.NewStyle().Foreground(inactiveColor).Margin(1, 0)
)

func (m Model) View() tea.View {
	var sections []string

	sections = append(sections, m.renderTopSection())
	sections = append(sections, dividerStyle.Render(strings.Repeat("─", 80)))
	sections = append(sections, m.renderMiddleSection())
	sections = append(sections, dividerStyle.Render(strings.Repeat("─", 80)))
	sections = append(sections, m.renderBottomSection())
	sections = append(sections, dividerStyle.Render(strings.Repeat("─", 80)))
	sections = append(sections, m.renderFooterSection())

	rendered := lipgloss.JoinVertical(lipgloss.Left, sections...)

	v := tea.NewView(baseStyle.Render(rendered))
	v.AltScreen = true
	v.MouseMode = tea.MouseModeCellMotion
	return v
}

func (m Model) renderTopSection() string {

	// Row 1: Search words input + Search button
	inputBox := m.renderInput("search_words", m.SearchWords, FieldSearchWords)
	searchBtn := m.renderButton("btn_search_top", "Search")
	row1 := lipgloss.JoinHorizontal(lipgloss.Top, labelStyle.Render("Search words:"), inputBox, "  ", searchBtn)

	// Row 2: Find radio buttons
	findLabel := labelStyle.Render("Find:")
	r1 := m.renderRadio("rad_and", m.StringJoinType == inkbunny.JoinTypeAnd, "Find all the words together")
	r2 := m.renderRadio("rad_or", m.StringJoinType == inkbunny.JoinTypeOr, "Find any one of the words")
	r3 := m.renderRadio("rad_exact", m.StringJoinType == inkbunny.JoinTypeExact, "Contains the exact phrase")
	row2 := lipgloss.JoinHorizontal(lipgloss.Top, findLabel, r1, "  ", r2, "  ", r3)

	// Row 3: Search in checkboxes
	searchInLabel := labelStyle.Render("Search in:")
	c1 := m.renderCheckbox("chk_keywords", m.SearchInKeywords, "Keywords")
	c2 := m.renderCheckbox("chk_title", m.SearchInTitle, "Title")
	c3 := m.renderCheckbox("chk_desc", m.SearchInDesc, "Description or Story")
	c4 := m.renderCheckbox("chk_md5", m.SearchInMD5, "MD5 Hash")
	row3 := lipgloss.JoinHorizontal(lipgloss.Top, searchInLabel, c1, "  ", c2, "  ", c3, "  ", c4)

	return lipgloss.JoinVertical(lipgloss.Left, row1, "", row2, "", row3)
}

func (m Model) renderMiddleSection() string {
	artistLabel := labelStyle.Render("Artist name:\nsearch only submissions by\nthis user")
	artistInput := m.renderInput("artist_name", m.ArtistName, FieldArtistName)
	artistCol := lipgloss.JoinVertical(lipgloss.Left, artistLabel, artistInput)

	favLabel := labelStyle.Render("Search favorites by:\nsearch only work favorited\nby this user")
	favInput := m.renderInput("fav_by", m.FavBy, FieldFavBy)
	favCol := lipgloss.JoinVertical(lipgloss.Left, favLabel, favInput)

	return lipgloss.JoinHorizontal(lipgloss.Top, artistCol, "    ", favCol)
}

func (m Model) renderBottomSection() string {
	// Left column: Time Range & Ratings
	timeLabel := labelStyle.Render("Time Range:")
	timeCycle := m.renderCycle("cycle_time", m.TimeRangeLabels[m.TimeRangeIndex])
	timeBlock := lipgloss.JoinHorizontal(lipgloss.Top, timeLabel, timeCycle)

	rateLabel := labelStyle.Render("Find Content Rated:")
	r1 := m.renderCheckbox("chk_rate_gen", m.RatingGeneral, "General")
	r2 := m.renderCheckbox("chk_rate_nudity", m.RatingNudity, "Mature - Nudity")
	r3 := m.renderCheckbox("chk_rate_mildv", m.RatingMildViolence, "Mature - Violence")
	r4 := m.renderCheckbox("chk_rate_sex", m.RatingSexual, "Adult - Sexual Themes")
	r5 := m.renderCheckbox("chk_rate_strongv", m.RatingStrongViolence, "Adult - Strong Violence")
	rateBlock := lipgloss.JoinVertical(lipgloss.Left, rateLabel, "", r1, r2, r3, r4, r5)

	leftCol := lipgloss.JoinVertical(lipgloss.Left, timeBlock, "", rateBlock)

	// Right column: Submission Type
	typeLabel := labelStyle.Render("Submission type:")
	radAny := m.renderRadio("rad_type_any", m.TypeAny, "Any")

	col1 := lipgloss.JoinVertical(lipgloss.Left,
		m.renderCheckbox("chk_type_pic", m.TypePicture, "Picture/Pinup"),
		m.renderCheckbox("chk_type_sketch", m.TypeSketch, "Sketch"),
		m.renderCheckbox("chk_type_picseries", m.TypePictureSeries, "Picture Series"),
		m.renderCheckbox("chk_type_comic", m.TypeComic, "Comic"),
		m.renderCheckbox("chk_type_port", m.TypePortfolio, "Portfolio"),
		m.renderCheckbox("chk_type_swfanim", m.TypeSWFAnimation, "Shockwave/Flash - Animation"),
		m.renderCheckbox("chk_type_swfint", m.TypeSWFInteract, "Shockwave/Flash - Interactive"),
	)
	col2 := lipgloss.JoinVertical(lipgloss.Left,
		m.renderCheckbox("chk_type_vidfeat", m.TypeVideoFeature, "Video - Feature Length"),
		m.renderCheckbox("chk_type_vidanim", m.TypeVideoAnim, "Video - Animation/3D/CGI"),
		m.renderCheckbox("chk_type_musicsing", m.TypeMusicSingle, "Music - Single Track"),
		m.renderCheckbox("chk_type_musicalb", m.TypeMusicAlbum, "Music - Album"),
		m.renderCheckbox("chk_type_writing", m.TypeWriting, "Writing - Document"),
		m.renderCheckbox("chk_type_char", m.TypeCharSheet, "Character Sheet"),
		m.renderCheckbox("chk_type_photo", m.TypePhotography, "Photography"),
	)
	typesBlock := lipgloss.JoinHorizontal(lipgloss.Top, col1, "  ", col2)

	rightCol := lipgloss.JoinVertical(lipgloss.Left, typeLabel, radAny, "  or", typesBlock)

	return lipgloss.JoinHorizontal(lipgloss.Top, leftCol, "        ", rightCol)
}

func (m Model) renderFooterSection() string {
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

// GUI Primitives
func (m Model) renderInput(id string, in textinput.Model, field activeField) string {
	style := inputInactiveStyle
	if m.ActiveField == field {
		style = inputActiveStyle
	} else if m.HoveredZone == id {
		style = inputHoverStyle
	}
	return m.ZoneManager.Mark(id, style.Render(in.View()))
}

func (m Model) renderCheckbox(id string, checked bool, label string) string {
	style := checkboxStyle
	if m.HoveredZone == id {
		style = hoverCheckboxStyle
	}
	mark := " "
	if checked {
		mark = "x"
	}
	return m.ZoneManager.Mark(id, style.Render(fmt.Sprintf("[%s] %s", mark, label)))
}

func (m Model) renderRadio(id string, checked bool, label string) string {
	style := checkboxStyle
	if m.HoveredZone == id {
		style = hoverCheckboxStyle
	}
	mark := " "
	if checked {
		mark = "o"
	}
	return m.ZoneManager.Mark(id, style.Render(fmt.Sprintf("(%s) %s", mark, label)))
}

func (m Model) renderButton(id string, label string) string {
	style := buttonStyle
	if m.HoveredZone == id {
		style = hoverButtonStyle
	}
	return m.ZoneManager.Mark(id, style.Render(label))
}

func (m Model) renderCycle(id string, label string) string {
	style := buttonStyle
	if m.HoveredZone == id {
		style = hoverButtonStyle
	}
	return m.ZoneManager.Mark(id, style.Render(fmt.Sprintf("< %s >", label)))
}
