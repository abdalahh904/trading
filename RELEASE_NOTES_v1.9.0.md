# AI-TRADER v1.9.0 — Final Percentage Decision + Advanced Chart Projection

## Core decision architecture
- Every live symbol completes the deep analysis pipeline before emitting its final direction and percentage.
- Final output is always BUY or SELL with a verified confidence percentage when live candle data is available.
- The user Minimum Confidence is the single strategy-level entry authority.
- MTF, structure, liquidity, OB/FVG, momentum, volatility, session, timing, target-space, contradiction, Gemini and cross-symbol context are evidence used to form the final percentage; none is a second hidden strategy veto after the percentage is emitted.
- Risk/drawdown metrics are advisory for sizing/diagnostics; Emergency Kill remains a separate explicit manual circuit breaker.

## Trade lifecycle
- Thesis IDs persist across analysis cycles.
- An active broker position owns the symbol and prevents duplicate entry for the same thesis.
- Continued analysis monitors the live thesis rather than reopening the same order.
- Confirmed thesis invalidation can transition the position to early exit/close; P/L alone is never the reason for an early exit.
- Execution state is persisted and reconciled with broker positions after reconnect/restart.

## Confidence
- Removed the flat 55% WAIT/default behavior.
- Confidence uses evidence reconciliation with contradiction penalties and observed calibration only when sufficient realized broker-linked samples exist.
- Algorithmic fallback is clearly marked provisional and is capped below fully verified generative vision.

## Chart
- AI chart reserves future space to the right of the live candle.
- Entry, SL and TP levels extend into the projection area.
- AI forecast is rendered as a projected path/corridor and target zone, never synthetic future candles.
- Forecast toggle added to the AI chart.
- Closed executed theses disappear from the chart once the broker position no longer exists; the next active thesis supplies the new levels.

## Runtime stability
- Persistent execution registry and thesis lifecycle state are preserved.
- MT5 reconnect resumes an active AI run without resetting thesis state when the previous lock was caused by connectivity loss.
- Bridge supervisor now detects an occupied local port 18812 and avoids spawning a duplicate bridge instance, preventing WinError 10048 restart storms.

## Verification
- TypeScript/TSX transpile audit: 49/49 PASS.
- Python bridge compile check: PASS.
- AI forecast chart runtime test: PASS.
- Full npm build/type-check was not available in the offline sandbox because project dependencies were not installed locally.
