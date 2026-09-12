//go:build windows

package ffmpeg

import (
	"context"
	"os/exec"
	"syscall"
)

// Command 创建子进程。Windows 下的 ffmpeg / ffprobe 是控制台程序，
// 默认会为每次调用闪出一个黑色终端窗口（缩略图是批量调用，尤其明显）。
// 这里用 CREATE_NO_WINDOW 让子进程不创建控制台。
func Command(ctx context.Context, bin string, args ...string) *exec.Cmd {
	cmd := exec.CommandContext(ctx, bin, args...)
	if cmd.SysProcAttr == nil {
		cmd.SysProcAttr = &syscall.SysProcAttr{}
	}
	cmd.SysProcAttr.CreationFlags |= 0x08000000 // CREATE_NO_WINDOW
	return cmd
}
