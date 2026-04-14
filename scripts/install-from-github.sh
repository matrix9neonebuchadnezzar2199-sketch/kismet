#!/usr/bin/env bash
# Install or update this fork from GitHub: clone/pull, (optional) apt deps, configure, make, make install.
# Usage:
#   ./scripts/install-from-github.sh
#   ./scripts/install-from-github.sh /path/to/kismet --with-deps
#   curl -fsSL .../install-from-github.sh | bash -s -- --with-deps
#
# Environment:
#   KISMET_GIT_URL  Override repository (default: this fork on GitHub).
#   KISMET_PREFIX   Passed to ./configure --prefix=... (default: /usr/local).

set -euo pipefail

DEFAULT_REPO="https://github.com/matrix9neonebuchadnezzar2199-sketch/kismet.git"
REPO="${KISMET_GIT_URL:-$DEFAULT_REPO}"
PREFIX="${KISMET_PREFIX:-/usr/local}"

TARGET=""
WITH_DEPS=0
RECONFIGURE=0

usage() {
    echo "Usage: $0 [TARGET_DIR] [--with-deps] [--reconfigure]"
    echo "  TARGET_DIR     Clone directory (default: \$HOME/kismet-enhanced/kismet)"
    echo "  --with-deps    On Debian/Ubuntu/Kali: sudo apt-get install build dependencies"
    echo "  --reconfigure  Run ./configure even if Makefile exists"
    exit "${1:-0}"
}

while [[ $# -gt 0 ]]; do
    case "$1" in
        -h|--help) usage 0 ;;
        --with-deps) WITH_DEPS=1; shift ;;
        --reconfigure) RECONFIGURE=1; shift ;;
        *)
            if [[ -z "$TARGET" && "$1" != -* ]]; then
                TARGET="$1"
            else
                echo "Unknown option: $1" >&2
                usage 1
            fi
            shift
            ;;
    esac
done

TARGET="${TARGET:-$HOME/kismet-enhanced/kismet}"

install_apt_deps() {
    if ! command -v apt-get >/dev/null 2>&1; then
        echo "apt-get not found; install build dependencies manually (see README.md)." >&2
        return 0
    fi
    echo "[install-from-github] Installing build dependencies via apt (sudo required)..."
    # Baseline aligned with Kismet docs; optional drivers may add more packages.
    sudo apt-get update
    sudo apt-get install -y --no-install-recommends \
        build-essential git pkg-config \
        libwebsockets-dev zlib1g-dev \
        libnl-3-dev libnl-genl-3-dev libcap-dev \
        libpcap-dev libnm-dev libdw-dev libsqlite3-dev \
        libprotobuf-dev protobuf-compiler libprotobuf-c-dev protobuf-c-compiler \
        libsensors-dev libusb-1.0-0-dev \
        libbluetooth-dev libcurl4-openssl-dev libssl-dev \
        libpcre3-dev \
        python3 python3-dev python3-setuptools \
        librtlsdr-dev \
        libmosquitto-dev \
        flex bison
}

if [[ "$WITH_DEPS" -eq 1 ]]; then
    install_apt_deps
fi

mkdir -p "$(dirname "$TARGET")"

if [[ -d "$TARGET/.git" ]]; then
    echo "[install-from-github] Updating existing clone: $TARGET"
    git -C "$TARGET" fetch origin
    if git -C "$TARGET" rev-parse --verify origin/master >/dev/null 2>&1; then
        git -C "$TARGET" pull --ff-only origin master
    else
        git -C "$TARGET" pull --ff-only
    fi
else
    echo "[install-from-github] Cloning $REPO -> $TARGET"
    git clone "$REPO" "$TARGET"
fi

cd "$TARGET"

if [[ ! -x ./configure ]]; then
    echo "[install-from-github] ./configure missing; this tree may be incomplete." >&2
    exit 1
fi

if [[ ! -f Makefile ]] || [[ "$RECONFIGURE" -eq 1 ]]; then
    echo "[install-from-github] Running ./configure --prefix=$PREFIX"
    ./configure --prefix="$PREFIX"
fi

echo "[install-from-github] Building (make -j)..."
make -j"$(getconf _NPROCESSORS_ONLN 2>/dev/null || echo 4)"

echo "[install-from-github] Installing (sudo make install)..."
sudo make install

echo
echo "[install-from-github] Done. Web UI files are under: $PREFIX/share/kismet/httpd/"
echo "[install-from-github] Restart Kismet so the browser loads the new UI."
echo "[install-from-github] If the build failed on missing headers, re-run with: $0 $TARGET --with-deps"
