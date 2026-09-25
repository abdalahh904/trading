#!/usr/bin/env python3
"""
AI-TRADER MT5 Official Bridge
Integrates with the official MetaTrader 5 Python library (MetaTrader5)
Strict Rule: Real MT5 Terminal and Real Broker accounts only.
Never fabricate, invent, or locally generate fake accounts or balances.
"""

import sys
import json
import os
from datetime import datetime, timezone
from typing import Dict, Any, Optional

try:
    import MetaTrader5 as mt5
    MT5_AVAILABLE = True
except ImportError:
    MT5_AVAILABLE = False

ALLOW_MOCK_BACKEND = os.getenv("ALLOW_MOCK_BACKEND", "false").lower() == "true"

def get_terminal_status() -> Dict[str, Any]:
    """Check MT5 desktop terminal installation and status"""
    if not MT5_AVAILABLE:
        return {
            "installed": False,
            "status": "MT5 Not Installed",
            "message": "Official Python MetaTrader5 package is not installed on this host."
        }
    
    version = mt5.version()
    if version is None:
        return {
            "installed": False,
            "status": "MT5 Terminal Not Found",
            "message": "MetaTrader 5 desktop terminal was not detected."
        }
    
    return {
        "installed": True,
        "version": version,
        "status": "Terminal Detected"
    }

def connect_terminal(path: Optional[str] = None, login: Optional[int] = None, 
                     password: Optional[str] = None, server: Optional[str] = None) -> Dict[str, Any]:
    """
    Connect to real MetaTrader 5 terminal.
    Option A: No login/password passed -> connect to currently logged-in account.
    Option B: Credentials provided -> authenticate with the broker server.
    """
    if not MT5_AVAILABLE:
        if ALLOW_MOCK_BACKEND:
            return {
                "success": False,
                "status": "MT5 Not Installed",
                "error": "MetaTrader5 Python package not available. Mock backend strictly gated by ALLOW_MOCK_BACKEND."
            }
        return {
            "success": False,
            "status": "MT5 Not Installed",
            "error": "MetaTrader 5 is not installed or not available in this environment. No fake account will be created."
        }

    init_args = {}
    if path:
        init_args["path"] = path

    # Initialize terminal connection
    init_success = mt5.initialize(**init_args)
    if not init_success:
        err = mt5.last_error()
        return {
            "success": False,
            "status": "MT5 Terminal Not Found",
            "error": f"mt5.initialize() failed: {err}"
        }

    # If login credentials provided, perform official broker authentication
    if login and password and server:
        authorized = mt5.login(login=int(login), password=password, server=server)
        if not authorized:
            err = mt5.last_error()
            return {
                "success": False,
                "status": "Authentication Failed",
                "error": f"mt5.login() failed for account {login} on {server}: {err}"
            }

    # Read account_info from actual MT5 terminal
    account = mt5.account_info()
    if account is None:
        err = mt5.last_error()
        return {
            "success": False,
            "status": "MT5 Not Logged In",
            "error": f"No active account logged in MT5 terminal: {err}. Please log into your broker account in MT5."
        }

    account_dict = account._asdict()
    terminal = mt5.terminal_info()
    terminal_dict = terminal._asdict() if terminal else {}

    # Verify connection status to broker
    if not terminal_dict.get("connected", False):
        return {
            "success": False,
            "status": "Broker Connection Failed",
            "error": f"Terminal is not connected to broker server {account_dict.get('server')}.",
            "account_info": account_dict
        }

    # Determine trade mode cleanly
    trade_mode = "DEMO"
    if account_dict.get("trade_mode") == 0:
        trade_mode = "DEMO"
    elif account_dict.get("trade_mode") == 1:
        trade_mode = "CONTEST"
    elif account_dict.get("trade_mode") == 2:
        trade_mode = "REAL"

    return {
        "success": True,
        "status": "Connected",
        "account_info": {
            "login": account_dict.get("login"),
            "trade_mode": trade_mode,
            "balance": account_dict.get("balance"),
            "equity": account_dict.get("equity"),
            "profit": account_dict.get("profit"),
            "margin": account_dict.get("margin"),
            "margin_free": account_dict.get("margin_free"),
            "margin_level": account_dict.get("margin_level"),
            "leverage": account_dict.get("leverage"),
            "currency": account_dict.get("currency"),
            "name": account_dict.get("name"),
            "server": account_dict.get("server"),
            "company": account_dict.get("company"),
            "trade_allowed": account_dict.get("trade_allowed"),
            "trade_expert": account_dict.get("trade_expert"),
            "limit_orders": account_dict.get("limit_orders"),
            "connected": terminal_dict.get("connected", False),
            "is_verified": True
        },
        "terminal_info": terminal_dict
    }

