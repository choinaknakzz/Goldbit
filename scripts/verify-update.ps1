$ErrorActionPreference = "Stop"

$env:Path = [Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [Environment]::GetEnvironmentVariable("Path", "User")
$root = Split-Path -Parent $PSScriptRoot
$pages = @("/", "/today", "/trades", "/history", "/logic", "/settings")

function Stop-GoldbitDevServer {
  Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue |
    ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }
}

function Wait-ForGoldbit {
  $deadline = (Get-Date).AddSeconds(30)
  do {
    Start-Sleep -Seconds 1
    try {
      $response = Invoke-WebRequest -Uri "http://localhost:3000/history" -UseBasicParsing -TimeoutSec 5
      if ($response.StatusCode -eq 200) {
        return
      }
    } catch {
      if ((Get-Date) -gt $deadline) {
        throw "Dev server did not become ready on http://localhost:3000"
      }
    }
  } while ((Get-Date) -le $deadline)

  throw "Dev server did not become ready on http://localhost:3000"
}

Push-Location $root
try {
  Write-Host "Running lint..."
  npm.cmd run lint

  Write-Host "Running tests..."
  npm.cmd run test:run

  Write-Host "Stopping dev server and clearing Next.js cache..."
  Stop-GoldbitDevServer
  Remove-Item -Path (Join-Path $root ".next") -Recurse -Force -ErrorAction SilentlyContinue

  Write-Host "Running production build from a clean cache..."
  npm.cmd run build

  Write-Host "Starting clean dev server for page smoke checks..."
  Start-Process -FilePath "cmd.exe" -ArgumentList "/c", "npm.cmd run dev" -WorkingDirectory $root -WindowStyle Hidden
  Wait-ForGoldbit

  foreach ($page in $pages) {
    $url = "http://localhost:3000$page"
    Write-Host "Checking $url..."
    $response = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 15
    if ($response.StatusCode -ne 200) {
      throw "$url returned HTTP $($response.StatusCode)"
    }
    if ($response.Content -match "Cannot find module|Internal Server Error|Application error") {
      throw "$url contains an app/server error marker"
    }
  }

  Write-Host "Update verification passed. Goldbit is clean at http://localhost:3000"
} finally {
  Pop-Location
}
