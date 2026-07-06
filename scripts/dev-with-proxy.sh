#!/bin/bash
# 本地开发脚本（通过代理访问 GitHub）
# 用法: ./scripts/dev-with-proxy.sh

export https_proxy=http://127.0.0.1:7897
export http_proxy=http://127.0.0.1:7897
export all_proxy=socks5://127.0.0.1:7897
export HTTPS_PROXY=http://127.0.0.1:7897
export HTTP_PROXY=http://127.0.0.1:7897
export ALL_PROXY=socks5://127.0.0.1:7897

echo "🌐 Proxy configured: http://127.0.0.1:7897"
echo "🚀 Starting wrangler dev..."
echo ""

npx wrangler dev