// Package thumbnail 负责后台生成时间轴缩略图。
// 设计约束：可取消、切换视频时旧任务必须停止且旧图不得混入新视频、不使用 Base64 传输。
package thumbnail

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"

	"videocut/internal/ffmpeg"
)

// Item 是一张缩略图在前端所需的信息。
type Item struct {
	Index int     `json:"index"`
	Time  float64 `json:"time"`
	URL   string  `json:"url"`
}

// Manager 管理缩略图生成任务的生命周期，同一时刻只允许一个任务。
type Manager struct {
	mu     sync.Mutex
	dir    string
	cancel context.CancelFunc
	done   chan struct{}
}

// New 创建缩略图管理器。
func New(dir string) *Manager {
	return &Manager{dir: dir}
}

// Start 开始生成缩略图。会先取消并清理上一次任务。
// count 为期望张数；onProgress 每完成一张回调一次；onDone 在全部完成或失败时回调一次。
func (m *Manager) Start(src string, duration float64, count int,
	onProgress func(done, total int), onDone func(items []Item, err error)) {

	m.Cancel()
	m.clearDir()

	if count < 2 {
		count = 2
	}
	if duration <= 0 {
		onDone(nil, fmt.Errorf("视频时长无效"))
		return
	}

	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan struct{})
	m.mu.Lock()
	m.cancel = cancel
	m.done = done
	m.mu.Unlock()

	go func() {
		defer close(done)
		items, err := m.generate(ctx, src, duration, count, onProgress)
		if ctx.Err() == nil {
			onDone(items, err)
		}
		m.mu.Lock()
		if m.done == done {
			m.cancel = nil
			m.done = nil
		}
		m.mu.Unlock()
	}()
}

// Cancel 取消进行中的任务，并等待所有 FFmpeg 子进程退出。
func (m *Manager) Cancel() {
	m.mu.Lock()
	cancel := m.cancel
	done := m.done
	m.mu.Unlock()
	if cancel != nil {
		cancel()
	}
	if done != nil {
		<-done
	}
}

// generate 并发生成所有缩略图，按顺序返回。
func (m *Manager) generate(ctx context.Context, src string, duration float64, count int,
	onProgress func(done, total int)) ([]Item, error) {

	paths, err := ffmpeg.Resolve()
	if err != nil {
		return nil, err
	}
	if err := os.MkdirAll(m.dir, 0o755); err != nil {
		return nil, err
	}

	items := make([]Item, count)
	errs := make([]error, count)
	done := make(chan int, count)

	sem := make(chan struct{}, 4) // 并发度
	var completed int
	var mu sync.Mutex

	for i := 0; i < count; i++ {
		go func(i int) {
			select {
			case sem <- struct{}{}:
			case <-ctx.Done():
				done <- i
				return
			}
			defer func() { <-sem }()
			if ctx.Err() != nil {
				done <- i
				return
			}

			// 均匀取点，避开首尾各 1% 的位置
			t := duration * float64(i) / float64(count-1)
			if t < 0 {
				t = 0
			}
			if t > duration-0.05 {
				t = duration - 0.05
			}

			name := fmt.Sprintf("thumb_%02d.jpg", i)
			out := filepath.Join(m.dir, name)
			args := []string{
				"-y",
				"-ss", fmt.Sprintf("%.3f", t),
				"-i", src,
				"-frames:v", "1",
				"-vf", "scale=-2:120",
				"-q:v", "6",
				out,
			}
			if err := ffmpeg.Run(ctx, paths.FFmpeg, args); err != nil {
				errs[i] = err
			} else if ctx.Err() == nil {
				items[i] = Item{Index: i, Time: t, URL: "/media/thumbs/" + name}
			}

			mu.Lock()
			completed++
			if ctx.Err() == nil && onProgress != nil {
				onProgress(completed, count)
			}
			mu.Unlock()
			done <- i
		}(i)
	}

	for i := 0; i < count; i++ {
		<-done
	}

	if ctx.Err() != nil {
		return nil, ctx.Err()
	}

	// 只要成功了一半以上就认为可用；单张失败不该阻断裁剪
	success := 0
	final := make([]Item, 0, count)
	for i := range items {
		if items[i].URL != "" {
			success++
			final = append(final, items[i])
		}
	}
	if success == 0 && len(errs) > 0 && errs[0] != nil {
		return nil, fmt.Errorf("无法生成缩略图，仍可继续裁剪")
	}
	return final, nil
}

// clearDir 清空缩略图目录，保证切换视频后旧图不会残留。
func (m *Manager) clearDir() {
	entries, err := os.ReadDir(m.dir)
	if err != nil {
		return
	}
	for _, e := range entries {
		if e.IsDir() {
			continue
		}
		if strings.HasPrefix(e.Name(), "thumb_") && strings.HasSuffix(e.Name(), ".jpg") {
			_ = os.Remove(filepath.Join(m.dir, e.Name()))
		}
	}
}
