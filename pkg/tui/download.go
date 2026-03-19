package tui

import (
	"context"
	"crypto/md5"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync/atomic"
	"time"

	tea "charm.land/bubbletea/v2"
	"github.com/charmbracelet/bubbles/progress"
	"github.com/charmbracelet/bubbles/spinner"
	teaV1 "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"
	"github.com/charmbracelet/log"
	"github.com/charmbracelet/x/ansi"
	zone "github.com/lrstanley/bubblezone"

	"github.com/ellypaws/inkbunny"

	appdownloads "github.com/ellypaws/inkbunny/cmd/downloader/pkg/app/downloads"
	"github.com/ellypaws/inkbunny/cmd/downloader/pkg/utils"
)

type DownloadCompleteMsg struct {
	Item  *DownloadItem
	RunID int64
}

type DownloadErrorMsg struct {
	Item  *DownloadItem
	Err   error
	RunID int64
}

type RetryDownloadMsg struct {
	Item  *DownloadItem
	RunID int64
}

type DownloadCanceledMsg struct {
	Item  *DownloadItem
	RunID int64
}

type DownloadItem struct {
	SubmissionID string
	Title        string
	URL          string
	Username     string
	FileName     string
	FileMD5      string
	IsPublic     bool
	Metadata     appdownloads.SubmissionFileMetadata
	DownloadRoot string
	Destinations []string

	Written   atomic.Int64
	TotalSize atomic.Int64
	Progress  progress.Model
	Spinner   spinner.Model

	Status     DownloadStatus
	Error      error
	MD5Retries int
}

type DownloadStatus int

const (
	StatusQueued DownloadStatus = iota
	StatusActive
	StatusPaused
	StatusCompleted
	StatusFailed
)

type DownloadModel struct {
	Items     []*DownloadItem
	User      *inkbunny.User
	Client    *http.Client
	MaxActive int

	Width  int
	Height int

	Downloaded      int
	ToDownload      int
	DownloadCaption bool

	Aborted     bool
	Confirmed   bool
	Paused      bool
	HoveredZone string

	ScrollOffset  int
	HScrollOffset int
	contentWidth  int

	ZoneManager *zone.Manager
	runs        map[*DownloadItem]downloadRun
	nextRunID   int64
}

type downloadRun struct {
	id     int64
	cancel context.CancelFunc
}

func NewDownloadModel(user *inkbunny.User, items []*DownloadItem, maxActive int, toDownload int, caption bool) *DownloadModel {
	m := &DownloadModel{
		Items:           items,
		User:            user,
		Client:          &http.Client{Timeout: 5 * time.Minute},
		MaxActive:       maxActive,
		ToDownload:      toDownload,
		DownloadCaption: caption,
		ZoneManager:     zone.New(),
		runs:            make(map[*DownloadItem]downloadRun),
	}
	if m.MaxActive <= 0 {
		m.MaxActive = 4
	}

	for _, item := range m.Items {
		prog := progress.New(progress.WithDefaultGradient())
		item.Progress = prog
	}

	return m
}

func (m *DownloadModel) Init() tea.Cmd {
	return nil
}

func (m *DownloadModel) runFor(item *DownloadItem) (downloadRun, bool) {
	run, ok := m.runs[item]
	return run, ok
}

func (m *DownloadModel) clearRun(item *DownloadItem, runID int64) bool {
	run, ok := m.runs[item]
	if !ok || run.id != runID {
		return false
	}
	delete(m.runs, item)
	return true
}

func (m *DownloadModel) launchItem(item *DownloadItem) tea.Cmd {
	if item == nil {
		return nil
	}
	if run, ok := m.runs[item]; ok && run.cancel != nil {
		run.cancel()
	}
	m.nextRunID++
	runID := m.nextRunID
	ctx, cancel := context.WithCancel(context.Background())
	m.runs[item] = downloadRun{id: runID, cancel: cancel}
	item.Status = StatusActive
	item.Error = nil
	item.Written.Store(0)
	item.TotalSize.Store(0)
	return startDownloadCmd(item, m.User, m.Client, m.DownloadCaption, ctx, runID)
}

func (m *DownloadModel) activeCount() int {
	active := 0
	for _, item := range m.Items {
		if item.Status == StatusActive {
			active++
		}
	}
	return active
}

