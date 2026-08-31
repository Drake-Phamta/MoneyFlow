@echo off
chcp 65001 >nul
title Money Flow - Desktop
cd /d "%~dp0.."

if not exist "node_modules" (
    echo Dang cai dat dependencies...
    call npm install
)

echo Dang dung giao dien...
call npx vite build

echo Khoi dong Money Flow Desktop...
npx electron .
