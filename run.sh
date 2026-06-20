#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

need() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Fehler: $1 nicht gefunden. Bitte installieren und erneut versuchen." >&2
    exit 1
  fi
}

need node
need npm

if [ ! -d node_modules ]; then
  echo "→ npm install …"
  npm install
fi

if [ ! -d wasm-stl/pkg ]; then
  need rustc
  need wasm-pack
  echo "→ WASM bauen …"
  npm run build:wasm
fi

echo "→ Dev-Server starten (http://localhost:5173/)"
exec npm run dev