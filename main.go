package main

import (
	"context"
	"embed"
	"net/http"

	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
	"github.com/wailsapp/wails/v2/pkg/runtime"
)

//go:embed all:frontend/dist
var assets embed.FS

func main() {
	app, err := NewApp()
	if err != nil {
		println("Error:", err.Error())
		return
	}

	// 静态资源由 Wails 提供；未命中的请求（/media/*）交给媒体服务。
	// 该行为在 dev 与生产模式下一致。
	mediaHandler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if s := app.mediaServer(); s != nil {
			s.ServeHTTP(w, r)
			return
		}
		http.NotFound(w, r)
	})

	err = wails.Run(&options.App{
		Title:     "视频裁剪",
		Width:     1440,
		Height:    900,
		MinWidth:  1024,
		MinHeight: 720,
		AssetServer: &assetserver.Options{
			Assets:  assets,
			Handler: mediaHandler,
		},
		BackgroundColour: &options.RGBA{R: 248, G: 250, B: 252, A: 1},
		DragAndDrop: &options.DragAndDrop{
			EnableFileDrop: true,
		},
		OnStartup:     app.startup,
		OnShutdown:    app.shutdown,
		OnBeforeClose: app.beforeClose,
		Bind: []interface{}{
			app,
		},
	})

	if err != nil {
		println("Error:", err.Error())
	}
}

// beforeClose 在窗口关闭前调用：导出进行中时询问用户是否放弃。
func (a *App) beforeClose(ctx context.Context) bool {
	a.mu.Lock()
	exporting := a.exporting
	a.mu.Unlock()
	if !exporting {
		return false
	}

	choice, err := runtime.MessageDialog(ctx, runtime.MessageDialogOptions{
		Type:          runtime.QuestionDialog,
		Title:         "正在导出视频",
		Message:       "导出尚未完成，关闭窗口将取消本次导出。确定要关闭吗？",
		Buttons:       []string{"取消导出并关闭", "继续导出"},
		DefaultButton: "继续导出",
	})
	if err != nil || choice == "继续导出" || choice == "" {
		return true // 阻止关闭
	}

	a.CancelExport()
	return false
}
