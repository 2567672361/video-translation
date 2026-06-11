# 视频翻译网站公网部署配置脚本
# 需要以管理员权限运行

Write-Host "======================================" -ForegroundColor Cyan
Write-Host "视频翻译网站公网部署配置工具" -ForegroundColor Cyan
Write-Host "======================================" -ForegroundColor Cyan
Write-Host ""

# 检查管理员权限
$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Host "错误：需要管理员权限才能配置防火墙" -ForegroundColor Red
    Write-Host "请右键点击此脚本，选择'以管理员身份运行'" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "或者手动运行以下命令：" -ForegroundColor Cyan
    Write-Host "netsh advfirewall firewall add rule name=`"视频翻译前端`" dir=in action=allow protocol=TCP localport=5173"
    Write-Host "netsh advfirewall firewall add rule name=`"视频翻译后端`" dir=in action=allow protocol=TCP localport=3001"
    pause
    exit 1
}

Write-Host "正在配置 Windows 防火墙..." -ForegroundColor Green
Write-Host ""

# 配置前端防火墙规则
Write-Host "1. 添加前端防火墙规则（端口 5173）..." -ForegroundColor Cyan
try {
    netsh advfirewall firewall add rule name="视频翻译前端" dir=in action=allow protocol=TCP localport=5173
    Write-Host "   前端防火墙规则添加成功！" -ForegroundColor Green
} catch {
    Write-Host "   前端防火墙规则添加失败：$_" -ForegroundColor Red
}

Write-Host ""

# 配置后端防火墙规则
Write-Host "2. 添加后端防火墙规则（端口 3001）..." -ForegroundColor Cyan
try {
    netsh advfirewall firewall add rule name="视频翻译后端" dir=in action=allow protocol=TCP localport=3001
    Write-Host "   后端防火墙规则添加成功！" -ForegroundColor Green
} catch {
    Write-Host "   后端防火墙规则添加失败：$_" -ForegroundColor Red
}

Write-Host ""
Write-Host "3. 验证防火墙规则..." -ForegroundColor Cyan
Write-Host ""

# 显示已添加的规则
netsh advfirewall firewall show rule name=all | Select-String "视频翻译"

Write-Host ""
Write-Host "======================================" -ForegroundColor Cyan
Write-Host "防火墙配置完成！" -ForegroundColor Green
Write-Host "======================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "下一步操作：" -ForegroundColor Yellow
Write-Host "1. 登录路由器管理界面（通常是 192.168.19.151）" -ForegroundColor White
Write-Host "2. 配置端口转发规则：" -ForegroundColor White
Write-Host "   - 前端：外部端口 8080 -> 内部 IP 192.168.19.118:5173" -ForegroundColor White
Write-Host "   - 后端：外部端口 8081 -> 内部 IP 192.168.19.118:3001" -ForegroundColor White
Write-Host "3. 修改项目根目录的 .env 文件，将公网 IP 替换为您的实际公网 IP" -ForegroundColor White
Write-Host "4. 重新构建前端：npm run build" -ForegroundColor White
Write-Host "5. 重启服务并测试公网访问" -ForegroundColor White
Write-Host ""
Write-Host "详细信息请查看：公网部署指南.md" -ForegroundColor Cyan
Write-Host ""
pause