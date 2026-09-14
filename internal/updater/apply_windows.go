//go:build windows

package updater

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"syscall"
)

// ApplyAndRestart 在 Windows 上替换当前 exe 并重启。
// 说明：Windows 下运行中的 exe 拥有独占文件锁，主进程自身无法覆盖自身。
// 此处启动一个独立的后台批处理，等待主程序退出释放文件锁后，完成文件覆盖并重新拉起。
func (m *Manager) ApplyAndRestart() error {
	newExePath, tempDir, err := m.GetDownloadedFile()
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
