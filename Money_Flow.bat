@echo off
cd /d "D:\New_era\Money_Flow"
start "" /b cmd /c "npm run dev:web"
timeout /t 5 /nobreak >nul
start "" "http://localhost:5173"
exit
