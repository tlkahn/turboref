#!/usr/bin/env bash
set -euo pipefail

# TurboRef — build and install into an Obsidian vault
#
# Usage:
#   ./install.sh                          # uses default vault
#   ./install.sh /path/to/vault           # specify vault
#   VAULT=/path/to/vault ./install.sh     # via env var

DEFAULT_VAULT="$HOME/Documents/Ekuro"
VAULT="${1:-${VAULT:-$DEFAULT_VAULT}}"
PLUGIN_DIR="$VAULT/.obsidian/plugins/turboref"

if [ ! -d "$VAULT/.obsidian" ]; then
    echo "Error: $VAULT does not contain .obsidian/ — not a valid vault."
    exit 1
fi

echo "==> Building WASM (release)..."
wasm-pack build crates/wasm --target web --release

echo "==> Optimizing WASM binary..."
if command -v wasm-opt &>/dev/null; then
    wasm-opt -Oz crates/wasm/pkg/turboref_wasm_bg.wasm \
        -o crates/wasm/pkg/turboref_wasm_bg.wasm
    echo "    wasm-opt applied (-Oz)"
else
    echo "    wasm-opt not found, skipping (install binaryen for smaller binary)"
fi

echo "==> Building TypeScript..."
node esbuild.config.mjs production

echo "==> Installing to $PLUGIN_DIR"
mkdir -p "$PLUGIN_DIR"
cp main.js         "$PLUGIN_DIR/"
cp manifest.json   "$PLUGIN_DIR/"
cp styles.css      "$PLUGIN_DIR/"
cp crates/wasm/pkg/turboref_wasm_bg.wasm "$PLUGIN_DIR/"

WASM_SIZE=$(du -h "$PLUGIN_DIR/turboref_wasm_bg.wasm" | cut -f1)
JS_SIZE=$(du -h "$PLUGIN_DIR/main.js" | cut -f1)

echo ""
echo "==> Installed successfully!"
echo "    main.js              $JS_SIZE"
echo "    turboref_wasm_bg.wasm  $WASM_SIZE"
echo "    manifest.json"
echo "    styles.css"
echo ""
echo "    Restart Obsidian and enable TurboRef in Community Plugins."