func (m *DownloadModel) startOrResumeDownloads() tea.Cmd {
	var cmds []tea.Cmd
	if m.activeCount() == 0 {
		cmds = append(cmds, func() tea.Msg { return spinner.TickMsg{Time: time.Now()} })
	}
	for _, item := range m.Items {
		if m.activeCount() >= m.MaxActive {
			break
		}
		if item.Status == StatusQueued {
			cmds = append(cmds, m.launchItem(item))
		}
	}
	return tea.Batch(cmds...)
}

func (m *DownloadModel) startDownloads() tea.Cmd {
	m.Confirmed = true
	m.Paused = false
	return m.startOrResumeDownloads()
}

func (m *DownloadModel) pauseAll() {
	m.Paused = true
	for _, item := range m.Items {
		if item.Status != StatusActive {
			continue
		}
		item.Status = StatusPaused
		if run, ok := m.runs[item]; ok && run.cancel != nil {
			run.cancel()
		}
	}
}

func (m *DownloadModel) resumeAll() tea.Cmd {
	m.Paused = false
	for _, item := range m.Items {
		if item.Status == StatusPaused {
			item.Status = StatusQueued
			item.Error = nil
		}
	}
	return m.startOrResumeDownloads()
}

func (m *DownloadModel) retryAll() tea.Cmd {
	for _, item := range m.Items {
		if item.Status == StatusFailed {
			item.Status = StatusQueued
			item.Error = nil
			item.Written.Store(0)
			item.TotalSize.Store(0)
		}
	}
	if m.Paused {
		return nil
	}
	return m.startOrResumeDownloads()
}

func (m *DownloadModel) stopAll() tea.Cmd {
	for _, run := range m.runs {
		if run.cancel != nil {
			run.cancel()
		}
	}
	m.Aborted = true
	return tea.Quit
}

func (m *DownloadModel) handleMouseRelease(v1msg teaV1.MouseMsg) (tea.Model, tea.Cmd) {
	if !m.Confirmed {
		if m.ZoneManager.Get("btn_start").InBounds(v1msg) {
			return m, m.startDownloads()
		}
		if m.ZoneManager.Get("btn_cancel").InBounds(v1msg) {
			m.Aborted = true
			return m, tea.Quit
		}
		return m, nil
	}

	if m.ZoneManager.Get("btn_pause_resume").InBounds(v1msg) {
		if m.Paused {
			return m, m.resumeAll()
		}
		m.pauseAll()
		return m, nil
	}
	if m.ZoneManager.Get("btn_retry_all").InBounds(v1msg) {
		return m, m.retryAll()
	}
	if m.ZoneManager.Get("btn_stop_all").InBounds(v1msg) {
		return m, m.stopAll()
	}
	return m, nil
}

func (m *DownloadModel) handleMouseMove(v1msg teaV1.MouseMsg) {
	inBounds := func(id string) bool { return m.ZoneManager.Get(id).InBounds(v1msg) }
	m.HoveredZone = ""

	if !m.Confirmed {
		if inBounds("btn_start") {
			m.HoveredZone = "btn_start"
			return
		}
		if inBounds("btn_cancel") {
			m.HoveredZone = "btn_cancel"
		}
		return
	}

	if inBounds("btn_pause_resume") {
		m.HoveredZone = "btn_pause_resume"
		return
	}
	if inBounds("btn_retry_all") {
		m.HoveredZone = "btn_retry_all"
		return
	}
	if inBounds("btn_stop_all") {
		m.HoveredZone = "btn_stop_all"
	}
}

