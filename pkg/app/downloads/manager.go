package downloads

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

	"github.com/ellypaws/inkbunny/cmd/downloader/pkg/app/types"
	apputils "github.com/ellypaws/inkbunny/cmd/downloader/pkg/app/utils"
	baseutils "github.com/ellypaws/inkbunny/cmd/downloader/pkg/utils"
)

type Task struct {
	SessionID    string
	SubmissionID string
	FileID       string
	Title        string
	Username     string
	FileName     string
	FileMD5      string
	URL          string
	IsPublic     bool
	Metadata     SubmissionFileMetadata
	PreviewURL   string
	SaveKeywords bool
	DownloadRoot string
	Destinations []string
}

type downloadJob struct {
	snapshot       types.DownloadJobSnapshot
	task           Task
	cancel         context.CancelFunc
	resumeOnCancel bool
	created        time.Time
	order          uint64
}

type Manager struct {
	ctx       context.Context
	client    *http.Client
	emit      func(string, any)
	limiter   *apputils.RateLimiter
	mu        sync.Mutex
	nextID    atomic.Uint64
	maxActive int
	paused    bool
	active    int
	jobs      map[string]*downloadJob
	pending   []string
}

func NewManager(ctx context.Context, maxActive int, limiter *apputils.RateLimiter, emit func(string, any)) *Manager {
	maxActive = apputils.NormalizeMaxActive(maxActive)
	return &Manager{
		ctx:       ctx,
		client:    &http.Client{Timeout: 5 * time.Minute},
		emit:      emit,
		limiter:   limiter,
		maxActive: maxActive,
		jobs:      make(map[string]*downloadJob),
	}
}

func (m *Manager) SetMaxActive(maxActive int) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if maxActive > 0 {
		m.maxActive = apputils.NormalizeMaxActive(maxActive)
	}
	m.maybeStartLocked()
}

