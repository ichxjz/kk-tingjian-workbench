#!/bin/bash
set -e
cd "$(dirname "$0")"
if ! command -v node >/dev/null 2>&1; then
  if [ -s "$HOME/.nvm/nvm.sh" ]; then . "$HOME/.nvm/nvm.sh"; fi
fi
if ! command -v node >/dev/null 2>&1; then
  echo "请先安装 Node.js 24 或更新版本，再双击启动。"
  read -r -p "按回车关闭…"
  exit 1
fi
if [ "$(node -p 'Number(process.versions.node.split(".")[0]) >= 24')" != "true" ]; then
  echo "需要 Node.js 24+。当前版本：$(node -v)"
  read -r -p "按回车关闭…"
  exit 1
fi
if curl -fsS --max-time 2 http://127.0.0.1:5188/api/state >/dev/null 2>&1; then
  open http://127.0.0.1:5188/
  exit 0
fi
if [ ! -d node_modules ]; then npm ci; fi
mkdir -p output
nohup node src/server.mjs > output/server.log 2>&1 &
server_pid=$!
for attempt in $(seq 1 30); do
  if curl -fsS --max-time 1 http://127.0.0.1:5188/api/state >/dev/null 2>&1; then
    open http://127.0.0.1:5188/
    exit 0
  fi
  if ! kill -0 "$server_pid" 2>/dev/null; then break; fi
  sleep 0.5
done
echo "启动未完成，请查看项目 output/server.log。"
read -r -p "按回车关闭…"
