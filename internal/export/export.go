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
	// 源媒体的编码信息，用于判断极速模式能否走混合裁剪。
	VideoCodec    string `json:"videoCodec"`
	AudioCodec    string `json:"audioCodec"`
	SubtitleCount int    `json:"subtitleCount"`
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
		runErr = runFast(ctx, *paths, req, tmp, duration, ext, &warnings)
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

// runFast 极速模式：默认流复制，不重编码。
// 源为 H.264 / HEVC + AAC 时先尝试混合裁剪（见 runSmart）：纯复制必须从起点之前的关键帧
// 开始，成片会多带一段内容，部分播放器（PotPlayer 硬解等）在这类文件上快进会卡在一帧；
// 混合裁剪只重编码开头到下一个关键帧的一小段，成片首帧就是关键帧，兼容性等同重新编码。
func runFast(ctx context.Context, paths ffmpeg.Paths, req Request, out string, duration float64, ext string, warnings *[]string) error {
	if smartEligible(req) {
		err := runSmart(ctx, paths, req, out, ext)
		if err == nil {
			return nil
		}
		if ctx.Err() != nil {
			return err
		}
		// 混合裁剪不可用时，退回原来的纯复制
	}

	base := []string{"-y", "-ss", fmtTS(req.Start), "-i", req.Src, "-t", fmtTS(duration)}
	common := []string{"-map_metadata", "0", "-map_chapters", "0"}

	if needsFastStart(ext) {
		common = append(common, "-movflags", "+faststart")
	}

	// 首选：所有流全部复制，尽量不丢字幕、章节、附件
	full := append([]string{}, base...)
	full = append(full, "-map", "0", "-c", "copy", "-avoid_negative_ts", "make_zero")
	full = append(full, common...)
	full = append(full, out)

	if err := ffmpeg.Run(ctx, paths.FFmpeg, full); err == nil {
		return nil
	}

	// 回退：只保留视频与音频，明确告知其他内容未保留
	av := append([]string{}, base...)
	av = append(av, "-map", "0:v:0", "-map", "0:a?", "-c", "copy", "-avoid_negative_ts", "make_zero")
	av = append(av, common...)
	av = append(av, out)

	if err := ffmpeg.Run(ctx, paths.FFmpeg, av); err != nil {
		return err
	}
	*warnings = append(*warnings, "部分字幕或附加信息未能保留")
	return nil
}

// 混合裁剪允许重编码的开头长度上限。超过说明关键帧间隔过大，退回纯复制。
const maxSmartHeadSec = 30.0

// 关键帧扫描窗口（秒）。只扫描起点之后的一小段，避免整片扫描。
const keyframeScanWindow = 120.0

// 混合裁剪中间片段的时间基准。两段必须用同一个基准，否则拼接时时间戳会被整体缩放。
const smartTimescale = "90000"

// runSmart 混合裁剪：重编码 [start, 下一个关键帧) 这一小段，其后原样复制，最后无损拼接。
// 任何一步失败都返回错误，由调用方退回纯复制。
func runSmart(ctx context.Context, paths ffmpeg.Paths, req Request, out string, ext string) error {
	cut, err := firstKeyframeAfter(ctx, paths.FFprobe, req.Src, req.Start)
	if err != nil {
		return err
	}
	headDur := cut - req.Start
	// 起点已经（几乎）落在关键帧上：纯复制本身就是干净的，无需重编码。
	// 关键帧落在终点之后：整段比一个关键帧间隔还短，同样交给纯复制。
	if headDur <= 0.02 || cut >= req.End-0.05 || headDur > maxSmartHeadSec {
		return fmt.Errorf("不适合混合裁剪")
	}

	head, err := fsutil.CreateTempWithExt(req.Output, ".mp4")
	if err != nil {
		return err
	}
	body, err := fsutil.CreateTempWithExt(req.Output, ".mp4")
	if err != nil {
		fsutil.RemoveQuiet(head)
		return err
	}
	list, err := fsutil.CreateTempWithExt(req.Output, ".txt")
	if err != nil {
		fsutil.RemoveQuiet(head)
		fsutil.RemoveQuiet(body)
		return err
	}
	defer func() {
		fsutil.RemoveQuiet(head)
		fsutil.RemoveQuiet(body)
		fsutil.RemoveQuiet(list)
	}()

	// 开头：重编码。输入侧 -ss 会精确跳到起点，编码后第一帧是关键帧，时间戳从 0 开始。
	headArgs := []string{
		"-y", "-ss", fmtTS(req.Start), "-i", req.Src, "-t", fmtTS(headDur),
		"-map", "0:v:0", "-map", "0:a?",
	}
	headArgs = append(headArgs, headVideoArgs(req.VideoCodec)...)
	headArgs = append(headArgs, "-c:a", "aac", "-b:a", "192k", "-video_track_timescale", smartTimescale)
	headArgs = append(headArgs, head)
	if err := ffmpeg.Run(ctx, paths.FFmpeg, headArgs); err != nil {
		return err
	}

	// 其余：起点正好是关键帧，复制后时间戳自然从 0 开始，不会带入多余片段。
	// 这里不能用 -avoid_negative_ts：它会让 FFmpeg 把关键帧之前的画面一并保留，
	// 成片就会多出一段、与开头重编码的部分重复。
	bodyArgs := []string{
		"-y", "-ss", fmtTS(cut), "-i", req.Src, "-t", fmtTS(req.End - cut),
		"-map", "0:v:0", "-map", "0:a?",
		"-c", "copy", "-video_track_timescale", smartTimescale,
	}
	bodyArgs = append(bodyArgs, body)
	if err := ffmpeg.Run(ctx, paths.FFmpeg, bodyArgs); err != nil {
		return err
	}

	if err := writeConcatList(list, []string{head, body}); err != nil {
		return err
	}
	concatArgs := []string{"-y", "-f", "concat", "-safe", "0", "-i", list, "-map", "0", "-c", "copy"}
	if needsFastStart(ext) {
		concatArgs = append(concatArgs, "-movflags", "+faststart")
	}
	concatArgs = append(concatArgs, out)
	return ffmpeg.Run(ctx, paths.FFmpeg, concatArgs)
}