def get_account_info() -> Dict[str, Any]:
    """Retrieve verified real-time account data from MT5"""
    if not MT5_AVAILABLE:
        return {"success": False, "status": "MT5 Not Installed", "error": "MT5 package not available"}
    
    account = mt5.account_info()
    if account is None:
        return {"success": False, "status": "Account Not Available", "error": "mt5.account_info() returned None"}
    
    return {"success": True, "account_info": account._asdict()}

def get_positions() -> Dict[str, Any]:
    """Read open positions directly from MT5 terminal"""
    if not MT5_AVAILABLE:
        return {"success": False, "status": "MT5 Not Installed", "positions": []}
    
    positions = mt5.positions_get()
    if positions is None:
        return {"success": True, "positions": []}
    
    normalized = []
    for pos in positions:
        p = pos._asdict()
        normalized.append({
            "ticket": int(p.get("ticket", 0)),
            "time": int(p.get("time", 0)),
            "time_msc": int(p.get("time_msc", 0)),
            "time_update": int(p.get("time_update", 0)),
            "type": "BUY" if p.get("type") == 0 else "SELL",
            "magic": int(p.get("magic", 0)),
            "identifier": int(p.get("identifier", p.get("ticket", 0))),
            "reason": int(p.get("reason", 0)),
            "volume": float(p.get("volume", 0)),
            "price_open": float(p.get("price_open", 0)),
            "price_current": float(p.get("price_current", 0)),
            "sl": float(p.get("sl", 0)),
            "tp": float(p.get("tp", 0)),
            "swap": float(p.get("swap", 0)),
            "profit": float(p.get("profit", 0)),
            "symbol": str(p.get("symbol", "")),
            "comment": str(p.get("comment", ""))
        })
    return {"success": True, "positions": normalized}

def get_orders() -> Dict[str, Any]:
    if not MT5_AVAILABLE:
        return {"success": False, "status": "MT5 Not Installed", "orders": []}
    orders = mt5.orders_get()
    if orders is None:
        return {"success": True, "orders": []}
    type_map = {0:"BUY",1:"SELL",2:"BUY_LIMIT",3:"SELL_LIMIT",4:"BUY_STOP",5:"SELL_STOP",6:"BUY_STOP_LIMIT",7:"SELL_STOP_LIMIT"}
    normalized = []
    for order in orders:
        o = order._asdict()
        normalized.append({
            "ticket": int(o.get("ticket",0)), "time_setup": int(o.get("time_setup",0)), "time_done": int(o.get("time_done",0)),
            "type": type_map.get(int(o.get("type", -1)), str(o.get("type", -1))), "state": "NEW",
            "magic": int(o.get("magic",0)), "position_id": int(o.get("position_id",0)),
            "volume_initial": float(o.get("volume_initial",0)), "volume_current": float(o.get("volume_current",0)),
            "price_open": float(o.get("price_open",0)), "sl": float(o.get("sl",0)), "tp": float(o.get("tp",0)),
            "price_current": float(o.get("price_current",0)), "symbol": str(o.get("symbol","")), "comment": str(o.get("comment",""))
        })
    return {"success": True, "orders": normalized}

