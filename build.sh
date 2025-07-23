#!/bin/bash

# This script builds the Marionette Companion extension for Chrome (MV3).

# --- Configuration ---
DIST_DIR="dist"
CHROME_DIR="$DIST_DIR/chrome"
SOURCE_FILES=(
  "background.js"
  "content.js"
  "injector.js"
  "popup.html"
  "popup.js"
  "browser-polyfill.js"
  "manifest.json"
  "rules.json"
)
ICON_DIR="icons"

# --- Main Build Logic ---

# 1. Clean up previous builds
echo "Cleaning up previous build directory..."
rm -rf "$DIST_DIR"
mkdir -p "$CHROME_DIR"

# 2. Copy all necessary source files
echo "Copying source files to $CHROME_DIR..."
for file in "${SOURCE_FILES[@]}"; do
  if [ -f "$file" ]; then
    cp "$file" "$CHROME_DIR/"
  else
    echo "Warning: Source file '$file' not found."
  fi
done

# 3. Copy the icons directory
if [ -d "$ICON_DIR" ]; then
  echo "Copying icons..."
  cp -R "$ICON_DIR" "$CHROME_DIR/"
else
  echo "Warning: Icon directory '$ICON_DIR' not found."
fi

# 4. Create a zip archive for distribution
echo "Creating zip archive..."
(cd "$CHROME_DIR" && zip -r ../marionette-chrome-mv3.zip .)

echo "Build complete."
echo "Unpacked extension ready in: $CHROME_DIR"
echo "Zipped extension ready at: $DIST_DIR/marionette-chrome-mv3.zip"
