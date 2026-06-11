# WSL 本地部署 + 公网访问指南

## 📋 方案概述

使用 WSL 部署视频翻译网站，然后通过内网穿透工具实现公网访问。

### 优势
- ✅ 无需购买云服务器
- ✅ 本地开发调试方便
- ✅ 充分利用本地资源
- ✅ 成本最低

### 劣势
- ⚠️ 依赖本地网络稳定性
- ⚠️ 需要保持电脑开机
- ⚠️ 公网访问速度受限于上行带宽

## 🚀 快速部署步骤

### 方案一：WSL + ngrok（推荐）

#### 1. 在 WSL 中部署应用

**步骤 1：进入 WSL**
```bash
# 打开 PowerShell 或 CMD
wsl
```

**步骤 2：安装依赖**
```bash
# 更新包管理器
sudo apt update && sudo apt upgrade -y

# 安装 Node.js
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# 安装 FFmpeg
sudo apt install -y ffmpeg

# 安装 Git
sudo apt install -y git

# 验证安装
node -v
npm -v
ffmpeg -version
```

**步骤 3：克隆代码**
```bash
# 创建项目目录
mkdir -p ~/video-translation
cd ~/video-translation

# 克隆代码（如果有 Git 仓库）
git clone https://your-repo-url.git .

# 或者从 Windows 复制
# 代码可以放在 Windows 目录，WSL 可以直接访问
# 例如：/mnt/c/Users/AAA/Desktop/视频翻译
```

**步骤 4：安装依赖**
```bash
# 安装前端依赖
npm install

# 安装后端依赖
cd backend
npm install
```

**步骤 5：配置环境变量**
```bash
# 创建 .env 文件
cat > .env << EOF
# 前端环境变量（先使用本地地址）
VITE_API_URL=http://localhost:3001
EOF

# 创建后端 .env 文件
cd backend
cat > .env << EOF
# 火山引擎 API 配置
VOLC_API_KEY=your_volc_api_key
VOLC_APP_ID=your_app_id
VOLC_ACCESS_TOKEN=your_access_token

# 豆包 API 配置
DOUBAO_API_KEY=your_doubao_api_key
DOUBAO_MODEL=doubao-seed-2-0-pro-260215

# 服务器配置
PORT=3001
NODE_ENV=development
EOF
```

**步骤 6：构建并启动服务**
```bash
# 返回项目根目录
cd ..

# 构建前端
npm run build

# 安装 PM2
npm install -g pm2

# 启动后端
cd backend
pm2 start server.js --name video-translation-backend

# 安装 serve 并启动前端
npm install -g serve
cd ..
pm2 start "serve -s dist -l 5173" --name video-translation-frontend

# 查看服务状态
pm2 status
```

#### 2. 配置 ngrok 实现公网访问

**步骤 1：注册 ngrok**
- 访问：https://dashboard.ngrok.com/signup
- 注册免费账号

**步骤 2：获取 Authtoken**
- 登录后访问：https://dashboard.ngrok.com/get-started/your-authtoken
- 复制您的 authtoken

**步骤 3：在 WSL 中安装 ngrok**
```bash
# 下载 ngrok
cd /tmp
wget https://bin.equinox.io/c/bNyj1mQVY4c/ngrok-v3-stable-linux-amd64.tgz
tar xvzf ngrok-v3-stable-linux-amd64.tgz
sudo mv ngrok /usr/local/bin/

# 配置 authtoken
ngrok config add-authtoken YOUR_AUTHTOKEN
```

**步骤 4：启动 ngrok 隧道**
```bash
# 打开两个终端窗口

# 窗口 1 - 前端
ngrok http 5173

# 窗口 2 - 后端
ngrok http 3001
```

**步骤 5：获取公网 URL**
ngrok 会显示两个 URL，例如：
- 前端：`https://abc123.ngrok-free.app`
- 后端：`https://xyz789.ngrok-free.app`

**步骤 6：修改前端配置**
```bash
# 修改 .env 文件
cd ~/video-translation
cat > .env << EOF
VITE_API_URL=https://xyz789.ngrok-free.app
EOF

# 重新构建前端
npm run build

# 重启前端服务
pm2 restart video-translation-frontend
```

**步骤 7：访问公网地址**
使用前端 ngrok URL 访问网站

### 方案二：WSL + Cloudflare Tunnel（免费稳定）

#### 1. 安装 cloudflared

```bash
# 添加 Cloudflare 仓库
curl -fsSL https://pkg.cloudflare.com/cloudflare-main.gpg | sudo tee /usr/share/keyrings/cloudflare-main.gpg >/dev/null
echo 'deb [signed-by=/usr/share/keyrings/cloudflare-main.gpg] https://pkg.cloudflare.com/cloudflared jammy main' | sudo tee /etc/apt/sources.list.d/cloudflared.list

# 安装 cloudflared
sudo apt-get update && sudo apt-get install -y cloudflared

# 验证安装
cloudflared --version
```

#### 2. 创建 Cloudflare Tunnel

