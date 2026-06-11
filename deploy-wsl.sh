#!/bin/bash

# WSL 一键部署脚本 + 内网穿透
# 支持 Ubuntu/Debian on WSL
# 作者：Trae AI

set -e

# 颜色定义
GREEN="\033[0;32m"
YELLOW="\033[1;33m"
RED="\033[0;31m"
NC="\033[0m"

# 版本信息
VERSION="1.0.0"

# 默认配置
APP_DIR="$HOME/video-translation"
NODE_VERSION="18"
FRONTEND_PORT="5173"
BACKEND_PORT="3001"
NGROK_AUTHTOKEN=""

# 显示欢迎信息
show_welcome() {
    echo -e "${GREEN}=====================================${NC}"
    echo -e "${GREEN}WSL 一键部署脚本 v${VERSION}${NC}"
    echo -e "${GREEN}=====================================${NC}"
    echo -e ""
    echo -e "${YELLOW}检测到 WSL 环境${NC}"
    echo -e "${YELLOW}部署类型：前端 + 后端 + FFmpeg + 内网穿透${NC}"
    echo -e ""
}

# 检查 WSL 环境
check_wsl() {
    if grep -qi microsoft /proc/version || grep -qi wsl /proc/version; then
        echo -e "${GREEN}✓ 确认在 WSL 环境中运行${NC}"
    else
        echo -e "${YELLOW}⚠ 未在 WSL 环境中检测到，但将继续部署${NC}"
    fi
}

# 安装系统依赖
install_deps() {
    echo -e "${YELLOW}安装系统依赖...${NC}"
    
    sudo apt update
    sudo apt install -y curl wget git build-essential ffmpeg
    
    echo -e "${GREEN}✓ 系统依赖安装完成${NC}"
}

