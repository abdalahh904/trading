> Current release: **v1.9.0** — final verified percentage is the single strategy-level entry authority; chart forecast uses projection graphics, never synthetic future candles.

# AI-TRADER — Institutional MT5 Quantitative Trading Terminal (Clean-Slate v1.5.1)

This project is the full AI-TRADER application: a React/Vite dashboard with a Node/TypeScript trading engine and a Python MetaTrader 5 bridge. The architecture uses MT5/broker state as the source of truth and blocks autonomous entries until the broker account, market data, reconciliation, risk, and emergency controls are all verified.

## Four-stage completion model

**Stage 1 — Trading Intelligence:** seven independently executable strategy families, live-data gating, adversarial ranking, entry/SL/TP thesis generation, and explicit NO-TRADE behavior.

**Stage 2 — Execution & Protection:** MT5 execution adapters, dynamic risk sizing, spread/leverage/drawdown protection, position management, break-even, trailing, partial-close logic, order lifecycle, duplicate protection, reconciliation, recovery, and pending-order cancellation.

**Stage 3 — Integrations & Terminal UI:** Telegram Secretary, Ollama discovery/fallback, optional external economic calendar, decision journal and observed performance metrics, live-only charts/backtest, dashboard/settings, and first-run MT5 connection flow.

**Stage 4 — Verification, regression validation & packaging:** server type-check, TypeScript/TSX syntax validation, Python syntax validation, regression tests, removal of fabricated runtime market data, cleanup, and release packaging.

## Run locally

Prerequisites: Node.js 22+ and Python 3.10+. Install Node dependencies with `npm ci` (or `npm install`) and Python dependencies from `requirements.txt`. On Windows, `setup_and_start_all.bat` performs the Python bridge dependency check, installs missing Node dependencies when needed, starts the attach-only MT5 bridge, waits for real HTTP health, then starts the dashboard. The normal manual flow is `npm run dev`; the packaged server can be started with `npm start` after `npm run build`.

## MT5 bridge configuration

Broker credentials are never stored in the frontend or replayed by automatic startup. Configure them in the process environment or the first-run connection flow:

```powershell
$env:MT5_LOGIN = "your-login"
$env:MT5_SERVER = "your-broker-server"
$env:MT5_PASSWORD = "your-password"
$env:MT5_TERMINAL_PATH = "C:\Program Files\MetaTrader 5\terminal64.exe"
$env:MT5_BRIDGE_URL = "http://127.0.0.1:18812"
```

The bridge is restricted to the project universe of ten symbols: EURUSD, GBPUSD, USDJPY, XAUUSD, USDCHF, AUDUSD, EURJPY, GBPJPY, USDCAD, and EURGBP. A broker that does not expose an exact symbol is reported as unavailable rather than silently substituted.

## Optional AI / macro services

Ollama is optional (`OLLAMA_BASE_URL`, `OLLAMA_MODEL`). The high-impact macro calendar has a broker-independent default provider (`financecalendar.com`) so the News Guard can work without an API key; `NEWS_CALENDAR_URL` can override it. If the provider is unavailable, the UI reports that state and the engine never fabricates market events or AI outputs. Gemini Vision remains available when `GEMINI_API_KEY` is configured.

## Safety invariants

No synthetic account, balance, candle series, sample trade, fake telemetry, or fake performance result is included in runtime state. Live/REAL MT5 accounts are blocked from autonomous entry. Emergency Kill, daily-loss, total-drawdown, max-position, spread, leverage, macro-news, reconciliation, and broker-connection gates can block new entries. New positions require a broker-verified SL and TP plus the configured reward/risk asymmetry threshold.

## Verification performed for this release

The release was reviewed with static source checks, Python bytecode compilation for both MT5 bridge modules, and the isolated project regression suite: 48/48 assertions passed. All 46 TypeScript/TSX files in the release parse with zero AST syntax diagnostics. The Windows `TEST_LOGIN_API` folder provides a safe read-only/local attach test for the target PC. A complete npm production build still has to be executed on the target PC after `npm ci`, because this packaging environment cannot guarantee registry access.

The profitability objective is risk-adjusted expectancy: seven methods are evaluated independently, candidates are ranked using confidence/uncertainty/net edge, structural reward/risk is enforced, M15/H1/H4 confirmation is required for autonomous entries, and realized outcomes are journaled for learning. These controls are designed to reduce low-quality entries; they do not guarantee profit.

## MT5 login troubleshooting

