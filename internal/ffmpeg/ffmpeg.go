// Package ffmpeg 负责检查系统 PATH 中的 ffmpeg / ffprobe 命令。
package ffmpeg

import (
	"fmt"
	"os/exec"
)

// Paths 保存传给 exec 的命令名。命令必须由系统 PATH 提供。
type Paths struct {
	FFmpeg  string
	FFprobe string
}

// Resolve 检查 ffmpeg 与 ffprobe 是否都可从系统 PATH 找到。
func Resolve() (*Paths, error) {
	_, ffmpegErr := exec.LookPath("ffmpeg")
	_, ffprobeErr := exec.LookPath("ffprobe")

	switch {
	case ffmpegErr != nil && ffprobeErr != nil:
		return nil, fmt.Errorf("未找到 ffmpeg 和 ffprobe，请安装 FFmpeg 并加入系统 PATH 后重试")
	case ffmpegErr != nil:
		return nil, fmt.Errorf("未找到 ffmpeg，请安装 FFmpeg 并加入系统 PATH 后重试")
	case ffprobeErr != nil:
		return nil, fmt.Errorf("未找到 ffprobe，请安装 FFmpeg 并加入系统 PATH 后重试")
	default:
		return &Paths{FFmpeg: "ffmpeg", FFprobe: "ffprobe"}, nil
	}
}
