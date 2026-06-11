@echo off

:: 视频翻译网站一键部署脚本（Windows Server）
:: 支持 Windows Server 2016+ / Windows 10+ 64位
:: 作者：Trae AI

:: 颜色定义
for /F "tokens=1,2 delims=#" %%a in ('"prompt #$H#$E# & echo on & for %%b in (1) do rem"') do set "DEL=%%a"

set "GREEN=%DEL%[92m"
set "YELLOW=%DEL%[93m"
set "RED=%DEL%[91m"
set "NC=%DEL%[0m"

:: 版本信息
set "VERSION=1.0.0"

:: 默认配置
set "DEFAULT_APP_DIR=C:\video-translation"
set "DEFAULT_NODE_VERSION=18"
set "DEFAULT_FRONTEND_PORT=5173"
set "DEFAULT_BACKEND_PORT=3001"

:: 显示欢迎信息
echo %GREEN%=====================================%NC%
echo %GREEN%视频翻译网站一键部署脚本 v%VERSION%%NC%
echo %GREEN%=====================================%NC%
echo.
echo %YELLOW%支持系统: Windows Server 2016+, Windows 10+ 64位%NC%
echo %YELLOW%部署类型: 前端 + 后端 + FFmpeg%NC%
echo.

:: 检查管理员权限
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo %RED%错误：需要管理员权限运行此脚本！%NC%
    echo 请右键点击脚本，选择"以管理员身份运行"
    pause
    exit /b 1
)

:: 检查 Windows 版本
ver

:: 检查系统类型
wmic os get osarchitecture

:: 安装依赖函数
:install_deps
echo %YELLOW%安装系统依赖...%NC%
echo.

:: 检查并安装 Chocolatey
where choco >nul 2>&1
if %errorLevel% neq 0 (
    echo %YELLOW%安装 Chocolatey 包管理器...%NC%
    @"%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -InputFormat None -ExecutionPolicy Bypass -Command "[System.Net.ServicePointManager]::SecurityProtocol = 3072; iex ((New-Object System.Net.WebClient).DownloadString('https://chocolatey.org/install.ps1'))"
    set "PATH=%PATH%;%ALLUSERSPROFILE%\chocolatey\bin"
)

:: 安装 Git
echo %YELLOW%安装 Git...%NC%
choco install git -y

:: 安装 FFmpeg
echo %YELLOW%安装 FFmpeg...%NC%
choco install ffmpeg -y

:: 安装 Node.js
echo %YELLOW%安装 Node.js v%DEFAULT_NODE_VERSION%...%NC%
choco install nodejs --version=%DEFAULT_NODE_VERSION% -y

:: 验证安装
echo %YELLOW%验证安装...%NC%
echo.
git --version
echo.
ffmpeg -version
echo.
node -v
echo.
npm -v
echo.
echo %GREEN%依赖安装完成%NC%
goto :create_directory

:: 创建目录
:create_directory
echo %YELLOW%创建项目目录...%NC%
if not exist "%DEFAULT_APP_DIR%" (
    mkdir "%DEFAULT_APP_DIR%"
    echo %GREEN%创建目录成功: %DEFAULT_APP_DIR%%NC%
) else (
    echo %YELLOW%目录已存在: %DEFAULT_APP_DIR%%NC%
)
echo.
goto :clone_code

:: 克隆代码
:clone_code
echo %YELLOW%准备代码...%NC%
echo %YELLOW%请将代码复制到 %DEFAULT_APP_DIR% 目录%NC%
echo.
echo %YELLOW%例如：%NC%
echo %YELLOW%1. 克隆 Git 仓库: git clone https://your-repo-url.git %DEFAULT_APP_DIR%%NC%
echo %YELLOW%2. 或复制本地代码到 %DEFAULT_APP_DIR%%NC%
echo.
set /p "input=代码已准备完成？(y/n): "
if /i "%input%" neq "y" (
    echo %RED%代码准备未完成，退出部署%NC%
    pause
    exit /b 1
)
echo %GREEN%代码准备完成%NC%
echo.
goto :install_project_deps

:: 安装项目依赖
:install_project_deps
echo %YELLOW%安装项目依赖...%NC%
echo.

:: 安装前端依赖
cd /d "%DEFAULT_APP_DIR%"
echo %YELLOW%安装前端依赖...%NC%
npm install
echo.

:: 安装后端依赖
cd /d "%DEFAULT_APP_DIR%\backend"
echo %YELLOW%安装后端依赖...%NC%
npm install
echo.
echo %GREEN%项目依赖安装完成%NC%
echo.
goto :configure_env

:: 配置环境变量
:configure_env
echo %YELLOW%配置环境变量...%NC%
echo.

:: 获取公网 IP
for /f "tokens=2 delims=: " %%a in ('nslookup myip.opendns.com. resolver1.opendns.com 2^>^&1 ^| findstr /C:"Address"') do set "PUBLIC_IP=%%a"

