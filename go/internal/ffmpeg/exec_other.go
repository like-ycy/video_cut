//go:build !windows

package ffmpeg

import (
	"context"
	"os/exec"
)

// Command 创建子进程。非 Windows 平台没有控制台窗口问题。
func Command(ctx context.Context, bin string, args ...string) *exec.Cmd {
	return exec.CommandContext(ctx, bin, args...)
}
