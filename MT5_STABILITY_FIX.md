# AI-TRADER MT5 Stability Fix — v1.0.3

## What changed
- Automatic startup is **attach-only** to the MT5 terminal/account that is already open.
- The desktop bridge no longer calls `mt5.shutdown()` before automatic attachment.
- Automatic startup never calls `mt5.login()` and never replays a broker password.
- The bridge never launches `terminal64.exe`.
- Reconnect/attach attempts are serialized and use exponential backoff to prevent initialize storms.
- The Node server does not spawn the secondary one-shot Python MT5 bridge by default. Set `MT5_ENABLE_PYTHON_CLI_FALLBACK=true` only for explicit maintenance scenarios.
- The watchdog monitors MT5 but does **not** auto-launch the terminal.
- The browser waits briefly before its first automatic attach request so MT5 can complete its native startup.

## Normal startup order
1. Open MetaTrader 5 yourself.
2. Log into the intended Demo account inside MT5.
3. Wait until MT5 shows the broker connection as online.
4. Start AI-TRADER / its local bridge.
5. AI-TRADER attaches to the already-running MT5 session and verifies the configured account.

The app does not ask for MT5 credentials during normal startup and does not switch the account.

## Why this is safer
The previous flow could have more than one component initialize the same MT5 terminal around the same time. A repeated `shutdown -> initialize -> login` cycle could collide with MT5's native startup/reconnect lifecycle. v1.0.3 makes the local desktop bridge the single MT5 connection owner and removes those automatic relogin/reinitialize races.
