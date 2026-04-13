#!/usr/bin/env python3
"""
Write Cursor-repo kismet_ui_signal_monitor.js to Kismet httpd (requires root).

Usage on Kali:
  cp kismet_ui_signal_monitor.b64 install_signal_monitor_kali.py /tmp/
  sudo python3 /tmp/install_signal_monitor_kali.py

Or from repo tools/:
  sudo python3 install_signal_monitor_kali.py

Optional:
  sudo python3 install_signal_monitor_kali.py --target /usr/local/share/kismet/httpd/js/kismet_ui_signal_monitor.js
"""
from __future__ import annotations

import argparse
import base64
import pathlib
import sys

DEFAULT_TARGET = pathlib.Path("/usr/local/share/kismet/httpd/js/kismet_ui_signal_monitor.js")


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument(
        "--target",
        type=pathlib.Path,
        default=DEFAULT_TARGET,
        help=f"Output file (default: {DEFAULT_TARGET})",
    )
    p.add_argument(
        "--b64",
        type=pathlib.Path,
        default=None,
        help="Path to kismet_ui_signal_monitor.b64 (default: next to this script)",
    )
    args = p.parse_args()

    here = pathlib.Path(__file__).resolve().parent
    b64_path = args.b64 or (here / "kismet_ui_signal_monitor.b64")
    if not b64_path.is_file():
        print(f"ERROR: Base64 payload not found: {b64_path}", file=sys.stderr)
        return 1

    raw = base64.b64decode(b64_path.read_text(encoding="ascii").strip())
    args.target.write_bytes(raw)
    print(f"Wrote {len(raw)} bytes -> {args.target}")
    print("Verify:")
    print(f'  grep -c "normalizeMac" {args.target}')
    print(f'  grep -c "maintainAspectRatio" {args.target}')
    print(f'  grep -c "function connectWs" {args.target}')
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
