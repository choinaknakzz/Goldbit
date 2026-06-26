$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$taskName = "GoldbitAutomationLab"
$runnerPath = Join-Path $PSScriptRoot "run-service.ps1"

if (Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue) {
  Stop-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
}

$orphanProcesses = Get-CimInstance Win32_Process | Where-Object {
  (
    ($_.CommandLine -like "*$projectRoot*" -and (
      $_.CommandLine -like "*npm.cmd run start*" -or
      $_.CommandLine -like "*run-service-hidden.vbs*"
    )) -or
    $_.CommandLine -like "*dist/index.js dev*"
  ) -and $_.ProcessId -ne $PID
}

foreach ($process in $orphanProcesses) {
  Stop-Process -Id $process.ProcessId -Force -ErrorAction SilentlyContinue
}

$action = New-ScheduledTaskAction `
  -Execute "powershell.exe" `
  -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$runnerPath`"" `
  -WorkingDirectory $projectRoot
$logonTrigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$watchdogTrigger = New-ScheduledTaskTrigger `
  -Once `
  -At (Get-Date).Date `
  -RepetitionInterval (New-TimeSpan -Minutes 5) `
  -RepetitionDuration (New-TimeSpan -Days 3650)
$settings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -ExecutionTimeLimit (New-TimeSpan -Days 0) `
  -MultipleInstances IgnoreNew `
  -RestartCount 999 `
  -RestartInterval (New-TimeSpan -Minutes 1) `
  -StartWhenAvailable
$principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Highest

Register-ScheduledTask `
  -TaskName $taskName `
  -Action $action `
  -Trigger @($logonTrigger, $watchdogTrigger) `
  -Settings $settings `
  -Principal $principal `
  -Force | Out-Null

Start-ScheduledTask -TaskName $taskName

Write-Host "Registered and started scheduled task: $taskName"
Write-Host "Watchdog trigger: every 5 minutes; running instances are ignored."
