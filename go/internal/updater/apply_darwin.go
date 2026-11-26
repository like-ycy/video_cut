//go:build darwin

package updater

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"syscall"
)

// ApplyAndRestart 在 macOS 上解压更新包（zip / 兼容 tar.gz），替换当前 .app 并重启。
func (m *Manager) ApplyAndRestart() error {
	pkgPath, tempDir, err := m.GetDownloadedFile()
	if err != nil {
		return err
	}

	// 1. 定位当前正在运行的 .app 目录
	currentAppPath, err := findCurrentAppBundle()
	if err != nil {
		return fmt.Errorf("定位当前应用目录失败: %w", err)
	}

	// 2. 解压更新包（extractUpdatePackage 会确保目标目录存在）
	extractedDir := filepath.Join(tempDir, "extracted")
	if err := extractUpdatePackage(pkgPath, extractedDir); err != nil {
		return fmt.Errorf("解压更新包失败: %w", err)
	}

	// 3. 在解压目录中查找新版的 .app 目录
	newAppPath, err := findAppBundleInDir(extractedDir)
	if err != nil {
		return fmt.Errorf("未在更新包中找到 .app 目录: %w", err)
	}

	// 4. 准备后台替换与重启脚本
	// 关键说明：
	// 脚本在后台独立会话 (setsid) 中运行，不会随当前应用退出而终止；
	// 等待当前 PID 退出后，原子替换 .app，清除 quarantine 属性，并通过 open 命令拉起新应用。
	pid := os.Getpid()
	scriptContent := `
PID="$1"
TARGET_APP="$2"
NEW_APP="$3"
CLEAN_DIR="$4"
BACKUP_APP="${TARGET_APP}.old-$$"

# 等待主应用进程完全退出
while kill -0 "$PID" 2>/dev/null; do
    sleep 0.2
done

# 保留旧版本，替换失败时恢复
rm -rf "$BACKUP_APP"
if ! mv "$TARGET_APP" "$BACKUP_APP"; then
    exit 1
fi
if ! mv "$NEW_APP" "$TARGET_APP"; then
    mv "$BACKUP_APP" "$TARGET_APP"
    exit 1
fi

# 清除 macOS 隔离属性，避免未签名或下载保护提示
xattr -dr com.apple.quarantine "$TARGET_APP" 2>/dev/null || true

# 重新启动新版本应用
open "$TARGET_APP"

rm -rf "$BACKUP_APP" 2>/dev/null || true

# 清理临时文件
rm -rf "$CLEAN_DIR" 2>/dev/null || true
`

	cmd := exec.Command("/bin/bash", "-c", scriptContent, "updater-script",
		strconv.Itoa(pid),
		currentAppPath,
		newAppPath,
		tempDir,
	)

	// 脱离父进程成为独立会话组
	cmd.SysProcAttr = &syscall.SysProcAttr{
		Setsid: true,
	}

	if err := cmd.Start(); err != nil {
		return fmt.Errorf("启动后台更新脚本失败: %w", err)
	}
	m.markApplyPending()

	return nil
}

// findCurrentAppBundle 根据当前可执行文件反查外层的 .app 路径。
func findCurrentAppBundle() (string, error) {
	exePath, err := os.Executable()
	if err != nil {
		return "", err
	}
	resolved, err := filepath.EvalSymlinks(exePath)
	if err == nil {
		exePath = resolved
	}

	curr := exePath
	for {
		if strings.HasSuffix(curr, ".app") {
			return curr, nil
		}
		parent := filepath.Dir(curr)
		if parent == curr || parent == "/" || parent == "." {
			break
		}
		curr = parent
	}

	return "", fmt.Errorf("当前程序运行路径为 %s，未处于 .app 应用程序包中（开发/调试模式下不支持就地替换，请打包后测试）", exePath)
}

// findAppBundleInDir 在目录中递归或直接查找以 .app 结尾的目录。
func findAppBundleInDir(dir string) (string, error) {
	entries, err := os.ReadDir(dir)
	if err != nil {
		return "", err
	}

	for _, entry := range entries {
		if entry.IsDir() && strings.HasSuffix(entry.Name(), ".app") {
			return filepath.Join(dir, entry.Name()), nil
		}
	}

	// 若第一层未找到，尝试深入一层（有些压缩包可能多包含了一层根目录）
	for _, entry := range entries {
		if entry.IsDir() {
			subEntries, sErr := os.ReadDir(filepath.Join(dir, entry.Name()))
			if sErr == nil {
				for _, sub := range subEntries {
					if sub.IsDir() && strings.HasSuffix(sub.Name(), ".app") {
						return filepath.Join(dir, entry.Name(), sub.Name()), nil
					}
				}
			}
		}
	}

	return "", fmt.Errorf("未找到 .app 目录")
}
