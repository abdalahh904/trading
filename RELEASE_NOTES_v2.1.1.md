# AI-TRADER v2.1.1 — Execution + AI Chart Fix

## Included fixes
- Per-symbol final confidence remains independently derived after the live/deep analysis pipeline; no forced/shared percentage.
- Minimum Confidence remains the final strategy-level entry authority in AUTO mode.
- When final confidence reaches the configured threshold, the main execution path submits the market order immediately; broker/MT5 failures are reported instead of silently skipping.
- Added explicit BROKER_RESPONSE / EXECUTION_FAILED trace after order submission.
- AI Chart now supports mouse-wheel zoom, touchpad/mouse drag in X/Y, reset-to-live, and keeps background analysis independent of chart navigation.
- AI Chart no longer renders Gemini STOP_LOSS/TAKE_PROFIT overlays as order-protection levels before a real broker position exists.
- Existing order SL/TP remain broker-position sourced and locked after fill.
- Embedded ChatGPT remains server-side via OPENAI_API_KEY.
- Local `.env` is included in this package and is gitignored by the project.

## Verification
- FINAL_PERCENT_AUTHORITY_STATIC_TEST: PASS
- CHATGPT_FULL_FEATURE_STATIC_TEST: PASS
- FULL_FEATURE_STATIC_TEST: PASS
- Node syntax check for the static tests: PASS

## Live verification limitation
This release was statically verified in the build environment. A live MT5 broker fill and real OpenAI request were not executed here.
