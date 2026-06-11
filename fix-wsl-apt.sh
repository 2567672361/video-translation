#!/bin/bash

# WSL 包管理器修复脚本
# 用于修复 apt 更新错误

set -e

GREEN="\033[0;32m"
YELLOW="\033[1;33m"
RED="\033[0;31m"
NC="\033[0m"

echo -e "${GREEN}=====================================${NC}"
echo -e "${GREEN}WSL 包管理器修复脚本${NC}"
echo -e "${GREEN}=====================================${NC}"
echo ""

# 备份 sources.list
echo -e "${YELLOW}备份当前源配置...${NC}"
sudo cp /etc/apt/sources.list /etc/apt/sources.list.backup.$(date +%Y%m%d_%H%M%S)
echo -e "${GREEN}✓ 备份完成${NC}"
echo ""

# 修复 Docker 仓库问题
echo -e "${YELLOW}检查 Docker 仓库配置...${NC}"
if [ -f /etc/apt/sources.list.d/docker.list ]; then
    echo -e "${YELLOW}发现 Docker 仓库配置，检查是否有效...${NC}"
    if ! curl -sSf https://download.docker.com/linux/ubuntu/dists/focal/Release > /dev/null; then
        echo -e "${YELLOW}Docker 仓库不可用，暂时禁用...${NC}"
        sudo mv /etc/apt/sources.list.d/docker.list /etc/apt/sources.list.d/docker.list.disabled
        echo -e "${GREEN}✓ Docker 仓库已禁用${NC}"
    else
        echo -e "${GREEN}✓ Docker 仓库正常${NC}"
    fi
fi
echo ""

# 修复阿里云镜像源问题
echo -e "${YELLOW}检查阿里云镜像源配置...${NC}"
if grep -q "multivers" /etc/apt/sources.list; then
    echo -e "${YELLOW}发现错误的组件名称 'multivers'，修复为 'multiverse'...${NC}"
    sudo sed -i 's/multivers$/multiverse/g' /etc/apt/sources.list
    sudo sed -i 's/multivers /multiverse /g' /etc/apt/sources.list
    echo -e "${GREEN}✓ 镜像源配置已修复${NC}"
else
    echo -e "${GREEN}✓ 镜像源配置正常${NC}"
fi
echo ""

# 清理 apt 缓存
echo -e "${YELLOW}清理 apt 缓存...${NC}"
sudo apt clean
sudo apt autoclean
sudo rm -rf /var/lib/apt/lists/*
echo -e "${GREEN}✓ 缓存清理完成${NC}"
echo ""

# 更新包管理器
echo -e "${YELLOW}更新包管理器...${NC}"
sudo apt update
echo ""

# 升级已安装的包
echo -e "${YELLOW}升级已安装的包...${NC}"
sudo apt upgrade -y
echo ""

# 安装基本工具
echo -e "${YELLOW}安装基本工具...${NC}"
sudo apt install -y curl wget git build-essential software-properties-common apt-transport-https ca-certificates gnupg lsb-release
echo -e "${GREEN}✓ 基本工具安装完成${NC}"
echo ""

# 重新添加 Docker 仓库（如果需要）
echo -e "${YELLOW}重新配置 Docker 仓库...${NC}"
if [ -f /etc/apt/sources.list.d/docker.list.disabled ]; then
    echo -e "${YELLOW}是否重新启用 Docker 仓库？(y/n): ${NC}"
    read -p "" -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        sudo mv /etc/apt/sources.list.d/docker.list.disabled /etc/apt/sources.list.d/docker.list
        curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/trusted.gpg.d/docker.gpg
        sudo add-apt-repository \
           "deb [arch=amd64] https://download.docker.com/linux/ubuntu \
           $(lsb_release -cs) \
           stable"
        echo -e "${GREEN}✓ Docker 仓库已重新启用${NC}"
    fi
fi
echo ""

echo -e "${GREEN}=====================================${NC}"
echo -e "${GREEN}包管理器修复完成！${NC}"
echo -e "${GREEN}=====================================${NC}"
echo ""
echo -e "${YELLOW}建议执行以下命令继续部署:${NC}"
echo -e "  cd /mnt/c/Users/AAA/Desktop/视频翻译"
echo -e "  chmod +x deploy-wsl.sh"
echo -e "  ./deploy-wsl.sh"
echo ""