func (m *DownloadModel) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	var cmds []tea.Cmd
	switch msg := msg.(type) {
	case tea.WindowSizeMsg:
		m.Width = msg.Width
		m.Height = msg.Height
		return m, nil

	case tea.KeyPressMsg:
		switch msg.String() {
		case "ctrl+c", "q", "esc":
			if m.Confirmed {
				return m, m.stopAll()
			}
			m.Aborted = true
			return m, tea.Quit
		case "enter":
			if !m.Confirmed {
				return m, m.startDownloads()
			}
		case "p":
			if m.Confirmed {
				if m.Paused {
					return m, m.resumeAll()
				}
				m.pauseAll()
				return m, nil
			}
		case "r":
			if m.Confirmed {
				return m, m.retryAll()
			}
		case "s":
			if m.Confirmed {
				return m, m.stopAll()
			}
		case "up", "k":
			if !m.Confirmed && m.ScrollOffset > 0 {
				m.ScrollOffset--
			}
		case "down", "j":
			if !m.Confirmed && m.ScrollOffset < len(m.Items)-1 {
				m.ScrollOffset++
			}
		case "left", "h":
			if m.HScrollOffset > 0 {
				m.HScrollOffset--
			}
		case "right", "l":
			m.HScrollOffset++
			m.clampHScroll()
		case "pgup":
			if !m.Confirmed {
				m.ScrollOffset -= m.Height / 2
				if m.ScrollOffset < 0 {
					m.ScrollOffset = 0
				}
			}
		case "pgdown":
			if !m.Confirmed {
				m.ScrollOffset += m.Height / 2
				if m.ScrollOffset >= len(m.Items) {
					m.ScrollOffset = len(m.Items) - 1
				}
			}
		}

	case spinner.TickMsg:
		var willTick bool
		return m, tea.Tick(100*time.Millisecond, func(t time.Time) tea.Msg {
			for i, item := range m.Items {
				if item.Status == StatusActive {
					model, _ := m.Items[i].Spinner.Update(msg)
					m.Items[i].Spinner = model
					willTick = true
				}
			}
			if !willTick {
				return nil
			}

			return spinner.TickMsg{Time: t}
		})

	case DownloadCompleteMsg:
		if !m.clearRun(msg.Item, msg.RunID) {
			return m, nil
		}
		msg.Item.Status = StatusCompleted
		msg.Item.Error = nil
		m.Downloaded++
		if !m.Paused {
			cmds = append(cmds, m.startNextDownload())
		}
		if m.isDone() {
			return m, tea.Quit
		}

	case DownloadErrorMsg:
		if !m.clearRun(msg.Item, msg.RunID) {
			return m, nil
		}
		msg.Item.Status = StatusFailed
		msg.Item.Error = msg.Err
		if !m.Paused {
			cmds = append(cmds, m.startNextDownload())
		}
		if m.isDone() {
			return m, tea.Quit
		}

	case RetryDownloadMsg:
		if !m.clearRun(msg.Item, msg.RunID) {
			return m, nil
		}
		if m.Paused || msg.Item.Status != StatusActive {
			return m, nil
		}
		cmds = append(cmds, m.launchItem(msg.Item))

	case DownloadCanceledMsg:
		if !m.clearRun(msg.Item, msg.RunID) {
			return m, nil
		}
		if msg.Item.Status == StatusPaused {
			return m, nil
		}
		if msg.Item.Status == StatusActive {
			msg.Item.Status = StatusQueued
			msg.Item.Written.Store(0)
			msg.Item.TotalSize.Store(0)
		}

	case tea.MouseWheelMsg:
		if msg.Mouse().Button == tea.MouseWheelUp {
			if !m.Confirmed && m.ScrollOffset > 0 {
				m.ScrollOffset--
			}
		} else if msg.Mouse().Button == tea.MouseWheelDown {
			if !m.Confirmed && m.ScrollOffset < len(m.Items)-1 {
				m.ScrollOffset++
			}
		} else if msg.Mouse().Button == tea.MouseWheelLeft {
			if m.HScrollOffset > 0 {
				m.HScrollOffset--
			}
		} else if msg.Mouse().Button == tea.MouseWheelRight {
			m.HScrollOffset++
			m.clampHScroll()
		}

	case teaV1.MouseMsg:
		v1msg := msg
		if v1msg.Type == teaV1.MouseWheelUp {
			if !m.Confirmed && m.ScrollOffset > 0 {
				m.ScrollOffset--
			}
		} else if v1msg.Type == teaV1.MouseWheelDown {
			if !m.Confirmed && m.ScrollOffset < len(m.Items)-1 {
				m.ScrollOffset++
			}
		} else if v1msg.Type == teaV1.MouseRelease && v1msg.Button == teaV1.MouseButtonLeft {
			return m.handleMouseRelease(v1msg)
		} else {
			m.handleMouseMove(v1msg)
		}

	case tea.MouseMsg:
		v1msg := teaV1.MouseMsg{X: msg.Mouse().X, Y: msg.Mouse().Y}
		if mRelease, ok := msg.(tea.MouseReleaseMsg); ok && mRelease.Button == tea.MouseLeft {
			return m.handleMouseRelease(v1msg)
		}
		m.handleMouseMove(v1msg)
	}

	return m, tea.Batch(cmds...)
}

