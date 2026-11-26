package updater

import (
	"archive/tar"
	"archive/zip"
	"compress/gzip"
	"fmt"
	"io"
	"io/fs"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
)

// extractUpdatePackage 按扩展名解压更新包到 destDir。
// 支持 .zip（当前约定）与 .tar.gz（兼容旧 Release）。
func extractUpdatePackage(pkgPath, destDir string) error {
	if err := os.MkdirAll(destDir, 0o755); err != nil {
		return fmt.Errorf("创建解压目录失败: %w", err)
	}
	name := strings.ToLower(filepath.Base(pkgPath))
	switch {
	case strings.HasSuffix(name, ".zip"):
		return extractZip(pkgPath, destDir)
	case strings.HasSuffix(name, ".tar.gz"), strings.HasSuffix(name, ".tgz"):
		return extractTarGz(pkgPath, destDir)
	default:
		return fmt.Errorf("不支持的更新包格式: %s", filepath.Base(pkgPath))
	}
}

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

// extractZip 解压 zip 到 destDir。
// 优先系统工具以更好还原权限与符号链接；失败时回退到 Go archive/zip。
func extractZip(pkgPath, destDir string) error {
	// macOS：ditto 对 .app 内符号链接/扩展属性最稳妥
	if ditto, err := exec.LookPath("ditto"); err == nil {
		cmd := exec.Command(ditto, "-x", "-k", pkgPath, destDir)
		if err := cmd.Run(); err == nil {
			return nil
		}
	}
	// 常见系统 unzip
	if unzip, err := exec.LookPath("unzip"); err == nil {
		cmd := exec.Command(unzip, "-qq", "-o", pkgPath, "-d", destDir)
		if err := cmd.Run(); err == nil {
			return nil
		}
	}
	// Windows / 部分环境的 bsdtar 也能解 zip
	if tarPath, err := exec.LookPath("tar"); err == nil {
		cmd := exec.Command(tarPath, "-xf", pkgPath, "-C", destDir)
		if err := cmd.Run(); err == nil {
			return nil
		}
	}
	return extractZipGo(pkgPath, destDir)
}

func extractZipGo(pkgPath, destDir string) error {
	r, err := zip.OpenReader(pkgPath)
	if err != nil {
		return err
	}
	defer r.Close()

	for _, f := range r.File {
		target, err := safeJoin(destDir, f.Name)
		if err != nil {
			return err
		}

		mode := f.Mode()
		if f.FileInfo().IsDir() {
			if err := os.MkdirAll(target, 0o755); err != nil {
				return err
			}
			continue
		}

		if mode&fs.ModeSymlink != 0 {
			if err := os.MkdirAll(filepath.Dir(target), 0o755); err != nil {
				return err
			}
			rc, err := f.Open()
			if err != nil {
				return err
			}
			linkTarget, err := io.ReadAll(rc)
			rc.Close()
			if err != nil {
				return err
			}
			_ = os.Remove(target)
			if err := os.Symlink(string(linkTarget), target); err != nil {
				return err
			}
			continue
		}

		if err := os.MkdirAll(filepath.Dir(target), 0o755); err != nil {
			return err
		}
		perm := mode.Perm()
		if perm == 0 {
			perm = 0o644
		}
		out, err := os.OpenFile(target, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, perm)
		if err != nil {
			return err
		}
		rc, err := f.Open()
		if err != nil {
			out.Close()
			return err
		}
		if _, copyErr := io.Copy(out, rc); copyErr != nil {
			rc.Close()
			out.Close()
			return copyErr
		}
		if err := rc.Close(); err != nil {
			out.Close()
			return err
		}
		if err := out.Close(); err != nil {
			return err
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
