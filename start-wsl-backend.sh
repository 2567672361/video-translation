#!/bin/bash

# 导航到后端目录
cd /mnt/c/Users/AAA/Desktop/视频翻译/backend

# 检查Node.js版本
echo "Node.js version:"
node -v

# 检查npm版本
echo "npm version:"
npm -v

# 检查目录内容
echo "Directory contents:"
ls -la

# 启动后端服务
echo "Starting backend server..."
npm start