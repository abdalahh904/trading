/**
 * AI-TRADER Automated Verification Suite
 * Proves that:
 * 1. Zero fake accounts are created
 * 2. Zero fake balances are permitted
 * 3. Mock backend is NEVER automatically chosen
 * 4. START AI is strictly blocked without real verified MT5 account
 * 5. MT5 disconnect immediately halts new orders
 * 6. Local profiles store metadata only; MT5 is the sole source of financial truth
 */

import { appStore } from '../src/server/state_store.js';
import { mt5Connector } from '../src/server/mt5_connector.js';
import { marketIntelligence } from '../src/server/market_intelligence.js';
import { strategyRankingEngine, STRATEGY_CATALOG } from '../src/server/strategy_ranking.js';
import { aiTradingPipeline } from '../src/server/ai_trading_pipeline.js';
import { riskEngine } from '../src/server/risk_engine.js';
import { reconciliationEngine } from '../src/server/reconciliation_engine.js';
import { piyaQuantEngine } from '../src/server/piya_quant_engine.js';

let passedCount = 0;
let totalCount = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  totalCount++;
  if (condition) {
    passedCount++;
    console.log(`  ✓ PASS: ${testName}`);
  } else {
    console.error(`  ✗ FAIL: ${testName} ${detail ? `(${detail})` : ''}`);
  }
}

