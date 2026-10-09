# KK-听见 Mac 本地轻量版

目标：不依赖作者服务器或付费 API，用户在自己的 Apple Silicon Mac 上运行。最低标注 macOS 14；实际验收系统为 macOS 15.6.1，不能据此宣称覆盖所有机型。

## 结构

- `src/desktop/Launcher.swift`：AppKit 控制窗口、独立服务生命周期、按需安装入口。
- `src/desktop/bootstrap.mjs`：复制干净程序与运行时至用户 Application Support，按构建标识更新代码，保留 `.runtime` 与模型目录；localhost 5189 开始选空闲端口。
- `src/desktop/install-feature.mjs`：用户主动点击后安装语音字幕、智能排版或增强采集；UV/Python 均随包提供，不要求开发工具。
- `scripts/build-mac-package.mjs`：白名单打包、可迁移路径修复、文件审计、ad-hoc 签名与 ZIP/SHA256 输出。
- `scripts/mac-package-check.mjs`：ZIP 解压到含中文和空格的全新路径，在隔离目录启动真实原生应用并验收。

用户数据：`~/Library/Application Support/KK-Tingjian/`。不会读取开发项目 `.runtime`，不会复制作者模型缓存。构建中不打包数据库、Cookie、密码、浏览器配置、个人文件和日志。原工作台仍按旧路径运行，两者独立。

## 运行时

内置 Node.js 24、可迁移 CPython 3.12、Pillow/OpenCC/yt-dlp、UV、原生 Vision OCR 和独立 FFmpeg/FFprobe。Chrome 不捆绑，使用者自行安装并登录。FFmpeg 7.1.1 从原始源码构建，关闭 GPL/nonfree/version3/network/autodetect，附完整源码、LGPL2.1许可与构建命令。开发机原 FFmpeg 含 nonfree 标记，禁止直接放入分发包。

Python 的 sysconfig 前缀改为运行时解析，libpython install name 改为 @rpath；保留相对符号链接。每次发版扫描作者路径和所有用户数据文件类型，避免“只在开发机能跑”。

## 构建准备与输出

当前构建复用开发机已安装的匹配版本运行时和三个轻量 Python 包；原始 FFmpeg 源码及构建输出位于 `.runtime/packaging/`。`npm run package:mac` 生成 `output/releases/KK-听见-Mac-arm64-0.1.0.zip` 和校验文件。构建目录会重建，用户数据目录不会删除。

程序采用本机 ad-hoc 签名，无付费 Developer ID，也未公证。不能声称首次双击不会出现安全提示；随包说明使用 Apple 官方允许打开流程，不提供关闭 Gatekeeper 或自动移除隔离标记的脚本。

## 验证范围

主程序现有测试、真实新目录启动、空白数据、演示分析和 XLSX、中文封面、FFmpeg 生成样本及内嵌字幕、联网翻译、退出关端口、重开数据保留。真实平台采集仍受登录、验证码和各平台状态影响，程序包验收不代表所有链接实采成功。

可选模型下载由各用户承担网络/磁盘消耗，不自动计费。不承诺免费外部翻译服务稳定或无限额度。MediaCrawler 的非商业学习许可保留，安装时明确展示。
