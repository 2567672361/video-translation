<#
.SYNOPSIS
    推送前安全审查：拦截密钥、凭据、隐私信息与体积异常的文件。

.DESCRIPTION
    在 git push 之前运行。检查三类问题：
      1) 敏感文件被纳入版本管理（.env、日志、上传物、数据库、私钥）
      2) 源码/文档中硬编码的密钥与令牌（OpenAI、GitHub、AWS、JWT、私钥块等）
      3) 即将提交的文件体积过大
    另外对局域网 IP 等隐私信息给出警告（不阻断）。

    退出码 0 表示通过，1 表示存在阻断项，推送应被拒绝。

.EXAMPLE
    pwsh -File scripts/security-check.ps1
    powershell -NoProfile -ExecutionPolicy Bypass -File scripts/security-check.ps1
#>

$ErrorActionPreference = 'Stop'
$repoRoot = (& git rev-parse --show-toplevel 2>$null)
if (-not $repoRoot) {
    Write-Host '不在 Git 仓库中，跳过安全审查。' -ForegroundColor Yellow
    exit 0
}
Set-Location $repoRoot

$failures = New-Object System.Collections.Generic.List[string]
$warnings = New-Object System.Collections.Generic.List[string]

function Add-Failure([string]$message) { $script:failures.Add($message) }
function Add-Warning([string]$message) { $script:warnings.Add($message) }

# ---------- 1. 敏感文件 ----------

$tracked = & git -c core.quotepath=false ls-files
$sensitivePathPatterns = @(
    '(^|/)\.env$',
    '(^|/)\.env\.(local|development|production|test)$',
    '\.(pem|key|p12|pfx|kdbx|jks)$',
    '(^|/)(uploads|output|data)/',
    '\.(log|sqlite|sqlite3|db)$',
    '(^|/)id_(rsa|ed25519|ecdsa)$'
)

foreach ($file in $tracked) {
    foreach ($pattern in $sensitivePathPatterns) {
        if ($file -match $pattern) {
            Add-Failure "敏感文件被纳入版本管理：$file（匹配 $pattern）"
            break
        }
    }
}

# .env.example / *.example 属于模板，允许存在
$trackedEnvLike = $tracked | Where-Object { $_ -match '(^|/)\.env' }
foreach ($file in $trackedEnvLike) {
    if ((Split-Path $file -Leaf) -notmatch '\.(example|sample|template)$') {
        Add-Failure "疑似真实环境变量文件：$file"
    }
}

# ---------- 2. 硬编码密钥 ----------

$secretPatterns = @(
    @{ Name = 'OpenAI/DeepSeek 风格密钥'; Regex = 'sk-[A-Za-z0-9_\-]{20,}' },
    @{ Name = 'GitHub 个人令牌'; Regex = 'gh[pousr]_[A-Za-z0-9]{30,}' },
    @{ Name = 'GitHub 细粒度令牌'; Regex = 'github_pat_[A-Za-z0-9_]{20,}' },
    @{ Name = 'AWS Access Key'; Regex = 'AKIA[0-9A-Z]{16}' },
    @{ Name = 'Slack 令牌'; Regex = 'xox[baprs]-[A-Za-z0-9\-]{10,}' },
    @{ Name = 'Google API Key'; Regex = 'AIza[0-9A-Za-z_\-]{35}' },
    @{ Name = 'JWT'; Regex = 'eyJ[A-Za-z0-9_\-]{20,}\.[A-Za-z0-9_\-]{20,}\.[A-Za-z0-9_\-]{10,}' },
    @{ Name = '私钥块'; Regex = '-----BEGIN [A-Z ]*PRIVATE KEY-----' }
)

$scannable = $tracked | Where-Object {
    $_ -notmatch '(package-lock\.json|pnpm-lock\.yaml|yarn\.lock)$'
}

foreach ($pattern in $secretPatterns) {
    foreach ($file in $scannable) {
        $path = Join-Path $repoRoot $file
        if (-not (Test-Path $path)) { continue }
        $item = Get-Item $path -ErrorAction SilentlyContinue
        if (-not $item -or $item.Length -gt 2MB) { continue }

        try {
            $hits = Select-String -Path $path -Pattern $pattern.Regex -AllMatches -ErrorAction Stop
        } catch {
            continue
        }

        foreach ($hit in $hits) {
            Add-Failure ("发现{0}：{1}:{2}" -f $pattern.Name, $file, $hit.LineNumber)
        }
    }
}

# ---------- 3. 体积检查 ----------

$maxBytes = 20MB
$staged = & git -c core.quotepath=false diff --cached --name-only
foreach ($file in $staged) {
    $path = Join-Path $repoRoot $file
    if (Test-Path $path) {
        $size = (Get-Item $path).Length
        if ($size -gt $maxBytes) {
            Add-Failure ("暂存文件超过 20MB：{0}（{1:N1} MB）" -f $file, ($size / 1MB))
        }
    }
}

# 历史中已跟踪的大文件同样提醒（无法通过 push 移除，只能重写历史）
foreach ($file in $tracked) {
    $path = Join-Path $repoRoot $file
    if (Test-Path $path) {
        $size = (Get-Item $path).Length
        if ($size -gt 50MB) {
            Add-Warning ("仓库中已有超过 50MB 的文件：{0}（{1:N1} MB）" -f $file, ($size / 1MB))
        }
    }
}

# ---------- 4. 隐私信息（仅警告） ----------

foreach ($file in $tracked) {
    if ($file -notmatch '\.(md|txt|ps1|bat|sh|yml|yaml|json)$') { continue }
    $path = Join-Path $repoRoot $file
    if (-not (Test-Path $path)) { continue }

    $lines = Select-String -Path $path -Pattern '\b192\.168\.\d{1,3}\.\d{1,3}\b|\b10\.\d{1,3}\.\d{1,3}\.\d{1,3}\b' -ErrorAction SilentlyContinue
    if ($lines) {
        Add-Warning ("包含内网 IP，公开仓库建议替换为占位符：{0}（{1} 处）" -f $file, $lines.Count)
    }
}

# ---------- 输出 ----------

Write-Host ''
Write-Host '================ 推送前安全审查 ================' -ForegroundColor Cyan

if ($failures.Count -eq 0) {
    Write-Host '阻断项：0' -ForegroundColor Green
} else {
    Write-Host ("阻断项：{0}" -f $failures.Count) -ForegroundColor Red
    foreach ($failure in $failures) { Write-Host ("  ✗ " + $failure) -ForegroundColor Red }
}

if ($warnings.Count -gt 0) {
    Write-Host ("警告：{0}" -f $warnings.Count) -ForegroundColor Yellow
    foreach ($warning in $warnings) { Write-Host ("  ! " + $warning) -ForegroundColor Yellow }
}

Write-Host '===============================================' -ForegroundColor Cyan

if ($failures.Count -gt 0) {
    Write-Host '审查未通过，推送已拦截。确认无误后可临时跳过：git push --no-verify' -ForegroundColor Red
    exit 1
}

Write-Host '审查通过，可以推送。' -ForegroundColor Green
exit 0
