// Package export 负责两种模式的裁剪导出：极速（流复制）与精准（重编码）。
package export

import (
	"bufio"
	"context"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"videocut/internal/ffmpeg"
	"videocut/internal/fsutil"
	"videocut/internal/video"
)

// Mode 是导出模式。
type Mode string

const (
	ModeFast  Mode = "fast"
	ModeExact Mode = "exact"
)

// Request 是一次导出请求。Output 已经是经过重名处理后的最终路径。
type Request struct {
	Src    string  `json:"src"`
	Mode   Mode    `json:"mode"`
	Start  float64 `json:"start"`
	End    float64 `json:"end"`
	Output string  `json:"output"`
}

// Result 是导出成功后的结果。
type Result struct {
	OutputPath     string   `json:"outputPath"`
	OutputName     string   `json:"outputName"`
	Mode           Mode     `json:"mode"`
	RequestedStart float64  `json:"requestedStart"`
	RequestedEnd   float64  `json:"requestedEnd"`
	ActualDuration float64  `json:"actualDuration"`
	SizeBytes      int64    `json:"sizeBytes"`
	Warnings       []string `json:"warnings"`
}

// Progress 是导出进度回调参数。
type Progress struct {
	Percent float64 `json:"percent"`
	ETASec  float64 `json:"etaSeconds"`
}

// Run 执行导出。ctx 取消时立即终止 FFmpeg 并清理临时文件。
// onProgress 可能为 nil（极速模式无需百分比）。
func Run(ctx context.Context, req Request, onProgress func(Progress)) (*Result, error) {
	if req.Src == "" || req.Output == "" {
		return nil, fmt.Errorf("导出参数不完整")
	}
	if fsutil.SameFile(req.Src, req.Output) {
		return nil, fmt.Errorf("不能覆盖原文件，请另选文件名")
	}
	if req.End-req.Start < 1 {
		return nil, fmt.Errorf("保留时长至少需要 1 秒")
	}

	paths, err := ffmpeg.Resolve()
	if err != nil {
		return nil, err
	}

	tmp, err := fsutil.CreateTemp(req.Output)
	if err != nil {
		return nil, fmt.Errorf("裁剪失败，无法创建临时文件: %w", err)
	}
	cleanup := func() { fsutil.RemoveQuiet(tmp) }

	duration := req.End - req.Start
	ext := strings.ToLower(strings.TrimPrefix(filepath.Ext(req.Output), "."))

	var warnings []string
	var runErr error

	if req.Mode == ModeFast {
		runErr = runFast(ctx, paths.FFmpeg, req, tmp, duration, ext, &warnings)
	} else {
		runErr = runExact(ctx, paths.FFmpeg, req, tmp, duration, ext, &warnings, onProgress)
	}

	if runErr != nil {
		cleanup()
		if ctx.Err() != nil {
			return nil, ctx.Err()
		}
		return nil, readableError(runErr)
	}

	// 校验输出文件
	info, statErr := os.Stat(tmp)
	if statErr != nil || info.Size() == 0 {
		cleanup()
		return nil, fmt.Errorf("裁剪失败，输出文件无效")
	}

	if ctx.Err() != nil {
		cleanup()
		return nil, ctx.Err()
	}

	// 读取真实输出时长。探测失败时不能将请求时长伪报为实际时长。
	mi, probeErr := video.Probe(ctx, tmp)
	if probeErr != nil || mi.Duration <= 0 {
		cleanup()
		if ctx.Err() != nil {
			return nil, ctx.Err()
		}
		return nil, fmt.Errorf("裁剪失败，无法确认输出时长")
	}
	actualDur := mi.Duration
	size := info.Size()
	if ctx.Err() != nil {
		cleanup()
		return nil, ctx.Err()
	}

	if err := fsutil.PublishNoReplace(tmp, req.Output); err != nil {
		cleanup()
		if errors.Is(err, fsutil.ErrTargetExists) {
			return nil, fmt.Errorf("裁剪失败，目标文件已存在，请重新选择文件名")
		}
		return nil, fmt.Errorf("裁剪失败，无法安全写入目标位置")
	}

	return &Result{
		OutputPath:     req.Output,
		OutputName:     filepath.Base(req.Output),
		Mode:           req.Mode,
		RequestedStart: req.Start,
		RequestedEnd:   req.End,
		ActualDuration: actualDur,
		SizeBytes:      size,
		Warnings:       warnings,
	}, nil
}

