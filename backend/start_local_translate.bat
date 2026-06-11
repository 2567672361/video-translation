@echo off
chcp 65001 >nul
echo ========================================
echo   腾讯混元本地翻译服务启动脚本
echo   如需在WSL中运行，请使用 start_local_translate_wsl.sh
echo ========================================
echo.

cd /d "%~dp0"

REM 检查Python是否安装
python --version >nul 2>&1
if errorlevel 1 (
    echo [错误] 未找到Python，请先安装Python 3.8+
    pause
    exit /b 1
)

echo [信息] 检查Python依赖...
python -c "import flask, transformers, torch" >nul 2>&1
if errorlevel 1 (
    echo [信息] 正在安装依赖...
    pip install -r requirements_local_translate.txt
    if errorlevel 1 (
        echo [错误] 依赖安装失败
        pause
        exit /b 1
    )
)

echo.
echo [信息] 启动本地翻译服务...
echo [信息] 服务地址: http://127.0.0.1:5001
echo [信息] 首次启动会自动下载模型（约4GB），请耐心等待...
echo.

set LOCAL_TRANSLATE_PORT=5001
set LOCAL_TRANSLATE_HOST=127.0.0.1
set PYTHONIOENCODING=utf-8

python local_translate.py

pause
