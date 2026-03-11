package tui

import (
	"crypto/md5"
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

	"github.com/ellypaws/inkbunny/cmd/downloader/pkg/utils"
)

type DownloadCompleteMsg struct {
	Item *DownloadItem
}

type DownloadErrorMsg struct {
	Item *DownloadItem
	Err  error
}

type RetryDownloadMsg struct {
	Item *DownloadItem
}

type DownloadItem struct {
	SubmissionID string
	Title        string
	URL          string
	Username     string
	FileName     string
	FileMD5      string
	IsPublic     bool
	Keywords     string

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

	Aborted   bool
	Confirmed bool

	ScrollOffset  int
	HScrollOffset int
	contentWidth  int

	ZoneManager *zone.Manager
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
			m.Aborted = true
			return m, tea.Quit
		case "enter":
			if !m.Confirmed {
				m.Confirmed = true
				activeCount := 0
				cmds = []tea.Cmd{func() tea.Msg { return spinner.TickMsg{Time: time.Now()} }}
				for _, item := range m.Items {
					if activeCount >= m.MaxActive {
						break
					}
					item.Status = StatusActive
					cmds = append(cmds, startDownloadCmd(item, m.User, m.Client, m.DownloadCaption))
					activeCount++
				}
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
		msg.Item.Status = StatusCompleted
		m.Downloaded++
		cmds = append(cmds, m.startNextDownload())
		if m.isDone() {
			return m, tea.Quit
		}

	case DownloadErrorMsg:
		msg.Item.Status = StatusFailed
		msg.Item.Error = msg.Err
		cmds = append(cmds, m.startNextDownload())
		if m.isDone() {
			return m, tea.Quit
		}

	case RetryDownloadMsg:
		msg.Item.Status = StatusActive
		cmds = append(cmds, startDownloadCmd(msg.Item, m.User, m.Client, m.DownloadCaption))

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
			if !m.Confirmed {
				if m.ZoneManager.Get("btn_confirm").InBounds(v1msg) {
					m.Confirmed = true
					var initCmds []tea.Cmd
					activeCount := 0
					for _, item := range m.Items {
						if activeCount >= m.MaxActive {
							break
						}
						item.Status = StatusActive
						initCmds = append(initCmds, startDownloadCmd(item, m.User, m.Client, m.DownloadCaption))
						activeCount++
					}
					cmds = append(cmds, initCmds...)
				}
				if m.ZoneManager.Get("btn_cancel").InBounds(v1msg) {
					m.Aborted = true
					return m, tea.Quit
				}
			}
		}

	case tea.MouseMsg:
		v1msg := teaV1.MouseMsg{X: msg.Mouse().X, Y: msg.Mouse().Y}
		if mRelease, ok := msg.(tea.MouseReleaseMsg); ok && mRelease.Button == tea.MouseLeft {
			if !m.Confirmed {
				if m.ZoneManager.Get("btn_confirm").InBounds(v1msg) {
					m.Confirmed = true
					var initCmds []tea.Cmd
					activeCount := 0
					for _, item := range m.Items {
						if activeCount >= m.MaxActive {
							break
						}
						item.Status = StatusActive
						initCmds = append(initCmds, startDownloadCmd(item, m.User, m.Client, m.DownloadCaption))
						activeCount++
					}
					cmds = append(cmds, initCmds...)
				}
				if m.ZoneManager.Get("btn_cancel").InBounds(v1msg) {
					m.Aborted = true
					return m, tea.Quit
				}
			}
		}
	}

	return m, tea.Batch(cmds...)
}

func (m *DownloadModel) startNextDownload() tea.Cmd {
	if m.ToDownload > 0 && m.Downloaded >= m.ToDownload {
		return tea.Quit // Done
	}

	activeCount := 0
	for _, item := range m.Items {
		if item.Status == StatusActive {
			activeCount++
		}
	}
	if activeCount >= m.MaxActive {
		return nil
	}

	for _, item := range m.Items {
		if item.Status == StatusQueued {
			item.Status = StatusActive
			return startDownloadCmd(item, m.User, m.Client, m.DownloadCaption)
		}
	}
	return nil
}

