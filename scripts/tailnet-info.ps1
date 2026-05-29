$ErrorActionPreference = "Stop"

$port = 7777
$tailscaleCommand = Get-Command tailscale -ErrorAction SilentlyContinue

if (-not $tailscaleCommand) {
  Write-Host "Tailscale CLI was not found in PATH."
  Write-Host "Install Tailscale, sign in on this PC and phone, then run this again."
  Write-Host "Goldbit tailnet server command: npm run dev:tailnet"
  exit 0
}

$ip = (& tailscale ip -4 | Select-Object -First 1).Trim()

if (-not $ip) {
  Write-Host "No Tailscale IPv4 address found. Check that Tailscale is running and signed in."
  exit 1
}

Write-Host "Goldbit Tailnet URL:"
Write-Host "http://$ip`:$port"
Write-Host ""
Write-Host "Start Goldbit for Tailnet access with:"
Write-Host "npm run dev:tailnet"