func (m *DownloadModel) startNextDownload() tea.Cmd {
	if m.Paused {
		return nil
	}
	if m.ToDownload > 0 && m.Downloaded >= m.ToDownload {
		return tea.Quit // Done
	}

	activeCount := m.activeCount()
	if activeCount >= m.MaxActive {
		return nil
	}

	for _, item := range m.Items {
		if item.Status == StatusQueued {
			return tea.Batch(
				func() tea.Msg { return spinner.TickMsg{Time: time.Now()} },
				m.launchItem(item),
			)
		}
	}
	return nil
}

func (m *DownloadModel) isDone() bool {
	if m.ToDownload > 0 && m.Downloaded >= m.ToDownload {
		return true
	}
	for _, item := range m.Items {
		if item.Status == StatusQueued || item.Status == StatusActive || item.Status == StatusPaused {
			return false
		}
	}
	return true
}

func (m *DownloadModel) clampHScroll() {
	maxH := max(m.contentWidth-m.Width, 0)
	if m.HScrollOffset > maxH {
		m.HScrollOffset = maxH
	}
	if m.HScrollOffset < 0 {
		m.HScrollOffset = 0
	}
}

func renderHScrollbar(trackWidth, contentWidth, offset int) string {
	if trackWidth <= 0 || contentWidth <= trackWidth {
		return ""
	}
	thumbSize := max(1, trackWidth*trackWidth/contentWidth)
	maxOffset := contentWidth - trackWidth
	thumbPos := 0
	if maxOffset > 0 {
		thumbPos = offset * (trackWidth - thumbSize) / maxOffset
	}

	thumbStyle := lipgloss.NewStyle().Foreground(lipgloss.Color("#E04080"))
	trackStyle := lipgloss.NewStyle().Foreground(lipgloss.Color("#6B6B6B"))

	var sb strings.Builder
	for i := range trackWidth {
		if i >= thumbPos && i < thumbPos+thumbSize {
			sb.WriteString(thumbStyle.Render("━"))
		} else {
			sb.WriteString(trackStyle.Render("─"))
		}
	}
	return sb.String()
}

func (m *DownloadModel) applyHorizontalViewport(content string) string {
	lines := strings.Split(content, "\n")

	maxW := 0
	for _, line := range lines {
		w := lipgloss.Width(line)
		if w > maxW {
			maxW = w
		}
	}
	m.contentWidth = maxW

	viewWidth := m.Width
	if viewWidth <= 0 {
		return content
	}

	if maxW <= viewWidth {
		m.HScrollOffset = 0
		return content
	}

	m.clampHScroll()

	for i, line := range lines {
		lines[i] = ansi.Cut(line, m.HScrollOffset, m.HScrollOffset+viewWidth)
	}

	scrollbar := renderHScrollbar(viewWidth, maxW, m.HScrollOffset)
	if scrollbar != "" {
		lines = append(lines, scrollbar)
	}

	return strings.Join(lines, "\n")
}

func truncateToWidth(value string, width int) string {
	if width <= 0 {
		return ""
	}
	if ansi.StringWidth(value) <= width {
		return lipgloss.NewStyle().Width(width).Render(value)
	}
	if width == 1 {
		return "…"
	}
	return lipgloss.NewStyle().Width(width).Render(ansi.Cut(value, 0, width-1) + "…")
}

func (m *DownloadModel) renderActionButton(id string, label string, fg lipgloss.Color, bg lipgloss.Color, hoverBg lipgloss.Color) string {
	style := lipgloss.NewStyle().
		Foreground(fg).
		Background(bg).
		Padding(0, 2).
		Bold(true)
	if m.HoveredZone == id {
		style = style.Background(hoverBg).Underline(true)
	}
	return m.ZoneManager.Mark(id, style.Render(label))
}

