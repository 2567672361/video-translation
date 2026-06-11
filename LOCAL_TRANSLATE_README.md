# 腾讯混元本地翻译服务使用说明

## 功能介绍

本项目集成了腾讯混元 HY-MT1.5-1.8B 本地翻译模型，支持实时语音翻译功能。

**重要：** 视频翻译功能仍使用火山引擎API，不受影响。

## 前置要求

1. **Python 3.8+**
2. **足够的内存**：建议 16GB+ RAM
3. **GPU（可选）**：NVIDIA GPU + CUDA（推荐，可大幅提升速度）

## 安装步骤

### 1. 安装Python依赖

在 `backend/` 目录下运行：

```bash
cd backend
pip install -r requirements_local_translate.txt
```

### 2. 配置环境变量

在 `backend/.env` 文件中添加：

```env
# 启用本地翻译服务
USE_LOCAL_TRANSLATE=true

# 本地翻译服务地址（默认即可）
LOCAL_TRANSLATE_URL=http://127.0.0.1:5001/translate
```

### 3. 启动本地翻译服务

**方式一：使用批处理脚本（Windows）**

```bash
cd backend
start_local_translate.bat
```

**方式二：直接运行Python**

```bash
cd backend
python local_translate.py
```

**首次启动**会自动从 ModelScope 下载模型（约 4GB），请确保网络通畅。

## 使用说明

### 启动服务的正确顺序

1. **先启动本地翻译服务**（端口 5001）
2. **再启动主后端服务**（端口 3001）
3. 启动前端

### 配置文件

在 `backend/.env` 中设置：

- `USE_LOCAL_TRANSLATE=true` - 启用本地翻译
- `USE_LOCAL_TRANSLATE=false` - 使用火山引擎API（默认）

## 文件说明

| 文件 | 说明 |
|------|------|
| `backend/local_translate.py` | 本地翻译服务主程序 |
| `backend/requirements_local_translate.txt` | Python依赖 |
| `backend/start_local_translate.bat` | Windows启动脚本 |
| `backend/voice-translation.js` | 语音翻译模块（已修改） |

## 注意事项

1. **视频翻译不受影响**：只有实时语音翻译使用本地模型，视频翻译仍使用火山引擎API
2. **模型首次下载**：首次启动会下载约4GB的模型文件
3. **性能**：CPU上运行较慢，建议使用GPU
4. **端口占用**：确保5001端口未被占用

## 故障排查

### 问题：模型下载慢
- 可以手动从 ModelScope 下载模型到本地，修改 `local_translate.py` 中的 `model_name_or_path` 为本地路径

### 问题：内存不足
- 关闭其他程序，释放内存
- 或者使用量化版本的模型（Tencent-Hunyuan/HY-MT1.5-1.8B-GPTQ-Int4）

### 问题：翻译服务连接失败
- 检查本地翻译服务是否正常启动
- 检查端口 5001 是否可访问
- 检查 `LOCAL_TRANSLATE_URL` 配置是否正确
