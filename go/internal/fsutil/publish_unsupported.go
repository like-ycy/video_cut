//go:build !darwin && !linux && !windows

package fsutil

import "fmt"

// PublishNoReplace 拒绝在没有原子 no-replace 原语的平台发布文件。
func PublishNoReplace(_, _ string) error {
	return fmt.Errorf("当前系统不支持安全发布文件")
}
