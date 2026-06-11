﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿# Video Translation Service Start Script
# Start order: Local Translate -> Backend -> Frontend -> Cloudflare Tunnel

$rootDir = $PSScriptRoot
$backendDir = Join-Path $rootDir "backend"

Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "  Video Translation Service" -ForegroundColor Cyan
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host ""

# ========== 1. Local Translation (Tencent Hunyuan HY-MT1.5-1.8B) ==========
Write-Host "[1/4] Starting local translation service..." -ForegroundColor Yellow
Write-Host "  Model: Tencent Hunyuan HY-MT1.5-1.8B (CPU/float32)"
Write-Host "  Port: 5001"

$pythonCmd = (Get-Command python -ErrorAction SilentlyContinue).Source
if (-not $pythonCmd) {
    Write-Host "  [FAIL] Python not found, please install Python 3.8+" -ForegroundColor Red
    exit 1
}

$depsOk = & python -c "import flask, transformers, torch" 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "  Installing Python dependencies..."
    Push-Location $backendDir
    pip install -r requirements_local_translate.txt
    Pop-Location
}

$env:LOCAL_TRANSLATE_PORT = "5001"
$env:LOCAL_TRANSLATE_HOST = "127.0.0.1"
Start-Process python -ArgumentList "local_translate.py" -WorkingDirectory $backendDir -WindowStyle Hidden

Write-Host "  Waiting for model to load (~20s)..."
Start-Sleep -Seconds 20
Write-Host "  [OK] Translation service started" -ForegroundColor Green
Write-Host ""

# ========== 2. Backend (Express + WebSocket) ==========
Write-Host "[2/4] Starting backend service..." -ForegroundColor Yellow
Write-Host "  Port: 3001"
Start-Process node -ArgumentList "server.js" -WorkingDirectory $backendDir -WindowStyle Hidden
Write-Host "  Waiting for service..."
Start-Sleep -Seconds 5
Write-Host "  [OK] Backend service started" -ForegroundColor Green
Write-Host ""

# ========== 3. Frontend (Vite + React) ==========
Write-Host "[3/4] Starting frontend service..." -ForegroundColor Yellow
Write-Host "  Port: 5173"
if (-not (Test-Path (Join-Path $rootDir "node_modules"))) {
    Write-Host "  [!] node_modules missing, installing dependencies..." -ForegroundColor Magenta
    Push-Location $rootDir
    try {
        npm install
        Write-Host "  [OK] Dependencies installed" -ForegroundColor Green
    } catch {
        Write-Host "  [FAIL] Dependency install failed: $_" -ForegroundColor Red
        Pop-Location
        exit 1
    }
    Pop-Location
}
Start-Process npm -ArgumentList "run dev" -WorkingDirectory $rootDir -WindowStyle Hidden
Write-Host "  Waiting for service..."
Start-Sleep -Seconds 8
Write-Host "  [OK] Frontend service started" -ForegroundColor Green
Write-Host ""

# ========== 4. Cloudflare Tunnel ==========
Write-Host "[4/4] Starting Cloudflare Tunnel..." -ForegroundColor Yellow
Start-Process cmd -ArgumentList "/c wsl cloudflared tunnel --config cloudflared-config.yml run video-translation" -WorkingDirectory $rootDir -WindowStyle Hidden
Start-Sleep -Seconds 5
Write-Host "  [OK] Cloudflare Tunnel started" -ForegroundColor Green
Write-Host ""

# ========== Done ==========
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "  All services started!" -ForegroundColor Green
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Local Translate:  http://127.0.0.1:5001" -ForegroundColor White
Write-Host "  Backend:          http://localhost:3001" -ForegroundColor White
Write-Host "  Frontend:         http://localhost:5173" -ForegroundColor White
Write-Host "  Public:           https://spfy.spfy03.icu" -ForegroundColor White
Write-Host ""
Write-Host "  All services are running in background." -ForegroundColor DarkGray
Write-Host "  Press any key to close this window (services keep running)..."
$null = $Host.UI.RawUI.ReadKey('NoEcho,IncludeKeyDown')