@echo off

REM 视频翻译服务一键启动脚本
REM 启动顺序：后端服务 -> 前端服务 -> Cloudflare Tunnel

echo 正在启动视频翻译服务...
echo ===============================

REM 启动后端服务
echo 1. 启动后端服务...
echo 请在新打开的窗口中查看后端服务状态
start "Backend Server" cmd /c "wsl npm start --prefix backend"

REM 等待后端服务启动
echo 等待后端服务启动中...
timeout /t 10 /nobreak > nul

REM 启动前端服务
echo 2. 启动前端服务...
echo 请在新打开的窗口中查看前端服务状态
start "Frontend Server" cmd /c "wsl npm run dev --prefix ."

REM 等待前端服务启动
echo 等待前端服务启动中...
timeout /t 10 /nobreak > nul

REM 启动Cloudflare Tunnel
echo 3. 启动Cloudflare Tunnel...
echo 请在新打开的窗口中查看Cloudflare Tunnel状态
start "Cloudflare Tunnel" cmd /c "wsl cloudflared tunnel --config cloudflared-config.yml run video-translation"

REM 等待Cloudflare Tunnel启动
echo 等待Cloudflare Tunnel启动中...
timeout /t 10 /nobreak > nul

echo ===============================
echo 视频翻译服务启动完成！
echo 前端服务: http://localhost:5173
echo 后端服务: http://localhost:3001
echo 公网访问: https://spfy.spfy03.icu
echo ===============================
echo 所有服务已在新窗口中启动，您可以在各自的窗口中查看服务状态。
echo 按任意键退出...
pause > nul