func newDownloadView(content string) tea.View {
	v := tea.NewView(content)
	v.AltScreen = true
	v.MouseMode = tea.MouseModeAllMotion
	return v
}

func (m *DownloadModel) View() tea.View {
	borderStyle := lipgloss.NewStyle().
		Border(lipgloss.RoundedBorder()).
		BorderForeground(lipgloss.Color("#5F7FFF")).
		Padding(0, 1)

	if m.Aborted {
		return newDownloadView(m.ZoneManager.Scan(borderStyle.Render("Aborted.")))
	}

	if !m.Confirmed {
		var out []string

		btnStart := m.renderActionButton("btn_start", "Start", lipgloss.Color("#FFFFFF"), lipgloss.Color("#5F7FFF"), lipgloss.Color("#E04080"))
		btnCancel := m.renderActionButton("btn_cancel", "Cancel", lipgloss.Color("#FFFFFF"), lipgloss.Color("#6B6B6B"), lipgloss.Color("#5F7FFF"))

		out = append(out, fmt.Sprintf("Ready to download %d files. Use %s or press ENTER. Use %s or press ESC.", len(m.Items), btnStart, btnCancel))
		out = append(out, "---")

		start := m.ScrollOffset
		end := start + (m.Height - 5)

		if m.Height == 0 {
			end = start + 10
		}
		if end-start > 256 {
			end = start + 256
		}
		if end > len(m.Items) {
			end = len(m.Items)
		}

		for i := start; i < end; i++ {
			out = append(out, fmt.Sprintf("%d. %s: %s", i+1, m.Items[i].Title, m.Items[i].FileName))
		}

		if end < len(m.Items) && end-start >= 256 {
			out = append(out, fmt.Sprintf("... and %d more (truncated to 256 lines)", len(m.Items)-end))
		} else if end < len(m.Items) {
			out = append(out, fmt.Sprintf("... %d more", len(m.Items)-end))
		}

		rendered := borderStyle.Render(strings.Join(out, "\n"))
		rendered = m.applyHorizontalViewport(rendered)
		return newDownloadView(m.ZoneManager.Scan(rendered))
	}

	contentWidth := max(m.Width-6, 40)
	statusWidth := 2
	nameWidth := min(32, max(contentWidth/4, 16))
	barWidth := max((contentWidth-statusWidth-nameWidth-2)/2, 5)

	var active []string
	var paused []string
	var queued []string
	var completed []string
	failedCount := 0

	for _, item := range m.Items {
		switch item.Status {
		case StatusActive:
			pct := 0.0
			total := item.TotalSize.Load()
			if total > 0 {
				pct = float64(item.Written.Load()) / float64(total)
			}
			item.Progress.Width = barWidth
			prog := item.Progress.ViewAs(pct)
			status := lipgloss.NewStyle().Width(statusWidth).Render(item.Spinner.View())
			name := truncateToWidth(item.FileName, nameWidth)
			line := lipgloss.JoinHorizontal(lipgloss.Top, status, " ", name, " ", prog)
			active = append(active, line)
		case StatusPaused:
			paused = append(paused, fmt.Sprintf("Ⅱ Paused: %s", item.FileName))
		case StatusQueued:
			queued = append(queued, fmt.Sprintf("  Queued: %s", item.FileName))
		case StatusCompleted:
			completed = append(completed, fmt.Sprintf("✓ Downloaded: %s", item.FileName))
		case StatusFailed:
			completed = append(completed, fmt.Sprintf("✗ Failed: %s (%v)", item.FileName, item.Error))
			failedCount++
		}
	}

	availableLines := m.Height - 4

	if availableLines < 5 {
		availableLines = 10
	}

	var out []string
	pauseLabel := "Pause All"
	if m.Paused {
		pauseLabel = "Resume All"
	}
	btnPauseResume := m.renderActionButton("btn_pause_resume", pauseLabel, lipgloss.Color("#FFFFFF"), lipgloss.Color("#7A4BFF"), lipgloss.Color("#E04080"))
	btnRetryAll := m.renderActionButton("btn_retry_all", "Retry All", lipgloss.Color("#FFFFFF"), lipgloss.Color("#2F6F4F"), lipgloss.Color("#5F7FFF"))
	btnStopAll := m.renderActionButton("btn_stop_all", "Stop All", lipgloss.Color("#FFFFFF"), lipgloss.Color("#A83A3A"), lipgloss.Color("#E04080"))
	stateLabel := "Running"
	if m.Paused {
		stateLabel = "Paused"
	}
	out = append(out, lipgloss.JoinHorizontal(lipgloss.Top, btnPauseResume, "  ", btnRetryAll, "  ", btnStopAll))
	out = append(out, fmt.Sprintf("State: %s | Completed: %d | Active: %d | Paused: %d | Queued: %d | Failed: %d", stateLabel, m.Downloaded, len(active), len(paused), len(queued), failedCount))
	out = append(out, "")
	availableLines -= 3

	if len(active) > 0 {
		out = append(out, active...)
		availableLines -= len(active) + 1
		out = append(out, "")
	}

	if len(paused) > 0 && availableLines > 0 {
		showCount := min(len(paused), availableLines/2)
		if showCount == 0 && availableLines > 0 {
			showCount = 1
		}
		out = append(out, paused[:showCount]...)
		availableLines -= showCount + 1
		out = append(out, "")
	}

	if len(completed) > 0 && availableLines > 0 {
		showCount := min(len(completed), availableLines/2)
		if showCount == 0 && availableLines > 0 {
			showCount = 1
		}
		out = append(out, completed[len(completed)-showCount:]...)
		availableLines -= showCount + 1
		out = append(out, "")
	}

	if len(queued) > 0 && availableLines > 0 {
		showCount := min(len(queued), availableLines)
		out = append(out, queued[:showCount]...)
		if len(queued) > showCount {
			out[len(out)-1] = fmt.Sprintf("  ... and %d more", len(queued)-showCount+1)
		}
	}

	rendered := borderStyle.Render(strings.Join(out, "\n"))
	rendered = m.applyHorizontalViewport(rendered)
	return newDownloadView(m.ZoneManager.Scan(rendered))
}

