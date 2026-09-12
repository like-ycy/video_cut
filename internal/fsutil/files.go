// Package fsutil 提供输出命名、临时文件、原子改名与在文件管理器中显示等文件操作。
package fsutil

import (
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
)

// DefaultOutputName 根据源文件名生成默认输出文件名：原名_trimmed.原扩展名。
func DefaultOutputName(src string) string {
	base := filepath.Base(src)
	ext := filepath.Ext(base)
	name := strings.TrimSuffix(base, ext)
	if ext == "" {
		return name + "_trimmed"
	}
	return name + "_trimmed" + ext
}

// UniqueTarget 在 dir 中生成不与已存在文件、也不与 forbidden（源文件）冲突的路径。
// 重名时依次追加 _trimmed(1)、_trimmed(2)。
func UniqueTarget(dir, filename string, forbidden []string) string {
	ext := filepath.Ext(filename)
	stem := strings.TrimSuffix(filename, ext)

	candidate := filepath.Join(dir, filename)
	if !conflicts(candidate, forbidden) && !exists(candidate) {
		return candidate
	}

	for i := 1; i < 1000; i++ {
		candidate = filepath.Join(dir, fmt.Sprintf("%s(%d)%s", stem, i, ext))
		if !conflicts(candidate, forbidden) && !exists(candidate) {
			return candidate
		}
	}

	// 极端情况下退化为时间戳后缀
	candidate = filepath.Join(dir, fmt.Sprintf("%s-%d%s", stem, os.Getpid(), ext))
	return candidate
}

// conflicts 判断路径是否与禁止覆盖的目标相同（大小写不敏感处理 Windows）。
func conflicts(path string, forbidden []string) bool {
	for _, f := range forbidden {
		if f == "" {
			continue
		}
		if samePath(path, f) {
			return true
		}
	}
	return false
}

// samePath 判断两个路径是否指向同一文件。
func samePath(a, b string) bool {
	if runtime.GOOS == "windows" {
		return strings.EqualFold(filepath.Clean(a), filepath.Clean(b))
	}
	return filepath.Clean(a) == filepath.Clean(b)
}

// exists 判断路径是否已存在。
func exists(path string) bool {
	_, err := os.Stat(path)
	return err == nil
}

// ErrTargetExists 表示发布时目标文件已由其他操作创建，原文件未被覆盖。
var ErrTargetExists = errors.New("目标文件已存在")

// CreateTemp 在目标同目录独占创建随机临时文件，保留原扩展名。
// 必须保留原扩展名：FFmpeg 依据扩展名推断封装格式，
// 若使用 .partial 之类的后缀会报 "Error initializing the muxer"。
// 放在同目录，保证最终改名是同分区原子操作。
func CreateTemp(final string) (string, error) {
	return CreateTempWithExt(final, filepath.Ext(final))
}

// CreateTempWithExt 同 CreateTemp，但可以指定扩展名。
// 混合裁剪的中间片段固定用 .mp4：H.264 / HEVC + AAC 都能装进 MP4，
// 统一容器与时间基准后拼接才不会错位。
func CreateTempWithExt(final, ext string) (string, error) {
	dir := filepath.Dir(final)
	stem := strings.TrimSuffix(filepath.Base(final), filepath.Ext(final))

	f, err := os.CreateTemp(dir, fmt.Sprintf(".%s.*%s", stem, ext))
	if err != nil {
		return "", err
	}
	if err := f.Close(); err != nil {
		RemoveQuiet(f.Name())
		return "", err
	}
	return f.Name(), nil
}

// RemoveQuiet 删除文件并忽略错误（用于清理临时文件）。
func RemoveQuiet(path string) {
	if path == "" {
		return
	}
	_ = os.Remove(path)
}

// EnsureDir 确保目录存在。
func EnsureDir(dir string) error {
	return os.MkdirAll(dir, 0o755)
}

// Reveal 在系统文件管理器中显示文件（macOS 访达 / Windows 资源管理器 / Linux 文件管理器）。
func Reveal(path string) error {
	var cmd *exec.Cmd
	switch runtime.GOOS {
	case "darwin":
		cmd = exec.Command("open", "-R", path)
	case "windows":
		// /select, 必须与路径拼成同一个参数；路径必须是原生反斜杠，
		// 正斜杠会被 explorer 当成命令行开关，导致只打开文件管理器而不选中文件。
		cmd = exec.Command("explorer", "/select,"+filepath.FromSlash(path))
	default:
		cmd = exec.Command("xdg-open", filepath.Dir(path))
	}
	return cmd.Start()
}

// SameFile 判断两个路径是否为同一文件，供导出前安全检查使用。
func SameFile(a, b string) bool {
	return samePath(a, b)
}