// smartEligible 判断能否使用混合裁剪。只支持 H.264 / HEVC 视频与 AAC（或无）音轨：
// 开头重编码出来的流必须和后面复制的流完全一致才能无损拼接，其它编码一律退回纯复制。
// 有字幕轨时也不走混合方式，避免字幕被静默丢弃。
func smartEligible(req Request) bool {
	if req.SubtitleCount > 0 {
		return false
	}
	switch strings.ToLower(req.VideoCodec) {
	case "h264", "avc1", "hevc", "hvc1", "hev1":
	default:
		return false
	}
	if req.AudioCodec == "" {
		return true
	}
	return strings.ToLower(req.AudioCodec) == "aac"
}

// headVideoArgs 返回开头片段的编码参数，编码器要与源编码对应。
func headVideoArgs(codec string) []string {
	switch strings.ToLower(codec) {
	case "hevc", "hvc1", "hev1":
		return []string{"-c:v", "libx265", "-preset", "veryfast", "-crf", "20"}
	default:
		return []string{"-c:v", "libx264", "-preset", "veryfast", "-crf", "18"}
	}
}

// firstKeyframeAfter 返回视频流中第一个不早于 t 的关键帧时间。
func firstKeyframeAfter(ctx context.Context, bin, src string, t float64) (float64, error) {
	if t < 0 {
		t = 0
	}
	args := []string{
		"-v", "error",
		"-select_streams", "v:0",
		"-skip_frame", "nokey",
		"-show_entries", "frame=pts_time",
		"-of", "csv=p=0",
		"-read_intervals", fmt.Sprintf("%.3f%%+%.0f", t, keyframeScanWindow),
		src,
	}
	out, err := ffmpeg.Output(ctx, bin, args...)
	if err != nil {
		return 0, err
	}
	for _, line := range strings.Split(string(out), "\n") {
		line = strings.TrimSpace(strings.TrimSuffix(strings.TrimSpace(line), ","))
		if line == "" || line == "N/A" {
			continue
		}
		v, err := strconv.ParseFloat(line, 64)
		if err != nil {
			continue
		}
		if v >= t-0.02 {
			return v, nil
		}
	}
	return 0, fmt.Errorf("起点之后 %.0f 秒内未找到关键帧", keyframeScanWindow)
}

// writeConcatList 写 ffmpeg concat 列表文件。
// 路径统一写成正斜杠：Windows 的反斜杠会被 concat 解复用器当成转义字符。
func writeConcatList(path string, files []string) error {
	var b strings.Builder
	for _, f := range files {
		b.WriteString("file '")
		b.WriteString(strings.ReplaceAll(filepath.ToSlash(f), "'", `'\''`))
		b.WriteString("'\n")
	}
	return os.WriteFile(path, []byte(b.String()), 0o600)
}

// needsFastStart 判断该容器是否需要把索引移到文件头部。
func needsFastStart(ext string) bool {
	return ext == "mp4" || ext == "mov" || ext == "m4v"
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

	if needsFastStart(ext) {
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