```bash
# 登录 Cloudflare
cloudflared tunnel login

# 创建隧道
cloudflared tunnel create video-translation

# 配置隧道
cat > ~/.cloudflared/config.yml << EOF
tunnel: video-translation
credentials-file: /home/YOUR_USERNAME/.cloudflared/YOUR_TUNNEL_ID.json

ingress:
  - hostname: frontend.your-domain.com
    service: http://localhost:5173
  - hostname: backend.your-domain.com
    service: http://localhost:3001
  - service: http_status:404
EOF

# 启动隧道
cloudflared tunnel run video-translation
```

### 方案三：WSL + frp（需要云服务器）

如果您有云服务器，可以使用 frp 实现反向代理。

#### 1. 配置云服务器（frps）

```bash
# 下载 frp
wget https://github.com/fatedier/frp/releases/download/v0.50.0/frp_0.50.0_linux_amd64.tar.gz
tar -xzvf frp_0.50.0_linux_amd64.tar.gz
cd frp_0.50.0_linux_amd64

# 配置 frps
cat > frps.ini << EOF
[common]
bind_port = 7000
dashboard_port = 7500
token = your_token
EOF

# 启动 frps
./frps -c frps.ini
```

#### 2. 配置 WSL（frpc）

```bash
# 下载 frp（同上）
# 配置 frpc
cat > frpc.ini << EOF
[common]
server_addr = YOUR_SERVER_IP
server_port = 7000
token = your_token

[frontend]
type = tcp
local_port = 5173
remote_port = 5173

[backend]
type = tcp
local_port = 3001
remote_port = 3001
EOF

# 启动 frpc
./frpc -c frpc.ini
```

### 方案四：WSL + 花生壳（国内用户）

#### 1. 下载花生壳
访问 https://hsk.oray.com/download 下载 Linux 版本

#### 2. 安装并配置
```bash
# 安装花生壳
sudo dpkg -i hsk*.deb

# 登录并配置映射
# 访问花生壳管理界面进行配置
```

## 📊 方案对比

| 方案 | 优点 | 缺点 | 推荐度 |
|------|------|------|--------|
| **ngrok** | 简单快速、支持 HTTPS | 免费版 URL 随机、带宽限制 | ⭐⭐⭐⭐⭐ |
| **Cloudflare** | 免费、稳定、可自定义域名 | 配置稍复杂 | ⭐⭐⭐⭐ |
| **frp** | 完全控制、速度快 | 需要云服务器 | ⭐⭐⭐⭐ |
| **花生壳** | 国内速度快、中文 | 免费版有限制 | ⭐⭐⭐ |

## 🔧 优化建议

### 1. 固定 ngrok URL（付费版）
```bash
# 使用付费版 ngrok 可以固定域名
ngrok http 5173 --domain=your-domain.ngrok-free.app
```

### 2. 使用 Docker 容器化部署
```bash
# 创建 Dockerfile
FROM node:18-alpine

WORKDIR /app
COPY package*.json ./
RUN npm install

COPY . .
RUN npm run build

EXPOSE 5173 3001

CMD ["npm", "run", "start:prod"]
```

### 3. 配置 Nginx 反向代理
```bash
# 安装 Nginx
sudo apt install -y nginx

# 配置反向代理
sudo cat > /etc/nginx/sites-available/video-translation << EOF
server {
    listen 80;
    server_name your-domain.com;
    
    location / {
        proxy_pass http://localhost:5173;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
    }
    
    location /api/ {
        proxy_pass http://localhost:3001/api/;
        proxy_set_header Host \$host;
    }
}
EOF

# 启用配置
sudo ln -s /etc/nginx/sites-available/video-translation /etc/nginx/sites-enabled/
sudo systemctl restart nginx
```

## 📝 完整部署脚本

我已创建了 `deploy-wsl.sh` 脚本，可以一键完成 WSL 部署。

## ⚠️ 注意事项

1. **防火墙配置**：
   - 确保 Windows 防火墙允许 WSL 网络
   - 可能需要配置 Windows 网络共享

2. **性能优化**：
   - 视频处理需要较多 CPU 和内存
   - 建议在 WSL 2 中运行以获得更好性能

3. **数据持久化**：
   - WSL 文件系统在 `\\wsl$` 下
   - 建议将数据存储在 Windows 目录以便备份

4. **网络稳定性**：
   - 内网穿透依赖第三方服务
   - 建议配置服务自动重启

## 🆘 常见问题

### Q: WSL 中无法访问 Windows 服务？
A: 使用 `host.docker.internal` 或 Windows IP 地址

### Q: ngrok 连接不稳定？
A: 尝试使用 Cloudflare Tunnel 或 frp

### Q: 视频处理失败？
A: 检查 FFmpeg 安装和服务器资源

### Q: 公网访问速度慢？
A: 检查上行带宽，考虑使用 CDN

## 📊 部署检查清单

- [ ] WSL 环境准备
- [ ] Node.js 和 FFmpeg 安装
- [ ] 代码克隆和依赖安装
- [ ] 环境变量配置
- [ ] 服务启动（PM2）
- [ ] 内网穿透配置（ngrok/Cloudflare）
- [ ] 公网访问测试
- [ ] 视频翻译功能测试

---

**部署完成后，您就可以通过公网 URL 访问视频翻译网站了！**