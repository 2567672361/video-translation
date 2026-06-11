#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
腾讯混元 HY-MT1.5-1.8B 本地翻译服务
通过ModelScope下载模型，提供HTTP API供Node.js调用
"""

import os
import sys
import json
import re
from flask import Flask, request, jsonify, Response
from transformers import AutoModelForCausalLM, AutoTokenizer
import torch

MODELSCOPE_MODEL_ID = "Tencent-Hunyuan/HY-MT1.5-1.8B"
LOCAL_MODEL_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "hy_mt1.5_model")

app = Flask(__name__)
app.config['JSON_AS_ASCII'] = False

model = None
tokenizer = None
device = None

HUNYUAN_SPECIAL_PATTERN = re.compile(r'<｜hy_[^｜]*｜>')

LANGUAGE_NAMES = {
    'zh': '中文',
    'en': '英文',
    'ja': '日文',
    'ko': '韩文',
    'fr': '法文',
    'de': '德文',
    'es': '西班牙文',
    'ru': '俄文',
    'ar': '阿拉伯文',
    'pt': '葡萄牙文',
    'tr': '土耳其语',
    'th': '泰语',
    'it': '意大利语',
    'vi': '越南语',
    'ms': '马来语',
    'id': '印尼语',
    'tl': '菲律宾语',
    'hi': '印地语',
    'pl': '波兰语',
    'cs': '捷克语',
    'nl': '荷兰语',
    'km': '高棉语',
    'my': '缅甸语',
    'fa': '波斯语',
    'gu': '古吉拉特语',
    'ur': '乌尔都语',
    'te': '泰卢固语',
    'mr': '马拉地语',
    'he': '希伯来语',
    'bn': '孟加拉语',
    'ta': '泰米尔语',
    'uk': '乌克兰语',
    'bo': '藏语',
    'kk': '哈萨克语',
    'mn': '蒙古语',
    'ug': '维吾尔语',
    'yue': '粤语'
}


def find_model_dir():
    """在本地缓存目录中查找模型子目录"""
    if os.path.exists(LOCAL_MODEL_DIR):
        # 先检查直接路径
        if os.path.exists(os.path.join(LOCAL_MODEL_DIR, 'config.json')):
            return LOCAL_MODEL_DIR
        # 扫描子目录
        for root, dirs, files in os.walk(LOCAL_MODEL_DIR):
            if 'config.json' in files and 'model.safetensors' in files:
                return root
    return None


def download_model_from_modelscope():
    """从ModelScope下载模型到本地"""
    print('[LocalTranslate] 正在从ModelScope下载模型...')
    print(f'[LocalTranslate] 模型ID: {MODELSCOPE_MODEL_ID}')
    print(f'[LocalTranslate] 本地目录: {LOCAL_MODEL_DIR}')

    try:
        os.environ['MODELSCOPE_CACHE'] = LOCAL_MODEL_DIR
        os.makedirs(LOCAL_MODEL_DIR, exist_ok=True)

        from modelscope import snapshot_download
        model_dir = snapshot_download(
            MODELSCOPE_MODEL_ID,
            cache_dir=LOCAL_MODEL_DIR,
            revision='master'
        )
        print(f'[LocalTranslate] 模型下载完成: {model_dir}')
        return model_dir
    except ImportError:
        print('[LocalTranslate] modelscope未安装，请运行: pip install modelscope')
        return None
    except Exception as e:
        print(f'[LocalTranslate] 模型下载失败: {e}')
        import traceback
        traceback.print_exc()
        return None


def init_model():
    """初始化模型和分词器"""
    global model, tokenizer, device

    print('[LocalTranslate] 正在初始化腾讯混元 HY-MT1.5-1.8B 模型...')

    if torch.cuda.is_available():
        device = torch.device('cuda')
        print('[LocalTranslate] 使用CUDA加速')
    else:
        device = torch.device('cpu')
        print('[LocalTranslate] 使用CPU')

    # 检查本地模型目录是否存在
    model_path = find_model_dir()
    if model_path:
        print(f'[LocalTranslate] 找到本地模型: {model_path}')
    else:
        print('[LocalTranslate] 本地模型不存在，开始下载...')
        model_path = download_model_from_modelscope()
        if model_path is None:
            print('[LocalTranslate] 模型下载失败，服务将无法工作')
            return False

    try:
        print(f'[LocalTranslate] 加载分词器...')
        tokenizer = AutoTokenizer.from_pretrained(
            model_path,
            trust_remote_code=True
        )
        print('[LocalTranslate] 分词器加载成功')

        print(f'[LocalTranslate] 加载模型（约4GB，请耐心等待）...')
        if torch.cuda.is_available() and torch.cuda.is_bf16_supported():
            dtype = torch.bfloat16
            print('[LocalTranslate] 使用bfloat16精度')
        elif torch.cuda.is_available():
            dtype = torch.float16
            print('[LocalTranslate] 使用float16精度（bfloat16不支持）')
        else:
            dtype = torch.float32
            print('[LocalTranslate] 使用float32精度')
        model = AutoModelForCausalLM.from_pretrained(
            model_path,
            trust_remote_code=True,
            device_map="auto" if torch.cuda.is_available() else None,
            torch_dtype=dtype,
            low_cpu_mem_usage=True
        )
        if not torch.cuda.is_available():
            model = model.to(device)
        print('[LocalTranslate] 模型加载成功')
        return True

    except Exception as e:
        print(f'[LocalTranslate] 模型加载失败: {e}')
        import traceback
        traceback.print_exc()
        return False


def clean_output(text):
    """清理翻译输出中的特殊token和多余空白"""
    text = HUNYUAN_SPECIAL_PATTERN.sub('', text)
    text = text.replace('\u3000', ' ')
    text = text.strip()
    return text


def build_prompt(text, target_language):
    """构建翻译提示词"""
    target_lang_name = LANGUAGE_NAMES.get(target_language, target_language)

    if target_language in ('zh', 'yue', 'zh-Hant'):
        prompt = f"将以下文本翻译为{target_lang_name}，注意只需要输出翻译后的结果，不要额外解释：\n{text}"
    else:
        prompt = f"Translate the following segment into {target_lang_name}, without additional explanation.\n{text}"

    return prompt


def translate_text(text, target_language):
    """翻译文本"""
    global model, tokenizer, device

    if model is None or tokenizer is None:
        raise RuntimeError("模型未初始化")

    try:
        prompt = build_prompt(text, target_language)
        messages = [{"role": "user", "content": prompt}]

        formatted_prompt = tokenizer.apply_chat_template(
            messages,
            tokenize=False,
            add_generation_prompt=True
        )
        inputs = tokenizer(formatted_prompt, return_tensors="pt").to(device)

        gen_kwargs = {
            'max_new_tokens': 2048,
            'do_sample': True,
            'top_k': 20,
            'top_p': 0.6,
            'repetition_penalty': 1.05,
            'temperature': 0.7,
            'pad_token_id': tokenizer.pad_token_id,
            'eos_token_id': tokenizer.eos_token_id,
        }

        with torch.no_grad():
            outputs = model.generate(**inputs, **gen_kwargs)

        generated_ids = outputs[0][inputs['input_ids'].shape[1]:]
        output_text = tokenizer.decode(
            generated_ids,
            skip_special_tokens=True,
            clean_up_tokenization_spaces=True
        )
        output_text = clean_output(output_text)
        return output_text

    except Exception as e:
        print(f'[LocalTranslate] 翻译失败: {e}')
        import traceback
        traceback.print_exc()
        raise


@app.route('/', methods=['GET'])
def index():
    model_status = '已加载' if model is not None else '未加载'
    device_info = str(device) if device else '未初始化'
    html = f'''<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<title>腾讯混元翻译服务</title>
<style>
  body {{ font-family: 'Segoe UI', sans-serif; max-width: 600px; margin: 60px auto; padding: 0 20px; color: #333; }}
  h1 {{ color: #0052d9; }}
  .card {{ background: #f5f7fa; border-radius: 8px; padding: 20px; margin: 15px 0; }}
  .label {{ color: #888; font-size: 14px; }}
  .value {{ font-size: 18px; font-weight: 600; }}
  .ok {{ color: #00a870; }}
  a {{ color: #0052d9; }}
  code {{ background: #e8eaed; padding: 2px 6px; border-radius: 3px; }}
</style>
</head>
<body>
<h1>腾讯混元 HY-MT1.5-1.8B 翻译服务</h1>
<div class="card">
  <div class="label">服务状态</div>
  <div class="value ok">运行中</div>
</div>
<div class="card">
  <div class="label">模型状态</div>
  <div class="value">{model_status}</div>
</div>
<div class="card">
  <div class="label">运行设备</div>
  <div class="value">{device_info}</div>
</div>
<div class="card">
  <div class="label">API 端点</div>
  <div class="value">
    <a href="/health">GET /health</a> — 健康检查<br>
    <code>POST /translate</code> — 翻译接口<br>
    &nbsp;&nbsp;参数: <code>{{"text": "...", "target_language": "en"}}</code>
  </div>
</div>
</body>
</html>'''
    return html


@app.route('/health', methods=['GET'])
def health():
    return jsonify({
        'status': 'ok',
        'model_loaded': model is not None
    })


@app.route('/translate', methods=['POST'])
def translate():
    try:
        data = request.json
        text = data.get('text', '')
        target_language = data.get('target_language', 'zh')

        if not text:
            return Response(
                json.dumps({'success': False, 'error': 'text参数不能为空'}, ensure_ascii=False),
                status=400,
                mimetype='application/json; charset=utf-8'
            )

        print(f'[LocalTranslate] 翻译请求: "{text[:50]}..." -> {target_language}')
        translated_text = translate_text(text, target_language)
        print(f'[LocalTranslate] 翻译结果: "{translated_text[:100]}"')

        result = {
            'success': True,
            'original_text': text,
            'translated_text': translated_text,
            'target_language': target_language
        }
        return Response(
            json.dumps(result, ensure_ascii=False),
            mimetype='application/json; charset=utf-8'
        )

    except Exception as e:
        print(f'[LocalTranslate] 翻译错误: {e}')
        import traceback
        traceback.print_exc()
        return Response(
            json.dumps({'success': False, 'error': str(e)}, ensure_ascii=False),
            status=500,
            mimetype='application/json; charset=utf-8'
        )


if __name__ == '__main__':
    success = init_model()
    if not success:
        print('[LocalTranslate] 模型初始化失败，服务将无法正常工作')
        sys.exit(1)

    port = int(os.environ.get('LOCAL_TRANSLATE_PORT', 5001))
    host = os.environ.get('LOCAL_TRANSLATE_HOST', '0.0.0.0')

    print(f'[LocalTranslate] 启动翻译服务，监听 {host}:{port}')
    app.run(host=host, port=port, debug=False, threaded=True)