:: 前端环境变量
cd /d "%DEFAULT_APP_DIR%"
echo %YELLOW%创建前端 .env 文件...%NC%
echo # 前端环境变量 > .env
echo VITE_API_URL=http://%PUBLIC_IP%:%DEFAULT_BACKEND_PORT% >> .env
echo.

:: 后端环境变量
cd /d "%DEFAULT_APP_DIR%\backend"
echo %YELLOW%创建后端 .env 文件...%NC%
echo # 火山引擎API配置 > .env
echo VOLC_API_KEY=your_volc_api_key >> .env
echo VOLC_APP_ID=your_app_id >> .env
echo VOLC_ACCESS_TOKEN=your_access_token >> .env
echo. >> .env
echo # 豆包API配置 >> .env
echo DOUBAO_API_KEY=your_doubao_api_key >> .env
echo DOUBAO_MODEL=doubao-seed-2-0-pro-260215 >> .env
echo. >> .env
echo # 服务器配置 >> .env
echo PORT=%DEFAULT_BACKEND_PORT% >> .env
echo NODE_ENV=production >> .env
echo.

echo %YELLOW%请编辑环境变量文件配置 API 密钥%NC%
echo %YELLOW%前端: %DEFAULT_APP_DIR%\.env%NC%
echo %YELLOW%后端: %DEFAULT_APP_DIR%\backend\.env%NC%
echo.
set /p "input=环境变量已配置完成？(y/n): "
if /i "%input%" neq "y" (
    echo %RED%环境变量配置未完成，退出部署%NC%
    pause
    exit /b 1
)
echo %GREEN%环境变量配置完成%NC%
echo.
goto :build_frontend

:: 构建前端
:build_frontend
echo %YELLOW%构建前端项目...%NC%
echo.
cd /d "%DEFAULT_APP_DIR%"
npm run build
echo.
echo %GREEN%前端构建完成%NC%
echo.
goto :install_pm2

:: 安装 PM2
:install_pm2
echo %YELLOW%安装 PM2 进程管理器...%NC%
echo.
npm install -g pm2
echo.
call pm2 -v
echo.
echo %GREEN%PM2 安装完成%NC%
echo.
goto :start_services

:: 启动服务
:start_services
echo %YELLOW%启动服务...%NC%
echo.

:: 启动后端服务
cd /d "%DEFAULT_APP_DIR%\backend"
echo %YELLOW%启动后端服务...%NC%
call pm2 start server.js --name video-translation-backend
echo.

:: 安装 serve 并启动前端
npm install -g serve
cd /d "%DEFAULT_APP_DIR%"
echo %YELLOW%启动前端服务...%NC%
call pm2 start "serve -s dist -l %DEFAULT_FRONTEND_PORT%" --name video-translation-frontend
echo.

:: 保存 PM2 配置
call pm2 save

:: 设置 PM2 开机自启
call pm2 startup

:: 查看服务状态
echo %YELLOW%服务状态:%NC%
echo.
call pm2 list
echo.
echo %GREEN%服务启动完成%NC%
echo.
goto :configure_firewall

:: 配置防火墙
:configure_firewall
echo %YELLOW%配置防火墙...%NC%
echo.

:: 允许前端端口
netsh advfirewall firewall add rule name="视频翻译前端" dir=in action=allow protocol=TCP localport=%DEFAULT_FRONTEND_PORT%

:: 允许后端端口
netsh advfirewall firewall add rule name="视频翻译后端" dir=in action=allow protocol=TCP localport=%DEFAULT_BACKEND_PORT%

:: 允许 HTTP/HTTPS 端口
netsh advfirewall firewall add rule name="HTTP" dir=in action=allow protocol=TCP localport=80
netsh advfirewall firewall add rule name="HTTPS" dir=in action=allow protocol=TCP localport=443

echo %GREEN%防火墙配置完成%NC%
echo.
goto :show_completion

:: 显示部署完成信息
:show_completion
echo %GREEN%=====================================%NC%
echo %GREEN%部署完成！%NC%
echo %GREEN%=====================================%NC%
echo.
echo %YELLOW%服务访问地址:%NC%
echo 前端: http://%PUBLIC_IP%:%DEFAULT_FRONTEND_PORT%
echo 后端: http://%PUBLIC_IP%:%DEFAULT_BACKEND_PORT%
echo API:  http://%PUBLIC_IP%:%DEFAULT_BACKEND_PORT%/api/translate-video
echo.
echo %YELLOW%管理命令:%NC%
echo 查看服务状态: pm2 status
echo 查看日志: pm2 logs
echo 重启服务: pm2 restart video-translation-backend video-translation-frontend
echo 停止服务: pm2 stop video-translation-backend video-translation-frontend
echo.
echo %YELLOW%注意事项:%NC%
echo 1. 请确保环境变量中的 API 密钥已正确配置
echo 2. 首次访问可能需要几分钟时间初始化
echo 3. 视频处理需要足够的服务器资源
echo.
echo %GREEN%🎉 部署成功！%NC%
echo.
pause
goto :eof