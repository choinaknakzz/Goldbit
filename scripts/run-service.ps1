$ErrorActionPreference = "Stop"

try {
  $projectRoot = Split-Path -Parent $PSScriptRoot
  $logPath = Join-Path $projectRoot "automation-service.log"
  $node = (Get-Command node.exe -ErrorAction SilentlyContinue).Source
  if (-not $node) {
    $node = "C:\Program Files\nodejs\node.exe"
  }
  $entrypoint = Join-Path $projectRoot "dist\index.js"

  "[$(Get-Date -Format o)] Starting GoldbitAutomationLab service with $node" | Out-File -FilePath $logPath -Append -Encoding utf8
  Set-Location $projectRoot

  $cmdArguments = "/d /s /c """"$node"" ""$entrypoint"" dev >> ""$logPath"" 2>&1"""
  $process = Start-Process `
    -FilePath "cmd.exe" `
    -ArgumentList $cmdArguments `
    -WorkingDirectory $projectRoot `
    -WindowStyle Hidden `
    -Wait `
    -PassThru
  $exitCode = $process.ExitCode

  "[$(Get-Date -Format o)] GoldbitAutomationLab service exited with code $exitCode" | Out-File -FilePath $logPath -Append -Encoding utf8
  exit $exitCode
} catch {
  $message = "[$(Get-Date -Format o)] GoldbitAutomationLab service failed: $($_.Exception.Message)"
  if ($logPath) {
    $message | Out-File -FilePath $logPath -Append -Encoding utf8
  }
  exit 1
}
