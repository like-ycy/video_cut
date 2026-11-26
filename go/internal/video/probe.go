// Package video 负责读取视频媒体的基本信息，并判断能否被 WebView 直接播放。
package video

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"strings"

	"videocut/internal/ffmpeg"
)

// MediaInfo 是前端需要的媒体信息，字段与前端 types 保持一致。
type MediaInfo struct {
	Path          string   `json:"path"`
	Name          string   `json:"name"`
	Ext           string   `json:"ext"`
	Duration      float64  `json:"duration"`
	Width         int      `json:"width"`
	Height        int      `json:"height"`
	FPS           float64  `json:"fps"`
	Format        string   `json:"format"`
	VideoCodec    string   `json:"videoCodec"`
	AudioCodecs   []string `json:"audioCodecs"`
	AudioCount    int      `json:"audioCount"`
	SubtitleCount int      `json:"subtitleCount"`
	ChapterCount  int      `json:"chapterCount"`
	Rotation      int      `json:"rotation"`
	SizeBytes     int64    `json:"sizeBytes"`
	// NeedsProxy 为 true 时，WebView 大概率无法直接播放，需要生成预览代理。
	NeedsProxy bool `json:"needsProxy"`
	// CanFastTrim 表示是否适合流复制（极速模式）。
	CanFastTrim bool `json:"canFastTrim"`
}

// 可直接播放的视频编码（WebKit / WebView2 通用能力）。
var playableCodecs = map[string]bool{
	"h264": true, "avc1": true, "hevc": true, "hvc1": true, "hev1": true,
	"vp8": true, "vp9": true, "av01": true, "av1": true, "mpeg4": true,
}

// 可直接播放的容器。
var playableContainers = map[string]bool{
	"mp4": true, "mov": true, "m4v": true, "webm": true, "isom": true, "quicktime": true,
}

// sideData 用于读取旋转信息。
type sideData struct {
	Rotation float64 `json:"rotation"`
}

// stream 是 ffprobe 输出的单个流。
type stream struct {
	CodecName    string                 `json:"codec_name"`
	CodecType    string                 `json:"codec_type"`
	Width        int                    `json:"width"`
	Height       int                    `json:"height"`
	RFrameRate   string                 `json:"r_frame_rate"`
	AvgFrameRate string                 `json:"avg_frame_rate"`
	Duration     string                 `json:"duration"`
	SideDataList []sideData             `json:"side_data_list"`
	Tags         map[string]interface{} `json:"tags"`
}

// formatInfo 是 ffprobe 输出的容器信息。
type formatInfo struct {
	Duration   string `json:"duration"`
	Size       string `json:"size"`
	FormatName string `json:"format_name"`
}

// probeOutput 是 ffprobe JSON 输出中我们需要的部分。
type probeOutput struct {
	Format   formatInfo `json:"format"`
	Streams  []stream   `json:"streams"`
	Chapters []struct{} `json:"chapters"`
}

// Probe 读取指定文件的媒体信息。返回的 error 已是可直接展示给用户的中文原因。
func Probe(ctx context.Context, file string) (*MediaInfo, error) {
	info, err := os.Stat(file)
	if err != nil {
		return nil, fmt.Errorf("无法读取该文件")
	}
	if info.IsDir() {
		return nil, fmt.Errorf("请选择视频文件，而不是文件夹")
	}

	paths, err := ffmpeg.Resolve()
	if err != nil {
		return nil, err
	}

	out, err := runProbe(ctx, paths.FFprobe, file)
	if err != nil {
		return nil, fmt.Errorf("无法打开该视频，可能格式不受支持")
	}

	var po probeOutput
	if err := json.Unmarshal(out, &po); err != nil {
		return nil, fmt.Errorf("无法打开该视频，可能格式不受支持")
	}

	mi := &MediaInfo{
		Path:         file,
		Name:         filepath.Base(file),
		Ext:          strings.ToLower(strings.TrimPrefix(filepath.Ext(file), ".")),
		Format:       primaryFormat(po.Format.FormatName),
		SizeBytes:    info.Size(),
		ChapterCount: len(po.Chapters),
		AudioCodecs:  []string{},
	}

	hasVideo := false
	for _, s := range po.Streams {
		switch s.CodecType {
		case "video":
			if hasVideo {
				continue
			}
			hasVideo = true
			mi.VideoCodec = s.CodecName
			mi.Width = s.Width
			mi.Height = s.Height
			mi.FPS = parseFPS(s.RFrameRate, s.AvgFrameRate)
			mi.Rotation = parseRotation(s)
			if d := parseFloat(s.Duration); d > 0 {
				mi.Duration = d
			}
		case "audio":
			mi.AudioCount++
			if s.CodecName != "" {
				mi.AudioCodecs = append(mi.AudioCodecs, s.CodecName)
			}
		case "subtitle":
			mi.SubtitleCount++
		}
	}

	if !hasVideo {
		return nil, fmt.Errorf("该文件没有视频画面，无法裁剪")
	}

	if mi.Duration <= 0 {
		mi.Duration = parseFloat(po.Format.Duration)
	}
	if mi.Duration <= 0 {
		return nil, fmt.Errorf("无法读取该视频的时长，文件可能已损坏")
	}

	mi.NeedsProxy = !playableContainers[mi.Format] || !playableCodecs[mi.VideoCodec]
	mi.CanFastTrim = true
	return mi, nil
}

// runProbe 执行 ffprobe 并返回 JSON 输出。
func runProbe(ctx context.Context, bin, file string) ([]byte, error) {
	cmd := ffmpeg.Command(ctx, bin,
		"-v", "error",
		"-print_format", "json",
		"-show_format",
		"-show_streams",
		"-show_chapters",
		file,
	)
	out, err := cmd.Output()
	if err != nil {
		return nil, err
	}
	return out, nil
}

// primaryFormat 取容器名的第一个（"mov,mp4,m4a,3gp" 中的 mov）。
func primaryFormat(name string) string {
	if name == "" {
		return ""
	}
	parts := strings.Split(name, ",")
	return strings.ToLower(strings.TrimSpace(parts[0]))
}

// parseFPS 解析 "30000/1001" 形式的帧率。
func parseFPS(rate, fallback string) float64 {
	for _, r := range []string{rate, fallback} {
		if r == "" || r == "0/0" {
			continue
		}
		if strings.Contains(r, "/") {
			parts := strings.SplitN(r, "/", 2)
			num, e1 := strconv.ParseFloat(parts[0], 64)
			den, e2 := strconv.ParseFloat(parts[1], 64)
			if e1 == nil && e2 == nil && den != 0 {
				return num / den
			}
			continue
		}
		if v, e := strconv.ParseFloat(r, 64); e == nil && v > 0 {
			return v
		}
	}
	return 0
}

// parseRotation 从 side_data 或 tags 读取旋转角度。
func parseRotation(s stream) int {
	for _, sd := range s.SideDataList {
		if v := int(sd.Rotation) % 360; v != 0 {
			return (v + 360) % 360
		}
	}
	if v, ok := s.Tags["rotate"]; ok {
		switch t := v.(type) {
		case float64:
			return (int(t) + 360) % 360
		case string:
			if f, e := strconv.Atoi(t); e == nil {
				return (f + 360) % 360
			}
		}
	}
	return 0
}

// parseFloat 安全解析字符串浮点数。
func parseFloat(s string) float64 {
	if s == "" || s == "N/A" {
		return 0
	}
	v, err := strconv.ParseFloat(s, 64)
	if err != nil {
		return 0
	}
	return v
}
