#
# Build and copy the Chrome Extension to root directory (PowerShell)
#
# Usage:
#   .\build_extension.ps1         # Build production version
#   .\build_extension.ps1 -Dev    # Build development version
#

param(
    [switch]$Dev
)

# Paths
$ExtensionDir = "src\sasiki\browser\extension"
$DistDir = "$ExtensionDir\dist"
$OutputDir = "extension"

Write-Host "========================================" -ForegroundColor Blue
Write-Host "  Sasiki Extension Build Script" -ForegroundColor Blue
Write-Host "========================================" -ForegroundColor Blue
Write-Host ""

# Check if extension directory exists
if (-not (Test-Path $ExtensionDir)) {
    Write-Host "Error: Extension directory not found: $ExtensionDir" -ForegroundColor Red
    exit 1
}

# Install dependencies if node_modules doesn't exist
if (-not (Test-Path "$ExtensionDir\node_modules")) {
    Write-Host "Installing npm dependencies..." -ForegroundColor Yellow
    Push-Location $ExtensionDir
    npm install
    Pop-Location
}

# Build extension
Push-Location $ExtensionDir
if ($Dev) {
    Write-Host "Building extension (development mode)..." -ForegroundColor Yellow
    npm run build:dev
} else {
    Write-Host "Building extension (production mode)..." -ForegroundColor Yellow
    npm run build
}
Pop-Location

# Check if build succeeded
if (-not (Test-Path $DistDir)) {
    Write-Host "Error: Build failed - dist directory not found" -ForegroundColor Red
    exit 1
}

# Remove old extension directory
Write-Host "Cleaning old extension directory..." -ForegroundColor Yellow
if (Test-Path $OutputDir) {
    Remove-Item -Recurse -Force $OutputDir
}

# Copy built extension to root
Write-Host "Copying extension to $OutputDir\..." -ForegroundColor Yellow
Copy-Item -Recurse $DistDir $OutputDir

# Copy manifest.json if not in dist
if ((-not (Test-Path "$OutputDir\manifest.json")) -and (Test-Path "$ExtensionDir\manifest.json")) {
    Copy-Item "$ExtensionDir\manifest.json" $OutputDir\
}

# Verify
if (Test-Path $OutputDir) {
    $FileCount = (Get-ChildItem -Recurse -File $OutputDir).Count
    Write-Host ""
    Write-Host "✓ Extension built successfully!" -ForegroundColor Green
    Write-Host "  Location: $OutputDir\" -ForegroundColor Green
    Write-Host "  Files: $FileCount" -ForegroundColor Green
    Write-Host ""
    Write-Host "Load the extension in Chrome:" -ForegroundColor Blue
    Write-Host "  1. Open chrome://extensions/"
    Write-Host "  2. Enable 'Developer mode'"
    Write-Host "  3. Click 'Load unpacked'"
    Write-Host "  4. Select the '$OutputDir' folder"
    Write-Host ""
    Write-Host "To start recording:" -ForegroundColor Blue
    Write-Host "  1. Start WebSocket server: " -NoNewline
    Write-Host "sasiki server start" -ForegroundColor Yellow
    Write-Host "  2. Start recording:        " -NoNewline
    Write-Host "sasiki record --name my-task" -ForegroundColor Yellow
    Write-Host ""
} else {
    Write-Host "Error: Failed to copy extension" -ForegroundColor Red
    exit 1
}
