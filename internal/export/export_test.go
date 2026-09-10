package export

import (
	"context"
	"os"
	"path/filepath"
	"testing"
	"time"

	"videocut/internal/video"
)

// 测试素材：40 秒、关键帧间隔 2 秒
const testSrc = "/tmp/vcut-test/test.mp4"

func TestSmokeFastAndExact(t *testing.T) {
	if _, err := os.Stat(testSrc); err != nil {
		t.Skip("缺少测试素材，跳过")
	}

	dir := t.TempDir()

	cases := []struct {
		name       string
		mode       Mode
		outName    string
		tolerance  float64
	}{
		{"极速模式", ModeFast, "out_fast.mp4", 2.5},
		{"精准模式", ModeExact, "out_exact.mp4", 0.6},
	}

	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			out := filepath.Join(dir, c.outName)
			req := Request{Src: testSrc, Mode: c.mode, Start: 5, End: 20, Output: out}

			var gotProgress bool
			res, err := Run(context.Background(), req, func(Progress) { gotProgress = true })
			if err != nil {
				t.Fatalf("导出失败: %v", err)
			}
			if res == nil {
				t.Fatal("导出结果为空")
			}

			// 输出文件必须真实存在
			if _, err := os.Stat(out); err != nil {
				t.Fatalf("输出文件不存在: %v", err)
			}

			// 时长应接近 15 秒
			diff := res.ActualDuration - 15
			if diff < 0 {
				diff = -diff
			}
			if diff > c.tolerance {
				t.Fatalf("实际时长 %.2f 秒，与预期 15 秒相差过大", res.ActualDuration)
			}

			// 精准模式必须上报进度，极速模式不上报
			if c.mode == ModeExact && !gotProgress {
				t.Error("精准模式未上报进度")
			}

			// 目录中不能残留临时文件
			entries, _ := os.ReadDir(dir)
			for _, e := range entries {
				if filepath.Ext(e.Name()) != ".mp4" {
					t.Errorf("残留临时文件: %s", e.Name())
				}
			}

			t.Logf("%s 实际时长 %.2f 秒，输出 %s", c.name, res.ActualDuration, filepath.Base(out))
		})
	}
}

func TestCancelLeavesNoTempFile(t *testing.T) {
	if _, err := os.Stat(testSrc); err != nil {
		t.Skip("缺少测试素材，跳过")
	}

	dir := t.TempDir()
	out := filepath.Join(dir, "out_cancel.mp4")

	ctx, cancel := context.WithCancel(context.Background())
	go func() {
		time.Sleep(300 * time.Millisecond)
		cancel()
	}()

	_, err := Run(ctx, Request{Src: testSrc, Mode: ModeExact, Start: 0, End: 30, Output: out}, nil)
	if err == nil {
		t.Log("导出在取消前已完成，跳过残留检查")
		return
	}
	if ctx.Err() == nil {
		t.Fatalf("导出失败但不是取消导致: %v", err)
	}

	entries, _ := os.ReadDir(dir)
	if len(entries) != 0 {
		t.Errorf("取消后仍有残留文件: %v", entries)
	}
}

func TestRejectsOverwriteOfSource(t *testing.T) {
	if _, err := os.Stat(testSrc); err != nil {
		t.Skip("缺少测试素材，跳过")
	}
	_, err := Run(context.Background(), Request{
		Src: testSrc, Mode: ModeFast, Start: 1, End: 5, Output: testSrc,
	}, nil)
	if err == nil {
		t.Fatal("应拒绝覆盖源文件")
	}
}

func TestProbeOutput(t *testing.T) {
	if _, err := os.Stat(testSrc); err != nil {
		t.Skip("缺少测试素材，跳过")
	}
	mi, err := video.Probe(context.Background(), testSrc)
	if err != nil {
		t.Fatalf("探测失败: %v", err)
	}
	if mi.Duration < 39 || mi.Duration > 41 {
		t.Fatalf("时长异常: %.2f", mi.Duration)
	}
	if mi.Width != 640 || mi.Height != 360 {
		t.Fatalf("分辨率异常: %dx%d", mi.Width, mi.Height)
	}
	if mi.NeedsProxy {
		t.Error("H.264 MP4 不应需要预览代理")
	}
	t.Logf("时长 %.2f 秒，%dx%d，%s", mi.Duration, mi.Width, mi.Height, mi.VideoCodec)
}
