$ErrorActionPreference = "Stop"

$env:Path = [Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [Environment]::GetEnvironmentVariable("Path", "User")
$root = Split-Path -Parent $PSScriptRoot
$port = 7777
$pages = @("/", "/today", "/trades", "/report", "/history", "/logic", "/settings")

function Invoke-GoldbitCommand {
  param([string[]] $Command)

  $executable = $Command[0]
  $arguments = @($Command | Select-Object -Skip 1)
  & $executable @arguments
  if ($LASTEXITCODE -ne 0) {
    throw "Command failed: $($Command -join ' ')"
  }
}

function Stop-GoldbitDevServer {
  foreach ($candidatePort in @(3000, $port)) {
    Get-NetTCPConnection -LocalPort $candidatePort -State Listen -ErrorAction SilentlyContinue |
      ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }
  }
}

function Wait-ForGoldbit {
  $deadline = (Get-Date).AddSeconds(30)
  do {
    Start-Sleep -Seconds 1
    try {
      $response = Invoke-WebRequest -Uri "http://localhost:$port/history" -UseBasicParsing -TimeoutSec 5
      if ($response.StatusCode -eq 200) {
        return
      }
    } catch {
      if ((Get-Date) -gt $deadline) {
        throw "Dev server did not become ready on http://localhost:$port"
      }
    }
  } while ((Get-Date) -le $deadline)

  throw "Dev server did not become ready on http://localhost:$port"
}

Push-Location $root
try {
  Write-Host "Running lint..."
  Invoke-GoldbitCommand @("npm.cmd", "run", "lint")

  Write-Host "Running tests..."
  Invoke-GoldbitCommand @("npm.cmd", "run", "test:run")

  Write-Host "Stopping dev server and clearing Next.js cache..."
  Stop-GoldbitDevServer
  Remove-Item -Path (Join-Path $root ".next") -Recurse -Force -ErrorAction SilentlyContinue

  Write-Host "Running production build from a clean cache..."
  Invoke-GoldbitCommand @("npm.cmd", "run", "next:build")

  Write-Host "Starting clean tailnet dev server for page smoke checks..."
  Start-Process -FilePath "cmd.exe" -ArgumentList "/c", "npm.cmd run dev:tailnet" -WorkingDirectory $root -WindowStyle Hidden
  Wait-ForGoldbit

  foreach ($page in $pages) {
    $url = "http://localhost:$port$page"
    Write-Host "Checking $url..."
    $response = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 15
    if ($response.StatusCode -ne 200) {
      throw "$url returned HTTP $($response.StatusCode)"
    }
    if ($response.Content -match "Cannot find module|Internal Server Error|Application error") {
      throw "$url contains an app/server error marker"
    }
  }

  Write-Host "Update verification passed. Goldbit is clean at http://localhost:$port"
} finally {
  Pop-Location
}
