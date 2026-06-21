@echo off
chcp 65001 >nul
title Phone Remote Input

cd /d "%~dp0"

echo 正在启动 Phone Remote Input...
echo.

call .venv\Scripts\activate.bat
python run.py

pause
