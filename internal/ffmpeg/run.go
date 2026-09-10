package ffmpeg

import (
	"bytes"
	"context"
	"io"
	"os/exec"
)

// Process 是带 stderr 捕获的已启动进程。
type Process struct {
	cmd    *exec.Cmd
	stderr bytes.Buffer
}

// Start 启动一个可从 stdout 读取进度的进程（用于 ffmpeg -progress pipe:1）。
func Start(ctx context.Context, bin string, args []string) (*Process, io.ReadCloser, error) {
	cmd := exec.CommandContext(ctx, bin, args...)
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return nil, nil, err
	}
	process := &Process{cmd: cmd}
	cmd.Stderr = &process.stderr
	if err := cmd.Start(); err != nil {
		return nil, nil, err
	}
	return process, stdout, nil
}

// Wait 等待进程结束，保留 FFmpeg 的 stderr，并优先返回取消原因。
func (p *Process) Wait(ctx context.Context) error {
	if err := p.cmd.Wait(); err != nil {
		if ctx.Err() != nil {
			return ctx.Err()
		}
		return &Error{Err: err, Output: p.stderr.String()}
	}
	return nil
}

// Run 执行 ffmpeg / ffprobe 并等待结束，返回组合后的错误输出（用于技术详情）。
func Run(ctx context.Context, bin string, args []string) error {
	cmd := exec.CommandContext(ctx, bin, args...)
	var stderr bytes.Buffer
	cmd.Stderr = &stderr
	if err := cmd.Run(); err != nil {
		if ctx.Err() != nil {
			return ctx.Err()
		}
		return &Error{Err: err, Output: stderr.String()}
	}
	return nil
}

// Error 携带 FFmpeg 原始输出的错误类型。
type Error struct {
	Err    error
	Output string
}

// Error 实现 error 接口，仅返回可读摘要，不含 FFmpeg 原始日志。
func (e *Error) Error() string {
	return e.Err.Error()
}

// Unwrap 返回底层错误。
func (e *Error) Unwrap() error { return e.Err }

// OutputOf 从错误中提取 FFmpeg 原始输出，供"技术详情"展示。
func OutputOf(err error) string {
	if e, ok := err.(*Error); ok {
		return e.Output
	}
	return ""
}
