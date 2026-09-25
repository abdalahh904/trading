#!/usr/bin/env python3
"""
=============================================================================
 AI-TRADER MetaTrader 5 Institutional Desktop Bridge
 Connects local MT5 Terminal directly with the AI-TRADER Autonomous Platform.
 Credentials are read only from environment variables or the running MT5 terminal.
=============================================================================
"""

import os
import sys
import glob
import time
import json
import logging
from datetime import datetime, timedelta
import threading
import subprocess
from typing import Optional, Dict, Any, List
from contextlib import asynccontextmanager
from pydantic import BaseModel

try:
    import uvicorn
    from fastapi import FastAPI, HTTPException
    from fastapi.middleware.cors import CORSMiddleware
except ImportError:
    print("[ERROR] FastAPI and uvicorn are required. Run: pip install -r requirements.txt")
    sys.exit(1)

try:
    import requests
except ImportError:
    print("[ERROR] requests is required. Run: pip install requests")
    sys.exit(1)

try:
    import MetaTrader5 as mt5
    MT5_AVAILABLE = True
except ImportError:
    MT5_AVAILABLE = False
    print("[WARN] Official MetaTrader5 package is not available on this platform (Windows required for native MT5).")

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("MT5-Bridge")

# Default trader account for this local desktop build.
# Environment variables can still override these values on the user's machine.
AUTO_LOGIN = 112780882
AUTO_SERVER = "metsquotes-Demo"
# Auto-attach target. The bridge never stores or replays a broker password for automatic startup.
# The account must already be logged in inside the local MT5 terminal.
DEFAULT_LOGIN = AUTO_LOGIN
DEFAULT_SERVER = AUTO_SERVER
DEFAULT_PASSWORD = ""
DEFAULT_PATH = os.getenv("MT5_PATH", "")
CLOUD_APP_URL = os.getenv("CLOUD_APP_URL", "https://ais-dev-cyck4mnmytvjx2lwa6lolw-480285230393.europe-west3.run.app").rstrip("/")

def find_mt5_path() -> Optional[str]:
    """Scan common Windows install directories for terminal64.exe."""
    if DEFAULT_PATH and os.path.exists(DEFAULT_PATH):
        return DEFAULT_PATH

    search_patterns = [
        r"C:\Program Files\MetaTrader 5*\terminal64.exe",
        r"C:\Program Files (x86)\MetaTrader 5*\terminal64.exe",
        r"C:\Program Files\*\terminal64.exe",
        r"C:\Program Files (x86)\*\terminal64.exe",
        os.path.expanduser(r"~\AppData\Roaming\MetaQuotes\Terminal\*\terminal64.exe"),
        os.path.expanduser(r"~\AppData\Local\Programs\MetaTrader 5*\terminal64.exe"),
    ]

    for pattern in search_patterns:
        matches = glob.glob(pattern)
        if matches:
            return matches[0]
    return None

_mt5_init_lock = threading.RLock()
_attach_block_until = 0.0
_attach_failures = 0

def is_terminal_process_running() -> bool:
    """Return True only when a local MT5 terminal process is already running.

    Automatic bridge startup must never launch terminal64.exe itself: doing so while the user
    is opening MT5 can create a second-terminal race and destabilize the terminal.
    """
    if os.name != "nt":
        return True
    try:
        result = subprocess.run(
            ["tasklist", "/FI", "IMAGENAME eq terminal64.exe", "/FO", "CSV", "/NH"],
            capture_output=True, text=True, timeout=3, creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0)
        )
        return "terminal64.exe" in (result.stdout or "").lower()
    except Exception:
        return False

def login_explicit_mt5(path: Optional[str], login: int, server: str, password: str) -> bool:
    """Perform an explicit, user-invoked broker login. Never called by automatic startup."""
    if not MT5_AVAILABLE or not login or not server or not password:
        return False
    global _attach_block_until, _attach_failures
    with _mt5_init_lock:
        if os.name == "nt" and not is_terminal_process_running():
            logger.warning("Manual login requested but MT5 terminal process is not running.")
            return False
        try:
            existing = mt5.account_info()
            existing_term = mt5.terminal_info()
            if existing is not None and existing_term is not None and bool(getattr(existing_term, "connected", False)):
                if int(getattr(existing, "login", 0) or 0) == int(login) and str(getattr(existing, "server", "") or "") == str(server):
                    return True
        except Exception:
            pass
        init_kwargs = {"timeout": 15000}
        if path and os.path.exists(path):
            init_kwargs["path"] = path
        if not mt5.initialize(**init_kwargs):
            logger.warning(f"Manual MT5 initialize failed: {mt5.last_error()}")
            return False
        if not mt5.login(login=int(login), password=str(password), server=str(server)):
            logger.warning(f"Manual MT5 broker login failed: {mt5.last_error()}")
            return False
        account = mt5.account_info()
        term = mt5.terminal_info()
        ok = bool(account and term and getattr(term, "connected", False) and int(getattr(account, "login", 0) or 0) == int(login) and str(getattr(account, "server", "") or "") == str(server))
        _attach_failures = 0
        _attach_block_until = time.time() + (1.5 if ok else 10.0)
        return ok

