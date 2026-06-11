@echo off
echo ================================
echo 安装并启动 ngrok
echo ================================
echo.

REM 检查 ngrok 是否已安装
where ngrok >nul 2>nul
if %ERRORLEVEL%==0 (
    echo ngrok 已安装
    goto :start_ngrok
)

echo ngrok 未安装，正在下载...
cd /d %~dp0
curl -L https://bin.equinox.io/c/bNyj1mQVY4c/ngrok-v3-stable-windows-amd64.zip -o ngrok.zip
if %ERRORLEVEL% neq 0 (
    echo 下载失败，请手动从 https://ngrok.com/download 下载
    pause
    exit /b 1
)

echo 解压 ngrok...
powershell -Command "Expand-Archive -Force ngrok.zip"
if %ERRORLEVEL% neq 0 (
    echo 解压失败
    pause
    exit /b 1
)

del ngrok.zip
echo ngrok 安装完成！

:start_ngrok
echo.
echo ================================
echo 启动 ngrok 隧道
echo ================================
echo.
echo 正在启动前端服务（端口 5173）...
start "ngrok-frontend" ngrok.exe http 5173
echo.
echo 正在启动后端服务（端口 3001）...
start "ngrok-backend" ngrok.exe http 3001
echo.
echo ================================
echo ngrok 已启动！
echo ================================
echo.
echo 请在 ngrok 界面查看生成的公网 URL
echo.
echo 重要提示：
echo 1. 首次使用需要注册 ngrok 账号并配置 authtoken
echo 2. 访问 https://dashboard.ngrok.com/signup 注册
echo 3. 复制 authtoken 并运行：ngrok config add-authtoken YOUR_TOKEN
echo.
echo 然后修改前端代码中的 API 地址为后端 ngrok URL
echo.
pause