#!/bin/bash

# WSL 环境验证脚本

GREEN="\033[0;32m"
YELLOW="\033[1;33m"
RED="\033[0;31m"
NC="\033[0m"

echo -e "${GREEN}=====================================${NC}"
echo -e "${GREEN}WSL 环境验证${NC}"
echo -e "${GREEN}=====================================${NC}"
echo ""

# 检查 WSL 版本
echo -e "${YELLOW}检查 WSL 版本...${NC}"
if grep -qi microsoft /proc/version; then
    echo -e "${GREEN}✓ 运行在 WSL 环境中${NC}"
    uname -r | grep -qi "microsoft" && echo -e "${GREEN}  WSL 版本：$(uname -r)${NC}"
else
    echo -e "${YELLOW}⚠ 未在 WSL 环境中${NC}"
fi
echo ""

# 检查 apt 是否正常
echo -e "${YELLOW}检查 apt 包管理器...${NC}"
if sudo apt update > /dev/null 2>&1; then
    echo -e "${GREEN}✓ apt 包管理器正常${NC}"
else
    echo -e "${RED}✗ apt 包管理器有问题${NC}"
fi
echo ""

# 检查 Node.js
echo -e "${YELLOW}检查 Node.js...${NC}"
if command -v node &> /dev/null; then
    echo -e "${GREEN}✓ Node.js 已安装：$(node -v)${NC}"
    echo -e "${GREEN}  NPM 版本：$(npm -v)${NC}"
else
    echo -e "${YELLOW}⚠ Node.js 未安装${NC}"
fi
echo ""

# 检查 FFmpeg
echo -e "${YELLOW}检查 FFmpeg...${NC}"
if command -v ffmpeg &> /dev/null; then
    echo -e "${GREEN}✓ FFmpeg 已安装${NC}"
    ffmpeg -version | head -n 1
else
    echo -e "${YELLOW}⚠ FFmpeg 未安装${NC}"
fi
echo ""

# 检查 Git
echo -e "${YELLOW}检查 Git...${NC}"
if command -v git &> /dev/null; then
    echo -e "${GREEN}✓ Git 已安装：$(git --version)${NC}"
else
    echo -e "${YELLOW}⚠ Git 未安装${NC}"
fi
echo ""

# 检查 PM2
echo -e "${YELLOW}检查 PM2...${NC}"
if command -v pm2 &> /dev/null; then
    echo -e "${GREEN}✓ PM2 已安装：$(pm2 -v)${NC}"
    echo -e "${GREEN}  服务状态:${NC}"
    pm2 status
else
    echo -e "${YELLOW}⚠ PM2 未安装${NC}"
fi
echo ""

# 检查磁盘空间
echo -e "${YELLOW}检查磁盘空间...${NC}"
df -h / | tail -n 1
echo ""

# 检查项目目录
echo -e "${YELLOW}检查项目目录...${NC}"
if [ -d "/mnt/c/Users/AAA/Desktop/视频翻译" ]; then
    echo -e "${GREEN}✓ 项目目录存在${NC}"
    echo -e "${GREEN}  位置：/mnt/c/Users/AAA/Desktop/视频翻译${NC}"
else
    echo -e "${YELLOW}⚠ 项目目录不存在${NC}"
fi
echo ""

echo -e "${GREEN}=====================================${NC}"
echo -e "${GREEN}验证完成！${NC}"
echo -e "${GREEN}=====================================${NC}"
echo ""

# 提供建议
echo -e "${YELLOW}下一步建议:${NC}"
if ! command -v node &> /dev/null || ! command -v ffmpeg &> /dev/null; then
    echo -e "1. 运行部署脚本安装依赖：${GREEN}./deploy-wsl.sh${NC}"
else
    echo -e "1. 检查服务状态：${GREEN}pm2 status${NC}"
    echo -e "2. 查看服务日志：${GREEN}pm2 logs${NC}"
    echo -e "3. 重启服务：${GREEN}pm2 restart all${NC}"
fi
echo ""