func (m *DownloadModel) isDone() bool {
	if m.ToDownload > 0 && m.Downloaded >= m.ToDownload {
		return true
	}
	for _, item := range m.Items {
		if item.Status == StatusQueued || item.Status == StatusActive {
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

func (m *DownloadModel) View() tea.View {
	borderStyle := lipgloss.NewStyle().
		Border(lipgloss.RoundedBorder()).
		BorderForeground(lipgloss.Color("#5F7FFF")).
		Padding(0, 1)

	if m.Aborted {
		return tea.NewView(m.ZoneManager.Scan(borderStyle.Render("Aborted.")))
	}

	if !m.Confirmed {
		var out []string

		btnConfirm := lipgloss.NewStyle().Foreground(lipgloss.Color("#5F7FFF")).Render("ENTER to confirm")
		btnCancel := lipgloss.NewStyle().Foreground(lipgloss.Color("#6B6B6B")).Render("ESC to cancel")

		btnConfirm = m.ZoneManager.Mark("btn_confirm", btnConfirm)
		btnCancel = m.ZoneManager.Mark("btn_cancel", btnCancel)

		out = append(out, fmt.Sprintf("Ready to download %d files. Press %s, %s.", len(m.Items), btnConfirm, btnCancel))
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
		return tea.NewView(m.ZoneManager.Scan(rendered))
	}

	progWidth := max(m.Width-40, 10)

	var active []string
	var queued []string
	var completed []string

	for _, item := range m.Items {
		switch item.Status {
		case StatusActive:
			pct := 0.0
			total := item.TotalSize.Load()
			if total > 0 {
				pct = float64(item.Written.Load()) / float64(total)
			}
			item.Progress.Width = progWidth
			prog := item.Progress.ViewAs(pct)
			line := fmt.Sprintf("%s Downloading %s... %s", item.Spinner.View(), item.FileName, prog)
			active = append(active, line)
		case StatusQueued:
			queued = append(queued, fmt.Sprintf("  Queued: %s", item.FileName))
		case StatusCompleted:
			completed = append(completed, fmt.Sprintf("✓ Downloaded: %s", item.FileName))
		case StatusFailed:
			completed = append(completed, fmt.Sprintf("✗ Failed: %s (%v)", item.FileName, item.Error))
		}
	}

	availableLines := m.Height - 4

	if availableLines < 5 {
		availableLines = 10
	}

	var out []string
	if len(active) > 0 {
		out = append(out, active...)
		availableLines -= len(active) + 1
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
	return tea.NewView(m.ZoneManager.Scan(rendered))
}

func startDownloadCmd(item *DownloadItem, user *inkbunny.User, client *http.Client, saveCaption bool) tea.Cmd {
	return func() tea.Msg {
		folder := filepath.Join("inkbunny", item.Username)
		filename := filepath.Join(folder, item.FileName)
		if fileExists(filename) {
			item.Written.Store(item.TotalSize.Load())
			return DownloadCompleteMsg{Item: item}
		}

		err := os.MkdirAll(folder, os.ModePerm)
		if err != nil {
			return DownloadErrorMsg{Item: item, Err: err}
		}

		var resp *http.Response
		url := utils.ResourceURL(item.URL, user.SID, item.IsPublic)
		sidURL := utils.AppendSID(item.URL, user.SID)

		req, err := http.NewRequest("GET", url, nil)
		if err != nil {
			return DownloadErrorMsg{Item: item, Err: err}
		}

		resp, err = client.Do(req)
		if err != nil {
			return DownloadErrorMsg{Item: item, Err: err}
		}

		if resp.StatusCode == http.StatusTooManyRequests {
			resp.Body.Close()
			log.Warn("Rate limited, pausing 5s before retrying...", "file", item.FileName)
			time.Sleep(5 * time.Second)
			return RetryDownloadMsg{Item: item}
		}

		if resp.StatusCode != http.StatusOK {
			resp.Body.Close()
			if sidURL != "" && sidURL != url {
				item.URL = sidURL
				return RetryDownloadMsg{Item: item}
			}
			return DownloadErrorMsg{Item: item, Err: fmt.Errorf("unexpected status: %d", resp.StatusCode)}
		}

		if resp.ContentLength > 0 {
			item.TotalSize.Store(resp.ContentLength)
		}

		f, err := os.Create(filename)
		if err != nil {
			resp.Body.Close()
			return DownloadErrorMsg{Item: item, Err: err}
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
					return DownloadErrorMsg{Item: item, Err: ew}
				}
			}
			if err != nil {
				if err == io.EOF {
					break
				}
				f.Close()
				resp.Body.Close()
				return DownloadErrorMsg{Item: item, Err: err}
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
				return RetryDownloadMsg{Item: item}
			}
			return DownloadErrorMsg{Item: item, Err: fmt.Errorf("MD5 mismatch: got %s, expected %s", hashStr, item.FileMD5)}
		}

		if saveCaption && item.Keywords != "" {
			err := os.WriteFile(strings.TrimSuffix(filename, filepath.Ext(filename))+".txt", []byte(item.Keywords), 0600)
			if err != nil {
				return DownloadErrorMsg{Item: item, Err: err}
			}
		}

		return DownloadCompleteMsg{Item: item}
	}
}

func fileExists(path string) bool {
	_, err := os.Stat(path)
	return err == nil
}
