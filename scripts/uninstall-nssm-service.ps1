param(
  [string]$ServiceName = 'RemoteInput',
  [string]$NssmPath = 'nssm.exe'
)

$ErrorActionPreference = 'Stop'
& $NssmPath stop $ServiceName
& $NssmPath remove $ServiceName confirm
Write-Host "Removed $ServiceName"
