@echo off
chcp 65001 >nul

REM 视频翻译服务一键停止脚本

echo =========================================
echo   停止视频翻译服务
echo =========================================
echo.

echo [1/4] 停止本地翻译服务 (端口 5001)...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :5001.*LISTENING') do (
    taskkill /f /pid %%a 2>nul && echo   [OK] 已停止
)
if %errorlevel% neq 0 echo   [SKIP] 未运行

echo [2/4] 停止后端服务 (端口 3001)...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :3001.*LISTENING') do (
    taskkill /f /pid %%a 2>nul && echo   [OK] 已停止
)
if %errorlevel% neq 0 echo   [SKIP] 未运行

echo [3/4] 停止前端服务 (端口 5173)...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :5173.*LISTENING') do (
    taskkill /f /pid %%a 2>nul && echo   [OK] 已停止
)
if %errorlevel% neq 0 echo   [SKIP] 未运行

echo [4/4] 停止 Cloudflare Tunnel...
taskkill /f /im cloudflared.exe 2>nul
echo   [OK] 已停止

echo.
echo =========================================
echo   服务已全部停止！
echo =========================================
echo.
echo 按任意键退出...
pause >nul
