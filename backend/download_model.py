#!/usr/bin/env python3
"""
从ModelScope直接下载腾讯混元HY-MT1.5-1.8B模型文件
绕过modelscope SDK的权限问题
"""

import os
import sys
import json
import urllib.request
import urllib.error

MODEL_ID = "Tencent-Hunyuan/HY-MT1.5-1.8B"
MODELSCOPE_BASE = "https://www.modelscope.cn/models"
LOCAL_MODEL_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "hy_mt1.5_model")

REQUIRED_FILES = [
    "config.json",
    "configuration.json",
    "generation_config.json",
    "special_tokens_map.json",
    "tokenizer.json",
    "tokenizer_config.json",
    "chat_template.jinja",
    "model.safetensors",
]

def download_file(url, dest_path):
    """下载单个文件，带进度显示"""
    import tempfile

    print(f"  下载: {os.path.basename(dest_path)}", end="", flush=True)

    try:
        # 使用urlopen获取文件大小
        response = urllib.request.urlopen(url, timeout=30)
        file_size = int(response.headers.get('Content-Length', 0))
        response.close()

        # 重新请求并下载
        urllib.request.urlretrieve(url, dest_path)

        actual_size = os.path.getsize(dest_path)
        if file_size > 0:
            print(f" -> {actual_size / 1024 / 1024:.1f}MB")
        else:
            print(f" -> {actual_size / 1024:.1f}KB")
        return True

    except Exception as e:
        print(f" -> 失败: {e}")
        return False


def