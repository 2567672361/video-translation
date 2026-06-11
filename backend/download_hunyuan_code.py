#!/usr/bin/env python3
"""从HuggingFace下载混元模型的自定义Python代码文件"""
from huggingface_hub import hf_hub_download
import os

MODEL_ID = "Tencent-Hunyuan/HY-MT1.5-1.8B"
MODEL_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                         "hy_mt1.5_model", "Tencent-Hunyuan", "HY-MT1___5-1___8B")

CODE_FILES = [
    "modeling_hunyuan_v1_dense.py",
    "configuration_hunyuan_v1_dense.py",
    "tokenization_hunyuan.py",
    "modeling_hunyuan.py",
    "configuration_hunyuan.py",
]

os.makedirs(MODEL_DIR, exist_ok=True)

for f in CODE_FILES:
    try:
        path = hf_hub_download(MODEL_ID, f, local_dir=MODEL_DIR)
        print(f"OK: {f} -> {path}")
    except Exception as e:
        print(f"SKIP: {f} - {e}")

print("Done")
