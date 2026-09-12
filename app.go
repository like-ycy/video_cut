package main

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"

	"github.com/wailsapp/wails/v2/pkg/runtime"

	"videocut/internal/export"
	"videocut/internal/ffmpeg"
	"videocut/internal/fsutil"
	"videocut/internal/preview"
	"videocut/internal/thumbnail"
	"videocut/internal/video"
)

// 事件名，前端通过 EventsOn 监听。
const (
	EventVideoOpened   = "video:opened"
	EventVideoFailed   = "video:failed"
	EventPreviewReady  = "preview:ready"
	EventThumbProgress = "thumb:progress"
	EventThumbDone     = "thumb:done"
	EventExportStart   = "export:start"
	EventExportProg    = "export:progress"
	EventExportDone    = "export:done"
	EventExportFailed  = "export:failed"
)

// 支持的视频扩展名（其他格式以实际探测结果决定）。
var supportedExt = map[string]bool{
	"mp4": true, "mov": true, "mkv": true, "m4v": true, "webm": true, "avi": true, "ts": true, "flv": true, "wmv": true,
}

// App 是暴露给前端的绑定对象。
type App struct {
	ctx context.Context

	media  *preview.Server
	thumbs *thumbnail.Manager

	mu          sync.Mutex
	jobsMu      sync.Mutex
	info        *video.MediaInfo
	tmpRoot     string
	mediaBase   string // 本地媒体服务地址，如 http://127.0.0.1:52341
	openSeq     int
	openReqSeq  int
	exportSeq   int
	closing     bool
	openCancel  context.CancelFunc
	openProbeWG sync.WaitGroup

	proxyCancel  context.CancelFunc
	proxyDone    chan struct{}
	exportCancel context.CancelFunc
	exportDone   chan struct{}
	exporting    bool
}

// NewApp 创建带私有缓存目录的 App 实例。
func NewApp() (*App, error) {
	tmpRoot, err := os.MkdirTemp("", "videocut-")
	if err != nil {
		return nil, fmt.Errorf("创建临时目录失败: %w", err)
	}
	thumbDir := filepath.Join(tmpRoot, "thumbs")
	if err := os.MkdirAll(thumbDir, 0o700); err != nil {
		_ = os.RemoveAll(tmpRoot)
		return nil, fmt.Errorf("创建缩略图目录失败: %w", err)
	}

	return &App{
		tmpRoot: tmpRoot,
		media:   preview.New(thumbDir),
		thumbs:  thumbnail.New(thumbDir),
	}, nil
}

// startup 在应用启动时调用。
func (a *App) startup(ctx context.Context) {
	a.ctx = ctx

	// 提前解析一次 FFmpeg，失败时前端打开视频会立刻得到可读原因
	if p, err := ffmpeg.Resolve(); err != nil {
		runtime.LogError(ctx, "FFmpeg 未找到: "+err.Error())
	} else {
		runtime.LogInfo(ctx, "FFmpeg: "+p.FFmpeg)
	}

	// 启动本地媒体服务（仅监听 127.0.0.1）
	base, err := a.media.Start()
	if err != nil {
		runtime.LogError(ctx, "媒体服务启动失败: "+err.Error())
	} else {
		a.mu.Lock()
		a.mediaBase = base
		a.mu.Unlock()
		runtime.LogInfo(ctx, "媒体服务: "+base)
	}
}

// shutdown 在应用退出时清理临时文件并停止任务。
func (a *App) shutdown(ctx context.Context) {
	a.stopOpenProbe()
	a.jobsMu.Lock()
	a.cancelPreviewTasks()
	a.cancelExportAndWait()
	a.jobsMu.Unlock()
	a.media.Close()
	if a.tmpRoot != "" {
		_ = os.RemoveAll(a.tmpRoot)
	}
}

// EnvInfo 返回运行环境信息，用于排查问题。
type EnvInfo struct {
	FFmpeg  string `json:"ffmpeg"`
	FFprobe string `json:"ffprobe"`
	OK      bool   `json:"ok"`
}

// GetEnv 返回 FFmpeg 路径信息。
func (a *App) GetEnv() EnvInfo {
	p, err := ffmpeg.Resolve()
	if err != nil {
		return EnvInfo{OK: false}
	}
	return EnvInfo{FFmpeg: p.FFmpeg, FFprobe: p.FFprobe, OK: true}
}

