// Package preview 提供受限的本地媒体访问：只向外暴露"当前已打开的视频"和"缩略图目录"。
// 前端不能传入任意路径，避免把整个磁盘暴露给 WebView。
package preview

import (
	"context"
	"fmt"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"videocut/internal/ffmpeg"
)

// Server 同时承担两件事：记住当前视频，以及处理 /media/* 请求。
type Server struct {
	mu         sync.RWMutex
	current    string // 当前用于播放的文件（可能是原文件，也可能是预览代理）
	original   string // 原始文件（导出始终使用它）
	revision   uint64 // 每次媒体切换递增，供前端刷新 <video>
	thumbDir   string // 缩略图目录，只有其中的文件可被访问
	listener   net.Listener
	httpServer *http.Server
}

// New 创建媒体服务。
func New(thumbDir string) *Server {
	return &Server{thumbDir: thumbDir}
}

// SetOriginal 设置原始视频路径，并将其作为可播放文件。
func (s *Server) SetOriginal(path string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.original = path
	s.current = path
	s.revision++
}

// SetCurrent 设置当前用于播放的文件（预览代理生成完成后调用）。
func (s *Server) SetCurrent(path string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.current = path
	s.revision++
}

// Original 返回原始视频路径。
func (s *Server) Original() string {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.original
}

// Current 返回当前播放文件路径。
func (s *Server) Current() string {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.current
}

// Revision 返回当前媒体版本，供浏览器区分同一 URL 的新内容。
func (s *Server) Revision() uint64 {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.revision
}

// Start 在 127.0.0.1 的随机端口上启动独立的媒体服务，返回可访问的基础地址。
// 之所以不复用 Wails 的资源服务器：开发模式下页面由 Vite 提供，
// 类似 /media/current 的请求会被 Vite 的 SPA fallback 拦截并返回 index.html，
// 导致视频无法加载。独立端口可保证开发模式与生产模式行为一致。
func (s *Server) Start() (string, error) {
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		return "", err
	}
	s.listener = ln
	s.httpServer = &http.Server{Handler: s}

	go func() {
		_ = s.httpServer.Serve(ln)
	}()

	return fmt.Sprintf("http://127.0.0.1:%d", ln.Addr().(*net.TCPAddr).Port), nil
}

// Close 停止媒体服务。
func (s *Server) Close() {
	if s.httpServer != nil {
		ctx, cancel := context.WithTimeout(context.Background(), time.Second)
		defer cancel()
		_ = s.httpServer.Shutdown(ctx)
		s.httpServer = nil
	}
}

// Clear 清空当前媒体（关闭视频时调用）。
func (s *Server) Clear() {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.current = ""
	s.original = ""
}

// ServeHTTP 处理 /media/ 开头的请求，其余返回 404。
func (s *Server) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	switch {
	case strings.HasPrefix(r.URL.Path, "/media/current"):
		s.serveCurrent(w, r)
	case strings.HasPrefix(r.URL.Path, "/media/thumbs/"):
		s.serveThumb(w, r)
	default:
		http.NotFound(w, r)
	}
}

// serveCurrent 以 Range 方式提供当前视频，支持拖动跳转。
func (s *Server) serveCurrent(w http.ResponseWriter, r *http.Request) {
	s.mu.RLock()
	path := s.current
	s.mu.RUnlock()

	if path == "" {
		http.NotFound(w, r)
		return
	}
	// 禁用缓存，避免切换视频后仍读到旧内容
	w.Header().Set("Cache-Control", "no-store")
	http.ServeFile(w, r, path)
}

// serveThumb 提供缩略图目录中的单张图片，做文件名白名单校验防止目录穿越。
func (s *Server) serveThumb(w http.ResponseWriter, r *http.Request) {
	name := filepath.Base(strings.TrimPrefix(r.URL.Path, "/media/thumbs/"))
	if name == "" || name == "." || name == ".." {
		http.NotFound(w, r)
		return
	}
	if !strings.HasSuffix(strings.ToLower(name), ".jpg") {
		http.NotFound(w, r)
		return
	}
	full := filepath.Join(s.thumbDir, name)
	// 再次确认解析后的路径仍在缩略图目录内
	if !strings.HasPrefix(filepath.Clean(full), filepath.Clean(s.thumbDir)+string(os.PathSeparator)) {
		http.NotFound(w, r)
		return
	}
	w.Header().Set("Cache-Control", "no-store")
	http.ServeFile(w, r, full)
}

// BuildProxy 为 WebView 无法直接播放的视频生成预览代理。
// 优先快速重封装（不重编码），失败则生成低清 H.264 代理。
// 返回生成的文件路径；返回空串表示无需代理。
func BuildProxy(ctx context.Context, src, outDir string) (string, error) {
	paths, err := ffmpeg.Resolve()
	if err != nil {
		return "", err
	}

	if err := os.MkdirAll(outDir, 0o700); err != nil {
		return "", err
	}
	out := filepath.Join(outDir, "preview.mp4")
	_ = os.Remove(out)

	// 第一次尝试：只换容器，不重编码，速度接近复制
	remux := ffmpeg.Run(ctx, paths.FFmpeg, []string{
		"-y", "-i", src,
		"-map", "0:v:0", "-map", "0:a?",
		"-c", "copy", "-movflags", "+faststart", out,
	})
	if remux == nil && fileOK(out) {
		return out, nil
	}
	if ctx.Err() != nil {
		_ = os.Remove(out)
		return "", ctx.Err()
	}

	// 第二次尝试：低清重编码，保证一定能预览
	_ = os.Remove(out)
	transcode := ffmpeg.Run(ctx, paths.FFmpeg, []string{
		"-y", "-i", src,
		"-map", "0:v:0", "-map", "0:a?",
		"-vf", "scale=960:-2",
		"-c:v", "libx264", "-preset", "veryfast", "-crf", "28", "-pix_fmt", "yuv420p",
		"-c:a", "aac", "-b:a", "128k",
		"-movflags", "+faststart", out,
	})
	if transcode != nil {
		_ = os.Remove(out)
		if ctx.Err() != nil {
			return "", ctx.Err()
		}
		return "", fmt.Errorf("无法生成预览画面，但可以继续裁剪")
	}
	if !fileOK(out) {
		_ = os.Remove(out)
		return "", fmt.Errorf("无法生成预览画面，但可以继续裁剪")
	}
	return out, nil
}

// fileOK 判断文件存在且非空。
func fileOK(path string) bool {
	info, err := os.Stat(path)
	return err == nil && info.Size() > 0
}
