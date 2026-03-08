package desktopapp

import (
	"context"
	"crypto/md5"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"slices"
	"sync"
	"sync/atomic"
	"time"
)

type downloadTask struct {
	SessionID    string
	SubmissionID string
	FileID       string
	Title        string
	Username     string
	FileName     string
	FileMD5      string
	URL          string
	IsPublic     bool
	Keywords     string
	PreviewURL   string
	SaveKeywords bool
	DownloadRoot string
}

type downloadJob struct {
	snapshot DownloadJobSnapshot
	task     downloadTask
	cancel   context.CancelFunc
	created  time.Time
}

type DownloadManager struct {
	ctx       context.Context
	client    *http.Client
	emit      func(string, any)
	limiter   *apiRateLimiter
	mu        sync.Mutex
	nextID    atomic.Uint64
	maxActive int
	active    int
	jobs      map[string]*downloadJob
	pending   []string
}

func NewDownloadManager(ctx context.Context, maxActive int, limiter *apiRateLimiter, emit func(string, any)) *DownloadManager {
	if maxActive <= 0 {
		maxActive = defaultMaxActive()
	}
	return &DownloadManager{
		ctx:       ctx,
		client:    &http.Client{Timeout: 5 * time.Minute},
		emit:      emit,
		limiter:   limiter,
		maxActive: maxActive,
		jobs:      make(map[string]*downloadJob),
	}
}

func (m *DownloadManager) SetMaxActive(maxActive int) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if maxActive > 0 {
		m.maxActive = maxActive
	}
	m.maybeStartLocked()
}

func (m *DownloadManager) Enqueue(tasks []downloadTask, maxActive int) QueueSnapshot {
	m.mu.Lock()
	defer m.mu.Unlock()

	if maxActive > 0 {
		m.maxActive = maxActive
	}
	now := time.Now()
	for _, task := range tasks {
		id := fmt.Sprintf("job-%d", m.nextID.Add(1))
		m.jobs[id] = &downloadJob{
			created: now,
			task:    task,
			snapshot: DownloadJobSnapshot{
				ID:           id,
				SubmissionID: task.SubmissionID,
				FileID:       task.FileID,
				Title:        task.Title,
				Username:     task.Username,
				FileName:     task.FileName,
				PreviewURL:   task.PreviewURL,
				Status:       "queued",
				CreatedAt:    now.Format(time.RFC3339Nano),
				UpdatedAt:    now.Format(time.RFC3339Nano),
			},
		}
		m.pending = append(m.pending, id)
	}

	m.maybeStartLocked()
	snapshot := m.snapshotLocked()
	m.emitLocked(snapshot, DownloadJobSnapshot{})
	return snapshot
}

func (m *DownloadManager) Snapshot() QueueSnapshot {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.snapshotLocked()
}

func (m *DownloadManager) Cancel(jobID string) QueueSnapshot {
	m.mu.Lock()
	defer m.mu.Unlock()

	job := m.jobs[jobID]
	if job == nil {
		return m.snapshotLocked()
	}
	switch job.snapshot.Status {
	case "queued":
		job.snapshot.Status = "cancelled"
		job.snapshot.UpdatedAt = time.Now().Format(time.RFC3339Nano)
		m.pending = removeString(m.pending, jobID)
	case "active":
		if job.cancel != nil {
			job.cancel()
		}
	}
	snapshot := m.snapshotLocked()
	m.emitLocked(snapshot, job.snapshot)
	return snapshot
}

func (m *DownloadManager) CancelSubmission(submissionID string) QueueSnapshot {
	m.mu.Lock()
	defer m.mu.Unlock()

	if submissionID == "" {
		return m.snapshotLocked()
	}

	changed := false
	for jobID, job := range m.jobs {
		if job == nil || job.snapshot.SubmissionID != submissionID {
			continue
		}

		switch job.snapshot.Status {
		case "queued":
			job.snapshot.Status = "cancelled"
			job.snapshot.UpdatedAt = time.Now().Format(time.RFC3339Nano)
			m.pending = removeString(m.pending, jobID)
			changed = true
		case "active":
			if job.cancel != nil {
				job.cancel()
				changed = true
			}
		}
	}

	snapshot := m.snapshotLocked()
	if changed {
		m.emitLocked(snapshot, DownloadJobSnapshot{})
	}
	return snapshot
}

