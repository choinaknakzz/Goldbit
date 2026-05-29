$ErrorActionPreference = "Stop"

$env:Path = [Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [Environment]::GetEnvironmentVariable("Path", "User")
$root = Split-Path -Parent $PSScriptRoot
$port = 7777

Write-Host "Stopping dev server on ports 3000 and $port..."
foreach ($candidatePort in @(3000, $port)) {
  Get-NetTCPConnection -LocalPort $candidatePort -State Listen -ErrorAction SilentlyContinue |
    ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }
}

Write-Host "Clearing Next.js cache..."
Remove-Item -Path (Join-Path $root ".next") -Recurse -Force -ErrorAction SilentlyContinue

Write-Host "Starting clean dev server..."
Start-Process -FilePath "cmd.exe" -ArgumentList "/c", "npm.cmd run dev" -WorkingDirectory $root -WindowStyle Hidden

$deadline = (Get-Date).AddSeconds(30)
do {
  Start-Sleep -Seconds 1
  try {
    $response = Invoke-WebRequest -Uri "http://localhost:$port/history" -UseBasicParsing -TimeoutSec 5
    if ($response.StatusCode -eq 200) {
      Write-Host "Goldbit is running at http://localhost:$port"
      exit 0
    }
  } catch {
    if ((Get-Date) -gt $deadline) {
      throw "Dev server did not become ready on http://localhost:$port"
    }
  }
} while ((Get-Date) -le $deadline)

throw "Dev server did not become ready on http://localhost:$port"
