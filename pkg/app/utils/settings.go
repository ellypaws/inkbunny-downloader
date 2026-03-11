package utils

import "runtime"

const MaxConcurrentDownloads = 16

func DefaultMaxActive() int {
	value := min(max(runtime.NumCPU()/6, 1), 6)
	return value
}

func NormalizeMaxActive(value int) int {
	if value <= 0 {
		return DefaultMaxActive()
	}
	if value > MaxConcurrentDownloads {
		return MaxConcurrentDownloads
	}
	return value
}
