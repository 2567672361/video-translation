// vite.config.js
export default {
  server: {
    allowedHosts: true // 允许所有主机访问
  }
}#!/bin/bash

# 视频翻译网站一键部署脚本（Linux/Ubuntu/CentOS）
# 支持 Ubuntu 20.04+ / CentOS 7+
# 作者：Trae AI

set -e

# 颜色定义
GREEN="\033[0;32m"
YELLOW="\033[1;33m"
RED="\033[0;31m"
NC="\033[0m" # No Color

# 版本信息
VERSION="1.0.0"

# 默认配置
DEFAULT_APP_DIR="/opt/video-translation"
DEFAULT_NODE_VERSION="18"
DEFAULT_FRONTEND_PORT="5173"
DEFAULT_BACKEND_PORT="3001"

# 显示欢迎信息
show_welcome() {
    echo -e "${GREEN}=====================================${NC}"
    echo -e "${GREEN}视频翻译网站一键部署脚本 v${VERSION}${NC}"
    echo -e "${GREEN}=====================================${NC}"
    echo -e ""
    echo -e "${YELLOW}支持系统: Ubuntu 20.04+, CentOS 7+${NC}"
    echo -e "${YELLOW}部署类型: 前端 + 后端 + FFmpeg${NC}"
    echo -e ""
}

# 检查系统类型
detect_os() {
    if [ -f /etc/os-release ]; then
        . /etc/os-release
        OS=$NAME
        VER=$VERSION_ID
    elif type lsb_release >/dev/null 2>&1; then
        OS=$(lsb_release -si)
        VER=$(lsb_release -sr)
    elif [ -f /etc/lsb-release ]; then
        . /etc/lsb-release
        OS=$DISTRIB_ID
        VER=$DISTRIB_RELEASE
    elif [ -f /etc/debian_version ]; then
        OS=Debian
        VER=$(cat /etc/debian_version)
    elif [ -f /etc/redhat-release ]; then
        OS=$(cat /etc/redhat-release | cut -d' ' -f1)
        VER=$(cat /etc/redhat-release | cut -d' ' -f3)
    else
        OS=$(uname -s)
        VER=$(uname -r)
    fi
    
    echo -e "${GREEN}检测到系统: ${OS} ${VER}${NC}"
}

# 安装系统依赖
install_system_deps() {
    echo -e "${YELLOW}安装系统依赖...${NC}"
    
    if [[ "$OS" == *"Ubuntu"* || "$OS" == *"Debian"* ]]; then
        sudo apt update && sudo apt install -y curl wget git build-essential ffmpeg
    elif [[ "$OS" == *"CentOS"* || "$OS" == *"Red Hat"* ]]; then
        sudo yum update && sudo yum install -y curl wget git gcc gcc-c++ make epel-release
        sudo yum install -y ffmpeg
    else
        echo -e "${RED}不支持的操作系统: $OS${NC}"
        exit 1
    fi
    
    echo -e "${GREEN}系统依赖安装完成${NC}"
}

