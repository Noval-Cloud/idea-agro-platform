#!/usr/bin/env bash
# Runs oasdiff at the version the repository pins, downloaded once into .cache/.
set -euo pipefail
VERSION=1.34.1

root="$(cd "$(dirname "$0")/.." && pwd)"
bin="$root/.cache/oasdiff/$VERSION/oasdiff"
if [ ! -x "$bin" ]; then
  case "$(uname -s)-$(uname -m)" in
    Darwin-*) build=darwin_all ;;
    Linux-x86_64) build=linux_amd64 ;;
    Linux-aarch64 | Linux-arm64) build=linux_arm64 ;;
    *)
      echo "oasdiff has no release for $(uname -s) $(uname -m)" >&2
      exit 1
      ;;
  esac
  mkdir -p "$(dirname "$bin")"
  curl -fsSL "https://github.com/oasdiff/oasdiff/releases/download/v$VERSION/oasdiff_${VERSION}_$build.tar.gz" |
    tar -xz -C "$(dirname "$bin")" oasdiff
fi
exec "$bin" "$@"