# 安装 Node.js
install_nodejs() {
    echo -e "${YELLOW}安装 Node.js v${NODE_VERSION}...${NC}"
    
    # 使用 nvm 安装
    curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
    export NVM_DIR="$HOME/.nvm"
    [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
    
    nvm install $NODE_VERSION
    nvm use $NODE_VERSION
    
    echo -e "${GREEN}✓ Node.js 安装完成${NC}"
    echo -e "${GREEN}  Node version: $(node -v)${NC}"
    echo -e "${GREEN}  NPM version: $(npm -v)${NC}"
}

# 克隆代码
clone_code() {
    echo -e "${YELLOW}准备代码...${NC}"
    
    # 创建目录
    mkdir -p $APP_DIR
    
    # 检查是否存在代码
    if [ -d "$APP_DIR/.git" ]; then
        echo -e "${YELLOW}代码已存在，更新代码...${NC}"
        cd $APP_DIR
        git pull
    else
        echo -e "${YELLOW}从 Windows 目录复制代码...${NC}"
        # 尝试从 Windows 目录复制
        if [ -d "/mnt/c/Users/AAA/Desktop/视频翻译" ]; then
            echo -e "${GREEN}  找到 Windows 目录代码，创建软链接...${NC}"
            ln -s /mnt/c/Users/AAA/Desktop/视频翻译 $APP_DIR/source
            cd $APP_DIR/source
        else
            echo -e "${YELLOW}请将代码放置到 $APP_DIR 目录${NC}"
            read -p "代码已准备完成？(y/n): " -n 1 -r
            echo
            if [[ ! $REPLY =~ ^[Yy]$ ]]; then
                echo -e "${RED}代码准备未完成，退出部署${NC}"
                exit 1
            fi
        fi
    fi
    
    echo -e "${GREEN}✓ 代码准备完成${NC}"
}

# 安装项目依赖
install_project_deps() {
    echo -e "${YELLOW}安装项目依赖...${NC}"
    
    # 安装前端依赖
    cd $APP_DIR/source
    npm install
    
    # 安装后端依赖
    cd $APP_DIR/source/backend
    npm install
    
    echo -e "${GREEN}✓ 项目依赖安装完成${NC}"
}

# 配置环境变量
configure_env() {
    echo -e "${YELLOW}配置环境变量...${NC}"
    
    # 前端环境变量
    cd $APP_DIR/source
    cat > .env << EOF
# 前端环境变量
VITE_API_URL=http://localhost:${BACKEND_PORT}
EOF
    
    # 后端环境变量
    cd $APP_DIR/source/backend
    cat > .env << EOF
# 火山引擎 API 配置
VOLC_API_KEY=your_volc_api_key
VOLC_APP_ID=your_app_id
VOLC_ACCESS_TOKEN=your_access_token

# 豆包 API 配置
DOUBAO_API_KEY=your_doubao_api_key
DOUBAO_MODEL=doubao-seed-2-0-pro-260215

# 服务器配置
PORT=${BACKEND_PORT}
NODE_ENV=development
EOF
    
    echo -e "${YELLOW}请编辑环境变量文件配置 API 密钥${NC}"
    echo -e "${YELLOW}前端：$APP_DIR/source/.env${NC}"
    echo -e "${YELLOW}后端：$APP_DIR/source/backend/.env${NC}"
    
    read -p "环境变量已配置完成？(y/n): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo -e "${RED}环境变量配置未完成，退出部署${NC}"
        exit 1
    fi
    
    echo -e "${GREEN}✓ 环境变量配置完成${NC}"
}

# 构建前端
build_frontend() {
    echo -e "${YELLOW}构建前端项目...${NC}"
    
    cd $APP_DIR/source
    npm run build
    
    echo -e "${GREEN}✓ 前端构建完成${NC}"
}

# 安装 PM2
install_pm2() {
    echo -e "${YELLOW}安装 PM2 进程管理器...${NC}"
    
    npm install -g pm2
    
    echo -e "${GREEN}✓ PM2 安装完成${NC}"
}

# 启动服务
start_services() {
    echo -e "${YELLOW}启动服务...${NC}"
    
    # 启动后端服务
    cd $APP_DIR/source/backend
    pm2 start server.js --name video-translation-backend
    
    # 安装 serve 并启动前端
    npm install -g serve
    cd $APP_DIR/source
    pm2 start "serve -s dist -l ${FRONTEND_PORT}" --name video-translation-frontend
    
    # 保存 PM2 配置
    pm2 save
    
    echo -e "${GREEN}✓ 服务启动完成${NC}"
    echo -e "${GREEN}服务列表:${NC}"
    pm2 list
}

# 安装 ngrok
install_ngrok() {
    echo -e "${YELLOW}安装 ngrok...${NC}"
    
    # 下载 ngrok
    cd /tmp
    wget -q https://bin.equinox.io/c/bNyj1mQVY4c/ngrok-v3-stable-linux-amd64.tgz
    tar xzf ngrok-v3-stable-linux-amd64.tgz
    sudo mv ngrok /usr/local/bin/
    
    # 配置 authtoken
    if [ -n "$NGROK_AUTHTOKEN" ]; then
        ngrok config add-authtoken $NGROK_AUTHTOKEN
        echo -e "${GREEN}✓ ngrok authtoken 配置完成${NC}"
    else
        echo -e "${YELLOW}请输入 ngrok authtoken（留空跳过，稍后手动配置）:${NC}"
        read -p "Authtoken: " -s NGROK_AUTHTOKEN_INPUT
        echo
        if [ -n "$NGROK_AUTHTOKEN_INPUT" ]; then
            ngrok config add-authtoken $NGROK_AUTHTOKEN_INPUT
            echo -e "${GREEN}✓ ngrok authtoken 配置完成${NC}"
        else
            echo -e "${YELLOW}稍后请手动运行：ngrok config add-authtoken YOUR_TOKEN${NC}"
        fi
    fi
    
    echo -e "${GREEN}✓ ngrok 安装完成${NC}"
}

# 启动 ngrok 隧道
start_ngrok() {
    echo -e "${YELLOW}启动 ngrok 隧道...${NC}"
    
    echo -e "${YELLOW}正在启动前端隧道（端口 ${FRONTEND_PORT}）...${NC}"
    # 在后台启动前端 ngrok
    nohup ngrok http ${FRONTEND_PORT} > /tmp/ngrok_frontend.log 2>&1 &
    sleep 2
    
    echo -e "${YELLOW}正在启动后端隧道（端口 ${BACKEND_PORT}）...${NC}"
    # 在后台启动后端 ngrok
    nohup ngrok http ${BACKEND_PORT} > /tmp/ngrok_backend.log 2>&1 &
    sleep 2
    
    # 显示 ngrok URL
    echo -e "${GREEN}ngrok 隧道已启动！${NC}"
    echo -e "${YELLOW}请查看以下日志获取公网 URL:${NC}"
    echo -e "${GREEN}前端：${NC}"
    tail -n 20 /tmp/ngrok_frontend.log | grep -o "https://[a-zA-Z0-9.-]*.ngrok-free.app" || echo "未找到 URL，请检查日志"
    echo -e "${GREEN}后端：${NC}"
    tail -n 20 /tmp/ngrok_backend.log | grep -o "https://[a-zA-Z0-9.-]*.ngrok-free.app" || echo "未找到 URL，请检查日志"
    
    echo -e ""
    echo -e "${YELLOW}提示：${NC}"
    echo -e "1. 请复制后端 ngrok URL"
    echo -e "2. 修改 .env 文件中的 VITE_API_URL"
    echo -e "3. 重新构建前端：npm run build"
    echo -e "4. 重启前端服务：pm2 restart video-translation-frontend"
}

# 显示完成信息
show_completion() {
    echo -e "${GREEN}=====================================${NC}"
    echo -e "${GREEN}WSL 部署完成！${NC}"
    echo -e "${GREEN}=====================================${NC}"
    echo -e ""
    echo -e "${YELLOW}本地访问地址:${NC}"
    echo -e "前端：http://localhost:${FRONTEND_PORT}"
    echo -e "后端：http://localhost:${BACKEND_PORT}"
    echo -e ""
    echo -e "${YELLOW}公网访问（ngrok）:${NC}"
    echo -e "请查看上述 ngrok URL"
    echo -e ""
    echo -e "${YELLOW}管理命令:${NC}"
    echo -e "查看服务状态：pm2 status"
    echo -e "查看日志：pm2 logs"
    echo -e "重启服务：pm2 restart video-translation-backend video-translation-frontend"
    echo -e "查看 ngrok 状态：ps aux | grep ngrok"
    echo -e ""
    echo -e "${YELLOW}注意事项:${NC}"
    echo -e "1. 请确保 API 密钥已正确配置"
    echo -e "2. ngrok 免费版 URL 每次重启会变化"
    echo -e "3. 视频处理需要足够的 CPU 和内存"
    echo -e "4. 保持电脑开机以维持公网访问"
    echo -e ""
    echo -e "${GREEN}🎉 部署成功！${NC}"
}

# 主函数
main() {
    show_welcome
    check_wsl
    install_deps
    install_nodejs
    clone_code
    install_project_deps
    configure_env
    build_frontend
    install_pm2
    start_services
    install_ngrok
    start_ngrok
    show_completion
}

# 运行主函数
main