// runFast 极速模式：流复制，不重编码，切点对齐附近关键帧。
func runFast(ctx context.Context, bin string, req Request, out string, duration float64, ext string, warnings *[]string) error {
	base := []string{"-y", "-ss", fmtTS(req.Start), "-i", req.Src, "-t", fmtTS(duration)}
	common := []string{"-map_metadata", "0", "-map_chapters", "0"}

	if ext == "mp4" || ext == "mov" || ext == "m4v" {
		common = append(common, "-movflags", "+faststart")
	}

	// 首选：所有流全部复制，尽量不丢字幕、章节、附件
	full := append([]string{}, base...)
	full = append(full, "-map", "0", "-c", "copy", "-avoid_negative_ts", "make_zero")
	full = append(full, common...)
	full = append(full, out)

	if err := ffmpeg.Run(ctx, bin, full); err == nil {
		return nil
	}

	// 回退：只保留视频与音频，明确告知其他内容未保留
	av := append([]string{}, base...)
	av = append(av, "-map", "0:v:0", "-map", "0:a?", "-c", "copy", "-avoid_negative_ts", "make_zero")
	av = append(av, common...)
	av = append(av, out)

	if err := ffmpeg.Run(ctx, bin, av); err != nil {
		return err
	}
	*warnings = append(*warnings, "部分字幕或附加信息未能保留")
	return nil
}

// runExact 精准模式：固定高质量重编码，严格按所选时间裁剪。
func runExact(ctx context.Context, bin string, req Request, out string, duration float64, ext string,
	warnings *[]string, onProgress func(Progress)) error {

	args := []string{
		"-y",
		"-ss", fmtTS(req.Start), "-i", req.Src,
		"-t", fmtTS(duration),
		"-map", "0:v:0", "-map", "0:a?",
		"-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p",
		"-c:a", "aac", "-b:a", "192k",
		"-map_metadata", "0",
	}

	// MKV 可以保留字幕轨；MP4/MOV 不支持大多数字幕格式，明确提示
	if ext == "mkv" {
		args = append(args, "-map", "0:s?", "-c:s", "copy", "-map_chapters", "0")
	}

	if ext == "mp4" || ext == "mov" || ext == "m4v" {
		args = append(args, "-movflags", "+faststart")
	}

	args = append(args, "-progress", "pipe:1", "-nostats", out)

	cmd, stdout, err := ffmpeg.Start(ctx, bin, args)
	if err != nil {
		return err
	}

	progressDone := make(chan struct{})
	go func() {
		defer close(progressDone)
		if onProgress == nil {
			_, _ = io.Copy(io.Discard, stdout)
			return
		}
		readProgress(stdout, duration, onProgress)
	}()

	runErr := cmd.Wait(ctx)
	<-progressDone
	return runErr
}

// readProgress 解析 ffmpeg -progress 输出并回调百分比与预计剩余时间。
func readProgress(r io.Reader, totalDur float64, onProgress func(Progress)) {
	scanner := bufio.NewScanner(r)
	start := time.Now()
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if strings.HasPrefix(line, "out_time_us=") {
			v, err := strconv.ParseFloat(strings.TrimPrefix(line, "out_time_us="), 64)
			if err != nil || totalDur <= 0 {
				continue
			}
			sec := v / 1e6
			percent := sec / totalDur * 100
			if percent < 0 {
				percent = 0
			}
			if percent > 99.5 {
				percent = 99.5
			}
			elapsed := time.Since(start).Seconds()
			var eta float64
			if percent > 1 {
				eta = elapsed * (100 - percent) / percent
			}
			onProgress(Progress{Percent: percent, ETASec: eta})
		}
	}
}

// readableError 把 FFmpeg 错误转成一行可读原因。
func readableError(err error) error {
	detail := ffmpeg.OutputOf(err)
	lower := strings.ToLower(detail + err.Error())
	switch {
	case strings.Contains(lower, "no space left"), strings.Contains(lower, "disk"):
		return fmt.Errorf("裁剪失败，磁盘空间不足")
	case strings.Contains(lower, "permission"), strings.Contains(lower, "denied"):
		return fmt.Errorf("裁剪失败，没有写入该位置的权限")
	case strings.Contains(lower, "invalid data"), strings.Contains(lower, "error while decoding"):
		return fmt.Errorf("裁剪失败，视频数据有问题")
	case strings.Contains(lower, "exit status 1"):
		return fmt.Errorf("裁剪失败，FFmpeg 无法处理该视频")
	default:
		return fmt.Errorf("裁剪失败，请重试或改用精准模式")
	}
}

// fmtTS 把秒数格式化为 FFmpeg 接受的时间戳。
func fmtTS(sec float64) string {
	if sec < 0 {
		sec = 0
	}
	return fmt.Sprintf("%.3f", sec)
}
