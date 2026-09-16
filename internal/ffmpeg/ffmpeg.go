// Package ffmpeg 负责检查 ffmpeg / ffprobe 是否可用。
package ffmpeg

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
)

// Paths 保存传给 exec 的命令路径。
type Paths struct {
	FFmpeg  string
	FFprobe string
}

// Resolve 检查 ffmpeg 与 ffprobe 是否都可找到。
// 优先系统 PATH；找不到时再查 macOS 常见安装目录——
// Finder/Dock 启动的 GUI 应用拿不到 shell 配置的 PATH。
func Resolve() (*Paths, error) {
	ffmpegPath, ffmpegErr := lookBinary("ffmpeg")
	ffprobePath, ffprobeErr := lookBinary("ffprobe")

	switch {
	case ffmpegErr != nil && ffprobeErr != nil:
		return nil, fmt.Errorf("未找到 ffmpeg 和 ffprobe，请安装 FFmpeg 并加入系统 PATH 后重试")
	case ffmpegErr != nil:
		return nil, fmt.Errorf("未找到 ffmpeg，请安装 FFmpeg 并加入系统 PATH 后重试")
	case ffprobeErr != nil:
		return nil, fmt.Errorf("未找到 ffprobe，请安装 FFmpeg 并加入系统 PATH 后重试")
	default:
		return &Paths{FFmpeg: ffmpegPath, FFprobe: ffprobePath}, nil
	}
}

// lookBinary 先按系统 PATH 解析；失败时再扫常见安装目录。
func lookBinary(name string) (string, error) {
	if p, err := exec.LookPath(name); err == nil {
		return p, nil
	}
	for _, dir := range fallbackBinDirs() {
		candidate := filepath.Join(dir, name)
		if isExecutable(candidate) {
			return candidate, nil
		}
	}
	return "", exec.ErrNotFound
}

// fallbackBinDirs 返回当前平台常见工具安装目录。
func fallbackBinDirs() []string {
	if runtime.GOOS != "darwin" {
		return nil
	}
	return []string{
		"/opt/homebrew/bin", // Apple Silicon Homebrew
		"/usr/local/bin",    // Intel Homebrew / 手动安装
		"/opt/local/bin",    // MacPorts
	}
}

func isExecutable(path string) bool {
	info, err := os.Stat(path)
	return err == nil && !info.IsDir() && info.Mode()&0o111 != 0
}