func (m *Manager) Enqueue(tasks []Task, maxActive int) types.QueueSnapshot {
	m.mu.Lock()
	defer m.mu.Unlock()

	if maxActive > 0 {
		m.maxActive = apputils.NormalizeMaxActive(maxActive)
	}
	now := time.Now()
	for _, task := range tasks {
		order := m.nextID.Add(1)
		id := fmt.Sprintf("job-%d", order)
		m.jobs[id] = &downloadJob{
			created: now,
			order:   order,
			task:    task,
			snapshot: types.DownloadJobSnapshot{
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
	m.emitLocked(snapshot, types.DownloadJobSnapshot{})
	return snapshot
}

func (m *Manager) Snapshot() types.QueueSnapshot {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.snapshotLocked()
}

func (m *Manager) OpenInFolder(jobID string) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	job := m.jobs[jobID]
	if job == nil {
		return errors.New("download job not found")
	}

	target := existingJobPath(job)
	if target == "" {
		return errors.New("downloaded file not found")
	}

	return apputils.RevealPathInFileManager(target)
}

func (m *Manager) Cancel(jobID string) types.QueueSnapshot {
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

func (m *Manager) CancelSubmission(submissionID string) types.QueueSnapshot {
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
		m.emitLocked(snapshot, types.DownloadJobSnapshot{})
	}
	return snapshot
}

func (m *Manager) Retry(jobID string) types.QueueSnapshot {
	m.mu.Lock()
	defer m.mu.Unlock()

	job := m.jobs[jobID]
	if job == nil || job.snapshot.Status != "failed" {
		return m.snapshotLocked()
	}

	m.retryJobLocked(jobID, job)
	m.maybeStartLocked()
	snapshot := m.snapshotLocked()
	m.emitLocked(snapshot, job.snapshot)
	return snapshot
}

func (m *Manager) Redownload(jobID string) (types.QueueSnapshot, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	job := m.jobs[jobID]
	if job == nil {
		return m.snapshotLocked(), errors.New("download job not found")
	}
	if job.snapshot.Status == "queued" || job.snapshot.Status == "active" {
		return m.snapshotLocked(), errors.New("stop this download before redownloading it")
	}
	if err := deleteJobArtifacts(job); err != nil {
		return m.snapshotLocked(), err
	}

	m.requeueJobLocked(jobID, job)
	m.maybeStartLocked()
	snapshot := m.snapshotLocked()
	m.emitLocked(snapshot, job.snapshot)
	return snapshot, nil
}

func (m *Manager) RetrySubmission(submissionID string) types.QueueSnapshot {
	m.mu.Lock()
	defer m.mu.Unlock()

	if submissionID == "" {
		return m.snapshotLocked()
	}

	retryIDs := make([]string, 0)
	relevantCount := 0
	for jobID, job := range m.jobs {
		if job == nil || job.snapshot.SubmissionID != submissionID || job.snapshot.Status == "cancelled" {
			continue
		}
		relevantCount++
		if job.snapshot.Status == "failed" {
			retryIDs = append(retryIDs, jobID)
		}
	}
	if relevantCount == 0 || len(retryIDs) == 0 || len(retryIDs) != relevantCount {
		return m.snapshotLocked()
	}

	for _, jobID := range retryIDs {
		m.retryJobLocked(jobID, m.jobs[jobID])
	}
	m.maybeStartLocked()
	snapshot := m.snapshotLocked()
	m.emitLocked(snapshot, types.DownloadJobSnapshot{})
	return snapshot
}

func (m *Manager) RedownloadSubmission(submissionID string) (types.QueueSnapshot, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	if submissionID == "" {
		return m.snapshotLocked(), errors.New("submission id is required")
	}

	targetJobIDs := make([]string, 0)
	for jobID, job := range m.jobs {
		if job == nil || job.snapshot.SubmissionID != submissionID {
			continue
		}
		if job.snapshot.Status == "queued" || job.snapshot.Status == "active" {
			return m.snapshotLocked(), errors.New("stop this submission before redownloading it")
		}
		targetJobIDs = append(targetJobIDs, jobID)
	}
	if len(targetJobIDs) == 0 {
		return m.snapshotLocked(), errors.New("submission jobs not found")
	}

	for _, jobID := range targetJobIDs {
		job := m.jobs[jobID]
		if job == nil {
			continue
		}
		if err := deleteJobArtifacts(job); err != nil {
			return m.snapshotLocked(), err
		}
		m.requeueJobLocked(jobID, job)
	}

	m.maybeStartLocked()
	snapshot := m.snapshotLocked()
	m.emitLocked(snapshot, types.DownloadJobSnapshot{})
	return snapshot, nil
}

func (m *Manager) RetryAll() types.QueueSnapshot {
	m.mu.Lock()
	defer m.mu.Unlock()

	changed := false
	for jobID, job := range m.jobs {
		if job == nil || job.snapshot.Status != "failed" {
			continue
		}
		m.retryJobLocked(jobID, job)
		changed = true
	}
	if !changed {
		return m.snapshotLocked()
	}

	m.maybeStartLocked()
	snapshot := m.snapshotLocked()
	m.emitLocked(snapshot, types.DownloadJobSnapshot{})
	return snapshot
}

func (m *Manager) PauseAll() types.QueueSnapshot {
	m.mu.Lock()
	defer m.mu.Unlock()

	if m.paused {
		return m.snapshotLocked()
	}

	m.paused = true
	for _, job := range m.jobs {
		if job == nil || job.snapshot.Status != "active" {
			continue
		}
		job.resumeOnCancel = true
		if job.cancel != nil {
			job.cancel()
		}
	}

	snapshot := m.snapshotLocked()
	m.emitLocked(snapshot, types.DownloadJobSnapshot{})
	return snapshot
}

func (m *Manager) ResumeAll() types.QueueSnapshot {
	m.mu.Lock()
	defer m.mu.Unlock()

	if !m.paused {
		return m.snapshotLocked()
	}

	m.paused = false
	m.maybeStartLocked()
	snapshot := m.snapshotLocked()
	m.emitLocked(snapshot, types.DownloadJobSnapshot{})
	return snapshot
}

func (m *Manager) CancelAll() types.QueueSnapshot {
	m.mu.Lock()
	defer m.mu.Unlock()

	changed := false
	for jobID, job := range m.jobs {
		if job == nil {
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
		m.emitLocked(snapshot, types.DownloadJobSnapshot{})
	}
	return snapshot
}

func (m *Manager) Clear() types.QueueSnapshot {
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
	m.emitLocked(snapshot, types.DownloadJobSnapshot{})
	return snapshot
}

func (m *Manager) Delete(jobID string) (types.QueueSnapshot, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	job := m.jobs[jobID]
	if job == nil {
		return m.snapshotLocked(), errors.New("download job not found")
	}
	if job.snapshot.Status == "queued" || job.snapshot.Status == "active" {
		return m.snapshotLocked(), errors.New("stop this download before deleting it")
	}
	if err := deleteJobArtifacts(job); err != nil {
		return m.snapshotLocked(), err
	}

	delete(m.jobs, jobID)
	snapshot := m.snapshotLocked()
	m.emitLocked(snapshot, types.DownloadJobSnapshot{})
	return snapshot, nil
}

func (m *Manager) DeleteSubmission(submissionID string) (types.QueueSnapshot, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	if submissionID == "" {
		return m.snapshotLocked(), errors.New("submission id is required")
	}

	targetJobIDs := make([]string, 0)
	for jobID, job := range m.jobs {
		if job == nil || job.snapshot.SubmissionID != submissionID {
			continue
		}
		if job.snapshot.Status == "queued" || job.snapshot.Status == "active" {
			return m.snapshotLocked(), errors.New("stop this submission before deleting it")
		}
		targetJobIDs = append(targetJobIDs, jobID)
	}
	if len(targetJobIDs) == 0 {
		return m.snapshotLocked(), errors.New("submission jobs not found")
	}

	for _, jobID := range targetJobIDs {
		job := m.jobs[jobID]
		if job == nil {
			continue
		}
		if err := deleteJobArtifacts(job); err != nil {
			return m.snapshotLocked(), err
		}
		delete(m.jobs, jobID)
	}

	snapshot := m.snapshotLocked()
	m.emitLocked(snapshot, types.DownloadJobSnapshot{})
	return snapshot, nil
}

func (m *Manager) Reset() types.QueueSnapshot {
	m.mu.Lock()
	defer m.mu.Unlock()

	for _, job := range m.jobs {
		if job != nil && job.cancel != nil {
			job.cancel()
		}
	}

	m.paused = false
	m.jobs = make(map[string]*downloadJob)
	m.pending = nil
	m.active = 0

	snapshot := m.snapshotLocked()
	m.emitLocked(snapshot, types.DownloadJobSnapshot{})
	return snapshot
}

func (m *Manager) ClearCompleted() types.QueueSnapshot {
	m.mu.Lock()
	defer m.mu.Unlock()

	for jobID, job := range m.jobs {
		if job == nil || job.snapshot.Status != "completed" {
			continue
		}
		delete(m.jobs, jobID)
	}

	snapshot := m.snapshotLocked()
	m.emitLocked(snapshot, types.DownloadJobSnapshot{})
	return snapshot
}

func (m *Manager) ClearCompletedSubmissions(submissionIDs []string) types.QueueSnapshot {
	m.mu.Lock()
	defer m.mu.Unlock()

	targets := make(map[string]struct{}, len(submissionIDs))
	for _, submissionID := range submissionIDs {
		if submissionID == "" {
			continue
		}
		targets[submissionID] = struct{}{}
	}
	if len(targets) == 0 {
		return m.snapshotLocked()
	}

	completed := make(map[string]bool, len(targets))
	for submissionID := range targets {
		hasJobs := false
		allCompleted := true
		for _, job := range m.jobs {
			if job == nil || job.snapshot.SubmissionID != submissionID {
				continue
			}
			hasJobs = true
			if job.snapshot.Status != "completed" {
				allCompleted = false
				break
			}
		}
		completed[submissionID] = hasJobs && allCompleted
	}

	for jobID, job := range m.jobs {
		if job == nil || job.snapshot.Status != "completed" {
			continue
		}
		if !completed[job.snapshot.SubmissionID] {
			continue
		}
		delete(m.jobs, jobID)
	}

	snapshot := m.snapshotLocked()
	m.emitLocked(snapshot, types.DownloadJobSnapshot{})
	return snapshot
}

func (m *Manager) maybeStartLocked() {
	if m.paused {
		return
	}
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

func (m *Manager) runJob(ctx context.Context, jobID string) {
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
		if job.resumeOnCancel {
			m.requeueJobLocked(jobID, job)
		} else {
			job.snapshot.Status = "cancelled"
			job.snapshot.Error = ""
		}
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

func (m *Manager) download(ctx context.Context, jobID string) error {
	m.mu.Lock()
	job := m.jobs[jobID]
	m.mu.Unlock()
	if job == nil {
		return errors.New("missing download job")
	}

	task := job.task
	destinations := uniqueNonEmptyPaths(task.Destinations)
	if len(destinations) == 0 {
		destinations = uniqueNonEmptyPaths([]string{
			filepath.Join(task.DownloadRoot, task.Username, filepath.Base(task.FileName)),
		})
	}
	allMatch, size, source, err := downloadTargetsMatch(destinations, task.FileMD5)
	if err != nil {
		return err
	}
	if allMatch {
		m.setProgress(jobID, size, size)
		return nil
	}

	if source != "" {
		if err := ensureDownloadTargetsFromSource(source, destinations, task.FileMD5); err != nil {
			return err
		}
		if task.SaveKeywords {
			return WriteSubmissionMetadata(destinations, task.Metadata)
		}
		return nil
	}

	filename := destinations[0]
	if verified, err := verifyDownloadedFile(filename, task.FileMD5); err != nil {
		return err
	} else if verified.Exists && !verified.Matches {
		if removeErr := os.Remove(filename); removeErr != nil && !os.IsNotExist(removeErr) {
			return removeErr
		}
	}
	if err := os.MkdirAll(filepath.Dir(filename), 0o755); err != nil {
		return err
	}

	url := baseutils.ResourceURL(task.URL, task.SessionID, task.IsPublic)
	sidURL := baseutils.AppendSID(task.URL, task.SessionID)

	const maxAttempts = 5
	var lastErr error
	for attempt := 1; attempt <= maxAttempts; attempt++ {
		m.setAttempt(jobID, attempt)
		err := m.downloadAttempt(ctx, jobID, attempt, task, filename, url)
		if err == nil {
			if copyErr := ensureDownloadTargetsFromSource(filename, destinations, task.FileMD5); copyErr != nil {
				return copyErr
			}
			if task.SaveKeywords {
				return WriteSubmissionMetadata(destinations, task.Metadata)
			}
			return nil
		}
		if errors.Is(err, errRetryWithSID) {
			url = sidURL
			lastErr = err
			continue
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
var errRetryWithSID = errors.New("retry with sid")

func (m *Manager) downloadAttempt(ctx context.Context, jobID string, attempt int, task Task, filename string, url string) error {
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
		if sidURL := baseutils.AppendSID(task.URL, task.SessionID); sidURL != "" && sidURL != url {
			return errRetryWithSID
		}
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

func (m *Manager) setAttempt(jobID string, attempt int) {
	m.mu.Lock()
	defer m.mu.Unlock()
	job := m.jobs[jobID]
	if job == nil {
		return
	}
	job.snapshot.Attempt = attempt
	job.snapshot.UpdatedAt = time.Now().Format(time.RFC3339Nano)
	m.emitJobUpdatedLocked(job.snapshot)
}

func (m *Manager) setProgress(jobID string, written, total int64) {
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
	m.emitJobUpdatedLocked(job.snapshot)
}

func (m *Manager) snapshotLocked() types.QueueSnapshot {
	type orderedJob struct {
		created  time.Time
		order    uint64
		snapshot types.DownloadJobSnapshot
	}

	jobs := make([]orderedJob, 0, len(m.jobs))
	var queued, active, completed, failed, cancelled int
	for _, job := range m.jobs {
		snapshot := job.snapshot
		snapshot.FileExists = jobFileExists(job)
		jobs = append(jobs, orderedJob{
			created:  job.created,
			order:    job.order,
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
			case a.order < b.order:
				return -1
			case a.order > b.order:
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

	snapshots := make([]types.DownloadJobSnapshot, 0, len(jobs))
	for _, job := range jobs {
		snapshots = append(snapshots, job.snapshot)
	}
	return types.QueueSnapshot{
		Jobs:           snapshots,
		Paused:         m.paused,
		QueuedCount:    queued,
		ActiveCount:    active,
		CompletedCount: completed,
		FailedCount:    failed,
		CancelledCount: cancelled,
	}
}

func (m *Manager) emitLocked(snapshot types.QueueSnapshot, job types.DownloadJobSnapshot) {
	if m.emit == nil {
		return
	}
	m.emit("download-progress", types.DownloadProgressEvent{
		Job:   job,
		Queue: snapshot,
	})
}

func (m *Manager) emitJobUpdatedLocked(job types.DownloadJobSnapshot) {
	if m.emit == nil {
		return
	}
	m.emit("download.jobUpdated", types.DownloadJobUpdateEvent{
		Job: job,
	})
}

func (m *Manager) retryJobLocked(jobID string, job *downloadJob) {
	if job == nil || job.snapshot.Status != "failed" {
		return
	}

	m.requeueJobLocked(jobID, job)
}

func (m *Manager) requeueJobLocked(jobID string, job *downloadJob) {
	if job == nil {
		return
	}

	now := time.Now().Format(time.RFC3339Nano)
	job.snapshot.Status = "queued"
	job.snapshot.BytesWritten = 0
	job.snapshot.TotalBytes = 0
	job.snapshot.Progress = 0
	job.snapshot.Error = ""
	job.snapshot.Attempt = 0
	job.snapshot.UpdatedAt = now
	job.cancel = nil
	job.resumeOnCancel = false
	if !slices.Contains(m.pending, jobID) {
		m.pending = append(m.pending, jobID)
	}
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

func jobFileExists(job *downloadJob) bool {
	if job == nil {
		return false
	}
	destinations := uniqueNonEmptyPaths(job.task.Destinations)
	if len(destinations) == 0 {
		destinations = []string{filepath.Join(job.task.DownloadRoot, job.task.Username, job.task.FileName)}
	}
	matches, _, _, err := downloadTargetsMatch(destinations, job.task.FileMD5)
	if err != nil {
		return false
	}
	return matches
}

func existingJobPath(job *downloadJob) string {
	if job == nil {
		return ""
	}

	for _, destination := range jobDestinations(job) {
		info, err := os.Stat(destination)
		if err != nil || info.IsDir() {
			continue
		}
		return destination
	}

	return ""
}

func jobDestinations(job *downloadJob) []string {
	if job == nil {
		return nil
	}

	destinations := uniqueNonEmptyPaths(job.task.Destinations)
	if len(destinations) > 0 {
		return destinations
	}

	return uniqueNonEmptyPaths([]string{
		filepath.Join(job.task.DownloadRoot, job.task.Username, job.task.FileName),
	})
}

func deleteJobArtifacts(job *downloadJob) error {
	if job == nil {
		return nil
	}
	return DeleteTaskArtifacts(job.task)
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
