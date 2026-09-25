# AI-TRADER — 104 REQUIREMENTS BASELINE

This is the mandatory feature baseline supplied by the operator. Each item is treated as a requirement, not an optional enhancement.
1. Gemini primary AI
2. Deep chart analysis
3. Price Action
4. Market Structure BOS/CHOCH
5. Liquidity detection and sweeps
6. SMC Order Blocks
7. FVG / Imbalance
8. Market Regime Detection
9. Bull/Bear Trap detection
10. Displacement Quality
11. Entry Location Intelligence
12. Chasing Detector
13. Distance-to-Obstacles
14. Momentum and Volatility analysis
15. Market Microstructure / tick intelligence
16. Session behavior
17. Cross-symbol/currency context
18. Adversarial why-is-this-trade-wrong engine
19. Thesis invalidation
20. Market memory
21. HTF context
22. H1 structure
23. Setup timeframe
24. Execution/timing timeframe
25. MTF conflict detection
26. MTF evidence in final decision
27. Dynamic confidence
28. Directional BUY/SELL on weak setups
29. Minimum Confidence final entry authority
30. Setup Quality A+/A/B/C
31. Confidence calibration
32. Confidence stability
33. Deep Analysis to Setup to Entry to Monitoring to Exit
34. Event-based re-analysis
35. Live thesis monitoring
36. Early exit after confirmed thesis invalidation
37. No forced time limit
38. Existing trade protected from better-entry churn
39. Independent new setup evaluation
40. Direct BUY/SELL market buttons
41. Automatic SL/TP
42. SL/TP locking after entry
43. Pending orders with independent confirmation
44. BUY_LIMIT / SELL_LIMIT / BUY_STOP / SELL_STOP
45. Pending-order cancellation
46. Exact MT5 execution trace
47. Confidence Pass to Submission to Broker Response to Fill to Position Verification
48. No silent failed execution
49. MT5 broker as source of truth
50. Balance/equity position sizing
51. SL distance lot calculation
52. Max risk per trade
53. Total open risk
54. Daily loss/drawdown protection
55. Margin/exposure checks
56. Spread protection
57. Correlation/exposure control
58. Broker contract/tick-value calculations
59. AI Chart
60. TradingView-style chart
61. Live candles
62. Auto-follow/live mode
63. Auto-fit
64. Zoom
65. Pan/drag
66. Historical scrolling
67. Return-to-live
68. Future projection area
69. AI structural overlays
70. Order Entry/SL/TP overlays only after actual order opens
71. P/L on active order
72. Chart navigation independent from analysis
73. Economic News/Calendar
74. Currency-impact mapping
75. News as context/risk/execution guard
76. Asian/London/NY/overlap sessions
77. News-driven vs structural move distinction
78. Broker Trade Journal from MT5 history
79. Execution Log
80. AI Trade Journal
81. Live journal updates
82. Historical journal retrieval
83. Failure/rejection reasons
84. Learning/performance statistics
85. Persistent working themes
86. Classic Gold
87. Midnight Pro
88. TradingView Dark
89. Institutional
90. Carbon
91. Professional Light
92. Trading Type changes analysis
93. Scalping/Intraday/Swing profiles
94. Trading Operation Mode changes behavior
95. Minimum Confidence controls entry
96. Embedded ChatGPT tab
97. Project-wide context access
98. Source-code inspection
99. Diagnosis
100. Code modification only with permission
101. Persistent project chat/history
102. Analysis/chart/trade/log/settings history
103. Permission levels
104. Emergency revoke

## Verification rule
A feature is only considered complete when it is implemented in executable source and connected to the live state/data path where applicable. Documentation alone is not completion.

## Broker journal rule
Broker Trade Journal must show live broker positions and historical MT5 deal history. Execution Log must preserve the full execution chain and exact broker response/rejection details.