// OpenVideoDialog 打开系统文件选择框并载入视频。
func (a *App) OpenVideoDialog() error {
	if a.ctx == nil {
		return fmt.Errorf("应用尚未就绪")
	}
	path, err := runtime.OpenFileDialog(a.ctx, runtime.OpenDialogOptions{
		Title: "选择视频",
		Filters: []runtime.FileFilter{
			{DisplayName: "视频文件", Pattern: "*.mp4;*.mov;*.mkv;*.m4v;*.webm;*.avi"},
		},
	})
	if err != nil {
		return err
	}
	if path == "" {
		return nil // 用户取消
	}
	return a.OpenPath(path)
}

// OpenPath 载入指定路径的视频（系统选择框或拖放共用）。
func (a *App) OpenPath(path string) error {
	if a.ctx == nil {
		return fmt.Errorf("应用尚未就绪")
	}
	seq, probeCtx, err := a.beginOpenProbe()
	if err != nil {
		return err
	}
	defer a.finishOpenProbe(seq)

	ext := strings.ToLower(strings.TrimPrefix(filepath.Ext(path), "."))
	if !supportedExt[ext] {
		a.emitOpenFailure(seq, "暂不支持该文件格式，请先转换为 MP4 / MOV / MKV")
		return nil
	}

	info, err := video.Probe(probeCtx, path)
	if err != nil {
		if probeCtx.Err() == nil {
			a.emitOpenFailure(seq, err.Error())
		}
		return nil
	}
	if probeCtx.Err() != nil {
		return nil
	}

	a.jobsMu.Lock()
	defer a.jobsMu.Unlock()
	if !a.commitOpenProbe(seq, info) {
		return nil
	}

	// 切换视频前等待旧任务退出，避免结果或缓存回写到新视频。
	a.cancelExportAndWait()
	a.cancelPreviewTasks()
	a.clearProxyCache()
	a.media.SetOriginal(path)
	runtime.EventsEmit(a.ctx, EventVideoOpened, map[string]interface{}{"seq": seq, "info": info})
	a.startThumbnails(seq, path, info.Duration)

	// WebView 无法直接播放时，后台生成预览代理
	if info.NeedsProxy {
		a.startProxy(seq, path)
	}

	return nil
}

func (a *App) beginOpenProbe() (int, context.Context, error) {
	a.mu.Lock()
	if a.closing {
		a.mu.Unlock()
		return 0, nil, fmt.Errorf("应用正在关闭")
	}
	previousCancel := a.openCancel
	a.openReqSeq++
	seq := a.openReqSeq
	ctx, cancel := context.WithCancel(a.ctx)
	a.openCancel = cancel
	a.openProbeWG.Add(1)
	a.mu.Unlock()
	if previousCancel != nil {
		previousCancel()
	}
	return seq, ctx, nil
}

func (a *App) finishOpenProbe(seq int) {
	a.mu.Lock()
	if a.openReqSeq == seq {
		a.openCancel = nil
	}
	a.mu.Unlock()
	a.openProbeWG.Done()
}

func (a *App) commitOpenProbe(seq int, info *video.MediaInfo) bool {
	a.mu.Lock()
	defer a.mu.Unlock()
	if a.closing || a.openReqSeq != seq {
		return false
	}
	a.openSeq = seq
	a.info = info
	return true
}

func (a *App) isCurrentOpenProbe(seq int) bool {
	a.mu.Lock()
	defer a.mu.Unlock()
	return !a.closing && a.openReqSeq == seq
}

func (a *App) emitOpenFailure(seq int, message string) {
	if a.isCurrentOpenProbe(seq) {
		runtime.EventsEmit(a.ctx, EventVideoFailed, message)
	}
}

func (a *App) stopOpenProbe() {
	a.mu.Lock()
	a.closing = true
	cancel := a.openCancel
	a.mu.Unlock()
	if cancel != nil {
		cancel()
	}
	a.openProbeWG.Wait()
}

// startThumbnails 启动缩略图生成任务。
func (a *App) startThumbnails(seq int, path string, duration float64) {
	a.thumbs.Start(path, duration, 15,
		func(done, total int) {
			if a.currentOpen(seq) {
				runtime.EventsEmit(a.ctx, EventThumbProgress, map[string]int{"seq": seq, "done": done, "total": total})
			}
		},
		func(items []thumbnail.Item, err error) {
			if !a.currentOpen(seq) {
				return
			}
			if err != nil {
				runtime.EventsEmit(a.ctx, EventThumbDone, map[string]interface{}{"seq": seq, "items": []thumbnail.Item{}, "error": err.Error()})
				return
			}
			// 补全为可访问的完整地址
			a.mu.Lock()
			base := a.mediaBase
			a.mu.Unlock()
			full := make([]thumbnail.Item, len(items))
			for i, it := range items {
				full[i] = it
				full[i].URL = base + it.URL
			}
			runtime.EventsEmit(a.ctx, EventThumbDone, map[string]interface{}{"seq": seq, "items": full, "error": ""})
		},
	)
}

