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
  "rules.json"
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
    # --- FIX: Use jq for robust JSON transformation ---
    if ! command -v jq &> /dev/null; then
        echo "Error: jq is not installed. Please install jq to build for Firefox."
        echo "On Debian/Ubuntu: sudo apt install jq"
        exit 1
    fi

    echo "Transforming manifest.json for Firefox (MV2) using jq..."
    tmp_manifest=$(mktemp)

    # This jq script robustly converts an MV3 manifest to a valid MV2 manifest.
    jq '
      .manifest_version = 2 |
      # Convert background service_worker to background scripts
      .background = { "scripts": ["browser-polyfill.js", .background.service_worker] } |
      # Convert action to browser_action
      .browser_action = .action | del(.action) |
      # Merge host_permissions into permissions for MV2
      .permissions = (.permissions + .host_permissions | unique) |
      # FIX: Convert invalid MV3 URL match patterns to valid MV2 patterns
      .permissions |= map(if type == "string" then gsub(":\\*\\/"; "/") | gsub(":\\*\\/\\*"; "/*") else . end) |
      .content_scripts[].matches |= map(gsub(":\\*\\/\\*"; "/*")) |
      # Clean up
      del(.host_permissions) |
      # Remove MV3-only permissions and keys that are invalid in MV2
      .permissions -= ["declarativeNetRequest", "scripting"] |
      del(.declarative_net_request) |
      # Convert web_accessible_resources to the flat array format for MV2
      .web_accessible_resources = .web_accessible_resources[0].resources
    ' "$manifest_path" > "$tmp_manifest"

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
