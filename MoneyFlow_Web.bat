@echo off
title Money Flow - Web
cd /d "%~dp0"

:: Start server in background
start /B node server.js

:: Wait for server to be ready
timeout /t 2 /nobreak >nul

:: Open browser
start http://localhost:3001

:: Keep window open
echo Money Flow đang chạy tại http://localhost:3001
echo Đóng cửa sổ này để tắt server.
pause >nul
