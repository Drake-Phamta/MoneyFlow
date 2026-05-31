@echo off
title Money Flow - Desktop
cd /d "%~dp0"

:: Check if node_modules exists
if not exist "node_modules" (
    echo Dang cai dat dependencies...
    npm install
)

:: Start Electron app
echo Khoi dong Money Flow Desktop...
npx electron .