func startDownloadCmd(item *DownloadItem, user *inkbunny.User, client *http.Client, saveCaption bool, ctx context.Context, runID int64) tea.Cmd {
	return func() tea.Msg {
		destinations := uniqueNonEmptyPaths(item.Destinations)
		if len(destinations) == 0 {
			root := strings.TrimSpace(item.DownloadRoot)
			if root == "" {
				root = "Downloads"
			}
			destinations = []string{filepath.Join(root, item.Username, item.FileName)}
		}
		filename := destinations[0]
		if fileExists(filename) {
			item.Written.Store(item.TotalSize.Load())
			if err := ensureDownloadTargetsFromSource(filename, destinations); err != nil {
				return DownloadErrorMsg{Item: item, Err: err, RunID: runID}
			}
			if saveCaption {
				if err := appdownloads.WriteSubmissionMetadata(destinations, item.Metadata); err != nil {
					return DownloadErrorMsg{Item: item, Err: err, RunID: runID}
				}
			}
			return DownloadCompleteMsg{Item: item, RunID: runID}
		}

		err := os.MkdirAll(filepath.Dir(filename), os.ModePerm)
		if err != nil {
			return DownloadErrorMsg{Item: item, Err: err, RunID: runID}
		}

		var resp *http.Response
		url := utils.ResourceURL(item.URL, user.SID, item.IsPublic)
		sidURL := utils.AppendSID(item.URL, user.SID)

		req, err := http.NewRequestWithContext(ctx, "GET", url, nil)
		if err != nil {
			return DownloadErrorMsg{Item: item, Err: err, RunID: runID}
		}

		resp, err = client.Do(req)
		if err != nil {
			if errors.Is(err, context.Canceled) || errors.Is(ctx.Err(), context.Canceled) {
				return DownloadCanceledMsg{Item: item, RunID: runID}
			}
			return DownloadErrorMsg{Item: item, Err: err, RunID: runID}
		}

		if resp.StatusCode == http.StatusTooManyRequests {
			resp.Body.Close()
			log.Warn("Rate limited, pausing 5s before retrying...", "file", item.FileName)
			select {
			case <-ctx.Done():
				return DownloadCanceledMsg{Item: item, RunID: runID}
			case <-time.After(5 * time.Second):
			}
			return RetryDownloadMsg{Item: item, RunID: runID}
		}

		if resp.StatusCode != http.StatusOK {
			resp.Body.Close()
			if sidURL != "" && sidURL != url {
				item.URL = sidURL
				return RetryDownloadMsg{Item: item, RunID: runID}
			}
			return DownloadErrorMsg{Item: item, Err: fmt.Errorf("unexpected status: %d", resp.StatusCode), RunID: runID}
		}

		if resp.ContentLength > 0 {
			item.TotalSize.Store(resp.ContentLength)
		}

		f, err := os.Create(filename)
		if err != nil {
			resp.Body.Close()
			return DownloadErrorMsg{Item: item, Err: err, RunID: runID}
		}

		hasher := md5.New()
		writer := io.MultiWriter(f, hasher)

		buf := make([]byte, 32*1024)
		var written int64
		for {
			n, err := resp.Body.Read(buf)
			if n > 0 {
				nw, ew := writer.Write(buf[0:n])
				if nw > 0 {
					written += int64(nw)
					item.Written.Store(written)
				}
				if ew != nil {
					f.Close()
					resp.Body.Close()
					return DownloadErrorMsg{Item: item, Err: ew, RunID: runID}
				}
			}
			if err != nil {
				if err == io.EOF {
					break
				}
				f.Close()
				resp.Body.Close()
				if errors.Is(err, context.Canceled) || errors.Is(ctx.Err(), context.Canceled) {
					_ = os.Remove(filename)
					return DownloadCanceledMsg{Item: item, RunID: runID}
				}
				return DownloadErrorMsg{Item: item, Err: err, RunID: runID}
			}
		}

		f.Close()
		resp.Body.Close()

		hashStr := fmt.Sprintf("%x", hasher.Sum(nil))
		if item.FileMD5 != "" && hashStr != item.FileMD5 {
			if item.MD5Retries < 5 {
				item.MD5Retries++
				_ = os.Remove(filename)
				log.Warn("MD5 mismatch, retrying...", "file", item.FileName, "attempt", item.MD5Retries)
				return RetryDownloadMsg{Item: item, RunID: runID}
			}
			return DownloadErrorMsg{Item: item, Err: fmt.Errorf("MD5 mismatch: got %s, expected %s", hashStr, item.FileMD5), RunID: runID}
		}

		if err := ensureDownloadTargetsFromSource(filename, destinations); err != nil {
			return DownloadErrorMsg{Item: item, Err: err, RunID: runID}
		}
		if saveCaption {
			err := appdownloads.WriteSubmissionMetadata(destinations, item.Metadata)
			if err != nil {
				return DownloadErrorMsg{Item: item, Err: err, RunID: runID}
			}
		}

		return DownloadCompleteMsg{Item: item, RunID: runID}
	}
}

