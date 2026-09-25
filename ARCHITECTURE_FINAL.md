# AI-TRADER Final Clean-Slate Architecture

## 1. Broker truth
MT5 is the source of truth for account, balance, equity, positions, pending orders, prices, candles, permissions, and realized deal history.

## 2. Local adapter
The desktop bridge attaches to the already-running MT5 terminal on loopback (`127.0.0.1:18812`). Automatic startup never calls broker login, never switches accounts, never launches `terminal64.exe`, and never calls `mt5.shutdown()` as a reconnect strategy.

## 3. Analysis
Ten configured symbols are analyzed with the selected Trading Mode profile. All seven executable methods run independently when enabled. Structural targets are derived from observed swing/VWAP/FVG levels and must satisfy the minimum 2.5R asymmetry requirement.

## 4. Decision fusion
Raw candidates are ranked by net edge, uncertainty, and confidence. Adversarial checks identify real counter-evidence. Multi-timeframe confirmation adjusts confidence and uncertainty only after confirmation. Action confidence is a policy gate, not adversarial evidence.

## 5. Execution
An autonomous entry requires action confidence at or above the user threshold (default 80%), verified MT5/demo account, fresh data, reconciliation, risk limits, spread/session/news checks, duplicate protection, and broker verification of the resulting position.

## 6. Position management
Open positions are monitored on a separate fast loop. Management may move SL, take partial profit, move to break-even, trail, or close early. Negative P/L alone never triggers closure. Confirmed early exit requires negative P/L, structural invalidation, opposite MTF evidence, and action confidence above the configured threshold.

## 7. Gemini Live Analysis
Gemini continuously analyzes the ten configured symbols from live MT5 candles, produces directional conviction and visual SMC evidence, and feeds the strategy validation layer. Gemini does not bypass broker, SL/TP, account, drawdown, or reconciliation safety.

## 8. Learning
Entry execution events are distinct from management events. A position close is reconciled against MT5 deal history and recorded as a broker-confirmed realized result. Win rate/profit factor use only these realized result events.

## 9. Backtesting
Walk-forward replay uses broker-supplied historical candles only. Historical freshness does not have to be live; current live spread is not injected into historical replay. Failed replay stages expose diagnostics instead of manufacturing trades/results.

## 10. Supervision
Windows startup launches the bridge and dashboard under auto-restart supervisors. If either component dies, it restarts. MT5 itself remains user-managed to avoid startup collisions/crashes.
