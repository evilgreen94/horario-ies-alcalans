@echo off
setlocal
cd /d "%~dp0"

if not exist ".env.local.cmd" (
  echo No existe .env.local.cmd
  exit /b 1
)

call ".env.local.cmd"

if "%GUARDIAS_SESSION_SECRET%"=="" (
  echo Configura GUARDIAS_SESSION_SECRET en .env.local.cmd antes de arrancar.
  exit /b 1
)

if "%GUARDIAS_SESSION_SECRET%"=="cambia-este-secret-por-uno-largo-y-privado" (
  echo Configura GUARDIAS_SESSION_SECRET en .env.local.cmd antes de arrancar.
  exit /b 1
)

echo Iniciando backend en http://localhost:3000
call npm.cmd start
