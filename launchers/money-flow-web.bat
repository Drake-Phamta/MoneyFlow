@echo off
chcp 65001 >nul
title Money Flow - Web
cd /d "%~dp0.."

if not exist "node_modules" (
    echo Dang cai dat dependencies...
    call npm install
)

echo Dang dung giao dien va khoi dong may chu...
start /B cmd /c "npm start"
timeout /t 8 /nobreak >nul
start http://localhost:3001

echo Money Flow dang chay tai http://localhost:3001
echo Dong cua so nay de tat may chu.
pause >nul