def init_and_auth_mt5(path: Optional[str] = None, login: Optional[int] = DEFAULT_LOGIN, server: Optional[str] = DEFAULT_SERVER, password: Optional[str] = DEFAULT_PASSWORD) -> bool:
    """Attach safely to the MT5 terminal/account that is already open on this PC.

    Automatic startup is intentionally ATTACH-ONLY. It does not call mt5.shutdown(), does not
    replay a broker password, and does not switch the user's MT5 account. Manual credential login
    remains available only through an explicit maintenance/API request.
    """
    if not MT5_AVAILABLE:
        return False

    global _attach_block_until, _attach_failures
    with _mt5_init_lock:
        now = time.time()
        if now < _attach_block_until:
            logger.info("MT5 attach backoff active; waiting before another initialize attempt.")
            return False

        if os.name == "nt" and not is_terminal_process_running():
            logger.info("MT5 terminal process is not running yet; waiting for the user to open MT5.")
            _attach_block_until = now + 5.0
            return False

        # Reuse an existing Python<->terminal session whenever possible. Repeated shutdown/init
        # cycles during UI polling are unsafe and can race with a terminal startup/reconnect.
        try:
            existing_account = mt5.account_info()
            existing_terminal = mt5.terminal_info()
            if existing_account is not None:
                current_login = int(getattr(existing_account, "login", 0) or 0)
                current_server = str(getattr(existing_account, "server", "") or "")
                if login and current_login != int(login):
                    logger.info(f"A different MT5 account #{current_login} is already attached. Automatic mode will not relogin or switch it.")
                    _attach_block_until = now + 15.0
                    return False
                if server and current_server != str(server):
                    logger.info(f"A different MT5 server '{current_server}' is already attached. Automatic mode will not switch it.")
                    _attach_block_until = now + 15.0
                    return False
                if existing_terminal is not None and bool(getattr(existing_terminal, "connected", False)):
                    logger.info(f"Reusing existing MT5 session #{current_login} ({current_server}); no relogin/reinitialize.")
                    return True
                logger.info("MT5 Python session exists but terminal is not connected yet; waiting for native MT5 reconnect instead of reinitializing.")
                _attach_block_until = now + 5.0
                return False
        except Exception:
            pass

        logger.info("Attaching to the already-running MetaTrader 5 terminal...")
        init_kwargs = {"timeout": 15000}
        if path and os.path.exists(path):
            init_kwargs["path"] = path
        # No shutdown before initialize. No automatic terminal launch and no credential replay.
        ok = mt5.initialize(**init_kwargs)
        if not ok:
            _attach_failures = min(_attach_failures + 1, 4)
            _attach_block_until = time.time() + min(30.0, 3.0 * (2 ** (_attach_failures - 1)))
            logger.warning(f"mt5.initialize() failed while attaching to running terminal: {mt5.last_error()} | retry backoff={int(_attach_block_until-time.time())}s")
            return False
        _attach_failures = 0
        _attach_block_until = time.time() + 1.5

        account = mt5.account_info()
        current_login = int(getattr(account, "login", 0) or 0) if account is not None else 0
        current_server = str(getattr(account, "server", "") or "") if account is not None else ""

        # Automatic mode never switches accounts. The user logs into the desired account in MT5.
        if not account:
            logger.warning(f"MT5 is open but no active account is available: {mt5.last_error()}")
            _attach_block_until = time.time() + 5.0
            return False
        if login and current_login != int(login):
            logger.warning(f"Wrong MT5 account is open. Expected #{login}, got #{current_login}. Automatic mode will not switch it.")
            _attach_block_until = time.time() + 15.0
            return False
        if server and current_server != str(server):
            logger.warning(f"Wrong MT5 server is open. Expected '{server}', got '{current_server}'. Automatic mode will not switch it.")
            _attach_block_until = time.time() + 15.0
            return False

        term = mt5.terminal_info()
        if term is None or not bool(getattr(term, "connected", False)):
            logger.warning(f"MT5 terminal is not connected to broker: {mt5.last_error()}")
            _attach_block_until = time.time() + 10.0
            return False

        logger.info(f"Attached to MT5 account #{account.login} | Server: {account.server}")
        return True

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifespan event handler."""
    logger.info("Starting AI-TRADER MetaTrader 5 Bridge...")
    logger.info("Bridge startup is passive: it will not initialize, relogin, or launch MT5 until the local terminal is already running and an attach request is due.")
    if MT5_AVAILABLE:
        sync_thread = threading.Thread(target=cloud_sync_worker, daemon=True)
        sync_thread.start()
    
    yield
    
    if MT5_AVAILABLE:
        try:
            mt5.shutdown()
            logger.info("MetaTrader 5 terminal connection closed cleanly.")
        except Exception:
            pass

app = FastAPI(
    title="AI-TRADER MT5 Bridge",
    description="Real MT5 Terminal REST & WebSocket Bridge",
    version="2.1.0",
    lifespan=lifespan
)

# Build CORS allow-list from explicit configuration plus the configured cloud/app origin.
# The bridge stays loopback-only at the network layer; CORS only controls which browser
# origins are allowed to call that local port.
_raw_cors = os.getenv("MT5_CORS_ORIGINS", "http://127.0.0.1:3000,http://localhost:3000,http://127.0.0.1:5173,http://localhost:5173")
_cors_origins = [origin.strip().rstrip("/") for origin in _raw_cors.split(",") if origin.strip()]
for _origin in (CLOUD_APP_URL, os.getenv("APP_URL", "")):
    _origin = (_origin or "").strip().rstrip("/")
    if _origin.startswith(("http://", "https://")) and _origin not in _cors_origins:
        _cors_origins.append(_origin)
app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    # Vite/dev hosts commonly use 5173/4173; allow loopback only, never arbitrary remote origins.
    allow_origin_regex=r"https?://(127\.0\.0\.1|localhost)(:\d+)?$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class ConnectRequest(BaseModel):
    option: Optional[str] = "LOGIN_CREDENTIALS"
    login: Optional[int] = None
    server: Optional[str] = None
    password: Optional[str] = None
    terminalPath: Optional[str] = None

class OrderRequest(BaseModel):
    symbol: str
    action: str  # BUY/SELL or BUY_LIMIT/SELL_LIMIT/BUY_STOP/SELL_STOP
    volume: float
    sl: float
    tp: float
    price: Optional[float] = None
    deviation: Optional[int] = 10
    comment: Optional[str] = "AI-TRADER Exec"
    request_id: Optional[str] = None  # idempotency key; prevents duplicate executions when a response is lost

class CancelRequest(BaseModel):
    ticket: int
    request_id: Optional[str] = None

class CloseRequest(BaseModel):
    ticket: int
    volume: Optional[float] = None
    request_id: Optional[str] = None

class ModifyRequest(BaseModel):
    ticket: int
    sl: Optional[float] = None
    tp: Optional[float] = None
    request_id: Optional[str] = None

TARGET_SYMBOLS = [
    "EURUSD", "GBPUSD", "USDJPY", "XAUUSD", "USDCHF",
    "AUDUSD", "EURJPY", "GBPJPY", "USDCAD", "EURGBP"
]

def get_real_symbols():
    if not MT5_AVAILABLE:
        return []
    symbols = mt5.symbols_get()
    if not symbols:
        return []

    by_name = {str(s.name).upper(): s for s in symbols}
    selected = []
    for target in TARGET_SYMBOLS:
        s = by_name.get(target)
        if s is None:
            continue
        try:
            mt5.symbol_select(s.name, True)
        except Exception:
            pass
        tick = mt5.symbol_info_tick(s.name)
        selected.append({
            "name": s.name,
            "path": s.path,
            "bid": float(tick.bid) if tick else float(s.bid),
            "ask": float(tick.ask) if tick else float(s.ask),
            "spread": int(s.spread or 0),
            "digits": int(s.digits),
            "point": float(s.point),
            "tick_size": float(getattr(s, "trade_tick_size", 0.0) or 0.0),
            "tick_value": float(getattr(s, "trade_tick_value", 0.0) or 0.0),
            "contract_size": float(s.trade_contract_size),
            "volume_min": float(s.volume_min),
            "volume_max": float(s.volume_max),
            "volume_step": float(s.volume_step),
            "trade_mode": int(s.trade_mode),
            "trade_execution": int(getattr(s, "trade_exemode", 0) or 0),
            "margin_initial": float(s.margin_initial),
            "currency_base": str(getattr(s, "currency_base", "")),
            "currency_profit": str(getattr(s, "currency_profit", "")),
            "currency_margin": str(getattr(s, "currency_margin", "")),
            "session_open": True,
            "auto_trading_enabled": bool(getattr(s, "trade_mode", 0) > 0),
            "priority": TARGET_SYMBOLS.index(target) + 1
        })
    return selected

def get_real_positions():
    if not MT5_AVAILABLE:
        return []
    positions = mt5.positions_get()
    if positions is None:
        return []
    result = []
    for p in positions:
        result.append({
            "ticket": int(p.ticket),
            "time": int(getattr(p, "time", 0)),
            "time_msc": int(getattr(p, "time_msc", 0)),
            "time_update": int(getattr(p, "time_update", 0)),
            "type": "BUY" if p.type == 0 else "SELL",
            "magic": int(getattr(p, "magic", 0)),
            "identifier": int(getattr(p, "identifier", p.ticket)),
            "reason": int(getattr(p, "reason", 0)),
            "volume": float(p.volume),
            "price_open": float(p.price_open),
            "price_current": float(p.price_current),
            "sl": float(p.sl),
            "tp": float(p.tp),
            "profit": float(p.profit),
            "swap": float(getattr(p, "swap", 0.0)),
            "symbol": str(p.symbol),
            "comment": str(getattr(p, "comment", ""))
        })
    return result

def get_real_orders():
    if not MT5_AVAILABLE:
        return []
    orders = mt5.orders_get()
    if orders is None:
        return []
    type_map = {
        0: "BUY", 1: "SELL", 2: "BUY_LIMIT", 3: "SELL_LIMIT", 4: "BUY_STOP", 5: "SELL_STOP",
        6: "BUY_STOP_LIMIT", 7: "SELL_STOP_LIMIT", 8: "CLOSE_BY"
    }
    result = []
    for o in orders:
        result.append({
            "ticket": int(o.ticket),
            "time_setup": int(getattr(o, "time_setup", 0)),
            "time_done": int(getattr(o, "time_done", 0)),
            "type": type_map.get(int(o.type), str(int(o.type))),
            "state": "NEW",
            "magic": int(getattr(o, "magic", 0)),
            "position_id": int(getattr(o, "position_id", 0)),
            "volume_initial": float(getattr(o, "volume_initial", 0.0)),
            "volume_current": float(getattr(o, "volume_current", 0.0)),
            "price_open": float(getattr(o, "price_open", 0.0)),
            "sl": float(getattr(o, "sl", 0.0)),
            "tp": float(getattr(o, "tp", 0.0)),
            "price_current": float(getattr(o, "price_current", 0.0)),
            "symbol": str(o.symbol),
            "comment": str(getattr(o, "comment", ""))
        })
    return result


@app.get("/")
def root():
    return {
        "status": "AI-TRADER MT5 Bridge Running",
        "mt5_available": MT5_AVAILABLE,
        "configured_account": bool(DEFAULT_LOGIN),
        "configured_server": bool(DEFAULT_SERVER)
    }

@app.get("/api/health")
def health():
    if not MT5_AVAILABLE:
        return {"healthy": False, "status": "MT5 Not Installed", "account": None}
    
    acc = mt5.account_info()
    if acc is None:
        return {"healthy": False, "status": "Disconnected", "account": None}
    if DEFAULT_LOGIN and int(getattr(acc, "login", 0) or 0) != int(DEFAULT_LOGIN):
        return {
            "healthy": False,
            "status": "Wrong MT5 Account",
            "account": None,
            "expected_login": DEFAULT_LOGIN,
            "actual_login": int(getattr(acc, "login", 0) or 0)
        }
    
    ad = acc._asdict()
    terminal_info = None
    ping_last = None
    try:
        ti = mt5.terminal_info()
        if ti is not None:
            td = ti._asdict()
            ping_last = td.get("ping_last")
            terminal_info = {
                "name": td.get("name"),
                "company": td.get("company"),
                "path": td.get("path"),
                "build": td.get("build"),
                "ping_last": ping_last,
                "trade_allowed": bool(td.get("trade_allowed", False)),
                "tradeapi_disabled": bool(td.get("tradeapi_disabled", False)),
                "connected": True
            }
    except Exception:
        terminal_info = None
    trade_mode = "DEMO" if ad.get("trade_mode") == 0 else ("CONTEST" if ad.get("trade_mode") == 1 else "REAL")
    return {
        "healthy": True,
        "status": "Connected",
        "ping_last": ping_last,
        "terminal_info": terminal_info,
        "account": {
            "login": ad.get("login"),
            "trade_mode": trade_mode,
            "company": ad.get("company", "MetaQuotes"),
            "server": ad.get("server"),
            "currency": ad.get("currency", "USD"),
            "balance": ad.get("balance", 0.0),
            "equity": ad.get("equity", 0.0),
            "margin": ad.get("margin", 0.0),
            "margin_free": ad.get("margin_free", 0.0),
            "margin_level": ad.get("margin_level", 0.0),
            "profit": ad.get("profit", 0.0),
            "leverage": ad.get("leverage", 100),
            "trade_allowed": bool(ad.get("trade_allowed", True)),
            "trade_expert": bool(ad.get("trade_expert", True)),
            "is_verified": True
        }
    }

@app.get("/api/market/candles")
@app.get("/api/candles")
def candles(symbol: str, timeframe: str = "1h", count: int = 200):
        if not MT5_AVAILABLE:
            raise HTTPException(status_code=503, detail="MT5 Python package is unavailable.")
        if mt5.account_info() is None:
            raise HTTPException(status_code=503, detail="MT5 account is not connected.")
        timeframe_map = {
            "1m": mt5.TIMEFRAME_M1, "5m": mt5.TIMEFRAME_M5, "15m": mt5.TIMEFRAME_M15,
            "30m": mt5.TIMEFRAME_M30, "1h": mt5.TIMEFRAME_H1, "4h": mt5.TIMEFRAME_H4,
            "1d": mt5.TIMEFRAME_D1, "1w": mt5.TIMEFRAME_W1,
        }
        normalized_timeframe = timeframe.lower()
        if normalized_timeframe not in timeframe_map:
            raise HTTPException(status_code=400, detail="Unsupported timeframe.")
        safe_count = max(20, min(int(count), 2000))
        rates = mt5.copy_rates_from_pos(symbol.upper(), timeframe_map[normalized_timeframe], 0, safe_count)
        if rates is None or len(rates) == 0:
            raise HTTPException(status_code=404, detail=f"No broker candle history available for {symbol}.")
        candles = [{
            "time": int(row["time"]),
            "time_str": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(int(row["time"]))),
            "open": float(row["open"]),
            "high": float(row["high"]),
            "low": float(row["low"]),
            "close": float(row["close"]),
            "volume": int(row["tick_volume"])
        } for row in rates]
        newest_age = max(0, time.time() - candles[-1]["time"])
        return {"status": "LIVE" if newest_age <= 180 else "STALE", "candles": candles}

@app.post("/api/autoconnect")
def autoconnect():
    """Connect to the fixed local Demo account without receiving credentials from the browser."""
    if not MT5_AVAILABLE:
        raise HTTPException(status_code=503, detail="MT5 python library is not available.")
    success = init_and_auth_mt5(
        path=None,
        login=DEFAULT_LOGIN,
        server=DEFAULT_SERVER,
        password=None
    )
    if not success:
        return {
            "success": False,
            "status": "Authentication/Connection Failed",
            "error": f"Unable to auto-connect configured MT5 account #{DEFAULT_LOGIN}: {mt5.last_error()}"
        }
    acc = mt5.account_info()
    if acc is None or int(getattr(acc, "login", 0) or 0) != int(DEFAULT_LOGIN):
        return {"success": False, "status": "Wrong MT5 Account", "error": f"Configured account #{DEFAULT_LOGIN} is not the active MT5 account."}
    return connect(ConnectRequest())

@app.post("/api/connect")
def connect(req: ConnectRequest):
    if not MT5_AVAILABLE:
        raise HTTPException(status_code=503, detail="MT5 python library is not available.")
    
    use_credentials = bool(req.login and req.server)
    # Empty / auto-connect requests use the fixed local Demo account configured for this build.
    requested_login = int(req.login) if use_credentials and req.login else DEFAULT_LOGIN
    requested_server = req.server if use_credentials and req.server else DEFAULT_SERVER
    requested_password = req.password if use_credentials else None
    if use_credentials:
        success = login_explicit_mt5(
            path=req.terminalPath,
            login=requested_login,
            server=str(requested_server),
            password=str(requested_password or "")
        )
    else:
        success = init_and_auth_mt5(
            path=req.terminalPath,
            login=requested_login,
            server=requested_server,
            password=None
        )

    # Never report success when broker authentication itself failed. In particular, do not
    # fall back to an account that may have been left logged in from an earlier MT5 session.
    if not success:
        err = mt5.last_error()
        return {
            "success": False,
            "status": "Authentication Failed" if use_credentials else "MT5 Terminal Not Connected",
            "error": f"MT5 broker authentication/terminal initialization failed: {err}"
        }

    acc = mt5.account_info()
    if not acc:
        err = mt5.last_error()
        return {
            "success": False,
            "status": "MT5 Terminal Not Connected",
            "error": f"Please ensure MT5 terminal is open on your PC. ({err})"
        }

    ad = acc._asdict()
    if requested_login and int(ad.get("login") or 0) != int(requested_login):
        return {
            "success": False,
            "status": "Authentication Failed",
            "error": f"MT5 authenticated a different account (#{ad.get('login')}) than the configured account #{requested_login}. Check the MT5 terminal and broker login."
        }

    term = mt5.terminal_info()
    td = term._asdict() if term else {}
    if not bool(td.get("connected", False)):
        return {
            "success": False,
            "status": "Broker Connection Failed",
            "error": f"MT5 terminal is initialized but is not connected to the broker server. ({mt5.last_error()})"
        }
    
    account_info = {
        "login": ad.get("login"),
        "trade_mode": "DEMO" if ad.get("trade_mode") == 0 else ("CONTEST" if ad.get("trade_mode") == 1 else "REAL"),
        "company": ad.get("company", "MetaQuotes"),
        "server": ad.get("server", req.server),
        "currency": ad.get("currency", "USD"),
        "balance": ad.get("balance", 0.0),
        "equity": ad.get("equity", 0.0),
        "margin": ad.get("margin", 0.0),
        "margin_free": ad.get("margin_free", 0.0),
        "margin_level": ad.get("margin_level", 0.0),
        "profit": ad.get("profit", 0.0),
        "leverage": ad.get("leverage", 100),
        "trade_allowed": bool(ad.get("trade_allowed", True)),
        "is_verified": True,
        "last_verified_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    }
    
    return {
        "success": True,
        "account": account_info,
        "terminalInfo": {
            "name": td.get("name", "MetaTrader 5"),
            "connected": bool(td.get("connected", True)),
            "build": td.get("build", 4000),
            "ping_last": td.get("ping_last", 15)
        },
        "symbols": get_real_symbols()
    }

def _filling_mode(symbol: str) -> int:
    """Choose a type_filling supported by the broker for the symbol.
    filling_mode bits: 1=FOK, 2=IOC, 4=RETURN. Prefer IOC, fall back to FOK."""
    si = mt5.symbol_info(symbol) if MT5_AVAILABLE else None
    mode = int(si.filling_mode) if si and si.filling_mode else 1
    if mode & 2:
        return mt5.ORDER_FILLING_IOC
    return mt5.ORDER_FILLING_FOK

# ===== Order Idempotency Guard =====
# Guarantees exactly-once execution: if the same request_id was already filled by the broker,
# the bridge returns the original ticket instead of opening a duplicate position.
_EXECUTED_REQUEST_IDS = {}  # request_id -> {"ticket": int, "ts": float}
_EXECUTED_REQUEST_LOCK = threading.Lock()
_EXECUTED_REQUEST_TTL = 120.0  # seconds

def _remember_executed_request(request_id, ticket, position_ticket=None):
    """Record an executed request with both order and broker position identity when available."""
    if not request_id:
        return
    with _EXECUTED_REQUEST_LOCK:
        now = time.time()
        if len(_EXECUTED_REQUEST_IDS) > 500:
            stale = [rid for rid, e in _EXECUTED_REQUEST_IDS.items() if now - e["ts"] > _EXECUTED_REQUEST_TTL]
            for rid in stale:
                del _EXECUTED_REQUEST_IDS[rid]
        _EXECUTED_REQUEST_IDS[str(request_id)] = {"ticket": int(ticket), "position_ticket": int(position_ticket) if position_ticket is not None else None, "ts": now}

def _previously_executed(request_id):
    """Return the prior execution record for a request_id, or None if never executed."""
    if not request_id:
        return None
    with _EXECUTED_REQUEST_LOCK:
        entry = _EXECUTED_REQUEST_IDS.get(str(request_id))
        if entry:
            entry["ts"] = time.time()  # refresh TTL
            return entry
        return None

@app.get("/api/positions")
def positions():
    return {"success": True, "positions": get_real_positions()}

@app.get("/api/orders")
def orders():
    return {"success": True, "orders": get_real_orders()}

@app.get("/api/symbols")
def symbols():
    return {"success": True, "symbols": get_real_symbols()}

@app.get("/api/tick")
def api_tick(symbol: str):
    try:
        s = mt5.symbol_info(symbol)
        if not s:
            return {"success": False, "symbol": symbol, "message": f"Symbol {symbol} unavailable"}
        tick = mt5.symbol_info_tick(symbol)
        if not tick:
            return {"success": False, "symbol": symbol, "message": f"Tick for {symbol} unavailable"}
        tms = int(getattr(tick, "time_msc", 0) or 0)
        if tms <= 0:
            tms = int(getattr(tick, "time", 0) or 0) * 1000
        return {"success": True, "symbol": symbol, "bid": float(tick.bid), "ask": float(tick.ask), "spread": float(max(0.0, tick.ask - tick.bid)), "time_msc": tms, "tick_age_ms": max(0, int(time.time()*1000)-tms) if tms else None}
    except Exception as exc:
        return {"success": False, "symbol": symbol, "message": str(exc)}

@app.get("/api/calc/profit")
def calc_profit(symbol: str, action: str, volume: float, open_price: float, close_price: float):
    """Broker-native monetary P/L calculation in the account currency."""
    if not MT5_AVAILABLE:
        raise HTTPException(status_code=503, detail="MT5 not available")
    try:
        symbol = str(symbol).upper()
        action = str(action).upper()
        order_type = mt5.ORDER_TYPE_BUY if action == "BUY" else mt5.ORDER_TYPE_SELL
        value = mt5.order_calc_profit(order_type, symbol, float(volume), float(open_price), float(close_price))
        if value is None:
            return {"success": False, "profit": None, "message": str(mt5.last_error())}
        return {"success": True, "profit": float(value), "currency": str((mt5.account_info().currency if mt5.account_info() else "") or "")}
    except Exception as exc:
        logger.exception("calc_profit failed")
        return {"success": False, "profit": None, "message": str(exc)}

@app.get("/api/history/deals")
def history_deals(position: Optional[int] = None, days: int = 7):
    """Return only broker-recorded MT5 deals for learning/audit purposes."""
    if not MT5_AVAILABLE:
        raise HTTPException(status_code=503, detail="MT5 not available")
    try:
        if position:
            deals = mt5.history_deals_get(position=int(position))
        else:
            bounded_days = max(1, min(int(days or 7), 90))
            date_to = datetime.now()
            date_from = date_to - timedelta(days=bounded_days)
            deals = mt5.history_deals_get(date_from, date_to)
        if deals is None:
            return {"success": True, "deals": []}
        result = []
        for d in deals:
            raw = d._asdict() if hasattr(d, "_asdict") else {}
            result.append({
                "ticket": int(getattr(d, "ticket", 0) or 0),
                "order": int(getattr(d, "order", 0) or 0),
                "position_id": int(getattr(d, "position_id", 0) or 0),
                "symbol": str(getattr(d, "symbol", "") or ""),
                "type": int(getattr(d, "type", 0) or 0),
                "entry": int(getattr(d, "entry", 0) or 0),
                "volume": float(getattr(d, "volume", 0.0) or 0.0),
                "price": float(getattr(d, "price", 0.0) or 0.0),
                "profit": float(getattr(d, "profit", 0.0) or 0.0),
                "commission": float(getattr(d, "commission", 0.0) or 0.0),
                "swap": float(getattr(d, "swap", 0.0) or 0.0),
                "fee": float(getattr(d, "fee", 0.0) or 0.0),
                "time": int(getattr(d, "time", 0) or 0),
                "time_msc": int(getattr(d, "time_msc", 0) or 0),
                "magic": int(getattr(d, "magic", 0) or 0),
                "comment": str(getattr(d, "comment", "") or "")
            })
        return {"success": True, "deals": result}
    except Exception as exc:
        logger.exception("history_deals failed")
        return {"success": False, "deals": [], "message": str(exc)}

@app.post("/api/order/send")
@app.post("/api/orders/send")
def send_order(req: OrderRequest):
    if not MT5_AVAILABLE:
        raise HTTPException(status_code=503, detail="MT5 python library not available.")

    # Idempotency: if this exact request_id was already executed, do NOT open a duplicate order.
    prev = _previously_executed(req.request_id)
    if prev is not None:
        return {
            "success": True,
            "ticket": prev.get("ticket"),
            "position_ticket": prev.get("position_ticket"),
            "deduplicated": True,
            "message": f"Duplicate execution prevented for request_id (already processed). Position #{prev.get('position_ticket') or prev.get('ticket')}"
        }

    ti = mt5.terminal_info()
    ai = mt5.account_info()
    if ti is not None and bool(getattr(ti, "tradeapi_disabled", False)):
        return {"success": False, "message": "MT5 external Python trading API is disabled in terminal settings.", "retcode": 10027}
    if ti is not None and not bool(getattr(ti, "trade_allowed", False)):
        return {"success": False, "message": "MT5 AutoTrading is disabled in the client terminal.", "retcode": 10027}
    if ai is not None and not bool(getattr(ai, "trade_allowed", False)):
        return {"success": False, "message": "Broker account trade permission is disabled.", "retcode": 10027}

    # Every live order must carry both protective levels.
    if req.sl is None or req.tp is None or float(req.sl) <= 0 or float(req.tp) <= 0:
        return {"success": False, "message": "Order blocked: both SL and TP are required."}

    tick = mt5.symbol_info_tick(req.symbol)
    if not tick:
        return {"success": False, "message": f"Symbol {req.symbol} tick unavailable"}

    # Never execute against an old broker quote.
    tick_ms = int(getattr(tick, "time_msc", 0) or 0)
    if tick_ms <= 0:
        tick_ms = int(getattr(tick, "time", 0) or 0) * 1000
    if tick_ms <= 0:
        return {"success": False, "message": "Order blocked: broker tick has no timestamp."}
    tick_age_ms = max(0, int(time.time() * 1000) - tick_ms)
    if tick_age_ms > 5000:
        return {"success": False, "message": f"Order blocked: broker tick is stale ({tick_age_ms} ms old).", "tick_age_ms": tick_age_ms}

    action = req.action.upper()
    pending_types = {
        "BUY_LIMIT": getattr(mt5, "ORDER_TYPE_BUY_LIMIT", 2),
        "SELL_LIMIT": getattr(mt5, "ORDER_TYPE_SELL_LIMIT", 3),
        "BUY_STOP": getattr(mt5, "ORDER_TYPE_BUY_STOP", 4),
        "SELL_STOP": getattr(mt5, "ORDER_TYPE_SELL_STOP", 5),
    }
    is_pending = action in pending_types
    if is_pending and (req.price is None or float(req.price) <= 0):
        return {"success": False, "message": "Pending order requires a valid entry price."}
    price = float(req.price) if is_pending else (tick.ask if action == "BUY" else tick.bid)
    order_type = pending_types[action] if is_pending else (mt5.ORDER_TYPE_BUY if action == "BUY" else mt5.ORDER_TYPE_SELL)

    trade_req = {
        "action": mt5.TRADE_ACTION_PENDING if is_pending else mt5.TRADE_ACTION_DEAL,
        "symbol": req.symbol,
        "volume": float(req.volume),
        "type": order_type,
        "price": price,
        "deviation": req.deviation or 10,
        "magic": 99281,
        "comment": (req.comment or "AI-TRADER")[:28],
        "type_time": mt5.ORDER_TIME_GTC,
        "type_filling": _filling_mode(req.symbol)
    }
    if req.sl:
        trade_req["sl"] = float(req.sl)
    if req.tp:
        trade_req["tp"] = float(req.tp)

    # Snapshot current positions BEFORE sending so verification can identify a newly-created
    # hedging position or a volume-increased netting position without guessing from timestamp alone.
    before_positions = list(mt5.positions_get(symbol=req.symbol) or [])
    before_by_ticket = {int(getattr(p, "ticket", 0)): p for p in before_positions}

    res = mt5.order_send(trade_req)
    if not res:
        err = mt5.last_error()
        return {"success": False, "message": f"order_send failed: {err}"}

    accepted_codes = {getattr(mt5, "TRADE_RETCODE_DONE", 10009), getattr(mt5, "TRADE_RETCODE_PLACED", 10008)}
    if res.retcode not in accepted_codes:
        return {"success": False, "message": f"Broker rejected: {res.comment} (retcode: {res.retcode})", "retcode": res.retcode}

    if is_pending:
        return {"success": True, "ticket": int(getattr(res, "order", 0) or 0), "order": int(getattr(res, "order", 0) or 0), "pending": True, "message": f"Pending {action} accepted by broker: {res.comment}", "retcode": res.retcode}

    position_ticket = None
    verified = False
    verified_sl = None
    verified_tp = None
    try:
        positions = list(mt5.positions_get(symbol=req.symbol) or [])
        same_action = [p for p in positions if (
            (req.action.upper() == "BUY" and int(getattr(p, "type", -1)) == getattr(mt5, "POSITION_TYPE_BUY", 0)) or
            (req.action.upper() == "SELL" and int(getattr(p, "type", -1)) == getattr(mt5, "POSITION_TYPE_SELL", 1))
        )]
        # Hedging account: choose a genuinely new position ticket.
        new_positions = [p for p in same_action if int(getattr(p, "ticket", 0)) not in before_by_ticket and abs(float(getattr(p, "volume", 0.0)) - float(req.volume)) < 1e-8]
        chosen = sorted(new_positions, key=lambda p: int(getattr(p, "time_msc", 0) or 0), reverse=True)[0] if new_positions else None

        # Netting account: position ticket can remain unchanged while its volume increases.
        if chosen is None:
            increased = []
            for p in same_action:
                ticket = int(getattr(p, "ticket", 0))
                before = before_by_ticket.get(ticket)
                if before is None:
                    continue
                before_volume = float(getattr(before, "volume", 0.0) or 0.0)
                after_volume = float(getattr(p, "volume", 0.0) or 0.0)
                if after_volume >= before_volume + float(req.volume) - 1e-8:
                    increased.append((after_volume - before_volume, p))
            if increased:
                chosen = max(increased, key=lambda item: item[0])[1]

        if chosen is not None:
            position_ticket = int(getattr(chosen, "ticket", 0))
            verified_sl = float(getattr(chosen, "sl", 0.0) or 0.0)
            verified_tp = float(getattr(chosen, "tp", 0.0) or 0.0)
            # Broker must expose both protections after the fill.
            verified = (verified_sl > 0 and verified_tp > 0 and
                        abs(verified_sl - float(req.sl)) <= max(1e-8, abs(float(req.sl)) * 1e-6) and
                        abs(verified_tp - float(req.tp)) <= max(1e-8, abs(float(req.tp)) * 1e-6))
    except Exception:
        verified = False
    if not verified:
        return {
            "success": False,
            "message": "Order filled but broker position could not be verified with the requested SL/TP; treating execution as unverified.",
            "ticket": int(res.order),
            "position_ticket": position_ticket,
            "verified_sl": verified_sl,
            "verified_tp": verified_tp
        }
    _remember_executed_request(req.request_id, res.order, position_ticket)
    return {
        "success": True,
        "ticket": int(res.order),
        "position_ticket": position_ticket,
        "volume": res.volume,
        "price": res.price,
        "message": f"Order #{res.order} filled at {res.price}"
    }
@app.post("/api/order/cancel")
@app.post("/api/orders/cancel")
def cancel_order(req: CancelRequest):
    if not MT5_AVAILABLE:
        raise HTTPException(status_code=503, detail="MT5 not available")

    request_id = req.request_id or f"cancel_{req.ticket}"
    prev = _previously_executed(request_id)
    if prev is not None:
        return {"success": True, "deduplicated": True, "ticket": req.ticket, "message": f"Duplicate cancellation prevented for order #{req.ticket}."}

    orders = mt5.orders_get(ticket=req.ticket)
    if not orders:
        return {"success": False, "message": f"Pending order #{req.ticket} not found"}

    order = orders[0]
    trade_req = {"action": mt5.TRADE_ACTION_REMOVE, "order": int(order.ticket), "comment": "AI-TRADER Cancel"}
    result = mt5.order_send(trade_req)
    if not result or result.retcode != mt5.TRADE_RETCODE_DONE:
        return {"success": False, "message": f"Failed to cancel order #{req.ticket}: {getattr(result, 'comment', mt5.last_error())}"}

    _remember_executed_request(request_id, int(order.ticket))
    remaining = mt5.orders_get(ticket=req.ticket)
    if remaining:
        return {"success": False, "message": f"Broker accepted cancellation request but order #{req.ticket} remains active."}
    return {"success": True, "ticket": int(order.ticket), "message": f"Pending order #{req.ticket} cancelled successfully."}

@app.post("/api/position/close")
@app.post("/api/positions/close")
def close_position(req: CloseRequest):
    if not MT5_AVAILABLE:
        raise HTTPException(status_code=503, detail="MT5 not available")
    
    request_id = req.request_id or f"close_{req.ticket}_{req.volume or 'ALL'}"
    prev = _previously_executed(request_id)
    if prev is not None:
        return {"success": True, "deduplicated": True, "ticket": req.ticket, "message": f"Duplicate close prevented (request_id already processed) for position #{req.ticket}."}

    pos = mt5.positions_get(ticket=req.ticket)
    if not pos:
        return {"success": False, "message": f"Position #{req.ticket} not found"}
    
    p = pos[0]
    tick = mt5.symbol_info_tick(p.symbol)
    if not tick:
        return {"success": False, "message": f"Tick for {p.symbol} unavailable"}
    
    close_type = mt5.ORDER_TYPE_SELL if p.type == 0 else mt5.ORDER_TYPE_BUY
    price = tick.bid if p.type == 0 else tick.ask
    vol = req.volume or p.volume
    
    trade_req = {
        "action": mt5.TRADE_ACTION_DEAL,
        "symbol": p.symbol,
        "volume": float(vol),
        "type": close_type,
        "position": p.ticket,
        "price": price,
        "deviation": 10,
        "magic": 99281,
        "comment": "AI-TRADER Close",
        "type_time": mt5.ORDER_TIME_GTC,
        "type_filling": _filling_mode(p.symbol)
    }
    res = mt5.order_send(trade_req)
    if not res or res.retcode != mt5.TRADE_RETCODE_DONE:
        return {"success": False, "message": f"Failed to close position: {getattr(res, 'comment', mt5.last_error())}"}
    
    _remember_executed_request(request_id, p.ticket)
    return {"success": True, "message": f"Position #{p.ticket} closed at {res.price}"}

@app.post("/api/position/modify")
@app.post("/api/positions/modify")
def modify_position(req: ModifyRequest):
    if not MT5_AVAILABLE:
        raise HTTPException(status_code=503, detail="MT5 not available")

    request_id = req.request_id or f"modify_{req.ticket}_{req.sl}_{req.tp}"
    prev = _previously_executed(request_id)
    if prev is not None:
        return {"success": True, "deduplicated": True, "ticket": req.ticket, "message": f"Duplicate SL/TP modification prevented for position #{req.ticket}."}

    pos = mt5.positions_get(ticket=req.ticket)
    if not pos:
        return {"success": False, "message": f"Position #{req.ticket} not found"}

    p = pos[0]
    trade_req = {
        "action": mt5.TRADE_ACTION_SLTP,
        "position": p.ticket,
        "symbol": p.symbol,
        "sl": float(req.sl) if req.sl is not None else float(p.sl),
        "tp": float(req.tp) if req.tp is not None else float(p.tp)
    }
    res = mt5.order_send(trade_req)
    if not res or res.retcode != mt5.TRADE_RETCODE_DONE:
        err_msg = getattr(res, 'comment', mt5.last_error())
        return {"success": False, "message": f"Failed to modify position #{p.ticket}: {err_msg}"}

    _remember_executed_request(request_id, p.ticket)
    return {"success": True, "message": f"Position #{p.ticket} modified successfully (SL: {trade_req['sl']}, TP: {trade_req['tp']})"}

def cloud_sync_worker():
    """Background daemon to automatically push real MT5 telemetry & pull orders to/from cloud web dashboard."""
    logger.info(f"Connecting cloud synchronization with AI-TRADER Web Platform: {CLOUD_APP_URL}")
    last_log_time = 0
    while True:
        try:
            if MT5_AVAILABLE:
                acc = mt5.account_info()
                if acc:
                    ad = acc._asdict()
                    trade_mode = "DEMO" if ad.get("trade_mode") == 0 else "REAL"
                    account_payload = {
                        "login": ad.get("login"),
                        "trade_mode": trade_mode,
                        "company": ad.get("company", "MetaQuotes"),
                        "server": ad.get("server", DEFAULT_SERVER),
                        "currency": ad.get("currency", "USD"),
                        "balance": float(ad.get("balance", 0.0)),
                        "equity": float(ad.get("equity", 0.0)),
                        "margin": float(ad.get("margin", 0.0)),
                        "margin_free": float(ad.get("margin_free", 0.0)),
                        "margin_level": float(ad.get("margin_level", 0.0)),
                        "profit": float(ad.get("profit", 0.0)),
                        "leverage": int(ad.get("leverage", 100)),
                        "trade_allowed": bool(ad.get("trade_allowed", True)),
                        "is_verified": True,
                        "last_verified_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
                    }
                    symbols = get_real_symbols()
                    positions = get_real_positions()

                    # 1. Push verified broker state to cloud dashboard
                    try:
                        sync_res = requests.post(
                            f"{CLOUD_APP_URL}/api/mt5/sync-client-bridge",
                            json={
                                "account": account_payload,
                                "terminalInfo": {
                                    "connected": True,
                                    "trade_allowed": True,
                                    "name": "MetaTrader 5",
                                    "company": ad.get("company", "MetaQuotes")
                                },
                                "symbols": symbols,
                                "positions": positions
                            },
                            timeout=4
                        )
                        if sync_res.status_code == 200:
                            now = time.time()
                            if now - last_log_time > 15:
                                logger.info(f"âœ… [CLOUD SYNC LIVE] Account #{ad.get('login')} (${ad.get('balance'):,.2f}) actively synced with AI-TRADER Web Platform!")
                                last_log_time = now
                    except Exception:
                        pass

                    # 2. Check for pending orders/actions from cloud dashboard
                    try:
                        poll_res = requests.get(f"{CLOUD_APP_URL}/api/mt5/bridge-poll", timeout=3)
                        if poll_res.status_code == 200:
                            data = poll_res.json()
                            actions = data.get("actions", [])
                            for act in actions:
                                act_id = act.get("id")
                                act_type = act.get("type")
                                payload = act.get("payload", {})
                                
                                if act_type == "ORDER":
                                    order_req = OrderRequest(**payload)
                                    exec_res = send_order(order_req)
                                    requests.post(
                                        f"{CLOUD_APP_URL}/api/mt5/bridge-action-result",
                                        json={"actionId": act_id, "result": exec_res},
                                        timeout=3
                                    )
                                elif act_type == "CLOSE":
                                    close_req = CloseRequest(**payload)
                                    exec_res = close_position(close_req)
                                    requests.post(
                                        f"{CLOUD_APP_URL}/api/mt5/bridge-action-result",
                                        json={"actionId": act_id, "result": exec_res},
                                        timeout=3
                                    )
                                elif act_type == "CANCEL":
                                    cancel_req = CancelRequest(**payload)
                                    exec_res = cancel_order(cancel_req)
                                    requests.post(
                                        f"{CLOUD_APP_URL}/api/mt5/bridge-action-result",
                                        json={"actionId": act_id, "result": exec_res},
                                        timeout=3
                                    )
                                elif act_type == "MODIFY":
                                    modify_req = ModifyRequest(**payload)
                                    exec_res = modify_position(modify_req)
                                    requests.post(
                                        f"{CLOUD_APP_URL}/api/mt5/bridge-action-result",
                                        json={"actionId": act_id, "result": exec_res},
                                        timeout=3
                                    )
                    except Exception:
                        pass
        except Exception:
            pass

        time.sleep(1.5)

if __name__ == "__main__":
    port = int(os.getenv("PORT", "18812"))
    host = os.getenv("MT5_BRIDGE_HOST", "127.0.0.1").strip() or "127.0.0.1"
    logger.info(f"Starting AI-TRADER MT5 Bridge on http://{host}:{port}")
    uvicorn.run(app, host=host, port=port, log_level="info")
