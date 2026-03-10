package desktopapp

import (
	"context"
	"encoding/base64"
	"fmt"
	"io"
	"mime"
	"net/http"
	"path"
	"strings"
	"time"

	"github.com/ellypaws/inkbunny/cmd/downloader/pkg/flight"
)

var proxiedUserIconCache = flight.NewCache(func(ctx context.Context, raw string) (string, error) {
	return fetchUserIconDataURL(ctx, raw)
})

func (a *App) ProxyAvatarImageURL(raw string) (string, error) {
	normalized := normalizeInkbunnyURL(raw)
	if !looksLikeUserIconURL(normalized) {
		return normalized, nil
	}

	ctx := a.ctx
	if ctx == nil {
		ctx = context.Background()
	}
	return proxiedUserIconCache.GetWithContext(ctx, normalized)
}

func fetchUserIconDataURL(ctx context.Context, raw string) (string, error) {
	normalized := normalizeInkbunnyURL(raw)
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

func looksLikeUserIconURL(raw string) bool {
	return strings.Contains(strings.ToLower(strings.TrimSpace(raw)), "/usericons/")
}
