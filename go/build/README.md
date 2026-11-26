# build 目录

存放应用打包所需的资源文件。`wails build` 会读取这里的内容生成最终产物。

目录结构：

```
build/
├── appicon.png      # 应用图标源文件（1024×1024 推荐）
├── darwin/          # macOS 专有文件
├── windows/         # Windows 专有文件
└── bin/             # 构建产物输出目录（已由 .gitignore 排除，不入库）
```

---

## appicon.png

应用的图标源文件，位于 build 目录根下。

- 建议提供 **1024×1024** 的 PNG
- 更换方式：直接替换 `appicon.png`，然后重新执行 `wails build`
- 缺失时 Wails 会生成一个默认图标

---

## darwin（macOS）

| 文件 | 说明 |
| --- | --- |
| `Info.plist` | `wails build` 时使用的主 plist 文件 |
| `Info.dev.plist` | 同上，但仅在 `wails dev` 时使用 |

可以在这里声明权限、文件类型关联、最低系统版本等。例如需要访问"下载"目录时，在 `Info.plist` 中补充 `NSDocumentsFolderUsageDescription` 之类的键值。

改动后想恢复默认：删掉这两个文件，重新执行 `wails build`，Wails 会自动重新生成。

> 注意：两个文件的差别之一是 `Info.dev.plist` 额外声明了 `NSAppTransportSecurity` → `NSAllowsLocalNetworking`，允许开发模式下通过 Vite 服务器访问本地网络；正式发布走 `Info.plist`，不含该声明。

---

## windows（Windows）

| 文件 | 说明 |
| --- | --- |
| `icon.ico` | 应用图标（EXE 与窗口图标）。**若缺失，Wails 会用 `appicon.png` 自动生成一个新的** |
| `info.json` | 应用元数据，用于安装包以及 EXE 属性里的"详细信息"（公司名、产品名、版本号、版权等） |
| `wails.exe.manifest` | 应用清单文件，声明 DPI 感知、所需权限级别等 |
| `installer/project.nsi` | NSIS 安装包脚本，执行 `wails build -nsis` 时使用 |
| `installer/wails_tools.nsh` | NSIS 脚本依赖的辅助函数库，一般无需改动 |

想定制版本号或公司信息，改 `info.json` 即可；想定制安装流程（快捷方式、安装目录、许可协议页），改 `installer/project.nsi`。

改动后想恢复默认：删掉对应文件，重新执行 `wails build`。

---

## 常用构建命令

在项目根目录执行：

```bash
wails build                          # 构建当前平台，产物在 build/bin/
wails build -clean                   # 清理构建缓存后重新构建
wails build -platform windows/amd64  # 交叉编译到 Windows x64
wails build -platform darwin/universal  # macOS 通用二进制（Intel + Apple Silicon）
wails build -nsis                    # Windows：额外生成 NSIS 安装包
wails build -upx                     # 使用 UPX 压缩产物体积
```

交叉编译 Windows 需要本机装有对应工具链，交叉编译 macOS 则要求构建机上已安装 Xcode 命令行工具。

更多构建选项见 [Wails 官方文档](https://wails.io/docs/reference/cli)。
