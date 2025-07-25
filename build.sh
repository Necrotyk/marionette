#!/bin/bash

# This script builds the Marionette Companion extension for Chrome (MV3) and Firefox (MV2).

# --- Configuration ---
DIST_DIR="dist"
SOURCE_FILES=(
  "background.js"
  "content.js"
  "injector.js"
  "popup.html"
  "popup.js"
  "script.js"
  "style.css"
  "manifest.json"
)
FIREFOX_ONLY_FILES=(
  "browser-polyfill.js"
)
ICON_DIR="icons"

# --- Functions ---

# Function to print usage
usage() {
  echo "Usage: $0 -b <chrome|firefox|all>"
  echo "  -b: Specify the browser to build for (chrome, firefox, or all)."
  exit 1
}

# Function to build the extension for a specific browser
build_for_browser() {
  local browser=$1
  local build_dir="$DIST_DIR/$browser"

  echo "--------------------------------------------------"
  echo "Building for $browser..."
  echo "--------------------------------------------------"

  # 1. Clean up and create directory
  echo "Creating build directory: $build_dir"
  mkdir -p "$build_dir"

  # 2. Copy common source files
  echo "Copying common source files..."
  for file in "${SOURCE_FILES[@]}"; do
    if [ -f "$file" ]; then
      cp "$file" "$build_dir/"
    else
      echo "Warning: Source file '$file' not found."
    fi
  done

  # 3. Copy icons
  if [ -d "$ICON_DIR" ]; then
    echo "Copying icons..."
    cp -R "$ICON_DIR" "$build_dir/"
  else
    echo "Warning: Icon directory '$ICON_DIR' not found."
  fi

  # 4. Process manifest and copy browser-specific files
  local manifest_path="$build_dir/manifest.json"
  if [ "$browser" == "firefox" ]; then
    echo "Transforming manifest.json for Firefox (MV2)..."
    # Use a temporary file for sed on systems that don't support -i ''
    tmp_manifest=$(mktemp)
    
    # Convert to MV2, change service_worker to background scripts, adjust permissions
    sed -e 's/"manifest_version": 3/"manifest_version": 2/' \
        -e 's/"service_worker": "background.js"/"scripts": ["browser-polyfill.js", "background.js"]/' \
        -e 's/"action"/"browser_action"/' \
        -e '/"host_permissions"/d' \
        -e 's/"storage",/"storage",\n    "<all_urls>",/' \
        "$manifest_path" > "$tmp_manifest"
    mv "$tmp_manifest" "$manifest_path"

    echo "Copying Firefox-specific files..."
    for file in "${FIREFOX_ONLY_FILES[@]}"; do
      if [ -f "$file" ]; then
        cp "$file" "$build_dir/"
      else
        echo "Error: Required Firefox file '$file' not found."
        exit 1
      fi
    done

  elif [ "$browser" == "chrome" ]; then
    echo "Using manifest.json for Chrome (MV3)..."
    # No changes needed for Chrome MV3 manifest if it's the default
  fi

  # 5. Create zip archive
  echo "Creating zip archive for $browser..."
  (cd "$build_dir" && zip -q -r "../marionette-$browser.zip" .)

  echo "Build for $browser complete."
  echo "Unpacked extension ready in: $build_dir"
  echo "Zipped extension ready at: $DIST_DIR/marionette-$browser.zip"
}


# --- Main Logic ---

# Check for arguments
if [ "$#" -eq 0 ]; then
  usage
fi

# Parse options
while getopts ":b:" opt; do
  case ${opt} in
    b )
      TARGET_BROWSER=$OPTARG
      ;;
    \? )
      usage
      ;;
    : )
      echo "Invalid option: $OPTARG requires an argument" 1>&2
      usage
      ;;
  esac
done

# 1. Clean up previous builds
echo "Cleaning up previous build directory..."
rm -rf "$DIST_DIR"
mkdir -p "$DIST_DIR"

# 2. Build for the specified target
case $TARGET_BROWSER in
  "chrome")
    build_for_browser "chrome"
    ;;
  "firefox")
    build_for_browser "firefox"
    ;;
  "all")
    build_for_browser "chrome"
    build_for_browser "firefox"
    ;;
  *)
    echo "Error: Invalid browser specified. Use 'chrome', 'firefox', or 'all'."
    usage
    ;;
esac

echo "--------------------------------------------------"
echo "All builds finished."
echo "--------------------------------------------------"
