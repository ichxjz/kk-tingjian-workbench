# 第三方组件说明

本仓库未授予项目整体新的开源许可证。各第三方组件及资源按其原许可证使用，不将其重新许可。

- MediaCrawler：可选安装，固定版本记录在 `docs/mediacrawler-source.json`。遵守上游非商业学习许可证；完整声明在 `src/public/mediacrawler-license.txt`。第三方源码及运行环境不随源码包提交。
- Node.js 依赖：版本与下载信息见 `package-lock.json`，各包保留各自许可证。
- Python 媒体依赖：见 `src/bridge/video-requirements.lock.txt`；yt-dlp、MLX 组件及模型权重分别遵循原许可证。模型不随包提供。
- Natural Earth 地球轮廓：公共领域数据，源自 https://github.com/nvkelso/natural-earth-vector 。
- 平台图标：仅用于识别相应平台，商标权归各平台。
- Mac 发行中的 FFmpeg 必须按发行说明使用可分发构建，保留许可证、对应源码及构建说明；不应直接打包含 nonfree 的开发机版本。
