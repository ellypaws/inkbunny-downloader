package flight

import (
	"sync"
)

type Cache[K comparable, V any] struct {
	finished map[K]V
	fmu      *sync.RWMutex
	pending  map[K]*job[V]
	pmu      *sync.Mutex
	work     func(K) (V, error)
}

type job[V any] struct {
	val  V
	err  error
	done chan struct{}
}

func NewCache[K comparable, V any](work func(K) (V, error)) Cache[K, V] {
	return Cache[K, V]{
		finished: make(map[K]V),
		fmu:      new(sync.RWMutex),
		pending:  make(map[K]*job[V]),
		pmu:      new(sync.Mutex),
		work:     work,
	}
}

func (p *Cache[K, V]) Get(k K) (V, error) {
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
		<-pending.done
		return pending.val, pending.err
	}

	j := job[V]{done: make(chan struct{})}
	p.pending[k] = &j
	p.pmu.Unlock()

	j.val, j.err = p.work(k)
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
