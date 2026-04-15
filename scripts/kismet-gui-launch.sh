#!/usr/bin/env bash
#
# Beginner-friendly launcher: optional Wi-Fi monitor mode, start Kismet, open browser.
# Intended for double-click from a .desktop file (Terminal=false) on Linux.
#
# Environment (optional):
#   KISMET_SRC_DIR      Clone root containing http_data/ (auto: cwd if http_data exists, else $HOME/kismet-enhanced/kismet)
#   KISMET_WIFI_INTERFACE  e.g. wlan0 (default: first Interface from `iw dev`)
#   KISMET_SKIP_MONITOR  set to 1 to skip putting the interface into monitor mode
#   KISMET_HTTP_URL     Browser URL (default: http://127.0.0.1:2501/)
#
set -euo pipefail

KISMET_HTTP_URL="${KISMET_HTTP_URL:-http://127.0.0.1:2501/}"

if [[ -z "${KISMET_SRC_DIR:-}" ]]; then
    if [[ -f "$(pwd)/http_data/index.html" ]]; then
        KISMET_SRC_DIR="$(pwd)"
    else
        KISMET_SRC_DIR="${HOME:-}/kismet-enhanced/kismet"
    fi
fi
export KISMET_SRC_DIR

zenity_err() {
    if command -v zenity &>/dev/null; then
        zenity --error --width=420 --text="$1" 2>/dev/null || true
    else
        printf '%s\n' "$1" >&2
    fi
}

# Re-run with graphical privilege escalation (no terminal needed for password on GNOME/KDE).
if [[ "${1:-}" != "--elevated" ]] && [[ "${EUID:-0}" -ne 0 ]]; then
    if command -v pkexec &>/dev/null; then
        exec pkexec env \
            DISPLAY="${DISPLAY:-}" \
            XAUTHORITY="${XAUTHORITY:-}" \
            HOME="${HOME:-}" \
            USER="${USER:-}" \
            PATH="${PATH:-}" \
            KISMET_SRC_DIR="${KISMET_SRC_DIR}" \
            KISMET_WIFI_INTERFACE="${KISMET_WIFI_INTERFACE:-}" \
            KISMET_SKIP_MONITOR="${KISMET_SKIP_MONITOR:-}" \
            KISMET_HTTP_URL="${KISMET_HTTP_URL}" \
            bash "$0" --elevated
    fi
    zenity_err "管理者権限が必要です。\npkexec が使えない場合は、ターミナルで次を実行してください:\n  sudo $0 --elevated"
    exit 1
fi

if [[ "${1:-}" == "--elevated" ]]; then
    shift
fi

if [[ ! -d "$KISMET_SRC_DIR" ]]; then
    zenity_err "Kismet のフォルダが見つかりません。\nKISMET_SRC_DIR を正しい clone 先に設定するか、README の clone 先に合わせてください。\n\n現在の値: $KISMET_SRC_DIR"
    exit 1
fi

if [[ "${KISMET_SKIP_MONITOR:-0}" != "1" ]]; then
    IFACE="${KISMET_WIFI_INTERFACE:-}"
    if [[ -z "$IFACE" ]] && command -v iw &>/dev/null; then
        IFACE="$(iw dev 2>/dev/null | awk '$1 == "Interface" { print $2; exit }')"
    fi
    if [[ -n "$IFACE" ]]; then
        if command -v rfkill &>/dev/null; then
            rfkill unblock wifi 2>/dev/null || true
        fi
        if ip link show "$IFACE" &>/dev/null; then
            ip link set "$IFACE" down 2>/dev/null || true
            if iw dev "$IFACE" set type monitor 2>/dev/null; then
                ip link set "$IFACE" up 2>/dev/null || true
            else
                ip link set "$IFACE" up 2>/dev/null || true
                zenity_err "インターフェース「${IFACE}」をモニターモードにできませんでした。\nドライバ・NetworkManager の状態を確認するか、KISMET_SKIP_MONITOR=1 でスキップできます。\n\nKismet はこのまま起動を試みます。"
            fi
        fi
    fi
fi

cd "$KISMET_SRC_DIR"

# Open browser shortly after Kismet starts binding the HTTP port.
(
    for ((i = 0; i < 40; i++)); do
        if command -v curl &>/dev/null; then
            if curl -fsS -o /dev/null --connect-timeout 1 "$KISMET_HTTP_URL" 2>/dev/null; then
                break
            fi
        elif command -v timeout &>/dev/null; then
            if timeout 1 bash -c "echo > /dev/tcp/127.0.0.1/2501" 2>/dev/null; then
                break
            fi
        else
            sleep 2
            break
        fi
        sleep 0.5
    done
    if command -v xdg-open &>/dev/null; then
        xdg-open "$KISMET_HTTP_URL" 2>/dev/null || true
    fi
) &

exec kismet
