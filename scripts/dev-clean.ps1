$ErrorActionPreference = "Stop"

$env:Path = [Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [Environment]::GetEnvironmentVariable("Path", "User")
$root = Split-Path -Parent $PSScriptRoot

Write-Host "Stopping dev server on port 3000..."
Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue |
  ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }

Write-Host "Clearing Next.js cache..."
Remove-Item -Path (Join-Path $root ".next") -Recurse -Force -ErrorAction SilentlyContinue

Write-Host "Starting clean dev server..."
Start-Process -FilePath "cmd.exe" -ArgumentList "/c", "npm.cmd run dev" -WorkingDirectory $root -WindowStyle Hidden

$deadline = (Get-Date).AddSeconds(30)
do {
  Start-Sleep -Seconds 1
  try {
    $response = Invoke-WebRequest -Uri "http://localhost:3000/history" -UseBasicParsing -TimeoutSec 5
    if ($response.StatusCode -eq 200) {
      Write-Host "Goldbit is running at http://localhost:3000"
      exit 0
    }
  } catch {
    if ((Get-Date) -gt $deadline) {
      throw "Dev server did not become ready on http://localhost:3000"
    }
  }
} while ((Get-Date) -le $deadline)

throw "Dev server did not become ready on http://localhost:3000"
