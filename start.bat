@echo off
cd /d "%~dp0"
where npm >NUL 2>NUL
if errorlevel 1 (
  echo Node.js is not installed. Install it from https://nodejs.org then double-click this file again.
  pause
  exit /b 1
)
if not exist .env.local (
  copy .env.example .env.local >NUL
  echo Fill in your Supabase URL and key in the file that opens, save it, then close Notepad.
  notepad .env.local
)
if not exist node_modules (
  echo Installing, please wait...
  call npm install
)
start "" http://localhost:5173
call npm run dev
pause