This desktop release is configured for automatic attachment to the designated MT5 Demo account that is already open in MT5. The local `mt5_desktop_bridge.py` attaches only to the matching account already open in MT5, verifies the account number/server, and exposes only verified account state to the browser. Normal startup is passive: it does not launch MT5, call broker login, or switch the account. Attachment retries use backoff to avoid initialize/reconnect storms while MT5 is starting. Manual credential login code remains available for maintenance, but production startup is fixed to automatic local MT5 attachment.
The login flow verifies that the authenticated MT5 account number exactly matches the account number entered in the form; a previously logged-in MT5 account is never accepted as a substitute after a failed broker login.

On Windows, the application accepts Python through `python`, `py -3`, or `python3`; the bridge listens on `127.0.0.1:18812` and allows loopback browser origins used by both port 3000 and common Vite development ports.


## MT5 stability release
See `MT5_STABILITY_FIX.md` for the attach-only startup behavior and the recommended startup order.


### Connection verification fix (1.1.1)

The desktop bridge now composes its CORS allow-list from loopback origins plus the configured `CLOUD_APP_URL`/`APP_URL`, so a browser served from the AI-TRADER hosted origin can call the loopback bridge without a generic `Failed to fetch`. Quick Connect now checks fresh bridge-synced state first, then uses the local bridge as a same-PC fallback. The MT5 terminal remains attach-only: it must already be open on the configured Demo account and AI-TRADER never invents account state.


## v1.2 clean-slate application architecture
The application layer is organized around a central settings/runtime contract while preserving the verified MT5 attach-only adapter that proved stable in testing. Trading Mode is a first-class control: **SCALPING**, **INTRADAY**, and **SWING** change the primary timeframe, confirmation frames, scan cadence, signal-quality floor, and strategy ranking fit. The seven executable methods remain individually selectable in Settings. Gemini is the primary always-on analytical surface and uses the same broker-truth state as the execution pipeline.

### Settings Center
Settings now contains:
- Trading Operating Mode (Scalping / Intraday / Swing)
- Primary and confirmation timeframe profile
- Theme: Midnight / Obsidian / Cyber / Light
- All 7 strategy enable/disable controls
- Gemini Live Analysis (always-on observer)
- Dashboard refresh and supervised startup/restart preferences

Changing Trading Mode is persisted server-side and is consumed by the live scan and strategy ranking engines. The mode never bypasses risk, reconciliation, or broker execution gates.


## Clean-slate final architecture

The production design deliberately separates analysis, decision policy, execution, and supervision:

`MT5 Terminal (source of truth) → Local Desktop Bridge → Server State → Gemini + 7 Strategy Evaluators → Evidence Fusion → MTF Confirmation → Action Confidence Policy → Safety/Risk/Reconciliation Gates → Broker Execution → Position Management → Broker Deal History → Learning`

Gemini is the primary live quantitative analysis layer and operational AI secretary. It can explain live state and surface evidence, but cannot bypass broker execution safety. The user-configured Minimum Confidence threshold defaults to 80% and is the entry threshold. MTF is informational evidence rather than a separate entry veto. Negative floating P/L alone never closes a position: early exit requires confirmed thesis invalidation plus opposing evidence and the configured action-confidence threshold.

## Trading operating modes

Settings provides **SCALPING**, **INTRADAY**, and **SWING** modes. Each mode changes the primary timeframe, confirmation timeframes, scan cadence, and maximum hold profile while preserving all safety and broker gates. Settings also provides **MIDNIGHT**, **OBSIDIAN**, **CYBER**, and **LIGHT** themes plus per-strategy enable/disable controls.

## Autonomous execution policy

Autonomous entries are ranked across all seven executable methods. A candidate must have real MT5 data, verified confidence at or above the configured threshold, evidence-aware reward/risk quality, and all broker/risk/reconciliation/safety gates. Multi-timeframe alignment is incorporated into verified confidence rather than acting as a hidden second confidence threshold. Once a position is open, the position manager continuously evaluates break-even, trailing, partial close, thesis invalidation, and verified broker state.

## Startup and recovery

`setup_and_start_all.bat` starts the supervised local bridge and dashboard automatically and waits for health before opening the browser. Each component has an independent 5-second restart supervisor. MT5 itself is never force-started or account-switched.

## Learning truth

Learning separates entry executions from management events. Actual Win Rate and Profit Factor are computed only from broker-confirmed closing deals recorded as `CONFIRMED_TRADE_RESULT`. A blocked trade is not counted as a loss, and BE/trailing/partial-close events are not counted as separate entries.


### Dependency integrity
The release carries a synchronized package.json/package-lock.json. The one-click Windows installer can automatically repair the lock and retry `npm ci` if npm reports a lock mismatch.
