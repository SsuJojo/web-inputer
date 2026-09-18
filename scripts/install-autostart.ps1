# Set up Phone Remote Input to auto-start at Windows logon.

param(
  [string]$TaskName = 'RemoteInput'
)

$ErrorActionPreference = 'Stop'
$Root = (Resolve-Path "$PSScriptRoot\..").Path
$PythonW = Join-Path $Root '.venv\Scripts\pythonw.exe'
$Launcher = Join-Path $Root 'scripts\autostart.vbs'

if (-not (Test-Path $PythonW)) {
  throw "Not found: $PythonW (run start-dev.ps1 once to create the venv)"
}

# Launching pythonw.exe directly as the task Program is unreliable here.
# Use wscript + a silent .vbs launcher instead: windowless and stable.
$shRun = 'sh.Run """' + $PythonW + '"" run.py", 0, False'
$vbsLines = @(
  'Set sh = CreateObject("WScript.Shell")'
  'sh.CurrentDirectory = "' + $Root + '"'
  $shRun
)
Set-Content -Path $Launcher -Value ($vbsLines -join "`r`n") -Encoding ASCII

# Use Task Scheduler (not an NSSM service). A service runs in Session 0 and
# cannot inject keystrokes into the interactive desktop; running at logon
# keeps the process in the user session so it can control the desktop.
$Action = New-ScheduledTaskAction -Execute "$env:windir\System32\wscript.exe" -Argument "`"$Launcher`"" -WorkingDirectory $Root
$Trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$Settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero) -MultipleInstances IgnoreNew
$Principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive -RunLevel Limited

Register-ScheduledTask -TaskName $TaskName -Action $Action -Trigger $Trigger -Settings $Settings -Principal $Principal -Description 'Phone Remote Input - run at logon, hidden console (pythonw via wscript)' -Force | Out-Null

Write-Host "Registered scheduled task '$TaskName' - runs at logon of $env:USERDOMAIN\$env:USERNAME"