func (a *App) startProxy(seq int, path string) {
	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan struct{})
	a.mu.Lock()
	a.proxyCancel = cancel
	a.proxyDone = done
	a.mu.Unlock()

	go func() {
		defer close(done)
		defer func() {
			a.mu.Lock()
			if a.proxyDone == done {
				a.proxyCancel = nil
				a.proxyDone = nil
			}
			a.mu.Unlock()
		}()

		out, err := preview.BuildProxy(ctx, path, filepath.Join(a.tmpRoot, "proxy"))
		if ctx.Err() != nil {
			return
		}
		if err != nil || out == "" {
			if a.currentOpen(seq) {
				runtime.EventsEmit(a.ctx, EventPreviewReady, map[string]interface{}{"seq": seq, "ready": false})
			}
			return
		}
		a.mu.Lock()
		if a.openSeq != seq {
			a.mu.Unlock()
			return
		}
		a.media.SetCurrent(out)
		a.mu.Unlock()
		runtime.EventsEmit(a.ctx, EventPreviewReady, map[string]interface{}{"seq": seq, "ready": true})
	}()
}

func (a *App) currentOpen(seq int) bool {
	a.mu.Lock()
	defer a.mu.Unlock()
	return a.openSeq == seq
}

func (a *App) cancelPreviewTasks() {
	a.thumbs.Cancel()
	a.cancelProxyAndWait()
}

func (a *App) cancelProxyAndWait() {
	a.mu.Lock()
	cancel := a.proxyCancel
	done := a.proxyDone
	a.mu.Unlock()
	if cancel != nil {
		cancel()
	}
	if done != nil {
		<-done
	}
}

// clearProxyCache 删除上一个视频遗留的预览代理。
// 必须在探测成功之后调用：打开失败时要保留当前视频继续播放。
func (a *App) clearProxyCache() {
	if a.tmpRoot == "" {
		return
	}
	_ = os.RemoveAll(filepath.Join(a.tmpRoot, "proxy"))
}

// ClearMedia 关闭当前视频并释放预览相关任务与缓存。
func (a *App) ClearMedia() {
	a.mu.Lock()
	a.openReqSeq++
	openCancel := a.openCancel
	a.openCancel = nil
	a.mu.Unlock()
	if openCancel != nil {
		openCancel()
	}

	a.jobsMu.Lock()
	defer a.jobsMu.Unlock()

	a.thumbs.Clear()
	a.cancelProxyAndWait()
	a.clearProxyCache()
	a.media.Clear()
	a.mu.Lock()
	a.info = nil
	a.openSeq++
	a.mu.Unlock()
}

// CurrentMediaURL 返回当前视频的完整访问地址，带序号避免浏览器缓存旧内容。
func (a *App) CurrentMediaURL() string {
	a.mu.Lock()
	base := a.mediaBase
	a.mu.Unlock()
	return fmt.Sprintf("%s/media/current?n=%d", base, a.media.Revision())
}

// GetMediaInfo 返回当前视频信息。
func (a *App) GetMediaInfo() *video.MediaInfo {
	a.mu.Lock()
	defer a.mu.Unlock()
	return a.info
}

