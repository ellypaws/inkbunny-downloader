package flight

import (
	"context"
	"sync"
)

type Cache[K comparable, V any] struct {
	finished map[K]V
	fmu      *sync.RWMutex
	pending  map[K]*job[V]
	pmu      *sync.Mutex
	work     func(context.Context, K) (V, error)
}

type job[V any] struct {
	val  V
	err  error
	done chan struct{}
}

func NewCache[K comparable, V any](work func(context.Context, K) (V, error)) Cache[K, V] {
	return Cache[K, V]{
		finished: make(map[K]V),
		fmu:      new(sync.RWMutex),
		pending:  make(map[K]*job[V]),
		pmu:      new(sync.Mutex),
		work:     work,
	}
}

func (p *Cache[K, V]) Get(k K) (V, error) {
	return p.GetWithContext(context.Background(), k)
}

func (p *Cache[K, V]) GetWithContext(ctx context.Context, k K) (V, error) {
	var zero V
	if ctx == nil {
		ctx = context.Background()
	}

	p.pmu.Lock()
	p.fmu.RLock()
	finished, ok := p.finished[k]
	p.fmu.RUnlock()
	if ok {
		p.pmu.Unlock()
		return finished, nil
	}

	pending, ok := p.pending[k]
	if ok {
		p.pmu.Unlock()
		select {
		case <-pending.done:
			return pending.val, pending.err
		case <-ctx.Done():
			return zero, ctx.Err()
		}
	}

	j := job[V]{done: make(chan struct{})}
	p.pending[k] = &j
	p.pmu.Unlock()

	j.val, j.err = p.work(ctx, k)
	if j.err == nil {
		p.fmu.Lock()
		p.finished[k] = j.val
		p.fmu.Unlock()
	}

	p.pmu.Lock()
	close(j.done)
	delete(p.pending, k)
	p.pmu.Unlock()

	return j.val, j.err
}

func (p *Cache[K, V]) Delete(k K) {
	p.pmu.Lock()
	defer p.pmu.Unlock()

	p.fmu.Lock()
	delete(p.finished, k)
	p.fmu.Unlock()
}

func (p *Cache[K, V]) Clear() {
	p.pmu.Lock()
	defer p.pmu.Unlock()

	p.fmu.Lock()
	clear(p.finished)
	p.fmu.Unlock()
}

func (p *Cache[K, V]) Peek(k K) (V, bool) {
	p.fmu.RLock()
	defer p.fmu.RUnlock()

	value, ok := p.finished[k]
	return value, ok
}

func (p *Cache[K, V]) Store(k K, value V) {
	p.pmu.Lock()
	defer p.pmu.Unlock()

	p.fmu.Lock()
	p.finished[k] = value
	p.fmu.Unlock()
}
