import 'dotenv/config';
/**
 * AI-TRADER Institutional Trading Platform Server
 * MetaTrader 5 Real Integration & Express API Gateway
 */

import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { appStore } from './src/server/state_store.js';
import { mt5Connector } from './src/server/mt5_connector.js';
import { aiTradingPipeline } from './src/server/ai_trading_pipeline.js';
import { reconciliationEngine } from './src/server/reconciliation_engine.js';
import { piyaOperator } from './src/server/piya_operator.js';
import { marketIntelligence } from './src/server/market_intelligence.js';
import { safetyGateEngine } from './src/server/safety_gates.js';
import { summarizeJournal, readJournal } from './src/server/trade_journal.js';
import { readExecutionLog } from './src/server/execution_log.js';
import { MultiTimeframeChartAnalysis } from './src/types/trading.js';
import { geminiVisionBrain } from './src/server/gemini_vision_brain.js';
import { chartRenderer } from './src/server/chart_renderer.js';
import { telegramSecretary } from './src/server/telegram_secretary.js';
import { strategyRankingEngine } from './src/server/strategy_ranking.js';
import { selfHealingEngine } from './src/server/self_healing_engine.js';
import { liquidityAndNewsGuard } from './src/server/liquidity_and_news_guard.js';
import { summarizeLearning } from './src/server/learning_engine.js';
import { backtestEngine } from './src/server/backtest_engine.js';
import { piyaQuantEngine } from './src/server/piya_quant_engine.js';
import { liveAnalysisService } from './src/server/live_analysis_service.js';
import { riskEngine } from './src/server/risk_engine.js';
import { tradingModeEngine } from './src/server/trading_mode_engine.js';
import { applyProjectFileChange, appendChatMessage, buildProjectContext, callOpenAI, getPermission, listProjectFiles, readChatHistory, setPermission, type ChatGPTPermission } from './src/server/chatgpt_assistant.js';

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT || 3000);

  app.use(express.json());

  // --- API Routes (First) ---

  // 1. Health check
  app.get('/api/health', (req, res) => {
    const state = appStore.getState();
    res.json({
      status: 'ok',
      mt5_status: state.mt5_status,
      ai_state: state.ai_state,
      active_account: state.active_account?.login || null
      ,safe_mode: state.safe_mode || false
    });
  });

  app.get('/api/readiness', (req, res) => {
    const state = appStore.getState();
    const ready = state.mt5_status === 'Connected' &&
      !!state.active_account?.is_verified &&
      state.active_account?.trade_mode !== 'REAL' &&
      state.reconciliation.in_sync &&
      state.data_quality.healthy &&
      !state.safe_mode &&
      !state.risk_settings.trading_locked;
    res.status(ready ? 200 : 503).json({ ready, safe_mode: state.safe_mode || false, reason: state.safe_mode_reason || state.risk_settings.lock_reason || null });
  });

  app.get('/api/metrics/trades', (req, res) => {
    res.json({ success: true, summary: summarizeJournal(), learning: summarizeLearning() });
  });

  // Broker-truth journal: always queried from MT5, never from a local fake dataset.
  app.get('/api/positions/monetary-levels', async (req, res) => {
    const state = appStore.getState();
    const levels: Record<string, { sl: number | null; tp: number | null; currency: string }> = {};
    for (const p of state.positions) {
      const action = p.type;
      const sl = p.sl > 0 ? await mt5Connector.calculateProfit(p.symbol, action, p.volume, p.price_open, p.sl) : null;
      const tp = p.tp > 0 ? await mt5Connector.calculateProfit(p.symbol, action, p.volume, p.price_open, p.tp) : null;
      levels[String(p.ticket)] = { sl, tp, currency: state.active_account?.currency || 'ACCOUNT' };
    }
    res.json({ success: true, levels });
  });

  app.get('/api/broker/history/deals', async (req, res) => {
    try {
      const position = req.query.position ? Number(req.query.position) : undefined;
      const days = Math.max(1, Math.min(90, Number(req.query.days || 30)));
      const deals = await mt5Connector.fetchHistoryDeals(Number.isFinite(position) ? position : undefined, days);
      res.json({ success: true, source: 'MT5_BROKER_HISTORY', deals, count: deals.length, days, position: position ?? null });
    } catch (err: any) {
      res.status(503).json({ success: false, source: 'MT5_BROKER_HISTORY', deals: [], message: err?.message || 'Broker history unavailable.' });
    }
  });

  app.get('/api/execution-log', (req, res) => {
    const limit = Math.max(1, Math.min(5000, Number(req.query.limit || 500)));
    res.json({ success: true, source: 'AI_TRADER_EXECUTION_AUDIT', events: readExecutionLog(limit), count: readExecutionLog(limit).length });
  });

  app.get('/api/trade-journal', (req, res) => {
    const limit = Math.max(1, Math.min(5000, Number(req.query.limit || 500)));
    const events = readJournal().slice(-limit).reverse();
    res.json({ success: true, source: 'AI_TRADER_PERSISTED_JOURNAL', events, count: events.length, summary: summarizeJournal() });
  });

  app.post('/api/backtest/run', async (req, res) => {
    try {
      const symbol = String(req.body?.symbol || 'EURUSD').toUpperCase();
      const timeframe = String(req.body?.timeframe || '1h').toLowerCase() as any;
      const strategy = String(req.body?.strategy || 'ALL');
      const result = await backtestEngine.run({ symbol, timeframe, strategy, count: Number(req.body?.count || 500) });
      res.status(result.status === 'ERROR' ? 400 : 200).json(result);
    } catch (err: any) {
      res.status(500).json({ success: false, status: 'ERROR', message: err?.message || 'Backtest failed.' });
    }
  });

  // 2. Full State
  app.get('/api/strategies', (req, res) => {
    res.json({ strategies: strategyRankingEngine.getStrategyCatalog() });
  });

  app.get('/api/news/calendar', (req, res) => {
    const now = new Date();
    res.json({ success: true, status: liquidityAndNewsGuard.getCalendarStatus(), liquidity: liquidityAndNewsGuard.isHighLiquidityWindow(now), events: liquidityAndNewsGuard.getUpcomingEvents(now) });
  });

  app.post('/api/news/calendar/refresh', async (req, res) => {
    const result = await liquidityAndNewsGuard.refreshExternalCalendar();
    res.json({ ...result, status: liquidityAndNewsGuard.getCalendarStatus() });
  });

  app.get('/api/news/calendar/check', (req, res) => {
    const symbol = String(req.query.symbol || 'EURUSD').toUpperCase();
    res.json({
      success: true,
      symbol,
      calendar: liquidityAndNewsGuard.getCalendarStatus(),
      liquidity: liquidityAndNewsGuard.isHighLiquidityWindow(),
      guard: liquidityAndNewsGuard.checkMacroNewsHalt(symbol)
    });
  });

  app.get('/api/state', (req, res) => {
    // READ-ONLY endpoint. Live market analysis is produced by the Piya/AI monitor;
    // this route must never overwrite fresh broker-derived analysis with an unavailable cache.
    const state = appStore.getState();
    const canStart = aiTradingPipeline.canStartAI();
    const safetyGates = safetyGateEngine.evaluateGates();
    res.json({
      ...state,
      can_start_ai: canStart,
      safety_gates: safetyGates
    });
  });

  // 3. Connect to current MT5 desktop terminal account (Option A)
  const handleConnectTerminal = async (req: express.Request, res: express.Response) => {
    const { terminalPath } = req.body || {};
    const result = await mt5Connector.connectCurrentTerminal(terminalPath);
    res.json(result);
  };
  app.post('/api/mt5/connect-terminal', handleConnectTerminal);
  app.post('/api/mt5/connect', handleConnectTerminal);

  // 4. Authenticate & Login to Broker account via MT5 (Option B)
  app.post('/api/mt5/login', async (req, res) => {
    const body = req.body || {};
    const { login, password, server } = body;
    // Accept both frontend spellings so a manually supplied terminal path is never silently dropped.
    const terminalPath = body.terminalPath ?? body.terminal_path;
    if (!login || !server) {
      return res.status(400).json({
        success: false,
        message: 'Account Login number and Broker Server name are strictly required.'
      });
    }
    if (password === undefined || password === null || String(password).length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Broker account password is required for credential login. Use Current MT5 to attach to an account already logged in.'
      });
    }

    try {
      const result = await mt5Connector.loginBrokerAccount({
        login: Number(login),
        password: String(password),
        server: String(server).trim(),
        terminalPath: terminalPath ? String(terminalPath).trim() : undefined
      });
      res.status(result.success ? 200 : 401).json(result);
    } catch (err: any) {
      res.status(500).json({ success: false, message: err?.message || 'MT5 broker authentication failed.' });
    }
  });

  // 4b. Quick Connect — attach to the already-logged-in local MT5 terminal.
  // This is the production startup path for the desktop build; it does not replay broker credentials.
  app.post('/api/mt5/quick-connect', async (req, res) => {
    const configuredLogin = 112780882;
    const configuredServer = 'metsquotes-Demo';
    try {
      // FIRST: accept a fresh broker state already pushed by the local desktop bridge.
      // This is the correct path when the dashboard itself is hosted remotely.
      const state = appStore.getState();
      const heartbeatAge = mt5Connector.getClientBridgeHeartbeatAgeMs();
      const alreadySynced = state.mt5_status === 'Connected' &&
        state.active_account?.is_verified === true &&
        Number(state.active_account?.login) === configuredLogin &&
        String(state.active_account?.server || '') === configuredServer &&
        heartbeatAge < 30000;
      if (alreadySynced) {
        return res.json({
          success: true,
          source: 'client-bridge-sync',
          message: `Verified MT5 Demo account #${configuredLogin} is already synchronized.`,
          account: state.active_account,
          terminalInfo: state.terminal_info,
          heartbeat_age_ms: heartbeatAge
        });
      }

      // SECOND: when dashboard and bridge are on the same PC, ask the local bridge directly.
      const bridgeUrl = process.env.MT5_BRIDGE_URL || 'http://127.0.0.1:18812';
      const bridgeResponse = await fetch(`${bridgeUrl}/api/autoconnect`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}', signal: AbortSignal.timeout(8000)
      });
      const payload = await bridgeResponse.json().catch(() => ({}));
      if (!bridgeResponse.ok || !payload?.success || !payload?.account) {
        return res.status(503).json({ success: false, message: payload?.error || payload?.message || 'Local MT5 bridge could not attach to the configured Demo account. Open MT5 and sign in first.' });
      }
      if (Number(payload.account.login) !== configuredLogin || String(payload.account.server || '') !== configuredServer) {
        return res.status(409).json({ success: false, message: `MT5 returned account #${payload.account.login} on server ${payload.account.server}; expected #${configuredLogin} on ${configuredServer}.` });
      }
      const result = await mt5Connector.syncClientBridgeState(payload.account, payload.terminalInfo, payload.symbols, payload.positions);
      res.json(result);
    } catch (err: any) {
      const state = appStore.getState();
      const heartbeatAge = mt5Connector.getClientBridgeHeartbeatAgeMs();
      if ((state.mt5_status === 'Connected' || state.mt5_status === 'Trading Disabled') && state.active_account?.is_verified && Number(state.active_account?.login) === 112780882 && heartbeatAge < 30000) {
        return res.json({ success: true, source: 'client-bridge-sync', message: 'Verified MT5 state is already synchronized.', account: state.active_account, terminalInfo: state.terminal_info, heartbeat_age_ms: heartbeatAge });
      }
      res.status(503).json({ success: false, message: `Quick Connect failed: ${err?.message || 'No reachable MT5 bridge or fresh client-bridge synchronization.'}` });
    }
  });

  app.get('/api/mt5/quick-connect-status', async (req, res) => {
    const login = 112780882;
    const server = 'metsquotes-Demo';
    try {
      const bridgeUrl = process.env.MT5_BRIDGE_URL || 'http://127.0.0.1:18812';
      const response = await fetch(`${bridgeUrl}/api/health`, { signal: AbortSignal.timeout(1200) });
      const data = await response.json().catch(() => ({}));
      const state = appStore.getState();
      const synced = (state.mt5_status === 'Connected' || state.mt5_status === 'Trading Disabled') && state.active_account?.is_verified === true && Number(state.active_account?.login) === login && String(state.active_account?.server || '') === server && mt5Connector.getClientBridgeHeartbeatAgeMs() < 30000;
      res.json({ configured: true, login, server, bridge_online: response.ok, attached: !!data?.account?.login || synced, active_login: data?.account?.login || state.active_account?.login || null, synchronized: synced });
    } catch {
      const state = appStore.getState();
      const synced = (state.mt5_status === 'Connected' || state.mt5_status === 'Trading Disabled') && state.active_account?.is_verified === true && Number(state.active_account?.login) === login && String(state.active_account?.server || '') === server && mt5Connector.getClientBridgeHeartbeatAgeMs() < 30000;
      res.json({ configured: true, login, server, bridge_online: synced, attached: synced, active_login: synced ? state.active_account?.login : null, synchronized: synced });
    }
  });

  // 5. Disconnect MT5
  app.post('/api/mt5/disconnect', (req, res) => {
    mt5Connector.disconnect();
    res.json({ success: true, message: 'Disconnected from MT5.' });
  });

  // 5b. Sync Client-Side MT5 Desktop Bridge State (from User's Browser or PC daemon)
  app.post('/api/mt5/sync-client-bridge', async (req, res) => {
    const { account, terminalInfo, symbols, positions } = req.body || {};
    if (!account || !account.login || typeof account.balance !== 'number') {
      return res.status(400).json({ success: false, message: 'Invalid real MT5 account payload.' });
    }
    try {
      const result = await mt5Connector.syncClientBridgeState(account, terminalInfo, symbols, positions);
      if (result.success) {
        await reconciliationEngine.reconcile();
      }
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ success: false, message: err?.message || 'Sync failed' });
    }
  });

  // 5c. Desktop Bridge Action Polling (for real order execution on user's PC)
  app.get('/api/mt5/bridge-poll', (req, res) => {
    const actions = mt5Connector.getPendingBridgeActions();
    res.json({ success: true, actions });
  });

  // 5d. Desktop Bridge Action Result Submission
  app.post('/api/mt5/bridge-action-result', (req, res) => {
    const { actionId, result } = req.body || {};
    if (!actionId) {
      return res.status(400).json({ success: false, message: 'actionId is required' });
    }
    const handled = mt5Connector.handleBridgeActionResult(actionId, result);
    res.json({ success: handled });
  });

  // 6. MT5 Health & Heartbeat check
  app.get('/api/mt5/health-check', async (req, res) => {
    const healthy = await mt5Connector.verifyCurrentHealth();
    res.json({
      healthy,
      mt5_status: appStore.getState().mt5_status,
      active_account: appStore.getState().active_account
    });
  });

  // 7. Reconcile against broker
  app.post('/api/mt5/reconcile', async (req, res) => {
    const result = await reconciliationEngine.reconcile();
    res.json(result);
  });

  // 7b. Live Candlestick & Historical Market Series for Expert TradingView Chart
  const handleGetCandles = (req: express.Request, res: express.Response) => {
    const symbol = String(req.query.symbol || 'EURUSD').toUpperCase();
    const timeframe = (String(req.query.timeframe || '1h').toLowerCase()) as any;
    const count = Math.min(Number(req.query.count || 120), 500);
    void mt5Connector.fetchRealCandles(symbol, timeframe, count).then(result => {
      res.json({
        success: result.candles.length > 0,
        symbol,
        timeframe,
        status: result.status,
        candles: result.candles,
        message: result.candles.length > 0 ? undefined : 'Real MT5 candle history is unavailable; no chart data was fabricated.'
      });
    });
  };
  app.get('/api/market/candles', handleGetCandles);
  app.get('/api/candles', handleGetCandles);

  // Multi-timeframe analysis is deliberately data-gated: no broker candles means no analysis.
  app.post('/api/market/chart-analysis', async (req, res) => {
    const symbol = String(req.body?.symbol || req.query.symbol || 'EURUSD').toUpperCase();
    const timeframes = (req.body?.timeframes || ['15m', '1h', '4h', '1d']) as any[];
    const results: Record<string, any> = {};
    const conflicts: string[] = [];
    const noTradeReasons: string[] = [];
    for (const timeframe of timeframes) {
      const result = await mt5Connector.fetchRealCandles(symbol, timeframe, 200);
      const candles = result.candles;
      const last = candles[candles.length - 1];
      const first = candles[0];
      const bias = !last || !first ? 'UNKNOWN' : last.close > first.close ? 'BULLISH' : last.close < first.close ? 'BEARISH' : 'NEUTRAL';
      results[timeframe] = { status: result.status, candles, bias };
      if (result.status === 'UNAVAILABLE') noTradeReasons.push(`${timeframe}: real MT5 candles unavailable`);
    }
    const biases = Object.values(results).map((r: any) => r.bias).filter((b: string) => b !== 'UNKNOWN');
    const uniqueBiases = [...new Set(biases)];
    if (uniqueBiases.length > 1) conflicts.push(`Timeframes disagree: ${uniqueBiases.join(' vs ')}`);
    const available = Object.values(results).filter((r: any) => r.candles.length > 0) as any[];
    const allCandles = available.flatMap((r: any) => r.candles);
    const closes = allCandles.map((c: any) => c.close);
    const bias = uniqueBiases.length === 1 ? uniqueBiases[0] : uniqueBiases.length > 1 ? 'CONFLICTED' : 'UNKNOWN';
    const analysis: MultiTimeframeChartAnalysis = {
      symbol, status: available.length === 0 ? 'UNAVAILABLE' : available.some((r: any) => r.status === 'STALE') ? 'STALE' : 'LIVE',
      as_of: allCandles.length ? new Date(Math.max(...allCandles.map((c: any) => c.time * 1000))).toISOString() : null,
      freshness_seconds: allCandles.length ? Math.max(0, (Date.now() - Math.max(...allCandles.map((c: any) => c.time * 1000))) / 1000) : null,
      bias, conflicts, levels: { support: closes.length ? [Math.min(...closes)] : [], resistance: closes.length ? [Math.max(...closes)] : [] },
      scenarios: [], trade_permission: available.length && conflicts.length === 0 ? 'REVIEW' : 'BLOCKED',
      no_trade_reasons: noTradeReasons.concat(conflicts), timeframes: results
    };
    appStore.getState().chart_analysis = { ...(appStore.getState().chart_analysis || {}), [symbol]: analysis };
    res.status(analysis.trade_permission === 'BLOCKED' ? 503 : 200).json({ success: true, analysis });
  });

  // 8. Broker data read APIs
  // Canonical dashboard endpoints mirror the local desktop bridge contract so the UI never
  // receives a 404 simply because it omitted the /mt5 namespace. These are READ-ONLY routes.
  app.get('/api/mt5/positions', async (req, res) => {
    const positions = await mt5Connector.refreshPositions();
    res.json({ success: true, positions, source: 'MT5' });
  });
  app.get('/api/positions', async (req, res) => {
    const positions = await mt5Connector.refreshPositions();
    res.json({ success: true, positions, source: 'MT5' });
  });

  app.get('/api/mt5/orders', async (req, res) => {
    const orders = await mt5Connector.refreshOrders();
    res.json({ success: true, orders, source: 'MT5' });
  });
  app.get('/api/orders', async (req, res) => {
    const orders = await mt5Connector.refreshOrders();
    res.json({ success: true, orders, source: 'MT5' });
  });

  app.get('/api/mt5/symbols', async (req, res) => {
    const symbols = await mt5Connector.refreshBrokerSymbols();
    res.json({ success: true, symbols, source: 'MT5' });
  });
  app.get('/api/symbols', async (req, res) => {
    const symbols = await mt5Connector.refreshBrokerSymbols();
    res.json({ success: true, symbols, source: 'MT5' });
  });

  const handleClosePosition = async (req: express.Request, res: express.Response) => {
    const health = appStore.getConnectionHealth();
    if (!health.is_synchronized) {
      return res.status(403).json({
        success: false,
        message: `Position close blocked: MT5 terminal is ${health.status.toLowerCase()} (${health.message}). Trading actions prevented until sync is confirmed.`
      });
    }
    const { ticket, volume } = req.body || {};
    if (!ticket) {
      return res.status(400).json({ success: false, message: 'Position ticket is required.' });
    }
    const result = await mt5Connector.closePosition(Number(ticket), volume ? Number(volume) : undefined);
    res.json(result);
  };
  app.post('/api/mt5/positions/close', handleClosePosition);
  app.post('/api/mt5/position/close', handleClosePosition);

  // 8b. Modify Position SL/TP
  const handleModifyPosition = async (req: express.Request, res: express.Response) => {
    const health = appStore.getConnectionHealth();
    if (!health.is_synchronized) {
      return res.status(403).json({
        success: false,
        message: `Position modify blocked: MT5 terminal is ${health.status.toLowerCase()} (${health.message}). Trading actions prevented until sync is confirmed.`
      });
    }
    const { ticket, sl, tp } = req.body || {};
    if (!ticket) {
      return res.status(400).json({ success: false, message: 'Position ticket is required.' });
    }
    const result = await mt5Connector.modifyPosition(
      Number(ticket),
      sl !== undefined && sl !== null ? Number(sl) : undefined,
      tp !== undefined && tp !== null ? Number(tp) : undefined
    );
    res.json(result);
  };
  app.post('/api/position/modify', handleModifyPosition);
  app.post('/api/positions/modify', handleModifyPosition);
  app.post('/api/mt5/position/modify', handleModifyPosition);
  app.post('/api/mt5/positions/modify', handleModifyPosition);

  // 9. Manual / Autonomous Order Send
  const handleSendOrder = async (req: express.Request, res: express.Response) => {
    const health = appStore.getConnectionHealth();
    if (!health.is_synchronized) {
      return res.status(403).json({
        success: false,
        message: `Order execution blocked: MT5 terminal is ${health.status.toLowerCase()} (${health.message}). Trading actions prevented until sync is confirmed.`
      });
    }
    const { symbol, action, volume, sl, tp, comment } = req.body || {};
    if (!symbol || !action) {
      return res.status(400).json({ success: false, message: 'symbol and action are required.' });
    }
    if (action !== 'BUY' && action !== 'SELL') {
      return res.status(400).json({ success: false, message: 'action must be BUY or SELL.' });
    }
    const result = await mt5Connector.sendOrder({
      symbol,
      action,
      volume: volume === undefined || volume === null || volume === '' ? undefined : Number(volume),
      sl: sl ? Number(sl) : undefined,
      tp: tp ? Number(tp) : undefined,
      comment: comment || 'AI-TRADER Manual'
    });
    res.json(result);
  };
  app.post('/api/mt5/orders/send', handleSendOrder);
  app.post('/api/mt5/order/send', handleSendOrder);

  // Rare, independently-confirmed AI pending order. This has its own quality criteria and is never
  // treated as a normal market entry merely because confidence crossed the ordinary threshold.
  app.post('/api/ai/pending-order', async (req, res) => {
    const symbol = String(req.body?.symbol || '').toUpperCase();
    if (!symbol) return res.status(400).json({ success: false, message: 'symbol is required.' });
    try {
      const analysis = await marketIntelligence.fetchLiveAnalysis(symbol, tradingModeEngine.getPrimaryTimeframe(), 200, false);
      if (analysis.data_status !== 'LIVE') return res.status(503).json({ success: false, message: 'Live broker analysis unavailable.' });
      const candidates = strategyRankingEngine.evaluateAllStrategies(analysis).map(c => strategyRankingEngine.finalizeCandidateConfidence(c, analysis, { [symbol]: analysis }));
      const candidate = candidates.sort((a,b) => b.confidence * (1-b.uncertainty) * b.expectedEdge - a.confidence * (1-a.uncertainty) * a.expectedEdge)[0];
      const symbolInfo = appStore.getState().symbols.find(s => s.name === symbol);
      if (!candidate || !symbolInfo) return res.status(409).json({ success: false, message: 'No valid pending setup candidate.' });
      const minimum = appStore.getState().user_settings.min_action_confidence_percent / 100;
      const qualityPass = candidate.confidence >= Math.min(0.99, minimum + 0.05) && candidate.setupQuality >= 0.75 && candidate.uncertainty <= 0.25 && candidate.expectedEdge >= 2.0 && candidate.entryTiming === 'CONFIRMED' && candidate.opposingFactors.length <= 1;
      const current = candidate.direction === 'BUY' ? symbolInfo.ask : symbolInfo.bid;
      const distance = Math.abs(candidate.entryPrice - current);
      const pricePass = distance >= Math.max(Number(analysis.atr || 0) * 0.20, Number(symbolInfo.point || 0) * 5);
      if (!qualityPass || !pricePass) return res.status(409).json({ success: false, message: `Pending criteria not independently confirmed. qualityPass=${qualityPass}, priceLocationPass=${pricePass}.`, candidate: { direction: candidate.direction, confidence: Math.round(candidate.confidence*100), setupQuality: Math.round(candidate.setupQuality*100), uncertainty: Math.round(candidate.uncertainty*100), expectedEdge: candidate.expectedEdge, entryTiming: candidate.entryTiming } });
      let pendingType: 'BUY_LIMIT' | 'SELL_LIMIT' | 'BUY_STOP' | 'SELL_STOP';
      if (candidate.direction === 'BUY') pendingType = candidate.entryPrice < current ? 'BUY_LIMIT' : 'BUY_STOP';
      else pendingType = candidate.entryPrice > current ? 'SELL_LIMIT' : 'SELL_STOP';
      const risk = riskEngine.validateTradeRisk(symbol, candidate.direction, candidate.entryPrice, candidate.slPrice);
      if (!risk.allowed) return res.status(403).json({ success: false, message: `Pending order blocked by technical/risk protection: ${risk.reason}` });
      const result = await mt5Connector.sendPendingOrder({ symbol, action: pendingType, volume: risk.volume, price: candidate.entryPrice, sl: candidate.slPrice, tp: candidate.tpPrice, comment: `AI-TRADER ${pendingType}` });
      res.status(result.success ? 200 : 502).json({ ...result, pendingType, candidate });
    } catch (err: any) { res.status(500).json({ success: false, message: err?.message || 'AI pending order failed.' }); }
  });

  // Direct manual market order: current price + AI/structure-derived SL/TP + broker-sized volume.
  // This bypasses the autonomous confidence threshold by design, but never bypasses broker/risk safety.
  app.post('/api/mt5/manual-market-order', async (req, res) => {
    const symbol = String(req.body?.symbol || '').toUpperCase();
    const action = String(req.body?.action || '').toUpperCase() as 'BUY' | 'SELL';
    if (!symbol || !['BUY', 'SELL'].includes(action)) return res.status(400).json({ success: false, message: 'symbol and BUY/SELL action are required.' });
    try {
      const analysis = await marketIntelligence.fetchLiveAnalysis(symbol, tradingModeEngine.getPrimaryTimeframe(), 200, false);
      if (analysis.data_status !== 'LIVE') return res.status(503).json({ success: false, message: `Manual order blocked: live broker candles unavailable for ${symbol}.` });
      const candidates = strategyRankingEngine.evaluateAllStrategies(analysis).map(c => strategyRankingEngine.finalizeCandidateConfidence(c, analysis, { [symbol]: analysis }));
      const selected = candidates.find(c => c.direction === action) || null;
      const entry = Number(action === 'BUY' ? appStore.getState().symbols.find(s => s.name === symbol)?.ask : appStore.getState().symbols.find(s => s.name === symbol)?.bid);
      const atr = Number(analysis.atr || 0);
      const fallbackSl = action === 'BUY' ? entry - atr * 1.35 : entry + atr * 1.35;
      const fallbackTp = action === 'BUY' ? entry + Math.max(atr * 2.7, Math.abs(Number(analysis.structure.last_swing_high || entry) - entry)) : entry - Math.max(atr * 2.7, Math.abs(Number(analysis.structure.last_swing_low || entry) - entry));
      const sl = Number(selected?.slPrice || fallbackSl);
      const tp = Number(selected?.tpPrice || fallbackTp);
      const risk = riskEngine.validateTradeRisk(symbol, action, entry, sl);
      if (!risk.allowed) return res.status(403).json({ success: false, message: `Manual ${action} blocked by technical/risk protection: ${risk.reason}` });
      const result = await mt5Connector.sendOrder({ symbol, action, volume: risk.volume, sl, tp, comment: 'AI-TRADER Manual Market' });
      res.status(result.success ? 200 : 502).json({ ...result, source: 'MANUAL_MARKET_ORDER', sl, tp, volume: risk.volume, analysisConfidence: selected ? Math.round(selected.confidence * 100) : null });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err?.message || 'Manual market order failed.' });
    }
  });

  const handleCancelOrder = async (req: express.Request, res: express.Response) => {
    const health = appStore.getConnectionHealth();
    if (!health.is_synchronized) {
      return res.status(403).json({ success: false, message: `Pending order cancellation blocked: MT5 terminal is ${health.status.toLowerCase()} (${health.message}).` });
    }
    const ticket = Number(req.body?.ticket);
    if (!Number.isFinite(ticket) || ticket <= 0) return res.status(400).json({ success: false, message: 'Valid pending order ticket is required.' });
    const result = await mt5Connector.cancelOrder(ticket);
    res.json(result);
  };
  app.post('/api/mt5/order/cancel', handleCancelOrder);
  app.post('/api/mt5/orders/cancel', handleCancelOrder);

  // 9b. MT5 Sync & Health Recheck
  app.post('/api/mt5/reconnect', async (req, res) => {
    appStore.setMT5Status('Reconnecting', 'User initiated MT5 connection handshake re-check.');
    try {
      await mt5Connector.verifyCurrentHealth();
      const health = appStore.getConnectionHealth();
      res.json({ success: health.is_synchronized, health });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err?.message || 'Reconnect failed' });
    }
  });

  // 10. AI Engine controls (Strict Verification Enforced)
  app.post('/api/ai/start', async (req, res) => {
    const result = await aiTradingPipeline.startAI();
    res.json(result);
  });

  app.get('/api/piya/brief', (req, res) => {
    res.json({ success: true, brief: piyaQuantEngine.getBrief() });
  });

  app.get('/api/piya/opportunity/:symbol', async (req, res) => {
    const symbol = String(req.params.symbol || '').toUpperCase();
    if (!symbol) {
      return res.status(400).json({ success: false, message: 'Symbol is required.' });
    }
    try {
      const result = await aiTradingPipeline.evaluateAndExecuteSymbol(symbol, false);
      res.json({ ...result, executable: !!result.thesis && result.thesis.direction !== 'WAIT' });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err?.message || 'Opportunity analysis failed.' });
    }
  });

  app.post('/api/ai/pause', (req, res) => {
    const result = aiTradingPipeline.pauseAI();
    res.json(result);
  });

  app.post('/api/ai/stop', (req, res) => {
    const result = aiTradingPipeline.stopAI();
    res.json(result);
  });

  // 10b. Targeted AI Symbol Evaluation & Immediate Execution on Active Account
  app.post('/api/ai/evaluate-symbol', async (req, res) => {
    const { symbol, autoExecute } = req.body || {};
    if (!symbol) {
      return res.status(400).json({ success: false, message: 'Symbol is required' });
    }
    const result = await aiTradingPipeline.evaluateAndExecuteSymbol(String(symbol).toUpperCase(), Boolean(autoExecute));
    res.json(result);
  });

  // 10c. Full-Market AI Scan & Instant Working Report
  app.post('/api/ai/scan-all', async (req, res) => {
    try {
      const report = await aiTradingPipeline.triggerFullMarketScan();
      res.json({ success: true, report });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err?.message || 'Scan failed' });
    }
  });

  // 10d. Confirmed Decision Stream Endpoint
  app.get('/api/confirmed-decisions', (req, res) => {
    const state = appStore.getState();
    res.json({
      success: true,
      decisions: state.confirmed_decisions || []
    });
  });

  // 11. Emergency Kill & Unlock (Section 55)
  app.post('/api/emergency-kill', async (req, res) => {
    const { reason } = req.body || {};
    const result = await aiTradingPipeline.emergencyKill(reason);
    res.json(result);
  });

  app.post('/api/emergency-unlock', (req, res) => {
    const result = aiTradingPipeline.emergencyUnlock();
    res.json(result);
  });

  // 12. Safety Gates (Section 73)
  app.get('/api/safety-gates', (req, res) => {
    const report = safetyGateEngine.evaluateGates();
    res.json(report);
  });

  // 13. Dashboard Symbol Controls (Section 14: AUTO, ON, OFF, Bulk)
  app.post('/api/symbols/toggle', (req, res) => {
    const { symbol, mode } = req.body || {};
    if (!symbol || !mode) {
      return res.status(400).json({ success: false, message: 'symbol and mode (AUTO|ON|OFF) required.' });
    }
    appStore.setSymbolControl(symbol, mode);
    res.json({ success: true, symbol_controls: appStore.getState().symbol_controls });
  });

  app.post('/api/symbols/bulk', (req, res) => {
    const { mode } = req.body || {};
    if (!mode || !['AUTO', 'ON', 'OFF'].includes(mode)) {
      return res.status(400).json({ success: false, message: 'Valid mode (AUTO|ON|OFF) required.' });
    }
    appStore.bulkSetSymbolControls(mode);
    res.json({ success: true, symbol_controls: appStore.getState().symbol_controls });
  });

  // 14. User settings: trading mode, theme, Piya and runtime preferences.
  app.get('/api/settings', (req, res) => {
    res.json({ success: true, settings: appStore.getState().user_settings });
  });

  app.post('/api/settings', (req, res) => {
    try {
      const body = req.body || {};
      const settings = appStore.updateUserSettings({
        theme: body.theme,
        min_action_confidence_percent: Number.isFinite(Number(body.min_action_confidence_percent)) ? Number(body.min_action_confidence_percent) : undefined,
        autonomous_entry_enabled: typeof body.autonomous_entry_enabled === 'boolean' ? body.autonomous_entry_enabled : undefined,
        position_management_enabled: typeof body.position_management_enabled === 'boolean' ? body.position_management_enabled : undefined,
        early_exit_on_confirmed_invalidation: typeof body.early_exit_on_confirmed_invalidation === 'boolean' ? body.early_exit_on_confirmed_invalidation : undefined,
        sound_alerts: typeof body.sound_alerts === 'boolean' ? body.sound_alerts : undefined,
        dashboard_refresh_ms: Number.isFinite(Number(body.dashboard_refresh_ms)) ? Number(body.dashboard_refresh_ms) : undefined,
        auto_start_dashboard: typeof body.auto_start_dashboard === 'boolean' ? body.auto_start_dashboard : undefined,
        auto_start_bridge: typeof body.auto_start_bridge === 'boolean' ? body.auto_start_bridge : undefined,
        auto_restart_components: typeof body.auto_restart_components === 'boolean' ? body.auto_restart_components : undefined,
        enabled_strategies: Array.isArray(body.enabled_strategies) ? body.enabled_strategies.map(String) : undefined,
        max_entries_per_scan: Number.isFinite(Number(body.max_entries_per_scan)) ? Number(body.max_entries_per_scan) : undefined,
        max_positions_per_symbol: Number.isFinite(Number(body.max_positions_per_symbol)) ? Number(body.max_positions_per_symbol) : undefined,
        min_net_edge_r: Number.isFinite(Number(body.min_net_edge_r)) ? Number(body.min_net_edge_r) : undefined,
        require_confirmed_mtf: typeof body.require_confirmed_mtf === 'boolean' ? body.require_confirmed_mtf : undefined,
        news_provider_required: typeof body.news_provider_required === 'boolean' ? body.news_provider_required : undefined,
        trading: body.trading && typeof body.trading === 'object' ? body.trading : undefined
      });
      res.json({ success: true, settings });
    } catch (err: any) {
      res.status(400).json({ success: false, message: err?.message || 'Invalid settings.' });
    }
  });

  // 14. Risk Settings Update
  app.post('/api/risk/settings', (req, res) => {
    const settings = req.body || {};
    appStore.updateRiskSettings(settings);
    res.json({ success: true, settings: appStore.getState().risk_settings });
  });

  // 15. Local Profile (Stored separately from MT5 broker financial truth)
  app.post('/api/accounts/profile', (req, res) => {
    const { label, login, server, broker, terminal_path } = req.body || {};
    if (!label) {
      return res.status(400).json({ success: false, message: 'Profile label is required.' });
    }
    const profile = appStore.addAccountProfile({
      label,
      login: login ? Number(login) : undefined,
      server,
      broker,
      terminal_path,
      is_active: false
    });
    res.json({ success: true, profile });
  });

  // 15b. Local Ollama model discovery (credentials/config remain server-side)
  app.get('/api/ollama/models', async (req, res) => {
    const baseUrl = (process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434').replace(/\/$/, '');
    try {
      const response = await fetch(`${baseUrl}/api/tags`, { signal: AbortSignal.timeout(2000) });
      if (!response.ok) return res.json({ configured: true, reachable: false, models: [], message: `Ollama returned HTTP ${response.status}.` });
      const payload = await response.json() as any;
      const models = Array.isArray(payload.models) ? payload.models.map((m: any) => String(m.name || '')).filter(Boolean) : [];
      res.json({ configured: true, reachable: true, selected: process.env.OLLAMA_MODEL || null, models });
    } catch (err: any) {
      res.json({ configured: true, reachable: false, models: [], selected: process.env.OLLAMA_MODEL || null, message: err?.message || 'Ollama not reachable.' });
    }
  });

  // 16. Embedded ChatGPT Project Assistant
  app.get('/api/chatgpt/context', (req, res) => {
    res.json({ success: true, configured: !!process.env.OPENAI_API_KEY?.trim(), model: process.env.OPENAI_MODEL || 'gpt-5.6-luna', permission: getPermission(), files: listProjectFiles() });
  });

  app.get('/api/chatgpt/history', (req, res) => {
    res.json({ success: true, messages: readChatHistory() });
  });

  app.post('/api/chatgpt/permission', (req, res) => {
    const level = String(req.body?.level || '').toUpperCase() as ChatGPTPermission;
    if (!['OBSERVE', 'DIAGNOSE', 'APPROVE_ACTION', 'FULL_CONTROL'].includes(level)) return res.status(400).json({ success: false, message: 'Invalid ChatGPT permission level.' });
    setPermission(level);
    appStore.log('INFO', `[CHATGPT] Permission changed to ${level}.`);
    res.json({ success: true, permission: level });
  });

  app.get('/api/chatgpt/file', (req, res) => {
    try {
      const file = String(req.query.path || '');
      const context = buildProjectContext(appStore.getState(), [file]);
      const item = context.source_files[0];
      if (!item || (item as any).error) return res.status(400).json({ success: false, message: (item as any)?.error || 'File unavailable.' });
      res.json({ success: true, file: item });
    } catch (err: any) { res.status(400).json({ success: false, message: err?.message || 'Unable to read project file.' }); }
  });

  app.post('/api/chatgpt/chat', async (req, res) => {
    const message = String(req.body?.message || '').trim();
    if (!message) return res.status(400).json({ success: false, message: 'Message is required.' });
    try {
      const state = appStore.getState();
      const includeLive = req.body?.includeLive !== false;
      const includeSource = req.body?.includeSource !== false;
      const sourcePaths = includeSource && Array.isArray(req.body?.sourcePaths) ? req.body.sourcePaths.map(String).slice(0, 8) : [];
      const context = buildProjectContext(includeLive ? state : { mt5_status: 'OMITTED BY USER', user_settings: state.user_settings }, sourcePaths);
      const history = Array.isArray(req.body?.history) ? req.body.history.slice(-40) : readChatHistory().slice(-40);
      const proposalMode = req.body?.proposalMode === true && ['APPROVE_ACTION', 'FULL_CONTROL'].includes(getPermission());
      const imageDataUrl = typeof req.body?.imageDataUrl === 'string' ? req.body.imageDataUrl : undefined;
      const prompt = `PROJECT CONTEXT (authoritative local snapshot):\n${JSON.stringify(context, null, 2)}\n\nCONVERSATION HISTORY:\n${JSON.stringify(history, null, 2)}\n\nUSER REQUEST:\n${message}\n\nPermission: ${getPermission()}. ${proposalMode ? 'If a code fix is appropriate, return complete replacement content only for files you actually inspected; do not propose trades or secret changes.' : 'Do not return code changes as an executable action; explain what should be changed.'}`;
      const result = await callOpenAI(prompt, proposalMode ? 'proposal' : 'chat', imageDataUrl);
      const reply = proposalMode ? String((result as any).structured?.reply || '') : String((result as any).reply || '');
      const changes = proposalMode ? ((result as any).structured?.changes || []) : [];
      appendChatMessage({ role: 'user', content: message });
      appendChatMessage({ role: 'assistant', content: reply });
      res.json({ success: true, configured: result.configured, model: (result as any).model || process.env.OPENAI_MODEL || 'gpt-5.6-luna', reply, changes });
    } catch (err: any) {
      res.status(502).json({ success: false, message: err?.message || 'ChatGPT request failed.' });
    }
  });

  app.post('/api/chatgpt/apply-change', (req, res) => {
    try {
      const permission = getPermission();
      const result = applyProjectFileChange(String(req.body?.path || ''), String(req.body?.content || ''), permission, req.body?.confirmed === true);
      appStore.log('INFO', `[CHATGPT] User-confirmed source change applied: ${result.path} (${result.bytes} bytes).`);
      res.json({ success: true, result });
    } catch (err: any) {
      res.status(403).json({ success: false, message: err?.message || 'Code change rejected.' });
    }
  });

  // 17. Piya Quant Partner operational chat (source-of-truth aware)
  const handlePiyaQuery = async (req: express.Request, res: express.Response) => {
    const text = String(req.body?.query || req.body?.prompt || '').trim();
    if (!text) return res.status(400).json({ reply: 'Query cannot be empty.' });
    try {
      const reply = await piyaOperator.answer(text);
      res.json({ success: true, reply });
    } catch (err: any) {
      res.status(500).json({ success: false, reply: `Piya error: ${err?.message || 'Unable to answer.'}` });
    }
  };
  app.post('/api/piya/query', handlePiyaQuery);
  app.post('/api/piya/chat', handlePiyaQuery);


  // 18. Gemini Vision Chart Brain
  app.post('/api/chart/vision-analyze', async (req, res) => {
    const { symbol, timeframe, candles } = req.body || {};
    const sym = String(symbol || 'EURUSD').toUpperCase();
    const tf = (timeframe || tradingModeEngine.getPrimaryTimeframe()) as any;
    try {
      const analysis = await geminiVisionBrain.analyzeChartWithVision(sym, tf, candles);
      const live = appStore.getState().analyses?.[sym];
      const market = live && live.timeframe === tf ? live : marketIntelligence.analyzeSymbol(sym, tf, candles);
      const provider = analysis.modelUsed?.startsWith('gemini-') ? 'GEMINI' : analysis.modelUsed === 'unavailable' ? 'UNAVAILABLE' : 'ALGORITHMIC_FALLBACK';
      market.gemini = {
        provider, model: analysis.modelUsed || 'unavailable', recommendation: analysis.recommendation, conviction_percent: analysis.convictionScore,
        reasoning: analysis.reasoning, entry_price: analysis.entryPrice, stop_loss: analysis.stopLossPrice, take_profit: analysis.takeProfitPrice,
        risk_reward: analysis.riskRewardRatio, visual_markups: analysis.visualMarkups, analyzed_at: analysis.timestamp
      };
      try {
        const frames = tradingModeEngine.getConfirmationTimeframes();
        const confirmations = await Promise.all(frames.map(frame => marketIntelligence.fetchLiveAnalysis(sym, frame, 200, false)));
        const bias = (a: any): 'BUY' | 'SELL' | 'NEUTRAL' | 'UNKNOWN' => a.data_status !== 'LIVE' ? 'UNKNOWN' : (['UP','STRONG_UP'].includes(a.trend) || String(a.regime).includes('BULLISH')) ? 'BUY' : (['DOWN','STRONG_DOWN'].includes(a.trend) || String(a.regime).includes('BEARISH')) ? 'SELL' : 'NEUTRAL';
        const all = [market, ...confirmations];
        const primaryBias = bias(market);
        const direction = analysis.recommendation === 'BUY' || analysis.recommendation === 'SELL' ? analysis.recommendation : primaryBias === 'BUY' ? 'BUY' : 'SELL';
        const alignment = all.filter(a => bias(a) === direction).length / Math.max(1, all.length);
        market.mtf_confirmation = {
          symbol: sym, direction, primary_timeframe: tradingModeEngine.getPrimaryTimeframe(), primary_bias: primaryBias,
          confirmation_frames: frames.map((frame, i) => ({ timeframe: frame, bias: bias(confirmations[i]) })),
          m15_bias: frames[0] === '15m' ? bias(confirmations[0]) : primaryBias, h1_bias: frames.includes('1h') ? bias(confirmations[frames.indexOf('1h')]) : primaryBias, h4_bias: frames.includes('4h') ? bias(confirmations[frames.indexOf('4h')]) : primaryBias,
          alignment_score: Number(alignment.toFixed(2)), passed: alignment >= 0.67 && primaryBias === direction, reasons: [`Trading mode ${tradingModeEngine.getMode()} uses primary ${tradingModeEngine.getPrimaryTimeframe()} with confirmations ${frames.join(' / ')}.`], checked_at: new Date().toISOString()
        } as any;
      } catch (mtfErr: any) {
        appStore.log('WARN', `[VISION-MTF] ${sym}: ${mtfErr?.message || mtfErr}`);
      }
      const finalThesis = strategyRankingEngine.evaluateOpportunities({ [sym]: market })[0];
      const threshold = appStore.getState().user_settings?.min_action_confidence_percent ?? 80;
      const finalDirection: 'BUY' | 'SELL' = finalThesis?.direction
        || (analysis.recommendation === 'BUY' ? 'BUY' : analysis.recommendation === 'SELL' ? 'SELL' : (market.trend === 'UP' || market.trend === 'STRONG_UP' ? 'BUY' : 'SELL'));
      const finalConfidence = finalThesis ? Math.round(finalThesis.confidence * 100) : Math.round(analysis.convictionScore);
      const confidencePassed = finalConfidence >= threshold;
      const verifiedDecision = {
        symbol: sym, direction: finalDirection, confidence: finalConfidence,
        status: confidencePassed ? 'ENTRY_APPROVED' : 'BELOW_THRESHOLD',
        entryApproved: confidencePassed,
        setupQuality: finalThesis?.setup_quality ?? finalConfidence, entryTiming: finalThesis?.entry_timing || 'DEVELOPING', confidenceSource: provider,
        tradingMode: tradingModeEngine.getMode(), primaryTimeframe: tradingModeEngine.getPrimaryTimeframe(),
        minimumConfidencePercent: threshold,
        confidenceVerification: (finalThesis as any)?.confidence_verification || (provider === 'ALGORITHMIC_FALLBACK' ? 'FALLBACK_PROVISIONAL' : 'EVIDENCE_VERIFIED'),
        supportingFactors: finalThesis?.supporting_evidence || [], opposingFactors: finalThesis?.opposing_evidence || [],
        finalDecisionRule: `FINAL DECISION = VERIFIED CONFIDENCE ${finalConfidence}% vs MINIMUM ${threshold}%. No second strategy veto.`
      };
      res.json({ success: true, analysis, verifiedDecision, tradingMode: tradingModeEngine.getMode(), minimumConfidencePercent: verifiedDecision.minimumConfidencePercent });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err?.message || 'Vision analysis failed' });
    }
  });

  app.get('/api/chart/ai', async (req, res) => {
    const sym = String(req.query.symbol || 'EURUSD').toUpperCase();
    const tf = String(req.query.timeframe || '1h').toLowerCase() as any;
    const showForecast = String(req.query.forecast ?? '1') !== '0';
    const historyOffset = Math.max(0, Math.min(180, Number(req.query.offset || 0)));
    const rawCandles = await mt5Connector.fetchRealCandles(sym, tf, 360);
    const realCandles = rawCandles.status === 'LIVE' ? { ...rawCandles, candles: rawCandles.candles.slice(Math.max(0, rawCandles.candles.length - 160 - historyOffset), Math.max(0, rawCandles.candles.length - historyOffset) || undefined) } : rawCandles;
    if (realCandles.status !== 'LIVE' || realCandles.candles.length === 0) {
      const svg = chartRenderer.renderChartSvg(sym, tf, [], {});
      res.setHeader('Content-Type', 'image/svg+xml');
      return res.send(svg);
    }

    const storeState = appStore.getState();
    const analysis = storeState.analyses?.[sym];
    const livePosition = (storeState.positions || []).find((p: any) => p.symbol === sym && Number(p.volume) > 0);
    const thesis = [...(storeState.theses || [])].reverse().find((t: any) => t.symbol === sym && ['BUY', 'SELL'].includes(t.direction) && (t.status === 'PENDING' || (t.status === 'EXECUTED' && !!livePosition)));
    const markups: any[] = [];
    if (thesis?.entry_price != null) markups.push({ id: 'ai-entry', type: 'ENTRY_ZONE', priceHigh: thesis.entry_price, priceLow: thesis.entry_price, label: `AI ENTRY ${Number(thesis.entry_price).toFixed(sym.includes('JPY') ? 3 : sym.includes('XAU') ? 2 : 5)}`, color: '#38bdf8' });
    // Order protection levels are displayed only after a broker position actually exists.
    if (livePosition) {
      if (livePosition.sl > 0) markups.push({ id: 'order-sl', type: 'STOP_LOSS', priceHigh: livePosition.sl, priceLow: livePosition.sl, label: `ORDER SL ${Number(livePosition.sl).toFixed(sym.includes('JPY') ? 3 : sym.includes('XAU') ? 2 : 5)}`, color: '#ef4444' });
      if (livePosition.tp > 0) markups.push({ id: 'order-tp', type: 'TAKE_PROFIT', priceHigh: livePosition.tp, priceLow: livePosition.tp, label: `ORDER TP ${Number(livePosition.tp).toFixed(sym.includes('JPY') ? 3 : sym.includes('XAU') ? 2 : 5)}`, color: '#10b981' });
    }

    const levels = (analysis as any)?.structure;
    if (levels?.order_block_price != null) markups.push({ id: `ai-ob-${sym}`, type: 'ORDER_BLOCK', priceHigh: levels.order_block_price, priceLow: levels.order_block_price, label: `ORDER BLOCK ${Number(levels.order_block_price).toFixed(sym.includes('JPY') ? 3 : sym.includes('XAU') ? 2 : 5)}`, color: '#a78bfa' });
    const geminiMarkups = ((analysis as any)?.gemini?.visual_markups || []) as any[];
    for (const m of geminiMarkups) {
      if (!Number.isFinite(Number(m.priceHigh)) || !Number.isFinite(Number(m.priceLow))) continue;
      // Before an actual broker position exists, AI structural/projection levels are allowed,
      // but ORDER SL/TP overlays must never be presented as live order protection.
      if (!livePosition && ['STOP_LOSS', 'TAKE_PROFIT'].includes(String(m.type))) continue;
      markups.push({ ...m, id: String(m.id || `gemini-${sym}-${m.type}-${m.priceLow}-${m.priceHigh}`) });
    }

    const forecast = showForecast && thesis && Number.isFinite(Number(thesis.entry_price)) && Number.isFinite(Number(thesis.tp_price))
      ? {
          direction: thesis.direction as 'BUY' | 'SELL',
          entry: Number(thesis.entry_price),
          ...(livePosition && Number.isFinite(Number(livePosition.sl)) && Number(livePosition.sl) > 0 ? { sl: Number(livePosition.sl) } : {}),
          tp: Number(thesis.tp_price),
          confidencePercent: Number(thesis.verified_confidence_percent ?? Math.round(Number(thesis.confidence || 0) * 100)),
          horizonBars: tradingModeEngine.getMode() === 'SCALPING' ? 8 : tradingModeEngine.getMode() === 'INTRADAY' ? 14 : 20
        }
      : undefined;
    const svg = chartRenderer.renderChartSvg(sym, tf, realCandles.candles, { markups, forecast, showSmc: true, showEma: true, showVolume: true });
    res.setHeader('Content-Type', 'image/svg+xml');
    return res.send(svg);
  });

  app.get('/api/chart/svg', async (req, res) => {
    const sym = String(req.query.symbol || 'EURUSD').toUpperCase();
    const tf = (String(req.query.timeframe || '1h').toLowerCase()) as any;
    const realCandles = await mt5Connector.fetchRealCandles(sym, tf, 80);
    if (realCandles.status !== 'LIVE' || realCandles.candles.length === 0) {
      const svg = chartRenderer.renderChartSvg(sym, tf, [], {});
      res.setHeader('Content-Type', 'image/svg+xml');
      return res.send(svg);
    }
    const svg = chartRenderer.renderChartSvg(sym, tf, realCandles.candles, {});
    res.setHeader('Content-Type', 'image/svg+xml');
    res.send(svg);
  });

  // 19. 24/7 Mobile Secretary Bridge (Telegram)
  app.get('/api/telegram/status', (req, res) => {
    res.json(telegramSecretary.getStatus());
  });

  app.post('/api/telegram/configure', (req, res) => {
    const { botToken, chatId } = req.body || {};
    if (!botToken) {
      return res.status(400).json({ success: false, message: 'botToken is required.' });
    }
    telegramSecretary.configure(botToken, chatId);
    res.json({ success: true, message: 'Telegram Secretary credentials updated.' });
  });

  app.post('/api/telegram/test', async (req, res) => {
    const ok = await telegramSecretary.sendMessage('👋 <b>Test Ping from AI-TRADER!</b>\nYour 24/7 Mobile Secretary Bridge is active and ready to deliver real-time trade alerts and accept remote commands.');
    res.json({ success: ok, message: ok ? 'Test message sent to Telegram successfully.' : 'Failed to send message. Check bot token and chat ID.' });
  });

  // 19. Autonomous DevOps Self-Healing
  app.get('/api/self-healing/status', (req, res) => {
    res.json({ success: true, history: selfHealingEngine.getHistory() });
  });

  app.post('/api/self-healing/scan', async (req, res) => {
    try {
      const result = await selfHealingEngine.scanAndHeal();
      res.json({ success: true, ...result });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err?.message || 'Scan failed' });
    }
  });

  // 20. Institutional Liquidity Windows & Macro News Halts
  app.get('/api/market/liquidity-window', (req, res) => {
    const status = liquidityAndNewsGuard.isHighLiquidityWindow();
    res.json(status);
  });

  app.get('/api/market/news-halt', (req, res) => {
    const symbol = String(req.query.symbol || 'EURUSD').toUpperCase();
    const status = liquidityAndNewsGuard.checkMacroNewsHalt(symbol);
    res.json(status);
  });

  // --- Vite & SPA Frontend Serving ---
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: process.env.ENABLE_HMR === 'true',
        watch: process.env.ENABLE_HMR === 'true' ? {} : null,
      },
      appType: 'spa'
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  // Primary live intelligence observer: Gemini-backed symbol-by-symbol analysis.
  // Piya is no longer the primary analysis loop.
  liveAnalysisService.start();

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`AI-TRADER institutional server listening on http://0.0.0.0:${PORT}`);
    console.log('[PIYA] Quant intelligence monitor started — live MT5 analysis observer active.');
  });
}

startServer().catch((err) => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});