# 安装 Node.js
install_nodejs() {
    echo -e "${YELLOW}安装 Node.js v${DEFAULT_NODE_VERSION}...${NC}"
    
    # 使用 nvm 安装
    curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
    export NVM_DIR="$HOME/.nvm"
    [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
    [ -s "$NVM_DIR/bash_completion" ] && \. "$NVM_DIR/bash_completion"
    
    nvm install $DEFAULT_NODE_VERSION
    nvm use $DEFAULT_NODE_VERSION
    
    # 验证安装
    node -v
    npm -v
    
    echo -e "${GREEN}Node.js 安装完成${NC}"
}

# 克隆代码
clone_code() {
    echo -e "${YELLOW}克隆代码到 ${DEFAULT_APP_DIR}...${NC}"
    
    # 创建目录
    sudo mkdir -p $DEFAULT_APP_DIR
    sudo chown $USER:$USER $DEFAULT_APP_DIR
    
    # 检查是否存在代码
    if [ -d "$DEFAULT_APP_DIR/.git" ]; then
        echo -e "${YELLOW}代码已存在，更新代码...${NC}"
        cd $DEFAULT_APP_DIR
        git pull
    else
        echo -e "${YELLOW}克隆新代码...${NC}"
        # 这里可以替换为你的代码仓库
        # git clone https://your-repo-url.git $DEFAULT_APP_DIR
        # 或者复制本地代码
        echo -e "${YELLOW}请将代码复制到 ${DEFAULT_APP_DIR} 目录${NC}"
        read -p "代码已复制完成？(y/n): " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            echo -e "${RED}代码复制未完成，退出部署${NC}"
            exit 1
        fi
    fi
    
    echo -e "${GREEN}代码准备完成${NC}"
}

# 安装项目依赖
install_deps() {
    echo -e "${YELLOW}安装项目依赖...${NC}"
    
    # 安装前端依赖
    cd $DEFAULT_APP_DIR
    npm install
    
    # 安装后端依赖
    cd $DEFAULT_APP_DIR/backend
    npm install
    
    echo -e "${GREEN}项目依赖安装完成${NC}"
}

# 配置环境变量
configure_env() {
    echo -e "${YELLOW}配置环境变量...${NC}"
    
    # 前端环境变量
    cd $DEFAULT_APP_DIR
    cat > .env << EOF
# 前端环境变量
VITE_API_URL=http://$(curl -s ifconfig.me):${DEFAULT_BACKEND_PORT}
EOF
    
    # 后端环境变量
    cd $DEFAULT_APP_DIR/backend
    cat > .env << EOF
# 火山引擎API配置
VOLC_API_KEY=your_volc_api_key
VOLC_APP_ID=your_app_id
VOLC_ACCESS_TOKEN=your_access_token

# 豆包API配置
DOUBAO_API_KEY=your_doubao_api_key
DOUBAO_MODEL=doubao-seed-2-0-pro-260215

# 服务器配置
PORT=${DEFAULT_BACKEND_PORT}
NODE_ENV=production
EOF
    
    echo -e "${YELLOW}请编辑环境变量文件配置 API 密钥${NC}"
    echo -e "${YELLOW}前端: ${DEFAULT_APP_DIR}/.env${NC}"
    echo -e "${YELLOW}后端: ${DEFAULT_APP_DIR}/backend/.env${NC}"
    
    read -p "环境变量已配置完成？(y/n): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo -e "${RED}环境变量配置未完成，退出部署${NC}"
        exit 1
    fi
    
    echo -e "${GREEN}环境变量配置完成${NC}"
}

# 构建前端
build_frontend() {
    echo -e "${YELLOW}构建前端项目...${NC}"
    
    cd $DEFAULT_APP_DIR
    npm run build
    
    echo -e "${GREEN}前端构建完成${NC}"
}

# 安装 PM2
install_pm2() {
    echo -e "${YELLOW}安装 PM2 进程管理器...${NC}"
    
    npm install -g pm2
    pm2 -v
    
    echo -e "${GREEN}PM2 安装完成${NC}"
}

# 启动服务
start_services() {
    echo -e "${YELLOW}启动服务...${NC}"
    
    # 启动后端服务
    cd $DEFAULT_APP_DIR/backend
    pm2 start server.js --name video-translation-backend
    
    # 安装 serve 并启动前端
    npm install -g serve
    cd $DEFAULT_APP_DIR
    pm2 start "serve -s dist -l ${DEFAULT_FRONTEND_PORT}" --name video-translation-frontend
    
    # 保存 PM2 配置
    pm2 save
    
    # 设置 PM2 开机自启
    pm2 startup
    
    echo -e "${GREEN}服务启动完成${NC}"
    echo -e "${GREEN}服务列表:${NC}"
    pm2 list
}

# 配置防火墙
configure_firewall() {
    echo -e "${YELLOW}配置防火墙...${NC}"
    
    if [[ "$OS" == *"Ubuntu"* || "$OS" == *"Debian"* ]]; then
        # Ubuntu/Debian (ufw)
        if command -v ufw &> /dev/null; then
            sudo ufw allow ${DEFAULT_FRONTEND_PORT}
            sudo ufw allow ${DEFAULT_BACKEND_PORT}
            sudo ufw allow 80
            sudo ufw allow 443
            sudo ufw reload
        else
            echo -e "${YELLOW}ufw 未安装，跳过防火墙配置${NC}"
        fi
    elif [[ "$OS" == *"CentOS"* || "$OS" == *"Red Hat"* ]]; then
        # CentOS/RHEL (firewalld)
        if command -v firewall-cmd &> /dev/null; then
            sudo firewall-cmd --permanent --add-port=${DEFAULT_FRONTEND_PORT}/tcp
            sudo firewall-cmd --permanent --add-port=${DEFAULT_BACKEND_PORT}/tcp
            sudo firewall-cmd --permanent --add-port=80/tcp
            sudo firewall-cmd --permanent --add-port=443/tcp
            sudo firewall-cmd --reload
        else
            echo -e "${YELLOW}firewalld 未安装，跳过防火墙配置${NC}"
        fi
    fi
    
    echo -e "${GREEN}防火墙配置完成${NC}"
}

# 显示部署完成信息
show_completion() {
    echo -e "${GREEN}=====================================${NC}"
    echo -e "${GREEN}部署完成！${NC}"
    echo -e "${GREEN}=====================================${NC}"
    echo -e ""
    echo -e "${YELLOW}服务访问地址:${NC}"
    echo -e "前端: http://$(curl -s ifconfig.me):${DEFAULT_FRONTEND_PORT}"
    echo -e "后端: http://$(curl -s ifconfig.me):${DEFAULT_BACKEND_PORT}"
    echo -e "API:  http://$(curl -s ifconfig.me):${DEFAULT_BACKEND_PORT}/api/translate-video"
    echo -e ""
    echo -e "${YELLOW}管理命令:${NC}"
    echo -e "查看服务状态: pm2 status"
    echo -e "查看日志: pm2 logs"
    echo -e "重启服务: pm2 restart video-translation-backend video-translation-frontend"
    echo -e "停止服务: pm2 stop video-translation-backend video-translation-frontend"
    echo -e ""
    echo -e "${YELLOW}注意事项:${NC}"
    echo -e "1. 请确保环境变量中的 API 密钥已正确配置"
    echo -e "2. 首次访问可能需要几分钟时间初始化"
    echo -e "3. 视频处理需要足够的服务器资源"
    echo -e ""
    echo -e "${GREEN}🎉 部署成功！${NC}"
}

# 主函数
main() {
    show_welcome
    detect_os
    install_system_deps
    install_nodejs
    clone_code
    install_deps
    configure_env
    build_frontend
    install_pm2
    start_services
    configure_firewall
    show_completion
}

# 运行主函数
main