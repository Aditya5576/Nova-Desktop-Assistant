@echo off
title Nova Desktop Assistant - Auto Setup Launcher
echo ========================================================
echo Nova Desktop Assistant - Auto Setup and Launcher
echo ========================================================
echo.

cd /d "%~dp0"

:: Check if Node.js is installed
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Node.js is not installed on this computer!
    echo.
    echo Please download and install Node.js from: https://nodejs.org/
    echo Then run this setup script again.
    echo.
    pause
    exit /b 1
)

:: Check if node_modules exists, if not run npm install automatically
if not exist "node_modules\" (
    echo First-time setup detected: Installing Nova packages...
    echo Please wait 15-30 seconds...
    echo.
    call npm install
    if %errorlevel% neq 0 (
        echo [ERROR] Installation failed! Please check your internet connection.
        pause
        exit /b 1
    )
    echo Packages installed successfully!
)

:: Create Desktop Shortcut if needed
if exist "create-desktop-shortcut.vbs" (
    wscript.exe create-desktop-shortcut.vbs >nul 2>nul
)

echo.
echo Launching Nova Desktop Assistant...
start "" "node_modules\.bin\electron.cmd" .
exit
