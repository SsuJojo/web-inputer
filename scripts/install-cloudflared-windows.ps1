param(
  [string]$ConfigPath = "$PSScriptRoot\..\deploy\cloudflared-aiapi.yml"
)

$ErrorActionPreference = 'Stop'
cloudflared service install
New-Item -ItemType Directory -Force -Path "$env:USERPROFILE\.cloudflared" | Out-Null
Copy-Item $ConfigPath "$env:USERPROFILE\.cloudflared\config.yml" -Force
Restart-Service cloudflared
Write-Host 'cloudflared Windows service installed/restarted. Ensure aiapi credentials JSON exists.'
