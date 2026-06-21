$ErrorActionPreference = 'Stop'
if (-not (Test-Path '.env')) {
  Copy-Item '.env.example' '.env'
  Write-Host 'Created .env from .env.example. Edit secrets before production use.'
}
if (-not (Test-Path '.venv')) {
  py -3.11 -m venv .venv
}
New-Item -ItemType Directory -Force -Path 'logs' | Out-Null
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe run.py