func uniqueNonEmptyPaths(paths []string) []string {
	seen := make(map[string]struct{}, len(paths))
	unique := make([]string, 0, len(paths))
	for _, path := range paths {
		clean := filepath.Clean(strings.TrimSpace(path))
		if clean == "." || clean == "" {
			continue
		}
		if _, ok := seen[clean]; ok {
			continue
		}
		seen[clean] = struct{}{}
		unique = append(unique, clean)
	}
	return unique
}

func ensureDownloadTargetsFromSource(source string, destinations []string) error {
	cleanSource := filepath.Clean(strings.TrimSpace(source))
	if cleanSource == "" {
		return nil
	}

	for _, destination := range uniqueNonEmptyPaths(destinations) {
		cleanDestination := filepath.Clean(destination)
		if cleanDestination == cleanSource {
			continue
		}
		if err := os.MkdirAll(filepath.Dir(cleanDestination), 0o755); err != nil {
			return err
		}
		if err := copyFile(cleanSource, cleanDestination); err != nil {
			return err
		}
	}
	return nil
}

func copyFile(source, destination string) error {
	in, err := os.Open(source)
	if err != nil {
		return err
	}
	defer in.Close()

	out, err := os.Create(destination)
	if err != nil {
		return err
	}
	defer func() {
		_ = out.Close()
	}()

	if _, err := io.Copy(out, in); err != nil {
		return err
	}
	return out.Sync()
}

func fileExists(path string) bool {
	_, err := os.Stat(path)
	return err == nil
}
