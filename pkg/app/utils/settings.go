package utils

import "runtime"

const MaxConcurrentDownloads = 16

func DefaultMaxActive() int {
	value := runtime.NumCPU() / 6
	if value < 1 {
		value = 1
	}
	if value > 6 {
		value = 6
	}
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
