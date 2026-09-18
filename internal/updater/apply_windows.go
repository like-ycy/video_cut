//go:build windows

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

// ApplyAndRestart 在 Windows 上解压更新包中的 exe，替换当前程序并重启。
// 说明：Windows 下运行中的 exe 拥有独占文件锁，主进程自身无法覆盖自身。
// 此处启动一个独立的后台批处理，等待主程序退出释放文件锁后，完成文件覆盖并重新拉起。
func (m *Manager) ApplyAndRestart() error {
	pkgPath, tempDir, err := m.GetDownloadedFile()
	if err != nil {
		return err
	}

	currentExePath, err := os.Executable()
	if err != nil {
		return fmt.Errorf("获取当前可执行文件路径失败: %w", err)
	}
	resolved, err := filepath.EvalSymlinks(currentExePath)
	if err == nil {
		currentExePath = resolved
	}

	// extractUpdatePackage 会确保目标目录存在
	extractedDir := filepath.Join(tempDir, "extracted")
	if err := extractUpdatePackage(pkgPath, extractedDir); err != nil {
		return fmt.Errorf("解压更新包失败: %w", err)
	}

	newExePath, err := findExecutableInDir(extractedDir)
	if err != nil {
		return fmt.Errorf("未在更新包中找到可执行文件: %w", err)
	}

	batPath := filepath.Join(tempDir, "update.bat")
	batContent := `@echo off
set PID=%1
set TARGET=%~2
set NEW_FILE=%~3
set CLEAN_DIR=%~4
set BACKUP=%TARGET%.old

:wait_exit
tasklist /FI "PID eq %PID%" 2>NUL | find /I "%PID%" >NUL
if "%ERRORLEVEL%"=="0" (
    timeout /t 1 /nobreak >nul
    goto wait_exit
)

set /a ATTEMPTS=0
:retry_move
set /a ATTEMPTS+=1
if exist "%BACKUP%" del /F /Q "%BACKUP%" >nul 2>&1
move /Y "%TARGET%" "%BACKUP%" >nul 2>&1
if errorlevel 1 (
    if %ATTEMPTS% GEQ 30 exit /b 1
    timeout /t 1 /nobreak >nul
    goto retry_move
)
move /Y "%NEW_FILE%" "%TARGET%" >nul 2>&1
if errorlevel 1 (
    move /Y "%BACKUP%" "%TARGET%" >nul 2>&1
    exit /b 1
)

start "" "%TARGET%"

del /F /Q "%BACKUP%" >nul 2>&1

if exist "%CLEAN_DIR%" (
    rd /s /q "%CLEAN_DIR%" >nul 2>&1
)
`

	if err := os.WriteFile(batPath, []byte(batContent), 0o755); err != nil {
		return fmt.Errorf("写入更新批处理脚本失败: %w", err)
	}

	cmd := exec.Command("cmd.exe", "/c", batPath,
		strconv.Itoa(os.Getpid()),
		currentExePath,
		newExePath,
		tempDir,
	)

	// CREATE_NO_WINDOW (0x08000000) 与 CREATE_NEW_PROCESS_GROUP (0x00000200)
	cmd.SysProcAttr = &syscall.SysProcAttr{
		CreationFlags: 0x08000000 | 0x00000200,
	}

	if err := cmd.Start(); err != nil {
		return fmt.Errorf("启动更新批处理进程失败: %w", err)
	}
	m.markApplyPending()

	return nil
}

// findExecutableInDir 查找更新包解压后的 Windows 可执行文件。
func findExecutableInDir(dir string) (string, error) {
	entries, err := os.ReadDir(dir)
	if err != nil {
		return "", err
	}

	for _, entry := range entries {
		if !entry.IsDir() && strings.HasSuffix(strings.ToLower(entry.Name()), ".exe") {
			return filepath.Join(dir, entry.Name()), nil
		}
	}

	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}
		subDir := filepath.Join(dir, entry.Name())
		subEntries, sErr := os.ReadDir(subDir)
		if sErr != nil {
			continue
		}
		for _, sub := range subEntries {
			if !sub.IsDir() && strings.HasSuffix(strings.ToLower(sub.Name()), ".exe") {
				return filepath.Join(subDir, sub.Name()), nil
			}
		}
	}

	return "", fmt.Errorf("未找到 .exe 可执行文件")
}
