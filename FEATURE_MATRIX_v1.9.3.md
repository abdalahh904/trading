# AI-TRADER v1.9.3 — Feature Matrix

This release is an integration upgrade on v1.9.1. It does not replace the existing architecture.

## Core analysis
- Gemini vision + algorithmic fallback
- Deep chart interpretation
- Price action / candle behavior
- Market structure: BOS / CHOCH / HH-HL / LH-LL
- Liquidity pools / sweeps / equal highs-lows / session liquidity
- Order Blocks / FVG / imbalance
- Premium / discount / equilibrium
- Market regime: trend, range, breakout, false breakout, transition, reversal, accumulation/distribution where detected
- Displacement / momentum / volatility / ATR / RSI / EMA / MACD / ADX estimate / VWAP / Bollinger width / tick activity
- Entry-location intelligence, chase detection, obstacle/target-space checks
- Bull/bear trap and adversarial counter-evidence checks
- Session context and cross-symbol/currency context
- Thesis invalidation and persistent thesis lifecycle
- Market-memory fields and event-driven re-analysis

## Multi-timeframe
- Trading modes: Scalping / Intraday / Swing
- Mode-specific primary timeframe and confirmation timeframes
- MTF structure, liquidity, zones, trend, momentum and conflict reconciliation
- Controlled/event-driven refresh rather than LLM-on-every-tick

## Methods
- EMA Trend Pullback
- RSI Mean Reversion
- ADX Momentum
- VWAP Bias Reclaim
- Breakout Retest
- Order Block Mitigation
- FVG + Liquidity Sweep
- AUTO method selection
- MANUAL one/multiple/all method selection
- Method-specific validation / setup / confidence / SL/TP / management hooks
- Method performance journal and learning aggregation

## Confidence / execution authority
- Dynamic evidence reconciliation; no fixed additive percentage formula
- BUY/SELL directional result can remain low-confidence rather than forcing WAIT
- User Minimum Confidence is final strategy entry threshold
- Confidence-pass is explicitly logged
- After confidence pass, MT5 submission result is explicit: submitted / broker response / filled / verified / failed
- No silent confidence-pass-with-no-execution state
- Broker/technical failure is logged separately from strategy confidence

## Orders / positions
- Direct market BUY/SELL actions
- Pending Buy Limit / Sell Limit / Buy Stop / Sell Stop
- Pending-order cancellation and thesis invalidation handling
- Mandatory broker SL/TP
- SL/TP locked after fill; monitoring does not churn protection levels
- Thesis monitoring and confirmed invalidation early-exit lifecycle
- Break-even / trailing / partial close / position reconciliation
- Existing trade is not closed merely because a newer/better setup appears
- Balance/equity regulates position size rather than acting as a strategy veto

## AI Chart / TradingView
- AI chart and TradingView modes coexist
- Live broker candles
- SMC/structure overlays and projections
- Future projection area without fabricated candles
- Before order: setup/projection only; order SL/TP are hidden
- After broker fill: Entry / SL / TP and active order state appear
- When position closes, order overlays disappear from live chart
- Chart mode/navigation does not stop background analysis

## Risk / safety
- Demo-only protection
- Broker account verification
- MT5 permission checks
- Spread / margin / exposure / correlation / drawdown diagnostics and sizing controls
- Broker contract data and position sizing
- Emergency kill / safe mode / reconciliation / self-healing
- No fake balances, fake fills or fabricated broker P/L

## News / calendar
- External economic calendar integration
- Currency-to-symbol impact mapping
- High-impact blackout guard
- Liquidity-window context
- News provider health and last-refresh telemetry
- News tab never fabricates missing events

## Journals / audit (newly strengthened in v1.9.3)
- Broker Trade Journal: direct MT5 deal history, 30-day dashboard view
- AI Trade Journal: persisted decision history
- Execution Log: persisted state-machine audit
- Live refresh of all three views
- Broker-native realized result enrichment
- Exact failure/rejection reason visibility
- Persistent JSONL execution/decision records under `data/`

## UI / settings
- Persistent themes including Classic Gold, Midnight Pro/Midnight, TradingView Dark, Institutional, Carbon and Light/Professional variants
- Persistent trading mode and minimum confidence
- Symbol controls AUTO / ON / OFF
- Live Activity / AI Engine / Learning / Backtest / Risk / News / Orders / Positions / System panels
- Telegram secretary integration and alerts

## Data integrity
- MT5 remains the financial source of truth
- Local journal is an audit mirror, not a broker substitute
- No historical fills are invented to populate empty tables
- Empty history explicitly reports why it is empty
