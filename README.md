# 视频裁剪（videocut）

一个本地运行的桌面视频裁剪工具。基于 [Wails v2](https://wails.io/)（Go + WebView），界面用 React 编写，媒体处理全部交给本机已安装的 FFmpeg。

打开视频 → 拖动或输入时间码选定片段 → 选择导出模式 → 保存。整个过程不联网、不上传，原始文件永不被覆盖。

---

## 功能特性

- **打开方式**：点击按钮选择文件，或直接把视频拖到窗口里（一次一个）
- **缩略图时间轴**：自动抽取 15 张缩略图铺满时间轴，可拖动两端手柄调整区间，拖动时播放器跟随跳转
- **时间码输入**：支持精确到毫秒的手动输入（如 `00:01:23.500`），带实时校验
- **兼容性兜底**：遇到 WebView 无法直接播放的编码（如 MKV + 非 H.264），后台自动生成预览代理用于播放，**导出仍使用原始文件**，画质不受影响
- **两种导出模式**：极速（流复制）与精准（重编码），见[导出模式对比](#导出模式对比)
- **安全落盘**：先写同目录临时文件，校验时长与体积后再原子改名；绝不覆盖源文件，目标已存在时自动追加 `(1)`、`(2)`
- **进度与耗时预估**：精准模式实时显示百分比和预计剩余时间，可随时取消
- **导出保护**：导出过程中关闭窗口会二次确认，避免任务被意外中断

---

## 技术栈

| 层 | 选型 |
| --- | --- |
| 桌面框架 | Wails v2.15（Go 1.25） |
| 前端 | React 19 + TypeScript + Vite 7 |
| 样式 | Tailwind CSS 3 |
| 媒体处理 | 系统 PATH 中的 `ffmpeg` / `ffprobe` |
| 平台支持 | macOS、Windows、Linux |

---

## 环境要求

| 依赖 | 说明 |
| --- | --- |
| Go | 1.25 及以上（`go version` 查看） |
| Node.js | 18 及以上，用于构建前端 |
| FFmpeg | **必需**。且 `ffmpeg`、`ffprobe` 两个命令都必须能从系统 PATH 中找到 |
| Wails CLI | 可选，用于 `wails dev` / `wails build` |

安装 FFmpeg：

```bash
# macOS
brew install ffmpeg

# Windows（需手动把 ffmpeg/bin 加入 PATH）
winget install Gyan.FFmpeg

# Ubuntu / Debian
sudo apt install ffmpeg
```

验证：

```bash
ffmpeg -version
ffprobe -version
```

安装 Wails CLI：

```bash
go install github.com/wailsapp/wails/v2/cmd/wails@latest
```

---

## 快速开始

```bash
# 1. 安装前端依赖
cd frontend && npm install && cd ..

# 2. 开发模式（前端热重载）
wails dev

# 3. 生产构建，产物在 build/bin/
wails build
```

常用构建参数：

```bash
wails build -platform darwin/universal   # macOS 通用二进制（Intel + Apple Silicon）
wails build -nsis                        # Windows 额外生成 NSIS 安装包
wails build -clean                       # 清理构建缓存后重新构建
```

---

## 项目结构

```
video_cut/
├── main.go                  # 入口：窗口配置、静态资源、媒体服务挂载、关闭前确认
├── app.go                   # 暴露给前端的绑定方法，以及全部事件名定义
├── wails.json               # Wails 项目配置
├── frontend/
│   ├── src/
│   │   ├── App.tsx          # 主界面状态编排、后端事件订阅
│   │   ├── components/      # 播放器、缩略图时间轴、时间码行、顶栏/底栏、导出浮层
│   │   ├── lib/timecode.ts  # 时间码解析与格式化
│   │   └── types.ts         # 与 Go 结构体对应的前端类型
│   └── wailsjs/             # Wails 自动生成的 Go 方法绑定（勿手动编辑）
├── internal/
│   ├── ffmpeg/              # ffmpeg / ffprobe 可用性检查与进程执行
│   ├── video/               # ffprobe 探测，解析媒体信息并判断能否直接播放
│   ├── preview/             # 本地媒体 HTTP 服务 + 预览代理生成
│   ├── thumbnail/           # 缩略图批量生成与取消
│   ├── export/              # 两种模式的裁剪导出
│   └── fsutil/              # 临时文件、原子落盘、跨平台「在文件夹中显示」
└── build/                   # 打包资源（详见 build/README.md）
```

---

## 导出模式对比

| | 极速模式（`fast`） | 精准模式（`exact`） |
| --- | --- | --- |
| 原理 | 流复制 `-c copy`，不重新编码 | 重编码 `libx264 -crf 18` + `aac 192k` |
| 速度 | 快，取决于磁盘 IO | 慢，取决于 CPU 与视频长度 |
| 画质 | 无损，与源文件完全一致 | 肉眼基本无损，有极小代损 |
| 切点精度 | **对齐到附近关键帧**，可能有零点几秒偏差 | 严格按所选时间裁剪 |
| 进度显示 | 无（速度太快） | 有百分比与剩余时间 |
| 字幕 | 尽量保留，失败时提示未保留 | 仅 MKV 输出保留字幕轨 |
| 适用 | 只要大致切掉头尾、追求速度与原画质 | 需要精确时间点、或源文件极速模式失败 |

极速模式内部有两级策略：先尝试复制全部流（含字幕、章节、附件），失败则回退为只保留视频和音频，并在结果中给出提示。精准模式失败时，界面会提供「改用精准模式重试」的入口。

---

## 架构说明

### 媒体服务

WebView 不能直接通过 `file://` 播放本地文件，因此应用启动时会额外在 `127.0.0.1` 的随机端口起一个独立的 HTTP 服务：

- `/media/current` — 当前视频（支持 Range 请求，可拖动跳转）
- `/media/thumbs/*.jpg` — 缩略图目录，做文件名白名单与路径校验，防止目录穿越

之所以不复用 Wails 的资源服务器：开发模式下页面由 Vite 提供，`/media/*` 会被 Vite 的 SPA fallback 拦截成 `index.html`。独立端口可以保证开发模式与生产模式行为一致。

### 前后端通信

前端通过 `EventsOn` 订阅后端事件，所有事件都带 `seq` 序号——切换视频或发起新导出时序号递增，前端据此丢弃过期消息，避免旧任务的进度条串台。

| 事件 | 时机 |
| --- | --- |
| `video:opened` | 视频探测成功，携带媒体信息 |
| `video:failed` | 打开失败，携带可读的中文原因 |
| `preview:ready` | 预览代理生成完成（或失败） |
| `thumb:progress` / `thumb:done` | 缩略图生成进度与结果 |
| `export:start` / `export:progress` / `export:done` / `export:failed` | 导出生命周期 |

### 导出流程

```
选择区间 → 弹出保存对话框 → 生成不冲突的目标路径
        → 同目录创建临时文件（保留原扩展名，供 FFmpeg 推断封装格式）
        → 执行 FFmpeg → 校验输出体积与真实时长
        → 原子改名落盘（目标已存在则不覆盖，直接报错）
        → 失败或取消时清理临时文件
```

---

## 常见问题

**打开视频时提示「未找到 ffmpeg 和 ffprobe」**
FFmpeg 没有安装，或没加入系统 PATH。在终端执行 `which ffmpeg`（Windows 用 `where ffmpeg`）确认。

**预览画面出不来，但可以裁剪**
说明该视频的编码或容器 WebView 播不了，且预览代理也生成失败。可以直接输入时间码后导出，不影响结果。

**导出后时长和我选的不一致**
极速模式会把切点对齐到附近关键帧，改用「精准模式」即可严格按所选时间裁剪。

**导出的文件没有字幕**
MP4 / MOV 对大多数字幕格式支持有限。需要保留字幕请选择 MKV 输出，并配合精准模式。

**会不会覆盖原文件？**
不会。代码层面有多重保护：源文件被列为禁止覆盖目标，目标路径已存在时自动追加序号，最终落盘用的是「不存在才创建」的原子操作。

---

## 开发

```bash
go build ./...      # 编译检查
go vet ./...        # 静态检查
go test ./...       # 运行测试
```

前端单独调试（不启动 Go 后端，绑定方法不可用）：

```bash
cd frontend && npm run dev
```
