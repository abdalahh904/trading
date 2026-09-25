import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(new URL('.', import.meta.url).pathname, '..');
const pipeline = fs.readFileSync(path.join(root, 'src/server/ai_trading_pipeline.ts'), 'utf8');
const connector = fs.readFileSync(path.join(root, 'src/server/mt5_connector.ts'), 'utf8');

function assert(cond, msg) {
  if (!cond) throw new Error(`FAIL: ${msg}`);
  console.log(`PASS: ${msg}`);
}

assert(pipeline.includes('if (candidate.confidence < configuredActionConfidence)'), 'Main loop has explicit final percentage threshold');
assert(pipeline.includes('if (thesis.confidence < configuredActionConfidence)'), 'Targeted symbol path has explicit final percentage threshold');
assert(pipeline.includes('[PERCENT-AUTHORITY]'), 'Execution logs explicitly identify percentage authority');
assert(!pipeline.includes("if (!state.user_settings?.autonomous_entry_enabled)"), 'No hidden autonomous-entry veto after final percentage');
assert(!pipeline.includes("return { success: false, message: 'Autonomous entry is disabled in Settings.'"), 'No targeted autonomous-entry veto after final percentage');
const mainEntryBlock = pipeline.slice(pipeline.indexOf('const viableCandidates = theses'), pipeline.indexOf('// 8. Commit AI Working Report to State'));
const targetedEntryBlock = pipeline.slice(pipeline.indexOf('// 3. Final execution rule: percentage passed -> submit immediately.'), pipeline.indexOf('/**\n   * Run an explicit full-market analysis scan'));
assert(!mainEntryBlock.includes('safetyGateEngine.evaluateGates()'), 'No safety-gate evaluation inside main final entry execution path');
assert(!mainEntryBlock.includes('liquidityAndNewsGuard'), 'No news/liquidity second veto inside main final entry path');
assert(mainEntryBlock.includes('riskEngine.validateTradeRisk(candidate.symbol'), 'Risk engine is advisory lot sizing in the main path');
assert(targetedEntryBlock.includes('riskEngine.validateTradeRisk(symbol'), 'Risk engine is advisory lot sizing in targeted path');
assert(!targetedEntryBlock.includes('safetyGateEngine.evaluateGates()'), 'No safety-gate evaluation inside targeted final entry execution path');
assert(connector.includes('Stop Loss is required by the trading contract'), 'Broker execution still enforces mandatory SL');
assert(connector.includes('Take Profit is required by the trading contract'), 'Broker execution still enforces mandatory TP');
assert(connector.includes("trade_mode === 'REAL'"), 'Demo-only execution protection remains');
assert(connector.includes('10027'), 'MT5 terminal permission errors are reported explicitly');

console.log('FINAL_PERCENT_AUTHORITY_STATIC_TEST PASS');
