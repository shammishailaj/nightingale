package cache

import (
	"sync"

	"github.com/toolkits/pkg/logger"
)

//TagKeys
type TagkvIndex struct {
	sync.RWMutex
	Tagkv map[string]map[string]int64 //map[tagk]map[tagv]ts
}

func NewTagkvIndex() *TagkvIndex {
	return &TagkvIndex{
		Tagkv: make(map[string]map[string]int64),
	}
}

func (t *TagkvIndex) Set(tagk, tagv string, now int64) {
	t.Lock()
	defer t.Unlock()

	if _, exists := t.Tagkv[tagk]; !exists {
		t.Tagkv[tagk] = make(map[string]int64)
	}
	t.Tagkv[tagk][tagv] = now
}

func (t *TagkvIndex) GetTagkv() []*TagPair {
	t.RLock()
	defer t.RUnlock()
	tagkvs := []*TagPair{}
	var vs []string
	for k, vm := range t.Tagkv {
		for v, _ := range vm {
			vs = append(vs, v)
		}
		tagkv := TagPair{
			Key:    k,
			Values: vs,
		}
		tagkvs = append(tagkvs, &tagkv)
	}

	return tagkvs
}

func (t *TagkvIndex) GetTagkvMap() map[string][]string {
	t.RLock()
	defer t.RUnlock()
	tagkvs := make(map[string][]string)

	var vs []string
	for k, vm := range t.Tagkv {
		for v, _ := range vm {
			vs = append(vs, v)
		}

		tagkvs[k] = vs
	}

	return tagkvs
}

func (t *TagkvIndex) Clean(now, timeDuration int64) {
	t.Lock()
	defer t.Unlock()

	for k, vm := range t.Tagkv {
		for v, ts := range vm {
			if now-ts > timeDuration {
				delete(t.Tagkv[k], v)
				logger.Errorf("[clean index tagkv] tagk:%s %s now:%d time duration:%d updated:%d",
					k, v, now, timeDuration, ts)
			}
		}
		if len(t.Tagkv[k]) == 0 {
			delete(t.Tagkv, k)
		}
	}
}

func (t *TagkvIndex) DelTagkv(tagk, tagv string) {
	t.Lock()
	defer t.Unlock()

	if _, exists := t.Tagkv[tagk]; exists {
		delete(t.Tagkv[tagk], tagv)
	}

	if len(t.Tagkv[tagk]) == 0 {
		delete(t.Tagkv, tagk)
	}
}

func (t *TagkvIndex) Len() int {
	t.RLock()
	defer t.RUnlock()

	return len(t.Tagkv)
}
