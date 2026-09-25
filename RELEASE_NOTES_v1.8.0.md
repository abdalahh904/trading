# AI-TRADER v1.8.0 — Advanced Verified Analysis & Persistent Thesis

- Removed the flat 55% / WAIT fallback.
- Added evidence-driven algorithmic SMC v3 fallback: trend, structure, BOS/CHOCH, liquidity sweeps, OB/FVG, momentum, VWAP, volume, pricing regime, volatility, directional separation, dynamic confidence, SL/TP and R:R.
- Gemini remains primary when configured; fallback is clearly marked provisional and can only reach high confidence when evidence quality is genuinely strong.
- BUY/SELL direction remains visible below the user's threshold; WAIT is reserved for unavailable/indefensible live data.
- Minimum Confidence is the strategy entry authority; MTF and target quality contribute to verified confidence instead of hidden second thresholds. Hard MT5, spread, account, risk, news, reconciliation, SL/TP and broker execution gates remain.
- Same-direction existing position continues thesis monitoring; opposite thesis stays separate and cannot attach to the wrong ticket or open a duplicate.
- Persistent thesis/execution registries recover from broker state after restart/reconnect; runtime state is not shipped inside the release archive.
- Trading Type controls primary and confirmation timeframes through the live analysis pipeline.
