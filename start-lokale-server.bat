@echo off
cd /d "%~dp0"
echo Lokale server wordt gestart op http://localhost:3000 ...
call npm run dev
pause