def execute_order(request: Dict[str, Any]) -> Dict[str, Any]:
    """Send order directly to MT5 and verify real broker execution.
    Accepts friendly params {symbol, action: BUY/SELL, volume, sl, tp, deviation, comment, magic, position}
    and builds the official mt5.order_send() native request dict."""

    if not MT5_AVAILABLE:
        return {
            "success": False,
            "status": "Trading Disabled",
            "error": "Real MT5 is not available. Fake order execution is strictly forbidden."
        }

    # Pre-verification
    account = mt5.account_info()
    if not account or not account.trade_allowed:
        return {
            "success": False,
            "status": "Trading Disabled",
            "error": "Trading is not allowed on current MT5 account."
        }

    # If the request is already a native MT5 trade request shape, pass it through directly.
    if "type" in request and isinstance(request.get("type"), int):
        native_request = dict(request)
    else:
        # Build friendly -> native translation
        symbol = request.get("symbol")
        action = str(request.get("action", "")).upper()
        volume = float(request.get("volume", 0.0))
        if not symbol or action not in ("BUY", "SELL") or volume <= 0:
            return {
                "success": False,
                "status": "Invalid Request",
                "error": "symbol, action (BUY/SELL) and positive volume are required."
            }
        if not request.get("position") and not request.get("sl"):
            return {
                "success": False,
                "status": "Invalid Request",
                "error": "Hard Stop Loss is mandatory for opening a position."
            }

        tick = mt5.symbol_info_tick(symbol)
        if not tick:
            return {
                "success": False,
                "status": "Symbol Unavailable",
                "error": f"Tick for {symbol} unavailable."
            }

        price = tick.ask if action == "BUY" else tick.bid
        order_type = mt5.ORDER_TYPE_BUY if action == "BUY" else mt5.ORDER_TYPE_SELL

        native_request = {
            "action": mt5.TRADE_ACTION_DEAL,
            "symbol": symbol,
            "volume": volume,
            "type": order_type,
            "price": price,
            "deviation": int(request.get("deviation", 10)),
            "magic": int(request.get("magic", 99281)),
            "comment": str(request.get("comment", "AI-TRADER Exec"))[:28],
            "type_time": mt5.ORDER_TIME_GTC,
            "type_filling": (mt5.ORDER_FILLING_IOC
                             if (mt5.symbol_info(symbol) and mt5.symbol_info(symbol).filling_mode and int(mt5.symbol_info(symbol).filling_mode) & 2)
                             else mt5.ORDER_FILLING_FOK)
        }
        if request.get("position"):
            native_request["position"] = int(request["position"])
        if request.get("sl"):
            native_request["sl"] = float(request["sl"])
        if request.get("tp"):
            native_request["tp"] = float(request["tp"])

    # Call official MT5 order_send
    result = mt5.order_send(native_request)
    if result is None:
        err = mt5.last_error()
        return {
            "success": False,
            "status": "ERROR",
            "error": f"mt5.order_send() failed: {err}"
        }
    
    result_dict = result._asdict()
    # Retcode 10009 is TRADE_RETCODE_DONE (request executed)
    is_done = result_dict.get("retcode") == 10009
    
    return {
        "success": is_done,
        "retcode": result_dict.get("retcode"),
        "comment": result_dict.get("comment"),
        "deal": result_dict.get("deal"),
        "order": result_dict.get("order"),
        "volume": result_dict.get("volume"),
        "price": result_dict.get("price"),
        "raw_result": result_dict
    }

def cancel_order(params: Dict[str, Any]) -> Dict[str, Any]:
    if not MT5_AVAILABLE:
        return {"success": False, "error": "MetaTrader5 library is not available."}
    ticket = params.get("ticket")
    if not ticket:
        return {"success": False, "error": "Pending order ticket is required."}
    orders = mt5.orders_get(ticket=int(ticket))
    if not orders:
        return {"success": False, "error": f"Pending order #{ticket} not found."}
    req = {"action": mt5.TRADE_ACTION_REMOVE, "order": int(ticket), "comment": "AI-TRADER Cancel"}
    result = mt5.order_send(req)
    if not result or result.retcode != 10009:
        return {"success": False, "error": f"Failed to cancel order #{ticket}: {getattr(result, 'comment', str(mt5.last_error()))}"}
    remaining = mt5.orders_get(ticket=int(ticket))
    return {"success": not bool(remaining), "ticket": int(ticket), "message": f"Pending order #{ticket} cancellation verified." if not remaining else f"Pending order #{ticket} still active after broker response."}

