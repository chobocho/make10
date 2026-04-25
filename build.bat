@echo off
REM build.bat - release/ folder build script (Windows).
REM Output: release\index.html, release\dist.js, release\data\maps.json
REM Note: Keep messages ASCII to avoid CP949/UTF-8 encoding issues on cmd.exe.

setlocal enableextensions
cd /d "%~dp0"

echo [build] esbuild bundling
call npx esbuild src/main.ts --bundle --outfile=dist/dist.js --target=es2020 --format=iife --minify
if errorlevel 1 goto :fail

echo [build] cleaning release/
if exist release rmdir /s /q release
mkdir release
mkdir release\data

echo [build] copying assets
REM Rewrite the script path (dist/dist.js -> dist.js) using PowerShell.
powershell -NoProfile -Command "(Get-Content 'index.html' -Raw) -replace 'dist/dist\.js','dist.js' | Set-Content -Path 'release\index.html' -Encoding UTF8"
if errorlevel 1 goto :fail

copy /Y dist\dist.js release\dist.js > nul
if errorlevel 1 goto :fail

copy /Y data\maps.json release\data\maps.json > nul
if errorlevel 1 goto :fail

echo [build] done (release/ contains index.html + dist.js + data/maps.json)
exit /b 0

:fail
echo [build] FAILED.
exit /b 1