// ExportVideo 执行导出：先弹出保存对话框，再后台裁剪。
// 返回 "started" 表示任务已启动；返回空串表示用户在保存对话框中取消。
// 导出结果通过事件通知前端。
func (a *App) ExportVideo(mode string, start, end float64) (string, error) {
	if a.ctx == nil {
		return "", fmt.Errorf("应用尚未就绪")
	}
	a.mu.Lock()
	info := a.info
	exporting := a.exporting
	openSeq := a.openSeq
	a.mu.Unlock()

	if info == nil {
		return "", fmt.Errorf("请先打开视频")
	}
	if exporting {
		return "", fmt.Errorf("正在导出，请稍候")
	}

	m := export.ModeFast
	if mode == "exact" {
		m = export.ModeExact
	}

	src := a.media.Original()
	if src == "" {
		src = info.Path
	}
	if info.Duration > 0 && end > info.Duration {
		end = info.Duration
	}
	if end-start < 1 {
		return "", fmt.Errorf("保留时长至少需要 1 秒")
	}

	// 保存对话框：默认同目录 + 原文件名_trimmed
	defaultName := fsutil.DefaultOutputName(src)
	chosen, err := runtime.SaveFileDialog(a.ctx, runtime.SaveDialogOptions{
		Title:                "导出视频",
		DefaultDirectory:     filepath.Dir(src),
		DefaultFilename:      defaultName,
		CanCreateDirectories: true,
		Filters: []runtime.FileFilter{
			{DisplayName: "视频文件", Pattern: "*" + strings.ToLower(filepath.Ext(src))},
		},
	})
	if err != nil {
		return "", err
	}
	if chosen == "" {
		return "", nil // 用户取消
	}

	// 确认保存前再次检查，永不覆盖已有文件或源文件
	final := chosen
	if _, err := os.Stat(final); err == nil {
		final = fsutil.UniqueTarget(filepath.Dir(chosen), filepath.Base(chosen), []string{src})
	}
	if fsutil.SameFile(final, src) {
		final = fsutil.UniqueTarget(filepath.Dir(chosen), filepath.Base(chosen), []string{src})
	}

	a.jobsMu.Lock()
	defer a.jobsMu.Unlock()
	a.mu.Lock()
	if a.exporting {
		a.mu.Unlock()
		return "", fmt.Errorf("正在导出，请稍候")
	}
	if a.openSeq != openSeq {
		a.mu.Unlock()
		return "", fmt.Errorf("视频已切换，请重新导出")
	}
	a.mu.Unlock()

	// 导出不需要预览，先释放代理与缩略图任务占用的 CPU、磁盘和缓存文件。
	a.cancelPreviewTasks()
	runtime.EventsEmit(a.ctx, EventPreviewReady, map[string]interface{}{"seq": openSeq, "ready": false})
	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan struct{})
	a.mu.Lock()
	a.exportCancel = cancel
	a.exportDone = done
	a.exporting = true
	a.exportSeq++
	seq := a.exportSeq
	a.mu.Unlock()

	runtime.EventsEmit(a.ctx, EventExportStart, map[string]interface{}{"mode": string(m), "seq": seq})

	go func() {
		defer func() {
			a.mu.Lock()
			if a.exportDone == done {
				a.exporting = false
				a.exportCancel = nil
				a.exportDone = nil
			}
			a.mu.Unlock()
			close(done)
		}()

		audioCodec := ""
		if len(info.AudioCodecs) > 0 {
			audioCodec = info.AudioCodecs[0]
		}
		req := export.Request{
			Src:           src,
			Mode:          m,
			Start:         start,
			End:           end,
			Output:        final,
			VideoCodec:    info.VideoCodec,
			AudioCodec:    audioCodec,
			SubtitleCount: info.SubtitleCount,
		}

		var onProg func(export.Progress)
		if m == export.ModeExact {
			onProg = func(p export.Progress) {
				runtime.EventsEmit(a.ctx, EventExportProg, map[string]interface{}{"seq": seq, "progress": p})
			}
		}

		result, err := export.Run(ctx, req, onProg)
		if err != nil {
			if ctx.Err() != nil {
				runtime.EventsEmit(a.ctx, EventExportFailed, map[string]interface{}{
					"message": "已取消导出",
					"detail":  "",
					"seq":     seq,
				})
				return
			}
			runtime.EventsEmit(a.ctx, EventExportFailed, map[string]interface{}{
				"message": err.Error(),
				"detail":  ffmpeg.OutputOf(err),
				"seq":     seq,
			})
			return
		}

		runtime.EventsEmit(a.ctx, EventExportDone, map[string]interface{}{"seq": seq, "result": result})
	}()

	return "started", nil
}

// CancelExport 取消进行中的导出。
func (a *App) CancelExport() {
	a.jobsMu.Lock()
	a.cancelExportAndWait()
	a.jobsMu.Unlock()
}

// cancelExportAndWait 终止 FFmpeg 进程，并等待导出清理临时文件。
func (a *App) cancelExportAndWait() {
	a.mu.Lock()
	cancel := a.exportCancel
	done := a.exportDone
	a.mu.Unlock()
	if cancel != nil {
		cancel()
	}
	if done != nil {
		<-done
	}
}

// RevealInFolder 在系统文件管理器中显示文件。
func (a *App) RevealInFolder(path string) error {
	return fsutil.Reveal(path)
}

// mediaServer 返回媒体服务，供 main.go 挂载到资源服务器。
// 使用小写开头，避免被暴露为前端可调用的方法。
func (a *App) mediaServer() *preview.Server {
	return a.media
}
