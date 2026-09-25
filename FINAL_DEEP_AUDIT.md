# AI-TRADER v1.1.0 — Final Deep Audit

## Architecture
- React/Vite dashboard.
- Node/TypeScript orchestration and API gateway.
- Local Python MT5 desktop bridge on `127.0.0.1:18812`.
- MT5/broker is the source of truth for financial state.
- Production startup is attach-only: the bridge does not launch MT5, switch accounts, or replay broker credentials. This avoids terminal startup/login races.

## Market analysis
- Ten-symbol universe: EURUSD, GBPUSD, USDJPY, XAUUSD, USDCHF, AUDUSD, EURJPY, GBPJPY, USDCAD, EURGBP.
- Primary scan: H1, up to 200 broker candles.
- Entry confirmation: M15 + H1 + H4 for the top autonomous candidate.
- Indicators: EMA12/20/26/50/200, RSI, ADX estimate, VWAP, MACD histogram with EMA12/26 + EMA9 signal, Bollinger width, ATR and volume ratio.
- Structure: BOS/CHOCH, order-block proximity, FVG, liquidity sweep and regime classification.
- Candle freshness is checked; stale/unavailable data cannot become a live strategy candidate.
- `/api/state` is read-only and does not overwrite live analysis during dashboard polling.

## Seven executable methods
1. EMA Trend Pullback
2. RSI Mean Reversion
3. ADX Momentum
4. VWAP Bias Reclaim
5. Breakout Retest
6. Order Block Mitigation
7. FVG + Liquidity Sweep

Each has its own evaluator. Candidates are scored, adversarially checked, filtered for confidence/uncertainty/net edge, and ranked.

## Profit-oriented design
The engine is tuned for risk-adjusted expectancy rather than trade frequency. Strategy templates target at least 2.5R structural reward/risk, and the viable-candidate filter also requires confidence >= 55%, uncertainty <= 40%, and net edge >= 1.25R. The top candidate must pass M15/H1/H4 confirmation plus spread/news/session/account/risk/reconciliation/execution gates. No trade quota is enforced. This increases selectivity and protects capital when edge is weak; it does not guarantee profit.

## Decision freshness / no-freeze behavior
- Position/risk supervision continues every 5 seconds.
- The heavy ten-symbol H1 market scan is rate-limited to a 15-second freshness window so the bridge is not hammered continuously.
- Pipeline iterations cannot overlap.
- M15/H4 confirmation requests are parallelized.
- Current `theses` are replaced with each analysis cycle; historical outcomes stay in the journal. Rejected setups from an earlier cycle therefore cannot remain as current PENDING decisions.
- Piya uses the latest H1 analysis and only requests a fresh scan when its cache is absent/stale.
- Dashboard telemetry never invents latency values.

## Piya
Piya starts automatically with the Node server and remains an always-on analytical observer. It uses the same strategy viability rules as the main pipeline, exposes `/api/piya/brief`, and turns failed M15/H1/H4 confirmation into explicit `NO TRADE`. Piya does not bypass the main execution/risk authority.

## Execution and protection
- Demo-first autonomous trading; REAL accounts are blocked.
- New positions require verified MT5 state, mandatory SL/TP, broker-backed contract/tick data, dynamic risk sizing, asymmetry, news clearance, duplicate checks, safety gates and post-fill verification.
- Ambiguous execution responses are reconciled before any further submission.
- Existing positions are managed through break-even, partial-close and trailing logic.
- Disconnect, emergency kill, daily-loss and drawdown locks stop new entries.
- Secondary Python CLI fallback is disabled by default to avoid multi-process MT5 races.

## Login / MT5 stability
- The production path attaches to the already-open MT5 terminal/session.
- Startup does not call broker `login()` or `shutdown()` and does not start `terminal64.exe`.
- The configured Demo account is verified by account number/server before AI-TRADER accepts the connection.
- The login/API test kit is included and is read-only with respect to trading.

## Integrations
- Telegram Secretary for alerts/operational controls.
- Ollama/Piya local AI fallback when configured.
- Optional Gemini Vision for analytical evidence; it cannot inject an executable thesis into the main pipeline.
- Optional external macro-economic calendar; no bundled fake events.
- Journal and learning use observed execution outcomes; no fabricated performance values.
- Live-only charts and broker-history backtesting use MT5 candles.

## API/UI completeness
- Added dashboard gateway aliases: `GET /api/orders`, `/api/positions`, `/api/symbols`.
- Piya brief endpoint and auto monitor are active from server startup.
- Strategy catalog is displayed from the live `/api/strategies` result; the UI no longer invents a fallback count.
- Orders/positions/symbols remain broker-backed read paths.

## Verification
- **46 TypeScript/TSX files** (including server, Vite config, source and test code) parsed with zero AST syntax diagnostics.
- `mt5_desktop_bridge.py` and `mt5_bridge.py` pass Python bytecode compilation.
- Isolated regression execution completed with **48/48 tests passing** after the final changes.
- Security/runtime scan found no literal broker password, no machine-specific `C:\Users\G...` path, no `node_modules`, no `__pycache__`, and no generated test trades in the release tree.
- `data/trade-journal.jsonl` is intentionally empty and `data/risk-state.json` starts unlocked/safe.

## Build environment limitation
The sandbox could not complete `npm ci` because external registry dependency installation timed out. Therefore a full Vite/esbuild production bundle was not generated here. The release contains the source project and lockfile rather than dependency stubs or a misleading partial `dist/` directory. On the target Windows machine, the included one-click launcher can install the bridge dependencies and start the application after the normal Node dependency installation is available.

Live broker behavior still depends on the user's MT5 terminal, broker server, market session, account permissions and local machine environment.
