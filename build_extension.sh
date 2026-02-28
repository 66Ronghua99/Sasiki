#!/bin/bash
#
# Build and copy the Chrome Extension to root directory
#
# Usage:
#   ./build_extension.sh          # Build production version
#   ./build_extension.sh --dev    # Build development version with watch mode
#

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Paths
EXTENSION_DIR="src/sasiki/browser/extension"
DIST_DIR="$EXTENSION_DIR/dist"
OUTPUT_DIR="extension"

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}  Sasiki Extension Build Script${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# Check if extension directory exists
if [ ! -d "$EXTENSION_DIR" ]; then
    echo -e "${RED}Error: Extension directory not found: $EXTENSION_DIR${NC}"
    exit 1
fi

# Install dependencies if node_modules doesn't exist
if [ ! -d "$EXTENSION_DIR/node_modules" ]; then
    echo -e "${YELLOW}Installing npm dependencies...${NC}"
    cd "$EXTENSION_DIR"
    npm install
    cd - > /dev/null
fi

# Build extension
cd "$EXTENSION_DIR"
if [ "$1" == "--dev" ] || [ "$1" == "-d" ]; then
    echo -e "${YELLOW}Building extension (development mode)...${NC}"
    npm run build:dev
else
    echo -e "${YELLOW}Building extension (production mode)...${NC}"
    npm run build
fi
cd - > /dev/null

# Check if build succeeded
if [ ! -d "$DIST_DIR" ]; then
    echo -e "${RED}Error: Build failed - dist directory not found${NC}"
    exit 1
fi

# Remove old extension directory
echo -e "${YELLOW}Cleaning old extension directory...${NC}"
rm -rf "$OUTPUT_DIR"

# Copy built extension to root
echo -e "${YELLOW}Copying extension to $OUTPUT_DIR/...${NC}"
cp -r "$DIST_DIR" "$OUTPUT_DIR"

# Copy manifest.json if not in dist
if [ ! -f "$OUTPUT_DIR/manifest.json" ] && [ -f "$EXTENSION_DIR/manifest.json" ]; then
    cp "$EXTENSION_DIR/manifest.json" "$OUTPUT_DIR/"
fi

# Verify
if [ -d "$OUTPUT_DIR" ]; then
    FILE_COUNT=$(find "$OUTPUT_DIR" -type f | wc -l)
    echo ""
    echo -e "${GREEN}✓ Extension built successfully!${NC}"
    echo -e "${GREEN}  Location: $OUTPUT_DIR/${NC}"
    echo -e "${GREEN}  Files: $FILE_COUNT${NC}"
    echo ""
    echo -e "${BLUE}Load the extension in Chrome:${NC}"
    echo "  1. Open chrome://extensions/"
    echo "  2. Enable 'Developer mode'"
    echo "  3. Click 'Load unpacked'"
    echo "  4. Select the '$OUTPUT_DIR' folder"
    echo ""
    echo -e "${BLUE}To start recording:${NC}"
    echo "  1. Start WebSocket server: ${YELLOW}sasiki server start${NC}"
    echo "  2. Start recording:        ${YELLOW}sasiki record --name my-task${NC}"
    echo ""
else
    echo -e "${RED}Error: Failed to copy extension${NC}"
    exit 1
fi
