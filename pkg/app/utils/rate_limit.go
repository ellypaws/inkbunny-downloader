package utils

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"sync"
	"time"

	"github.com/ellypaws/inkbunny/cmd/downloader/pkg/app/types"
)

const maxRateLimitAttempts = 4

type RateLimiter struct {
	mu            sync.Mutex
	cooldownUntil time.Time
	notify        func(types.AppNotification)
}

func NewRateLimiter(notify func(types.AppNotification)) *RateLimiter {
	return &RateLimiter{notify: notify}
}

func (l *RateLimiter) SetNotifier(notify func(types.AppNotification)) {
	if l == nil {
		return
	}
	l.mu.Lock()
	l.notify = notify
	l.mu.Unlock()
}

func (l *RateLimiter) Reset() {
	if l == nil {
		return
	}
	l.mu.Lock()
	l.cooldownUntil = time.Time{}
	l.mu.Unlock()
}

func (l *RateLimiter) Wait(ctx context.Context) error {
	if l == nil {
		return nil
	}
	if ctx == nil {
		ctx = context.Background()
	}

	for {
		l.mu.Lock()
		wait := time.Until(l.cooldownUntil)
		l.mu.Unlock()
		if wait <= 0 {
			return nil
		}

		timer := time.NewTimer(wait)
		select {
		case <-ctx.Done():
			if !timer.Stop() {
				<-timer.C
			}
			return ctx.Err()
		case <-timer.C:
		}
	}
}

func (l *RateLimiter) Register(scope string, attempt int) time.Duration {
	if l == nil {
		return 0
	}

	delay := rateLimitDelay(attempt)
	now := time.Now()
	until := now.Add(delay)

	l.mu.Lock()
	if until.After(l.cooldownUntil) {
		l.cooldownUntil = until
	}
	effective := time.Until(l.cooldownUntil)
	notify := l.notify
	l.mu.Unlock()

	if notify != nil {
		notify(types.AppNotification{
			ID:           fmt.Sprintf("rate-limit-%s-%d", notificationKey(scope), now.UnixNano()),
			Level:        "warning",
			Message:      fmt.Sprintf("Inkbunny is rate limiting %s. Retrying in %s.", scope, humanizeRetryDelay(effective)),
			Scope:        scope,
			DedupeKey:    "rate-limit-" + notificationKey(scope),
			RetryAfterMS: effective.Milliseconds(),
		})
	}

	return effective
}

func (l *RateLimiter) Exhausted(scope string, err error) error {
	message := fmt.Sprintf("Inkbunny is still rate limiting %s. Please try again in a moment.", scope)
	if l != nil {
		l.mu.Lock()
		notify := l.notify
		l.mu.Unlock()
		if notify != nil {
			notify(types.AppNotification{
				ID:        fmt.Sprintf("rate-limit-exhausted-%s-%d", notificationKey(scope), time.Now().UnixNano()),
				Level:     "error",
				Message:   message,
				Scope:     scope,
				DedupeKey: "rate-limit-exhausted-" + notificationKey(scope),
			})
		}
	}
	if err == nil {
		return errors.New(message)
	}
	return fmt.Errorf("%s: %w", message, err)
}

func ExecuteWithRateLimitRetry[T any](ctx context.Context, limiter *RateLimiter, scope string, work func() (T, error)) (T, error) {
	var zero T

	for attempt := 1; attempt <= maxRateLimitAttempts; attempt++ {
		if limiter != nil {
			if err := limiter.Wait(ctx); err != nil {
				return zero, err
			}
		}

		value, err := work()
		if err == nil {
			return value, nil
		}
		if !IsRateLimitError(err) {
			return zero, err
		}
		if attempt == maxRateLimitAttempts {
			if limiter == nil {
				return zero, err
			}
			return zero, limiter.Exhausted(scope, err)
		}
		if limiter != nil {
			limiter.Register(scope, attempt)
		}
	}

	return zero, errors.New("rate limit retry loop exited unexpectedly")
}

func rateLimitDelay(attempt int) time.Duration {
	if attempt < 1 {
		attempt = 1
	}
	base := min(time.Second<<minInt(attempt, 4), 15*time.Second)
	jitter := time.Duration(time.Now().UnixNano() % int64(500*time.Millisecond+1))
	return base + jitter
}

func humanizeRetryDelay(delay time.Duration) string {
	if delay <= 0 {
		return "a moment"
	}
	seconds := delay.Round(100 * time.Millisecond).Seconds()
	if seconds < 1 {
		return "1s"
	}
	if seconds == float64(int64(seconds)) {
		return fmt.Sprintf("%.0fs", seconds)
	}
	return fmt.Sprintf("%.1fs", seconds)
}

func IsRateLimitError(err error) bool {
	if err == nil {
		return false
	}

	message := strings.ToLower(err.Error())
	return strings.Contains(message, "429") &&
		(strings.Contains(message, "too many requests") || strings.Contains(message, "status code"))
}

func minInt(a, b int) int {
	if a < b {
		return a
	}
	return b
}

func notificationKey(scope string) string {
	key := strings.ToLower(strings.TrimSpace(scope))
	key = strings.ReplaceAll(key, " ", "-")
	key = strings.ReplaceAll(key, "_", "-")
	if key == "" {
		return "general"
	}
	return key
}
