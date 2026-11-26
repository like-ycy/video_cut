//go:build windows

package fsutil

import (
	"errors"
	"fmt"

	"golang.org/x/sys/windows"
)

// PublishNoReplace 原子发布临时文件；目标已存在时不会覆盖。
func PublishNoReplace(tmp, final string) error {
	from, err := windows.UTF16PtrFromString(tmp)
	if err != nil {
		return fmt.Errorf("无法安全发布文件: %w", err)
	}
	to, err := windows.UTF16PtrFromString(final)
	if err != nil {
		return fmt.Errorf("无法安全发布文件: %w", err)
	}
	err = windows.MoveFileEx(from, to, 0)
	if errors.Is(err, windows.ERROR_FILE_EXISTS) || errors.Is(err, windows.ERROR_ALREADY_EXISTS) {
		return ErrTargetExists
	}
	if err != nil {
		return fmt.Errorf("无法安全发布文件: %w", err)
	}
	return nil
}
