#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
echo "=============================================================="
echo " AI-TRADER one-click desktop launcher (attach-only)"
echo " Open MT5 and log in to the configured Demo account first."
echo "=============================================================="
PY_CMD=""
if command -v python3 >/dev/null 2>&1; then PY_CMD=python3; elif command -v python >/dev/null 2>&1; then PY_CMD=python; else echo "Python not found"; exit 1; fi
if ! "$PY_CMD" -c 'import MetaTrader5,fastapi,uvicorn,requests,pydantic' >/dev/null 2>&1; then
  "$PY_CMD" -m pip install MetaTrader5 fastapi uvicorn requests pydantic
fi
export PORT=18812
export CLOUD_APP_URL=http://127.0.0.1:3000
export MT5_BRIDGE_URL=http://127.0.0.1:18812
export MT5_ENABLE_PYTHON_CLI_FALLBACK=false
"$PY_CMD" mt5_desktop_bridge.py
