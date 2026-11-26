//go:build darwin

package fsutil

import (
	"errors"
	"fmt"

	"golang.org/x/sys/unix"
)

// PublishNoReplace 原子发布临时文件；目标已存在时不会覆盖。
func PublishNoReplace(tmp, final string) error {
	err := unix.RenameatxNp(unix.AT_FDCWD, tmp, unix.AT_FDCWD, final, unix.RENAME_EXCL)
	if errors.Is(err, unix.EEXIST) {
		return ErrTargetExists
	}
	if err != nil {
		return fmt.Errorf("无法安全发布文件: %w", err)
	}
	return nil
}