async function runAllTests() {
  console.log('\n======================================================');
  console.log('AI-TRADER INSTITUTIONAL MT5 VERIFICATION TEST SUITE');
  console.log('======================================================\n');

  // Test 1: Initial state has NO fake account and NO fake balance
  console.log('[Suite 1: Zero Fake Account & Zero Fake Balance Enforced]');
  const initialState = appStore.getState();
  assert(initialState.active_account === null, 'Initial state has no active account');
  assert(initialState.mt5_status === 'Disconnected', 'Initial MT5 status is Disconnected (not connected)');
  assert(initialState.ai_state === 'STOPPED', 'Initial AI state is STOPPED');

  // Stage 1: executable strategy catalog + live-data gate
  console.log('\n[Stage 1: Seven Strategy Engine Integrity]');
  assert(STRATEGY_CATALOG.length === 7, 'Exactly seven executable strategy methods are registered');
  assert(new Set(STRATEGY_CATALOG.map(s => s.id)).size === 7, 'All seven strategy IDs are unique');
  assert(strategyRankingEngine.getExecutableStrategyIds().length === 7, 'All seven catalog strategies are wired to executable evaluators');
  const unavailable = marketIntelligence.analyzeSymbol('EURUSD', 'H1');
  assert(unavailable.data_status === 'UNAVAILABLE', 'No-candle analysis is explicitly marked UNAVAILABLE');
  assert(strategyRankingEngine.evaluateAllStrategies(unavailable).length === 0, 'Unavailable/non-live market data cannot generate strategy candidates');
  const piyaUnavailable = piyaQuantEngine.refresh({ EURUSD: unavailable });
  assert(piyaUnavailable.action === 'NO TRADE', 'Piya refuses a trade decision when verified live candles are unavailable');
  assert(piyaUnavailable.status === 'WAITING_FOR_LIVE_DATA', 'Piya reports an explicit live-data wait state rather than fabricated analysis');

  // Test 2: Mock backend is disabled by default
  assert(mt5Connector.isMockAllowed() === false, 'Mock backend is disabled by default (requires ALLOW_MOCK_BACKEND=true)');

  // Test 3: START AI must be BLOCKED when MT5 is not connected
  console.log('\n[Suite 2: START AI Prerequisite Enforcement]');
  const startCheck1 = aiTradingPipeline.canStartAI();
  assert(startCheck1.canStart === false, 'canStartAI returns false when MT5 is disconnected');
  assert(startCheck1.reasons.some(r => r.includes('MetaTrader 5 is not connected')), 'Blocks with MT5 not connected reason');

  const startAttempt1 = await aiTradingPipeline.startAI();
  assert(startAttempt1.success === false, 'startAI() rejects when MT5 is not connected');
  assert(appStore.getState().ai_state === 'STOPPED', 'AI State remains STOPPED after rejected attempt');

  // Test 4: Missing Terminal connection fails safely without fabricating accounts
  console.log('\n[Suite 3: Terminal/Bridge Detection & Safe Rejection]');
  const connAttempt = await mt5Connector.connectCurrentTerminal();
  assert(connAttempt.success === false, 'connectCurrentTerminal fails safely when no MT5 terminal is present');
  assert(appStore.getState().active_account === null, 'No synthetic account was created on terminal connect failure');
  assert(['MT5 Terminal Not Found','MT5 Not Installed','Local MT5 Bridge Required'].includes(appStore.getState().mt5_status), 'Status clearly reflects local attach requirement / MT5 unavailable');

  // Test 5: Authentication failure rejects without creating fallback account
  console.log('\n[Suite 4: Broker Authentication Failure Handling]');
  const authAttempt = await mt5Connector.loginBrokerAccount({
    login: 12345678,
    server: 'MetaQuotes-Demo',
    password: 'wrong_password'
  });
  assert(authAttempt.success === false, 'loginBrokerAccount rejects invalid login without fake fallback');
  assert(appStore.getState().active_account === null, 'No fake account created when broker login fails');
  const currStatus = appStore.getState().mt5_status;
  assert(
    currStatus === 'Authentication Failed' || 
    currStatus === 'Broker Connection Failed' || 
    currStatus === 'MT5 Terminal Not Found' || 
    currStatus === 'MT5 Not Installed' || 
    currStatus === 'Local MT5 Bridge Required',
    'Status accurately set to failure',
    `got: ${currStatus}`
  );

  // Test 6: Order submission blocked when MT5 not connected
  console.log('\n[Suite 5: Execution & Order Safety Guard]');
  const orderAttempt = await mt5Connector.sendOrder({
    symbol: 'EURUSD',
    action: 'BUY',
    volume: 0.10,
    sl: 1.0750,
    tp: 1.0900
  });
  assert(orderAttempt.success === false, 'sendOrder blocked when MT5 is not connected');
  assert(orderAttempt.message.includes('MT5 is not connected'), 'Rejection message explains MT5 not connected');

  // Test 7: Local profile separation from MT5 broker financial truth
  console.log('\n[Suite 6: Database & Local Profile Separation]');
  const profile = appStore.addAccountProfile({
    label: 'Primary Prop Account',
    login: 8876123,
    server: 'ICMarketsSC-Live',
    broker: 'IC Markets',
    is_active: false
  });
  assert(profile.id.startsWith('prof_'), 'Local profile created with metadata only');
  // Confirm active financial state is STILL null (local profile does NOT fabricate balance)
  assert(appStore.getState().active_account === null, 'Local profile creation DOES NOT alter active broker balance or equity');

  // Test 8: Verified Account Injection & MT5 Authority
  console.log('\n[Suite 7: Real MT5 Account Verification & Broker Authority]');
  const verifiedTestAccount = {
    login: 5928174,
    trade_mode: 'DEMO' as const,
    balance: 5432.10,
    equity: 5432.10,
    profit: 0,
    margin: 0,
    margin_free: 5432.10,
    margin_level: 0,
    margin_so_call: 50,
    margin_so_so: 30,
    margin_initial: 0,
    margin_maintenance: 0,
    leverage: 100,
    currency: 'USD',
    name: 'Real Demo Trader',
    server: 'ICMarketsSC-Demo',
    company: 'IC Markets Global',
    trade_allowed: true,
    trade_expert: true,
    limit_orders: 200,
    connected: true,
    last_verified_at: new Date().toISOString(),
    is_verified: true
  };

  appStore.setActiveAccount(verifiedTestAccount);
  appStore.setMT5Status('Connected');
  appStore.updateDataQuality({ healthy: true });
  appStore.updateReconciliation({ in_sync: true, discrepancies: [] });

  assert(appStore.getState().active_account?.login === 5928174, 'Verified account login loaded correctly');
  assert(appStore.getState().active_account?.balance === 5432.10, 'Real MT5 balance reflected accurately ($5432.10)');

  // Test 9: With verified real MT5 account, START AI criteria passes
  const startCheck2 = aiTradingPipeline.canStartAI();
  assert(startCheck2.canStart === true, 'START AI passes all checks with verified MT5 account');

  // Test 9b: Real/live MT5 accounts are blocked from autonomous entry in demo-first mode
  const liveAccount = {
    login: 99999999,
    trade_mode: 'REAL' as const,
    balance: 15000,
    equity: 15000,
    profit: 0,
    margin: 0,
    margin_free: 15000,
    margin_level: 0,
    margin_so_call: 50,
    margin_so_so: 30,
    margin_initial: 0,
    margin_maintenance: 0,
    leverage: 100,
    currency: 'USD',
    name: 'Live Account',
    server: 'ICMarketsSC-Live',
    company: 'IC Markets Global',
    trade_allowed: true,
    trade_expert: true,
    limit_orders: 200,
    connected: true,
    last_verified_at: new Date().toISOString(),
    is_verified: true
  };

  appStore.setActiveAccount(liveAccount);
  appStore.setMT5Status('Connected');
  appStore.setSafeMode(false);
  appStore.updateRiskSettings({ trading_locked: false, daily_loss_locked: false, lock_reason: undefined });

  const liveStartCheck = aiTradingPipeline.canStartAI();
  assert(liveStartCheck.canStart === false, 'Live MT5 account cannot start autonomous trading');
  assert(liveStartCheck.reasons.some(r => r.toLowerCase().includes('live account') || r.toLowerCase().includes('real account')), 'Live account reason is explicitly surfaced');

  const liveRisk = riskEngine.validateTradeRisk('EURUSD', 'BUY', 1.0800, 1.0750);
  assert(liveRisk.allowed === false, 'Risk engine blocks orders on live/real MT5 accounts');
  assert((liveRisk.reason || '').toLowerCase().includes('live') || (liveRisk.reason || '').toLowerCase().includes('real'), 'Live-account risk rejection contains the safety reason');

  const liveOrder = await mt5Connector.sendOrder({
    symbol: 'EURUSD',
    action: 'BUY',
    volume: 0.10,
    sl: 1.0800,
    tp: 1.0900
  });
  assert(liveOrder.success === false, 'Order submission is blocked on live MT5 accounts');
  assert((liveOrder.message || '').toLowerCase().includes('live') || (liveOrder.message || '').toLowerCase().includes('real'), 'Order block message names the live account violation');

  appStore.setActiveAccount(verifiedTestAccount);
  appStore.setMT5Status('Connected');

  // Test 10: Disconnection immediately locks trading
  console.log('\n[Suite 8: Disconnection & Emergency Lock]');
  appStore.setAIState('RUNNING');
  assert(appStore.getState().ai_state === 'RUNNING', 'AI set to RUNNING');

  // Simulate terminal disconnect
  appStore.setMT5Status('Disconnected', 'Lost heartbeat from MT5 terminal');
  assert(appStore.getState().mt5_status === 'Disconnected', 'Status updated to Disconnected');
  assert(appStore.getState().ai_state === 'LOCKED', 'AI state immediately flipped to LOCKED on disconnection');

  // Test 11: Orders blocked while Disconnected
  const orderAttempt2 = await mt5Connector.sendOrder({
    symbol: 'EURUSD',
    action: 'BUY',
    volume: 0.10,
    sl: 1.0750,
    tp: 1.0900
  });
  assert(orderAttempt2.success === false, 'Order strictly blocked when disconnected');

  // Test 12: Risk Engine Lot Sizing based on real MT5 equity
  console.log('\n[Suite 9: Risk Engine & Position Sizing]');
  appStore.setMT5Status('Connected');
  appStore.setSafeMode(false);
  appStore.updateRiskSettings({ trading_locked: false, daily_loss_locked: false, max_open_positions: 4 });
  appStore.resetEmergencyKill();
  // Unit-test broker contract fixture: explicitly injected test data, never used by production.
  appStore.setPositions([]);
  appStore.setSymbols([
    { name: 'EURUSD', path: 'TEST\\EURUSD', digits: 5, spread: 10, spread_float: true, bid: 1.0800, ask: 1.0801, point: 0.00001, tick_size: 0.00001, tick_value: 1.0, contract_size: 100000, volume_min: 0.01, volume_max: 100, volume_step: 0.01, trade_mode: 0, trade_execution: 0, margin_initial: 0, currency_base: 'EUR', currency_profit: 'USD', currency_margin: 'EUR', session_open: true, auto_trading_enabled: true, priority: 1 },
    { name: 'EURJPY', path: 'TEST\\EURJPY', digits: 3, spread: 20, spread_float: true, bid: 170.000, ask: 170.002, point: 0.001, tick_size: 0.001, tick_value: 1.0, contract_size: 100000, volume_min: 0.01, volume_max: 100, volume_step: 0.01, trade_mode: 0, trade_execution: 0, margin_initial: 0, currency_base: 'EUR', currency_profit: 'JPY', currency_margin: 'EUR', session_open: true, auto_trading_enabled: true, priority: 1 }
  ]);
  const riskResult = riskEngine.validateTradeRisk('EURUSD', 'BUY', 1.0800, 1.0790);
  assert(riskResult.allowed === true, 'Risk validation allowed with verified account');
  assert(riskResult.volume > 0, `Dynamic lot size computed from equity: ${riskResult.volume} lots`);

  appStore.activateEmergencyKill('REGRESSION TEST');
  const emergencyRisk = riskEngine.validateTradeRisk('EURUSD', 'BUY', 1.0800, 1.0790);
  assert(emergencyRisk.allowed === false, 'Emergency Kill Switch blocks all new risk-approved entries');
  appStore.resetEmergencyKill();

  // Test 13: Hard Stop Loss is mandatory
  const noSlRisk = riskEngine.validateTradeRisk('EURUSD', 'BUY', 1.0800, 0);
  assert(noSlRisk.allowed === false, 'Trade with zero/missing SL is strictly rejected by Risk Engine');

  // Test 14: MT5 Position Verification & Idempotency
  console.log('\n[Suite 10: Execution Idempotency & Position Verification]');
  appStore.setPositions([
    {
      ticket: 99887766,
      time: Math.floor(Date.now() / 1000),
      time_msc: Date.now(),
      time_update: Math.floor(Date.now() / 1000),
      type: 'BUY',
      magic: 202609,
      identifier: 99887766,
      reason: 0,
      volume: 0.1,
      price_open: 1.0850,
      sl: 1.0800,
      tp: 1.0950,
      price_current: 1.0855,
      swap: 0,
      profit: 5.0,
      symbol: 'EURUSD',
      comment: 'AI-TEST'
    }
  ]);

  const verifiedExists = aiTradingPipeline.verifyExecutionWithMT5('EURUSD', 'BUY', 0.1, 99887766);
  assert(verifiedExists === true, 'verifyExecutionWithMT5 correctly confirms open position in MT5 state');

  const verifiedMismatch = aiTradingPipeline.verifyExecutionWithMT5('EURUSD', 'SELL', 0.1, 99887766);
  assert(verifiedMismatch === false, 'verifyExecutionWithMT5 correctly rejects direction mismatch');

  // New regression tests for duplicate execution integrity
  console.log('\n[Suite 11: Duplicate Execution & Execution Integrity]');
  const decisionId = 'EURJPY|M15|INSTITUTIONAL_PULLBACK_ORDER_BLOCK|BUY|5928174';
  const setupFingerprint = '5928174|EURJPY|BUY|INSTITUTIONAL_PULLBACK_ORDER_BLOCK|M15|order-block|trend-following';
  const firstRegistration = (aiTradingPipeline as any).registerDecisionExecution?.({
    decision_id: decisionId,
    account_id: 5928174,
    symbol: 'EURJPY',
    direction: 'BUY',
    strategy: 'INSTITUTIONAL_PULLBACK_ORDER_BLOCK',
    timeframe: 'M15',
    setup_fingerprint: setupFingerprint,
    thesis_id: 'THESIS_EURJPY_BI_001',
    market_state_version: '184293',
    status: 'CONFIRMED'
  });
  assert(firstRegistration?.accepted === true, 'Decision registration accepts the first confirmed execution intent');

  const secondRegistration = (aiTradingPipeline as any).registerDecisionExecution?.({
    decision_id: decisionId,
    account_id: 5928174,
    symbol: 'EURJPY',
    direction: 'BUY',
    strategy: 'INSTITUTIONAL_PULLBACK_ORDER_BLOCK',
    timeframe: 'M15',
    setup_fingerprint: setupFingerprint,
    thesis_id: 'THESIS_EURJPY_BI_001',
    market_state_version: '184293',
    status: 'CONFIRMED'
  });
  assert(secondRegistration?.accepted === false, 'Duplicate decision registration is rejected');

  const sameFingerprint = (aiTradingPipeline as any).registerDecisionExecution?.({
    decision_id: 'EURJPY|M15|INSTITUTIONAL_PULLBACK_ORDER_BLOCK|BUY|5928174|V2',
    account_id: 5928174,
    symbol: 'EURJPY',
    direction: 'BUY',
    strategy: 'INSTITUTIONAL_PULLBACK_ORDER_BLOCK',
    timeframe: 'M15',
    setup_fingerprint: setupFingerprint,
    thesis_id: 'THESIS_EURJPY_BI_001',
    market_state_version: '184293',
    status: 'CONFIRMED'
  });
  assert(sameFingerprint?.accepted === false, 'Same setup fingerprint is deduplicated before a new execution');

  const orderAttempt3 = await mt5Connector.sendOrder({
    symbol: 'EURJPY',
    action: 'BUY',
    volume: 0.01,
    sl: 1.0800,
    tp: 1.0900,
    comment: 'AI-REGRESSION-TEST'
  });
  assert(orderAttempt3.success === false, 'sendOrder rejects an execution request when no actual broker terminal/bridge is available');

  console.log('\n======================================================');
  console.log(`TEST RUN COMPLETE: ${passedCount} / ${totalCount} PASSED`);
  console.log('======================================================\n');

  if (passedCount !== totalCount) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runAllTests().catch((err) => {
  console.error('Fatal test runner error:', err);
  process.exit(1);
});