def modify_position(params: Dict[str, Any]) -> Dict[str, Any]:
    """Modify Stop Loss and Take Profit on an open position using mt5.TRADE_ACTION_SLTP"""
    if not MT5_AVAILABLE:
        return {"success": False, "error": "MetaTrader5 library is not available."}
    
    ticket = params.get("ticket")
    if not ticket:
        return {"success": False, "error": "Position ticket is required."}
    
    pos = mt5.positions_get(ticket=int(ticket))
    if not pos:
        return {"success": False, "error": f"Position #{ticket} not found."}
    
    p = pos[0]
    sl = float(params["sl"]) if params.get("sl") is not None else float(p.sl)
    tp = float(params["tp"]) if params.get("tp") is not None else float(p.tp)
    
    req = {
        "action": mt5.TRADE_ACTION_SLTP,
        "position": p.ticket,
        "symbol": p.symbol,
        "sl": sl,
        "tp": tp
    }
    res = mt5.order_send(req)
    if not res or res.retcode != 10009:  # TRADE_RETCODE_DONE
        err_msg = getattr(res, "comment", str(mt5.last_error()))
        return {"success": False, "error": f"Failed to modify position #{p.ticket}: {err_msg}"}
    
    return {"success": True, "message": f"Position #{p.ticket} modified (SL: {sl}, TP: {tp})", "result": res._asdict()}

def get_candles(params: Dict[str, Any]) -> Dict[str, Any]:
    """Fetch real OHLC candle history directly from MT5 terminal"""
    if not MT5_AVAILABLE:
        return {"status": "UNAVAILABLE", "candles": [], "error": "MetaTrader5 not available"}
    
    symbol = params.get("symbol", "EURUSD")
    tf_str = str(params.get("timeframe", "1h")).lower()
    count = int(params.get("count", 100))
    
    tf_map = {
        "1m": mt5.TIMEFRAME_M1,
        "5m": mt5.TIMEFRAME_M5,
        "15m": mt5.TIMEFRAME_M15,
        "30m": mt5.TIMEFRAME_M30,
        "1h": mt5.TIMEFRAME_H1,
        "4h": mt5.TIMEFRAME_H4,
        "1d": mt5.TIMEFRAME_D1,
        "1w": mt5.TIMEFRAME_W1
    }
    tf = tf_map.get(tf_str, mt5.TIMEFRAME_H1)
    
    rates = mt5.copy_rates_from_pos(symbol, tf, 0, count)
    if rates is None or len(rates) == 0:
        return {"status": "UNAVAILABLE", "candles": []}
    
    candles = []
    for r in rates:
        t = int(r["time"])
        candles.append({
            "time": t,
            "time_str": datetime.fromtimestamp(t, timezone.utc).strftime("%Y-%m-%d %H:%M:%S"),
            "open": float(r["open"]),
            "high": float(r["high"]),
            "low": float(r["low"]),
            "close": float(r["close"]),
            "volume": int(r["tick_volume"])
        })
    
    return {"status": "LIVE", "candles": candles}

def main():
    """Handle JSON-RPC commands from stdin"""
    try:
        input_data = sys.stdin.read()
        if not input_data.strip():
            print(json.dumps({"error": "Empty input"}))
            return
        
        req = json.loads(input_data)
        cmd = req.get("command")
        params = req.get("params", {})
        
        if cmd == "status":
            res = get_terminal_status()
        elif cmd == "connect":
            res = connect_terminal(
                path=params.get("path"),
                login=params.get("login"),
                password=params.get("password"),
                server=params.get("server")
            )
        elif cmd == "account_info":
            res = get_account_info()
        elif cmd == "positions":
            res = get_positions()
        elif cmd == "orders":
            res = get_orders()
        elif cmd == "order_send":
            res = execute_order(params)
        elif cmd == "modify_position":
            res = modify_position(params)
        elif cmd == "candles":
            res = get_candles(params)
        else:
            res = {"error": f"Unknown command: {cmd}"}
        
        print(json.dumps(res))
    except Exception as e:
        print(json.dumps({"error": str(e)}))

if __name__ == "__main__":
    main()
