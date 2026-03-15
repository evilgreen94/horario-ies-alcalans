$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $projectRoot

$envFile = Join-Path $projectRoot '.env.local.ps1'
if (-not (Test-Path $envFile)) {
  throw "No existe $envFile"
}

. $envFile

if (-not $env:GUARDIAS_SESSION_SECRET -or $env:GUARDIAS_SESSION_SECRET -eq 'cambia-este-secret-por-uno-largo-y-privado') {
  throw 'Configura GUARDIAS_SESSION_SECRET en .env.local.ps1 antes de arrancar.'
}

Write-Host "Iniciando backend en http://localhost:3000" -ForegroundColor Cyan
& npm.cmd start