func (m *DownloadManager) Clear() QueueSnapshot {
	m.mu.Lock()
	defer m.mu.Unlock()

	for _, job := range m.jobs {
		if job != nil && job.cancel != nil {
			job.cancel()
		}
	}

	m.jobs = make(map[string]*downloadJob)
	m.pending = nil
	m.active = 0

	snapshot := m.snapshotLocked()
	m.emitLocked(snapshot, DownloadJobSnapshot{})
	return snapshot
}

func (m *DownloadManager) maybeStartLocked() {
	for m.active < m.maxActive && len(m.pending) > 0 {
		jobID := m.pending[0]
		m.pending = m.pending[1:]
		job := m.jobs[jobID]
		if job == nil || job.snapshot.Status != "queued" {
			continue
		}
		ctx, cancel := context.WithCancel(m.ctx)
		job.cancel = cancel
		job.snapshot.Status = "active"
		job.snapshot.UpdatedAt = time.Now().Format(time.RFC3339Nano)
		m.active++
		go m.runJob(ctx, jobID)
	}
}

func (m *DownloadManager) runJob(ctx context.Context, jobID string) {
	err := m.download(ctx, jobID)

	m.mu.Lock()
	defer m.mu.Unlock()

	job := m.jobs[jobID]
	if job == nil {
		return
	}
	job.snapshot.UpdatedAt = time.Now().Format(time.RFC3339Nano)
	switch {
	case errors.Is(err, context.Canceled):
		job.snapshot.Status = "cancelled"
		job.snapshot.Error = ""
	case err != nil:
		job.snapshot.Status = "failed"
		job.snapshot.Error = err.Error()
	default:
		job.snapshot.Status = "completed"
		job.snapshot.Error = ""
	}
	if job.snapshot.TotalBytes > 0 && job.snapshot.BytesWritten == 0 && job.snapshot.Status == "completed" {
		job.snapshot.BytesWritten = job.snapshot.TotalBytes
		job.snapshot.Progress = 1
	}
	m.active--
	m.maybeStartLocked()
	snapshot := m.snapshotLocked()
	m.emitLocked(snapshot, job.snapshot)
}

func (m *DownloadManager) download(ctx context.Context, jobID string) error {
	m.mu.Lock()
	job := m.jobs[jobID]
	m.mu.Unlock()
	if job == nil {
		return errors.New("missing download job")
	}

	task := job.task
	folder := filepath.Join(task.DownloadRoot, task.Username)
	filename := filepath.Join(folder, task.FileName)
	if fileExists(filename) {
		info, err := os.Stat(filename)
		if err == nil {
			m.setProgress(jobID, info.Size(), info.Size())
		}
		return nil
	}
	if err := os.MkdirAll(folder, 0o755); err != nil {
		return err
	}

	url := task.URL
	if !task.IsPublic {
		url += "?sid=" + task.SessionID
	}

	const maxAttempts = 5
	var lastErr error
	for attempt := 1; attempt <= maxAttempts; attempt++ {
		m.setAttempt(jobID, attempt)
		err := m.downloadAttempt(ctx, jobID, attempt, task, filename, url)
		if err == nil {
			if task.SaveKeywords && task.Keywords != "" {
				sidecar := stringsTrimExt(filename) + ".txt"
				if writeErr := os.WriteFile(sidecar, []byte(task.Keywords), 0o600); writeErr != nil {
					return writeErr
				}
			}
			return nil
		}
		if !errors.Is(err, errRetry) {
			return err
		}
		lastErr = err
	}
	if m.limiter != nil {
		return m.limiter.Exhausted("downloads", lastErr)
	}
	return fmt.Errorf("download failed after %d attempts", maxAttempts)
}

var errRetry = errors.New("retry")

