# Video Translation Service Stop Script

Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "  Stopping Video Translation Service" -ForegroundColor Cyan
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host ""

$stopped = @()

function Stop-ByPort($port, $name) {
    Write-Host "[$name] Stopping on port $port..." -ForegroundColor Yellow
    $conns = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue | Where-Object { $_.State -eq 'Listen' }
    if ($conns) {
        foreach ($conn in $conns) {
            $pidToKill = $conn.OwningProcess
            try {
                $proc = Get-Process -Id $pidToKill -ErrorAction Stop
                Stop-Process -Id $pidToKill -Force
                $stopped += "$name (PID: $pidToKill, $($proc.ProcessName))"
                Write-Host "  [OK] Terminated" -ForegroundColor Green
            } catch {
                Write-Host "  [SKIP] PID $pidToKill not accessible" -ForegroundColor DarkGray
            }
        }
    } else {
        Write-Host "  [SKIP] Not running" -ForegroundColor DarkGray
    }
}

Stop-ByPort 5001 "Local Translate"
Write-Host ""

Stop-ByPort 3001 "Backend (Express)"
Write-Host ""

Stop-ByPort 5173 "Frontend (Vite)"
Write-Host ""

# Cloudflare Tunnel
Write-Host "[Cloudflare Tunnel] Stopping..." -ForegroundColor Yellow
taskkill /f /im cloudflared.exe 2>$null
wsl pkill -f cloudflared 2>$null
Write-Host "  [OK] Stopped" -ForegroundColor Green
Write-Host ""

Write-Host "=========================================" -ForegroundColor Cyan
if ($stopped.Count -gt 0) {
    Write-Host "  Stopped services:" -ForegroundColor Green
    foreach ($s in $stopped) {
        Write-Host "    ✓ $s" -ForegroundColor White
    }
} else {
    Write-Host "  No services were running" -ForegroundColor DarkGray
}
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Press any key to exit..."
$null = $Host.UI.RawUI.ReadKey('NoEcho,IncludeKeyDown')
