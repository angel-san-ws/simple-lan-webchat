@echo off
setlocal
cd /d "%~dp0"

echo === Building client (Angular) ===
cd client
call npm run build
if errorlevel 1 (
    echo Client build failed.
    pause
    exit /b 1
)

echo === Building server (TypeScript) ===
cd ..\server
call npm run build
if errorlevel 1 (
    echo Server build failed.
    pause
    exit /b 1
)

echo === Starting server ===
echo Once running, open this machine's LAN IP in a browser, e.g. http://192.168.x.x:3000
call npm start

pause
