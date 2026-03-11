package utils

import (
	"context"
	"encoding/base64"
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

func LooksLikeUserIconURL(raw string) bool {
	return strings.Contains(strings.ToLower(strings.TrimSpace(raw)), "/usericons/")
}

func FetchUserIconDataURL(ctx context.Context, raw string) (string, error) {
	normalized := NormalizeInkbunnyURL(raw)
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, normalized, nil)
	if err != nil {
		return "", err
	}

	request.Header.Set("Accept", "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8")
	request.Header.Set("Origin", "https://inkbunny.net")
	request.Header.Set("Referer", "https://inkbunny.net/")
	request.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36")

	client := &http.Client{Timeout: 15 * time.Second}
	response, err := client.Do(request)
	if err != nil {
		return "", err
	}
	defer response.Body.Close()

	if response.StatusCode < http.StatusOK || response.StatusCode >= http.StatusMultipleChoices {
		return "", fmt.Errorf("avatar proxy status: %s", response.Status)
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
		return "", err
	}
	return "data:" + contentType + ";base64," + base64.StdEncoding.EncodeToString(body), nil
}
