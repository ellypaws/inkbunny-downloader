package modes

import (
	"bytes"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"sync/atomic"
	"time"

	"github.com/charmbracelet/huh/spinner"
	"github.com/charmbracelet/log"

	"github.com/ellypaws/inkbunny"

	"github.com/ellypaws/inkbunny/cmd/downloader/pkg/flags"
	"github.com/ellypaws/inkbunny/cmd/downloader/pkg/flight"
	"github.com/ellypaws/inkbunny/cmd/downloader/pkg/utils"
)

func RunHeadless(config flags.Config) {
	var (
		request      inkbunny.SubmissionSearchRequest
		searchIn     []int
		favBy        string
		maxDownloads string

		toDownload      int
		downloadCaption bool
		downloaded      atomic.Int64
		search          inkbunny.SubmissionSearchResponse
	)

Login:
	user, source, persistSession, err := authenticateUser(config, false)
	if err != nil {
		log.Fatal("Failed to authenticate", "err", err)
	}
	if persistSession {
		if err := saveSession(user); err != nil {
			log.Warn("failed to save session", "err", err)
		}
	}
	logAuthenticatedUser(user, source)

	cleanup := prepareGuestSession(user, false)
	defer cleanup()

	usernameCache := flight.NewCache(user.SearchMembers)
	config.ApplyTo(&request, &searchIn, &favBy, &maxDownloads, nil, &downloadCaption)

	request.SearchInKeywords = nil
	request.Title = nil
	request.Description = nil
	request.MD5 = nil

	for _, v := range searchIn {
		switch v {
		case flags.Keywords:
			request.SearchInKeywords = &inkbunny.Yes
		case flags.Title:
			request.Title = &inkbunny.Yes
		case flags.Description:
			request.Description = &inkbunny.Yes
		case flags.MD5:
			request.MD5 = &inkbunny.Yes
		}
	}

	if favBy != "" {
		suggestions, _ := usernameCache.Get(favBy)
		for _, v := range suggestions {
			if v.SingleWord == favBy {
				request.FavsUserID = v.ID
			}
		}
	}

	if maxDownloads != "" {
		toDownload, err = strconv.Atoi(maxDownloads)
		if err != nil {
			log.Fatal(err)
		}
	}

	request.GetRID = inkbunny.Yes

	if request.Username != "" {
		suggestions, _ := usernameCache.Get(request.Username)
		for _, v := range suggestions {
			if strings.EqualFold(v.Value, request.Username) {
				request.UserID = v.ID
				break
			}
		}
	}

	spinner.New().
		Title("Searching...").
		Action(func() {
			search, err = user.SearchSubmissions(request)
		}).Run()
	if err != nil {
		if err, ok := errors.AsType[inkbunny.ErrorResponse](err); ok && err.Code != nil && *err.Code == inkbunny.ErrInvalidSessionID {
			invalidateAuthSource(&config, source)
			log.Warn("Session expired, please login again")
			goto Login
		}
		log.Fatal("failed to search submissions", "err", err)
	}
	log.Infof("Total number of submissions: %d", search.ResultsCountAll)
	if toDownload > 0 {
		log.Infof("To download: %d", toDownload)
	} else {
		log.Info("To download: Unlimited")
	}

	client := &http.Client{Timeout: 5 * time.Minute}
	downloader := utils.NewWorkerPool(runtime.NumCPU(), func(details inkbunny.SubmissionDetails) error {
		numOfFiles := len(details.Files)
		if numOfFiles == 0 {
			return nil
		}

		var keywords bytes.Buffer
		for i, keyword := range details.Keywords {
			if i > 0 {
				keywords.WriteString(", ")
			}
			keywords.WriteString(keyword.KeywordName)
		}

		submissionURL := fmt.Sprintf("https://inkbunny.net/s/%d", details.SubmissionID)
		padding := digitCount(numOfFiles)
		log.Debug("Downloading submission", "url", submissionURL, "files", numOfFiles)
		for i, file := range details.Files {
			if toDownload > 0 && int(downloaded.Load()) >= toDownload {
				return nil
			}

			folder := filepath.Join("inkbunny", details.Username)
			filename := filepath.Join(folder, filepath.Base(file.FileName))
			if fileExists(filename) {
				continue
			}
			if err := os.MkdirAll(folder, os.ModePerm); err != nil {
				return err
			}
			f, err := os.Create(filename)
			if err != nil {
				return err
			}
			defer f.Close()

			var resp *http.Response
			for {
				if !details.Public.Bool() {
					resp, err = client.Get(file.FileURLFull.String() + "?sid=" + user.SID)
				} else {
					resp, err = client.Get(file.FileURLFull.String())
				}
				if err != nil {
					return err
				}
				if resp.StatusCode == http.StatusOK {
					break
				}
				if resp.StatusCode == http.StatusTooManyRequests {
					resp.Body.Close()
					log.Warn("Rate limited, waiting 5 seconds before retrying...")
					time.Sleep(5 * time.Second)
					continue
				}
				resp.Body.Close()
				return fmt.Errorf("unexpected status code: %d", resp.StatusCode)
			}

			_, err = io.Copy(f, resp.Body)
			resp.Body.Close()
			if err != nil {
				return err
			}

			if downloadCaption && len(details.Keywords) > 0 {
				if err := os.WriteFile(strings.TrimSuffix(filename, filepath.Ext(filename))+".txt", keywords.Bytes(), 0o600); err != nil {
					return err
				}
			}

			log.Debug(fmt.Sprintf("Downloaded file %0*d/%0*d", padding, i+1, padding, numOfFiles), "url", file.FileURLFull)
			downloaded.Add(1)
		}
		if downloadCaption && len(details.Keywords) <= 0 {
			log.Warn("There are no keywords on the submission", "url", submissionURL)
		}
		log.Info("Downloaded submission", "url", submissionURL, "files", numOfFiles)
		return nil
	})

	go func() {
		defer downloader.Close()
		for page, err := range search.AllPages() {
			if err != nil {
				log.Error("Failed to search submissions", "err", err)
			}
			details, err := page.Details()
			if err != nil {
				log.Error("Failed to get submission details", "err", err)
				continue
			}
			downloader.Add(details.Submissions...)
			if toDownload > 0 && int(downloaded.Load()) >= toDownload {
				return
			}
		}
	}()

	for err := range downloader.Work() {
		if err != nil {
			log.Error("Failed to download submissions", "err", err)
		}
	}

	log.Infof("Downloaded %d files", downloaded.Load())
}
