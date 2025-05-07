package utils

import (
	"iter"
	"sync"
)

type WorkerPool[J any, R any] struct {
	workers int

	working sync.Once
	work    func(J) R

	closed    bool
	closing   chan struct{}
	jobs      chan jobRequest[J, R]
	responses chan R
}

// jobRequest wraps a job and optionally a promise channel.
type jobRequest[J any, R any] struct {
	job     J
	promise chan R // nil if not a promise job
}

// NewWorkerPool creates a new worker pool with the given number of workers.
// The job channel is buffered to the number of workers.
// The work function should use the channel to receive jobs, and use the callback function to send responses.
// Inside the work function, the callback function should only be called synchronously or the program might panic.
func NewWorkerPool[J any, R any](workers int, work func(J) R) WorkerPool[J, R] {
	return WorkerPool[J, R]{
		workers:   workers,
		work:      work,
		jobs:      make(chan jobRequest[J, R], workers),
		responses: make(chan R),
		closing:   make(chan struct{}),
	}
}

// Cap returns the capacity of the worker pool.
func (p *WorkerPool[_, _]) Cap() int { return p.workers }

// Closed returns true if the response channel is closed.
func (p *WorkerPool[_, _]) Closed() bool { return p.closed }

// Work starts the worker pool and returns a channel of Response[R] to receive results.
// Can be called concurrently to receive in multiple places.
func (p *WorkerPool[_, R]) Work() <-chan R {
	p.working.Do(p.do)
	return p.responses
}

func (p *WorkerPool[_, R]) Wait() {
	<-p.closing
	return
}

func (p *WorkerPool[_, R]) Done() <-chan struct{} {
	return p.closing
}

// do launches worker goroutines that consume jobRequests.
func (p *WorkerPool[J, R]) do() {
	var workSet sync.WaitGroup
	workSet.Add(p.workers)
	for range p.workers {
		go func() {
			for req := range p.jobs {
				workSet.Add(1)
				r := p.work(req.job)
				go func() {
					select {
					case p.responses <- r:
					case req.promise <- r:
						req.promise = nil
					}
					workSet.Done()
				}()
			}
			workSet.Done()
		}()
	}

	go func() {
		workSet.Wait()
		close(p.responses)
		p.closed = true
		close(p.closing)
	}()
}

// Add adds jobs to the worker pool. It blocks if the pool is full.
func (p *WorkerPool[J, R]) Add(j ...J) {
	for _, job := range j {
		p.jobs <- jobRequest[J, R]{job: job}
	}
}

// Promise enqueues a job with an attached promise channel and returns that channel.
// The promise channel is buffered with one element.
func (p *WorkerPool[J, R]) Promise(j J) <-chan R {
	promiseCh := make(chan R)
	go func() { p.jobs <- jobRequest[J, R]{job: j, promise: promiseCh} }()
	return promiseCh
}

// AddIter adds jobs to the worker pool from an iterator. It blocks if the pool is full.
func (p *WorkerPool[J, R]) AddIter(j iter.Seq[J]) {
	for job := range j {
		p.jobs <- jobRequest[J, R]{job: job}
	}
}

// AddAndClose adds jobs to the worker pool and calls Close it after all jobs are added. It blocks if the pool is full.
func (p *WorkerPool[J, R]) AddAndClose(j ...J) {
	for _, job := range j {
		p.jobs <- jobRequest[J, R]{job: job}
	}
	p.Close()
}

// AddAndCloseIter adds jobs to the worker pool from an iterator and closes it after all jobs are added.
func (p *WorkerPool[J, R]) AddAndCloseIter(j iter.Seq[J]) {
	for job := range j {
		p.jobs <- jobRequest[J, R]{job: job}
	}
	p.Close()
}

// Close closes the worker pool. It should be called after all jobs are added.
// All Add methods panic when Close is called.
func (p *WorkerPool[_, _]) Close() {
	close(p.jobs)
}

// Iter returns an iterator that yields the results R from the worker pool.
// It returns and consumes each result as it is received.
// Make sure to call Work before calling Iter.
func (p *WorkerPool[_, R]) Iter() iter.Seq[R] {
	return func(yield func(R) bool) {
		for r := range p.responses {
			if !yield(r) {
				return
			}
		}
	}
}

// Iter2 returns an iterator that yields the results R from the worker pool.
// It returns the index of the result and the result itself.
func (p *WorkerPool[_, R]) Iter2() iter.Seq2[int, R] {
	var i int
	return func(yield func(int, R) bool) {
		for r := range p.responses {
			if !yield(i, r) {
				return
			}
			i++
		}
	}
}

// Iter returns an iterator that yields the results R from a channel.
// It returns the index of the result and the result itself.
func Iter[R any](results <-chan R) iter.Seq[R] {
	var i int
	return func(yield func(R) bool) {
		for res := range results {
			if !yield(res) {
				return
			}
			i++
		}
	}
}

// Unpack unpacks the results from an iterator of ~[]R and returns them as iter.Seq[R].
// This is equivalent to using slices.Values but for iter.Seq.
func Unpack[S ~[]R, R any](results iter.Seq[S]) iter.Seq[R] {
	return func(yield func(R) bool) {
		for slice := range results {
			for _, v := range slice {
				if !yield(v) {
					return
				}
			}
		}
	}
}
