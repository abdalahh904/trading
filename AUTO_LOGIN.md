# AI-TRADER Auto-Login

This desktop build is configured to attach automatically to the designated MT5 Demo account that is already open in the local MT5 terminal, without asking for login credentials.

The browser does not contain broker credentials. Automatic startup never replays a broker password; it only attaches to the account already logged in inside the local MT5 terminal. The bridge verifies that the active MT5 account login matches the configured account before reporting the account as healthy.

Environment variables may configure terminal discovery, but automatic startup remains attach-only and never switches the MT5 account.


## Stability rule
The desktop bridge is the single owner of the MetaTrader5 Python session. The platform does not spawn a second Python MT5 bridge while the local daemon is expected to be running, and the watchdog does not auto-launch terminal64.exe. This avoids shutdown/initialize/login races that can destabilize the MT5 terminal during startup or reconnect.
