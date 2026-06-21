param(
  [string]$ServiceName = 'RemoteInput',
  [string]$NssmPath = 'nssm.exe'
)

$ErrorActionPreference = 'Stop'
$Root = (Resolve-Path "$PSScriptRoot\..").Path
$Python = Join-Path $Root '.venv\Scripts\python.exe'

if (-not (Test-Path $Python)) {
  py -3.11 -m venv (Join-Path $Root '.venv')
  & $Python -m pip install -r (Join-Path $Root 'requirements.txt')
}
New-Item -ItemType Directory -Force -Path (Join-Path $Root 'logs') | Out-Null

& $NssmPath install $ServiceName $Python 'run.py'
& $NssmPath set $ServiceName AppDirectory $Root
& $NssmPath set $ServiceName AppEnvironmentExtra "PYTHONUTF8=1"
& $NssmPath set $ServiceName Start SERVICE_AUTO_START
& $NssmPath set $ServiceName AppStdout (Join-Path $Root 'logs\service-out.log')
& $NssmPath set $ServiceName AppStderr (Join-Path $Root 'logs\service-err.log')
& $NssmPath set $ServiceName AppRotateFiles 1
& $NssmPath set $ServiceName AppRotateBytes 10485760
& $NssmPath set $ServiceName AppThrottle 1500
& $NssmPath start $ServiceName
Write-Host "Installed and started $ServiceName"
