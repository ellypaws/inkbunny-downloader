package desktopapp

import (
	"crypto/md5"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
	"sync"
)

type fileVerificationResult struct {
	Exists  bool
	Matches bool
	Size    int64
}

type fileVerificationCacheKey struct {
	Path         string
	ExpectedMD5  string
	Size         int64
	ModifiedUnix int64
}

type fileVerifier struct {
	mu    sync.Mutex
	cache map[fileVerificationCacheKey]fileVerificationResult
}

var sharedFileVerifier = &fileVerifier{
	cache: make(map[fileVerificationCacheKey]fileVerificationResult),
}

func verifyDownloadedFile(path string, expectedMD5 string) (fileVerificationResult, error) {
	return sharedFileVerifier.Verify(path, expectedMD5)
}

func (v *fileVerifier) Verify(path string, expectedMD5 string) (fileVerificationResult, error) {
	cleanPath := filepath.Clean(strings.TrimSpace(path))
	if cleanPath == "" {
		return fileVerificationResult{}, nil
	}

	info, err := os.Stat(cleanPath)
	if err != nil {
		if os.IsNotExist(err) {
			return fileVerificationResult{}, nil
		}
		return fileVerificationResult{}, err
	}
	if info.IsDir() {
		return fileVerificationResult{}, nil
	}

	trimmedMD5 := strings.ToLower(strings.TrimSpace(expectedMD5))
	if trimmedMD5 == "" {
		return fileVerificationResult{
			Exists:  true,
			Matches: true,
			Size:    info.Size(),
		}, nil
	}

	key := fileVerificationCacheKey{
		Path:         cleanPath,
		ExpectedMD5:  trimmedMD5,
		Size:         info.Size(),
		ModifiedUnix: info.ModTime().UnixNano(),
	}

	v.mu.Lock()
	cached, ok := v.cache[key]
	v.mu.Unlock()
	if ok {
		return cached, nil
	}

	file, err := os.Open(cleanPath)
	if err != nil {
		return fileVerificationResult{}, err
	}
	defer file.Close()

	hasher := md5.New()
	if _, err := io.Copy(hasher, file); err != nil {
		return fileVerificationResult{}, err
	}

	result := fileVerificationResult{
		Exists:  true,
		Matches: fmt.Sprintf("%x", hasher.Sum(nil)) == trimmedMD5,
		Size:    info.Size(),
	}

	v.mu.Lock()
	v.cache[key] = result
	v.mu.Unlock()

	return result, nil
}

func downloadFilePath(root, username, fileName string) string {
	if strings.TrimSpace(root) == "" || strings.TrimSpace(username) == "" || strings.TrimSpace(fileName) == "" {
		return ""
	}
	return filepath.Join(root, username, filepath.Base(fileName))
}
