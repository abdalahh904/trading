# AI-TRADER v2.1.0 — 104-Requirement Integration Release

## Scope
This release uses the operator-supplied 104-item baseline as the mandatory feature scope.

## Implemented/strengthened in this release
- Added explicit AUTO/MANUAL Trading Operation Mode and connected it to autonomous execution.
- Minimum Confidence remains the final strategy-level entry authority.
- Added explicit Setup Quality labels A+/A/B/C alongside numeric quality.
- Removed forced time-based holding semantics: trading profiles now use no mandatory max-hold exit.
- Added Professional Light theme; Midnight is presented as Midnight Pro.
- Added advanced market-context fields for trap detection, displacement quality, entry location, chasing risk, obstacle distance, session, cross-symbol context, news context and thesis memory.
- Added broker-native tick endpoint for microstructure snapshots.
- Added relevant-news currency mapping for the 10-symbol universe.
- Advanced context is incorporated into dynamic confidence through context-aware evidence reconciliation rather than fixed additive percentages.
- Broker Trade Journal now explicitly displays live MT5 positions together with historical MT5 deals.
- Execution Log remains persisted and exposes the complete execution chain including broker response/failure information.
- Added `FEATURE_REQUIREMENTS_104.md` as the canonical project baseline.

## Verification performed in this environment
- Python bridge syntax: PASS.
- ChatGPT full-feature static test: PASS.
- Existing full-feature static test: PASS.
- Final-percentage authority static test: PASS.
- TypeScript full compiler was not run because this release workspace does not contain `node_modules`; no network install was performed.
- Live MT5/Gemini/OpenAI runtime behavior requires verification on the user's machine with the real services connected.
