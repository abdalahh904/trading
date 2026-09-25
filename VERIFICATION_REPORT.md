# AI-TRADER v1.4.0 Final Verification

## Passed
- TypeScript/TSX transpile/parse audit: all source files passed with zero syntax diagnostics.
- Python MT5 bridges: `mt5_desktop_bridge.py` and `mt5_bridge.py` passed `py_compile`.
- Clean-slate assistant removal: no legacy Assistant component/module remains.
- Seven strategy evaluators are present and independently executable.
- Structural target selection is broker-data-derived and enforces the 2.5R minimum; no forced 2.6R target multiplier remains.
- Action confidence is a user setting (default 80%) and is checked after MTF confirmation for autonomous entries.
- Negative P/L alone never triggers early exit; early exit requires confirmed thesis invalidation, opposing evidence, and the configured action-confidence threshold.
- Learning separates entry executions from management events and records realized results only from broker deal history.
- News guard uses a real external calendar by default and never invents events if the provider is unavailable.
- MT5 stays attach-only; startup never launches `terminal64.exe`, switches accounts, or performs reconnect shutdown storms.
- Dashboard and MT5 bridge have supervised auto-restart launchers.
- Persistent release journal is empty and risk state is reset to unlocked defaults.
- No broker password is included in the release source.

## Environment limitation
A full `npm ci`/Vite production build could not be completed in the packaging sandbox because dependency downloads from the npm registry timed out. The release therefore does not claim a sandboxed production bundle build; the Windows one-click launcher performs `npm ci` on the target PC when dependencies are missing.


## v1.5.1 Dependency Lock Verification
- Explicit react-is@19.3.0 added to package.json and package-lock.json.
- npm lock/package dependency structure check: PASS.
- Offline npm ci dry-run produced no EUSAGE lock mismatch and no missing react-is error; only uncached registry/optional peer warnings remain in the sandbox.
- setup_and_start_all.bat now repairs package-lock.json and retries npm ci after a clean-install failure.
