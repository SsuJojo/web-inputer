$ErrorActionPreference = 'Stop'
$Root = (Resolve-Path "$PSScriptRoot\..").Path
$PythonW = Join-Path $Root '.venv\Scripts\pythonw.exe'
$cmd = '"' + $PythonW + '" run.py'
Write-Host "PSScriptRoot=[$PSScriptRoot]"
Write-Host "Root=[$Root]"
Write-Host "PythonW=[$PythonW]"
Write-Host "cmd=[$cmd]"
$vbsLines = @(
  'Set sh = CreateObject("WScript.Shell")'
  'sh.CurrentDirectory = "' + $Root + '"'
  'sh.Run "' + $cmd + '", 0, False'
)
$vbs = $vbsLines -join "`r`n"
Set-Content -Path (Join-Path $Root 'scripts\debug.out') -Value $vbs -Encoding ASCII
try {
  $Action = New-ScheduledTaskAction -Execute "$env:windir\System32\wscript.exe" -Argument "`"$((Join-Path $Root 'scripts\autostart.vbs'))`"" -WorkingDirectory $Root
  Write-Host "ActionNull=$($null -eq $Action) Execute=[$($Action.Execute)] Arg=[$($Action.Arguments)]"
} catch {
  Write-Host "ActionError: $($_.Exception.Message)"
}