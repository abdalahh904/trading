# AI-TRADER v1.9.1

- Final verified confidence is the sole strategy-level entry authorization: confidence >= the user minimum proceeds directly to broker submission.
- Removed the redundant autonomous-entry veto from the final percentage path.
- Risk engine is advisory for lot sizing and no longer acts as a strategy veto after percentage approval.
- Physical MT5/broker requirements remain because an application cannot create a broker fill when the terminal is disconnected/disabled or the broker rejects an order.
- Existing thesis/position identity still prevents duplicate orders.
- Added global themes: Classic Gold, Institutional, Carbon, and TradingView Dark; theme tokens now apply across application surfaces and persist.
