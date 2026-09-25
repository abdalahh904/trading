# AI-TRADER v2.0.0 — FULL FEATURE RELEASE

## Main additions
- Added embedded ChatGPT tab below Settings.
- Added persistent ChatGPT project history, live state context and selected source inspection.
- Added chart image capture for ChatGPT vision input.
- Added permission-gated source change proposals and explicit Apply confirmation.
- Added direct BUY/SELL market buttons with server-side analysis-based SL/TP and broker-sized volume.
- Added AI pending-order path with independent strict confirmation criteria.
- Added broker-native pending order submission support.
- Added AI chart history navigation, LIVE return, zoom and pointer pan.
- Added current P/L to active-order chart view.
- Removed mandatory max-hold exits.
- Locked broker SL/TP against ordinary post-entry analysis churn.

## OpenAI integration note
The embedded assistant uses the OpenAI API with a server-side `OPENAI_API_KEY`. It is not the same as logging into the consumer ChatGPT website; project chat history is persisted locally by AI-TRADER.
