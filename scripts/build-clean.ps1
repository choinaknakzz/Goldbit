$ErrorActionPreference = "Stop"

$env:Path = "C:\Program Files\nodejs;" + [Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [Environment]::GetEnvironmentVariable("Path", "User")
$root = Split-Path -Parent $PSScriptRoot
$port = 7777

function Stop-GoldbitServer {
  foreach ($candidatePort in @(3000, $port)) {
    Get-NetTCPConnection -LocalPort $candidatePort -State Listen -ErrorAction SilentlyContinue |
      ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }
  }
}

Push-Location $root
try {
  Write-Host "Stopping Goldbit dev server before build..."
  Stop-GoldbitServer

  Write-Host "Clearing Next.js cache..."
  Remove-Item -Path (Join-Path $root ".next") -Recurse -Force -ErrorAction SilentlyContinue

  Write-Host "Running clean production build..."
  & npx.cmd next build
  if ($LASTEXITCODE -ne 0) {
    throw "next build failed"
  }
} finally {
  Pop-Location
}
