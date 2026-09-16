package updater

import (
	"archive/tar"
	"compress/gzip"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
)

// extractTarGz 解压 tar.gz 到 destDir。
// 优先使用系统 tar，以更好保留 macOS .app 的权限与符号链接；失败时回退到纯 Go 解压。
func extractTarGz(pkgPath, destDir string) error {
	if tarPath, err := exec.LookPath("tar"); err == nil {
		cmd := exec.Command(tarPath, "-xzf", pkgPath, "-C", destDir)
		if err := cmd.Run(); err == nil {
			return nil
		}
	}
	return extractTarGzGo(pkgPath, destDir)
}

func extractTarGzGo(pkgPath, destDir string) error {
	f, err := os.Open(pkgPath)
	if err != nil {
		return err
	}
	defer f.Close()

	gz, err := gzip.NewReader(f)
	if err != nil {
		return err
	}
	defer gz.Close()

	tr := tar.NewReader(gz)
	for {
		hdr, err := tr.Next()
		if err == io.EOF {
			break
		}
		if err != nil {
			return err
		}

		target, err := safeJoin(destDir, hdr.Name)
		if err != nil {
			return err
		}

		switch hdr.Typeflag {
		case tar.TypeDir:
			if err := os.MkdirAll(target, os.FileMode(hdr.Mode)); err != nil {
				return err
			}
		case tar.TypeReg:
			if err := os.MkdirAll(filepath.Dir(target), 0o755); err != nil {
				return err
			}
			out, err := os.OpenFile(target, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, os.FileMode(hdr.Mode))
			if err != nil {
				return err
			}
			if _, err := io.Copy(out, tr); err != nil {
				out.Close()
				return err
			}
			if err := out.Close(); err != nil {
				return err
			}
		case tar.TypeSymlink:
			if err := os.MkdirAll(filepath.Dir(target), 0o755); err != nil {
				return err
			}
			_ = os.Remove(target)
			if err := os.Symlink(hdr.Linkname, target); err != nil {
				return err
			}
		default:
			// 忽略设备文件、FIFO 等更新包中不应出现的类型
		}
	}
	return nil
}

func safeJoin(base, name string) (string, error) {
	target := filepath.Join(base, filepath.FromSlash(name))
	cleanBase := filepath.Clean(base)
	cleanTarget := filepath.Clean(target)
	if cleanTarget != cleanBase && !strings.HasPrefix(cleanTarget, cleanBase+string(filepath.Separator)) {
		return "", fmt.Errorf("非法压缩包路径: %s", name)
	}
	return target, nil
}
