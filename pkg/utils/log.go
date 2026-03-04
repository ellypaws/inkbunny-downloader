package utils

import (
	"io"
	"os"

	"github.com/charmbracelet/log"
)

func LogOutput(writer io.Writer) func() {
	f, _ := os.OpenFile("log.txt", os.O_WRONLY|os.O_CREATE|os.O_TRUNC, 0666)

	mw := io.MultiWriter(writer, f)
	r, w, _ := os.Pipe()

	log.SetOutput(mw)

	exit := make(chan bool)

	go func() {
		_, _ = io.Copy(mw, r)
		exit <- true
		close(exit)
	}()

	return func() {
		_ = w.Close()
		<-exit
		_ = f.Close()
	}
}