func (m *DownloadManager) downloadAttempt(ctx context.Context, jobID string, attempt int, task downloadTask, filename string, url string) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return err
	}
	resp, err := m.client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusTooManyRequests {
		if m.limiter != nil {
			m.limiter.Register("downloads", attempt)
			if err := m.limiter.Wait(ctx); err != nil {
				return err
			}
		}
		return errRetry
	}
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("unexpected status: %d", resp.StatusCode)
	}

	file, err := os.Create(filename)
	if err != nil {
		return err
	}
	defer file.Close()

	hasher := md5.New()
	writer := io.MultiWriter(file, hasher)
	total := resp.ContentLength
	m.setProgress(jobID, 0, total)

	var written int64
	buffer := make([]byte, 32*1024)
	for {
		select {
		case <-ctx.Done():
			_ = file.Close()
			_ = os.Remove(filename)
			return ctx.Err()
		default:
		}

		n, readErr := resp.Body.Read(buffer)
		if n > 0 {
			nw, writeErr := writer.Write(buffer[:n])
			if writeErr != nil {
				_ = os.Remove(filename)
				return writeErr
			}
			written += int64(nw)
			m.setProgress(jobID, written, total)
		}
		if readErr != nil {
			if errors.Is(readErr, io.EOF) {
				break
			}
			_ = os.Remove(filename)
			return readErr
		}
	}

	if task.FileMD5 != "" {
		hash := fmt.Sprintf("%x", hasher.Sum(nil))
		if hash != task.FileMD5 {
			_ = os.Remove(filename)
			return errRetry
		}
	}
	m.setProgress(jobID, written, max64(written, total))
	return nil
}

func (m *DownloadManager) setAttempt(jobID string, attempt int) {
	m.mu.Lock()
	defer m.mu.Unlock()
	job := m.jobs[jobID]
	if job == nil {
		return
	}
	job.snapshot.Attempt = attempt
	job.snapshot.UpdatedAt = time.Now().Format(time.RFC3339Nano)
	snapshot := m.snapshotLocked()
	m.emitLocked(snapshot, job.snapshot)
}

func (m *DownloadManager) setProgress(jobID string, written, total int64) {
	m.mu.Lock()
	defer m.mu.Unlock()
	job := m.jobs[jobID]
	if job == nil {
		return
	}
	job.snapshot.BytesWritten = written
	job.snapshot.TotalBytes = total
	if total > 0 {
		job.snapshot.Progress = float64(written) / float64(total)
	}
	job.snapshot.UpdatedAt = time.Now().Format(time.RFC3339Nano)
	snapshot := m.snapshotLocked()
	m.emitLocked(snapshot, job.snapshot)
}

func (m *DownloadManager) snapshotLocked() QueueSnapshot {
	type orderedJob struct {
		created  time.Time
		snapshot DownloadJobSnapshot
	}

	jobs := make([]orderedJob, 0, len(m.jobs))
	var queued, active, completed, failed, cancelled int
	for _, job := range m.jobs {
		snapshot := job.snapshot
		snapshot.FileExists = jobFileExists(job)
		jobs = append(jobs, orderedJob{
			created:  job.created,
			snapshot: snapshot,
		})
		switch snapshot.Status {
		case "queued":
			queued++
		case "active":
			active++
		case "completed":
			completed++
		case "failed":
			failed++
		case "cancelled":
			cancelled++
		}
	}
	slices.SortFunc(jobs, func(a, b orderedJob) int {
		if a.created.Equal(b.created) {
			switch {
			case a.snapshot.ID < b.snapshot.ID:
				return -1
			case a.snapshot.ID > b.snapshot.ID:
				return 1
			default:
				return 0
			}
		}
		if a.created.Before(b.created) {
			return -1
		}
		return 1
	})

	snapshots := make([]DownloadJobSnapshot, 0, len(jobs))
	for _, job := range jobs {
		snapshots = append(snapshots, job.snapshot)
	}
	return QueueSnapshot{
		Jobs:           snapshots,
		QueuedCount:    queued,
		ActiveCount:    active,
		CompletedCount: completed,
		FailedCount:    failed,
		CancelledCount: cancelled,
	}
}

func (m *DownloadManager) emitLocked(snapshot QueueSnapshot, job DownloadJobSnapshot) {
	if m.emit == nil {
		return
	}
	m.emit("download-progress", DownloadProgressEvent{
		Job:   job,
		Queue: snapshot,
	})
}

func removeString(items []string, target string) []string {
	out := items[:0]
	for _, item := range items {
		if item != target {
			out = append(out, item)
		}
	}
	return out
}

func fileExists(path string) bool {
	_, err := os.Stat(path)
	return err == nil
}

func jobFileExists(job *downloadJob) bool {
	if job == nil {
		return false
	}
	if job.task.DownloadRoot == "" || job.task.Username == "" || job.task.FileName == "" {
		return false
	}
	return fileExists(filepath.Join(job.task.DownloadRoot, job.task.Username, job.task.FileName))
}

func max64(a, b int64) int64 {
	if a > b {
		return a
	}
	return b
}

func stringsTrimExt(filename string) string {
	return filename[:len(filename)-len(filepath.Ext(filename))]
}
