#!/bin/bash

# Electron Build Script for Resilient Research App
# Builds setup.exe for Windows, .dmg for macOS, and AppImage/.deb for Linux
#
# Usage:
#   ./build-electron.sh          # Build for current platform
#   ./build-electron.sh win      # Build Windows installer
#   ./build-electron.sh mac      # Build macOS DMG
#   ./build-electron.sh linux    # Build Linux packages
#   ./build-electron.sh all      # Build all platforms (requires appropriate OS)

set -e

VERSION=$(node -p "require('./package.json').version")
PLATFORM="${1:-auto}"

echo "========================================"
echo "Resilient Research App - Electron Build"
echo "Version: $VERSION"
echo "Platform: $PLATFORM"
echo "========================================"

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    echo "Error: Run this script from the project root directory"
    exit 1
fi

# Function to generate icons
generate_icons() {
    echo "Generating icons..."
    
    if command -v magick &> /dev/null; then
        echo "Using ImageMagick (magick)..."
        magick electron/build/icon.svg -define icon:auto-resize=256,128,64,48,32,16 electron/build/icon.ico
        magick electron/build/icon.svg -resize 512x512 electron/build/icon.png
        echo "✓ Windows .ico and Linux .png generated"
    elif command -v convert &> /dev/null; then
        echo "Using ImageMagick (convert)..."
        convert electron/build/icon.svg -define icon:auto-resize=256,128,64,48,32,16 electron/build/icon.ico
        convert electron/build/icon.svg -resize 512x512 electron/build/icon.png
        echo "✓ Windows .ico and Linux .png generated"
    else
        echo "⚠ ImageMagick not found. Install it for icon generation:"
        echo "  Windows: choco install imagemagick"
        echo "  macOS: brew install imagemagick"
        echo "  Linux: sudo apt-get install imagemagick"
        echo ""
        echo "Or manually convert electron/build/icon.svg to:"
        echo "  - electron/build/icon.ico (256,128,64,48,32,16)"
        echo "  - electron/build/icon.png (512x512)"
        echo "  - electron/build/icon.icns (macOS only, use iconutil)"
    fi
    
    # macOS icns generation
    if [[ "$OSTYPE" == "darwin"* ]] && command -v iconutil &> /dev/null; then
        echo "Generating macOS .icns..."
        mkdir -p electron/build/icon.iconset
        for size in 16 32 64 128 256 512 1024; do
            magick electron/build/icon.svg -resize ${size}x${size} electron/build/icon.iconset/icon_${size}x${size}.png
            magick electron/build/icon.svg -resize $((size*2))x$((size*2)) electron/build/icon.iconset/icon_${size}x${size}@2x.png
        done
        iconutil -c icns electron/build/icon.iconset -o electron/build/icon.icns
        echo "✓ macOS .icns generated"
    fi
}

# Build Next.js first
build_nextjs() {
    echo "Building Next.js application..."
    npm run build
    echo "✓ Next.js build complete"
}

# Build for Windows
build_windows() {
    echo "Building Windows installer..."
    generate_icons
    build_nextjs
    npm run dist:win
    echo "✓ Windows build complete"
    echo "Output: dist-electron/Resilient-Research-App-Setup-${VERSION}.exe"
}

# Build for macOS
build_macos() {
    if [[ "$OSTYPE" != "darwin"* ]]; then
        echo "⚠ macOS build can only run on macOS"
        return 1
    fi
    echo "Building macOS DMG..."
    generate_icons
    build_nextjs
    npm run dist:mac
    echo "✓ macOS build complete"
    echo "Output: dist-electron/Resilient-Research-App-${VERSION}.dmg"
}

# Build for Linux
build_linux() {
    if [[ "$OSTYPE" != "linux-gnu"* ]]; then
        echo "⚠ Linux build recommended on Linux (but may work on other platforms with Docker)"
    fi
    echo "Building Linux packages..."
    generate_icons
    build_nextjs
    npm run dist:linux
    echo "✓ Linux build complete"
    echo "Output: dist-electron/Resilient-Research-App-${VERSION}.AppImage"
    echo "Output: dist-electron/Resilient-Research-App-${VERSION}.deb"
}

# Main logic
case "$PLATFORM" in
    win|windows)
        build_windows
        ;;
    mac|macos|darwin)
        build_macos
        ;;
    linux)
        build_linux
        ;;
    all)
        echo "Building all platforms..."
        if [[ "$OSTYPE" == "darwin"* ]]; then
            build_macos
        fi
        if [[ "$OSTYPE" == "linux-gnu"* ]] || command -v docker &> /dev/null; then
            build_linux
        fi
        if [[ "$OSTYPE" == "msys" ]] || [[ "$OSTYPE" == "cygwin" ]] || command -v docker &> /dev/null; then
            build_windows
        fi
        ;;
    auto|*)
        echo "Auto-detecting platform..."
        case "$OSTYPE" in
            darwin*)
                build_macos
                ;;
            linux-gnu*)
                build_linux
                ;;
            msys*|cygwin*)
                build_windows
                ;;
            *)
                echo "Unknown platform: $OSTYPE"
                echo "Specify platform: win, mac, linux, or all"
                exit 1
                ;;
        esac
        ;;
esac

echo ""
echo "========================================"
echo "Build complete!"
echo "========================================"
echo "Artifacts in: dist-electron/"
ls -la dist-electron/ 2>/dev/null || echo "No artifacts found"