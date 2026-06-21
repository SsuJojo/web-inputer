@echo off
chcp 65001 >nul
title Build remote-input.exe

cd /d "%~dp0"

echo Building remote-input.exe with PyInstaller...
echo.

call .venv\Scripts\activate.bat
python -m PyInstaller remote-input.spec --noconfirm --clean

if errorlevel 1 (
    echo.
    echo Build FAILED.
    pause
    exit /b 1
)

echo.
echo Build OK -^> dist\remote-input.exe
pause
