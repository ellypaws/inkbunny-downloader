package utils

import (
	"context"
	"errors"
	"fmt"
	"io"
	"mime"
	"net/http"
	"net/url"
	"path"
	"strings"
	"time"
)

const DefaultAvatarURL = "https://inkbunny.net/images80/usericons/large/noicon.png"

var (
	errApprovedURLRequired = errors.New("url is required")
	errApprovedURLInvalid  = errors.New("invalid url")
	errApprovedURLDenied   = errors.New("unsupported url")
)

var (
	ErrApprovedURLRequired = errApprovedURLRequired
	ErrApprovedURLInvalid  = errApprovedURLInvalid
	ErrApprovedURLDenied   = errApprovedURLDenied
)

func hasSafeAbsolutePathPrefix(raw string) bool {
	if !strings.HasPrefix(raw, "/") {
		return false
	}
	if len(raw) == 1 {
		return true
	}
	return raw[1] != '/' && raw[1] != '\\'
}

func NormalizeInkbunnyURL(raw string) string {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		return raw
	}
	if strings.HasPrefix(trimmed, "#") || strings.HasPrefix(trimmed, "data:") {
		return trimmed
	}
	if strings.HasPrefix(trimmed, "//") {
		return "https:" + trimmed
	}

	parsed, err := url.Parse(trimmed)
	if err == nil && parsed.Scheme != "" {
		return parsed.String()
	}

	if strings.HasPrefix(trimmed, "/") {
		if !hasSafeAbsolutePathPrefix(trimmed) {
			return trimmed
		}
		return "https://inkbunny.net" + trimmed
	}

	if err == nil && parsed.Host == "" {
		return "https://inkbunny.net/" + strings.TrimPrefix(trimmed, "/")
	}

	return trimmed
}

func IsApprovedInkbunnyHost(host string) bool {
	value := strings.ToLower(strings.TrimSpace(host))
	if value == "" {
		return false
	}
	return value == "inkbunny.net" ||
		strings.HasSuffix(value, ".inkbunny.net") ||
		value == "ib.metapix.net" ||
		strings.HasSuffix(value, ".ib.metapix.net")
}

func ParseApprovedInkbunnyURL(raw string) (*url.URL, error) {
	target := strings.TrimSpace(raw)
	if target == "" {
		return nil, errApprovedURLRequired
	}

	if strings.HasPrefix(target, "//") {
		target = "https:" + target
	}
	if strings.HasPrefix(target, "/") {
		if !hasSafeAbsolutePathPrefix(target) {
			return nil, errApprovedURLDenied
		}
		target = "https://inkbunny.net" + target
	} else if parsed, err := url.Parse(target); err == nil && parsed != nil && parsed.Scheme == "" && parsed.Host == "" {
		target = "https://inkbunny.net/" + strings.TrimPrefix(target, "/")
	}

	parsed, err := url.Parse(target)
	if err != nil || parsed == nil {
		return nil, errApprovedURLInvalid
	}
	if parsed.Scheme != "https" || parsed.Hostname() == "" || parsed.User != nil {
		return nil, errApprovedURLDenied
	}
	if parsed.Port() != "" {
		return nil, errApprovedURLDenied
	}
	if !IsApprovedInkbunnyHost(parsed.Hostname()) {
		return nil, errApprovedURLDenied
	}
	if !hasSafeAbsolutePathPrefix(parsed.EscapedPath()) {
		return nil, errApprovedURLDenied
	}
	parsed.Scheme = "https"
	return parsed, nil
}

func ParseApprovedUserIconURL(raw string) (*url.URL, error) {
	parsed, err := ParseApprovedInkbunnyURL(raw)
	if err != nil {
		return nil, err
	}
	if !strings.Contains(strings.ToLower(parsed.EscapedPath()), "/usericons/") {
		return nil, errApprovedURLDenied
	}
	return parsed, nil
}

func LooksLikeUserIconURL(raw string) bool {
	_, err := ParseApprovedUserIconURL(raw)
	return err == nil
}

func checkApprovedRedirect(req *http.Request, via []*http.Request, parser func(string) (*url.URL, error)) error {
	if len(via) >= 10 {
		return errors.New("too many redirects")
	}
	if req == nil || req.URL == nil {
		return errApprovedURLInvalid
	}
	_, err := parser(req.URL.String())
	return err
}

func FetchUserIconBytes(ctx context.Context, raw string) ([]byte, string, error) {
	target, err := ParseApprovedUserIconURL(raw)
	if err != nil {
		return nil, "", err
	}
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, target.String(), nil)
	if err != nil {
		return nil, "", err
	}

	request.Header.Set("Accept", "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8")
	request.Header.Set("Origin", "https://inkbunny.net")
	request.Header.Set("Referer", "https://inkbunny.net/")
	request.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36")

	client := &http.Client{
		Timeout: 15 * time.Second,
		CheckRedirect: func(req *http.Request, via []*http.Request) error {
			return checkApprovedRedirect(req, via, ParseApprovedUserIconURL)
		},
	}
	response, err := client.Do(request)
	if err != nil {
		return nil, "", err
	}
	defer response.Body.Close()

	if response.StatusCode < http.StatusOK || response.StatusCode >= http.StatusMultipleChoices {
		return nil, "", fmt.Errorf("avatar proxy status: %s", response.Status)
	}

	contentType := strings.TrimSpace(response.Header.Get("Content-Type"))
	if index := strings.Index(contentType, ";"); index >= 0 {
		contentType = strings.TrimSpace(contentType[:index])
	}
	if contentType == "" {
		contentType = mime.TypeByExtension(path.Ext(request.URL.Path))
	}
	if contentType == "" {
		contentType = "image/png"
	}

	body, err := io.ReadAll(io.LimitReader(response.Body, 2<<20))
	if err != nil {
		return nil, "", err
	}
	return body, contentType, nil
}
