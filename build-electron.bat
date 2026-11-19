@echo off
REM Electron Build Script for Resilient Research App (Windows)
REM Builds setup.exe for Windows
REM
REM Usage:
REM   build-electron.bat          # Build Windows installer
REM   build-electron.bat clean    # Clean previous builds

set VERSION=0.9.0
set PLATFORM=%1

echo ========================================
echo Resilient Research App - Electron Build
echo Version: %VERSION%
echo Platform: Windows
echo ========================================

REM Check if we're in the right directory
if not exist package.json (
    echo Error: Run this script from the project root directory
    exit /b 1
)

if "%PLATFORM%"=="clean" (
    echo Cleaning previous builds...
    if exist dist-electron rmdir /s /q dist-electron
    if exist .next rmdir /s /q .next
    echo Clean complete
    exit /b 0
)

REM Check for ImageMagick
where magick >nul 2>nul
if %errorlevel% neq 0 (
    where convert >nul 2>nul
    if %errorlevel% neq 0 (
        echo.
        echo WARNING: ImageMagick not found in PATH.
        echo Install it for icon generation:
        echo   choco install imagemagick
        echo.
        echo Continuing without icon generation (existing icons will be used)...
        echo.
    ) else (
        set MAGICK=convert
    )
) else (
    set MAGICK=magick
)

REM Generate icons
echo Generating icons...
if defined MAGICK (
    %MAGICK% electron\build\icon.svg -define icon:auto-resize=256,128,64,48,32,16 electron\build\icon.ico
    %MAGICK% electron\build\icon.svg -resize 512x512 electron\build\icon.png
    echo Icons generated successfully
) else (
    echo Skipping icon generation (ImageMagick not found)
)

REM Build Next.js
echo Building Next.js application...
npm run build
if %errorlevel% neq 0 (
    echo Next.js build failed!
    exit /b 1
)
echo Next.js build complete

REM Build Windows installer
echo Building Windows installer...
npm run dist:win
if %errorlevel% neq 0 (
    echo Windows build failed!
    exit /b 1
)

echo.
echo ========================================
echo Build complete!
echo ========================================
echo Output: dist-electron\Resilient-Research-App-Setup-%VERSION%.exe
dir dist-electron\*.exe 2>nul