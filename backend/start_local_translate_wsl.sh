#!/bin/bash
# -*- coding: utf-8 -*-
# 腾讯混元本地翻译服务 WSL 启动脚本
# 用法: bash start_local_translate_wsl.sh

set -e

echo "========================================"
echo "  腾讯混元本地翻译服务启动脚本 (WSL)"
echo "========================================"
echo ""

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

PYTHON_CMD=""
for cmd in python3 python; do
    if command -v $cmd &> /dev/null; then
        PYTHON_CMD=$cmd
        break
    fi
done

if [ -z "$PYTHON_CMD" ]; then
    echo "[错误] 未找到Python，请先安装Python 3.8+"
    echo "  Ubuntu/Debian: sudo apt install python3 python3-pip python3-venv"
    exit 1
fi

echo "[信息] 使用Python: $($PYTHON_CMD --version)"

$PYTHON_CMD -c "import flask, transformers, torch" 2>/dev/null
if [ $? -ne 0 ]; then
    echo "[信息] 正在安装Python依赖..."
    pip install -r requirements_local_translate.txt
    if [ $? -ne 0 ]; then
        echo "[错误] 依赖安装失败"
        exit 1
    fi
fi

echo ""
echo "[信息] 启动本地翻译服务..."
echo "[信息] 服务地址: http://127.0.0.1:5001"
echo "[信息] 健康检查: http://127.0.0.1:5001/health"
echo "[信息] 首次启动会自动下载模型（约4GB），请耐心等待..."
echo ""

export LOCAL_TRANSLATE_PORT="${LOCAL_TRANSLATE_PORT:-5001}"
export LOCAL_TRANSLATE_HOST="${LOCAL_TRANSLATE_HOST:-0.0.0.0}"
export PYTHONIOENCODING=utf-8
export LANG=zh_CN.UTF-8
export LC_ALL=zh_CN.UTF-8

$PYTHON_CMD local_translate.py
