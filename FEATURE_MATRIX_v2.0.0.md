# AI-TRADER v2.0.0 — FULL FEATURE IMPLEMENTATION MATRIX

This release is built from the v1.9.3 source and adds the missing project-assistant and chart-interaction capabilities while preserving the existing trading architecture.

## Embedded ChatGPT
- ChatGPT tab directly below Settings in the sidebar.
- Server-side OpenAI Responses API integration.
- Persistent local project chat history (`data/chatgpt_history.jsonl`).
- Live project context: MT5 status, account summary, symbols, positions, orders, theses, analyses, data quality, reconciliation and recent activity.
- Source tree discovery and selected source-file inspection.
- Current AI chart capture sent as PNG image input when live context is enabled.
- Permission levels: OBSERVE, DIAGNOSE, APPROVE_ACTION, FULL_CONTROL.
- Code proposals are separated from code application.
- Every code application requires explicit user confirmation; protected `.env` and `package-lock.json` are blocked.
- No claim of code/trade/broker action unless the application returns confirmation.

## AI Chart / TV
- AI and TradingView modes coexist.
- Live broker candle rendering.
- AI SMC/structure/liquidity/OB/FVG overlays and projection corridor.
- Before order: order SL/TP hidden.
- After broker position exists: Entry, SL, TP and current P/L shown.
- Order protection levels are not rewritten by ordinary analysis monitoring.
- Manual history navigation, return-to-live, zoom and pointer pan.
- Background analysis continues while the chart is viewing history.

## Execution
- Direct BUY MARKET / SELL MARKET buttons.
- Manual market orders calculate SL/TP and broker-sized volume server-side from live analysis and contract data.
- Autonomous final-confidence authority remains explicit in the autonomous pipeline.
- Pending-order infrastructure supports BUY_LIMIT / SELL_LIMIT / BUY_STOP / SELL_STOP.
- AI pending setup path uses independent strict quality/location criteria rather than ordinary confidence alone.
- Pending cancellation remains available from Orders.

## Position lifecycle
- No mandatory time-based exit.
- Confirmed thesis invalidation can trigger early close.
- Broker SL/TP remain locked after fill during ordinary monitoring.
- Partial close remains a volume-management action.

## Existing preserved systems
- 10-symbol universe.
- Gemini vision + algorithmic fallback.
- Seven strategy methods and AUTO/MANUAL selection.
- MTF trading modes.
- Dynamic evidence-based confidence.
- MT5 broker source of truth, demo-only protection and execution audit.
- News/calendar provider and refresh telemetry.
- Themes, Settings persistence, Telegram, Learning, Backtest, Risk, Reconciliation and Self-healing.

## Verification status
- TypeScript/TSX transpile syntax audit: PASS.
- Python bridge syntax audit: PASS.
- Existing full-feature static test: PASS.
- Existing final-percent-authority static test: PASS.
- Live MT5 broker execution, Gemini API response, OpenAI API response and TradingView network behavior still require runtime verification on the user's machine.
