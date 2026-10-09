#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."
uv venv --python 3.12 .runtime/video-env
uv pip install --python .runtime/video-env/bin/python -r src/bridge/video-requirements.lock.txt
swiftc src/bridge/video_ocr.swift -o .runtime/video-ocr
swiftc src/bridge/video_subtitle_ocr.swift -o .runtime/video-subtitle-ocr
printf '%s\n' '视频环境安装完成。请核对 docs/本地视频工作台.md 中的模型与工具要求。'
