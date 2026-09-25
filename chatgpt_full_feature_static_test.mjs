import fs from 'fs';
const app = fs.readFileSync('src/App.tsx','utf8');
const sidebar = fs.readFileSync('src/components/Sidebar.tsx','utf8');
const tab = fs.readFileSync('src/components/tabs/ChatGPTTab.tsx','utf8');
const server = fs.readFileSync('server.ts','utf8');
const chatService = fs.readFileSync('src/server/chatgpt_assistant.ts','utf8');
const chart = fs.readFileSync('src/components/TradingViewChart.tsx','utf8');
const position = fs.readFileSync('src/server/position_manager.ts','utf8');
const bridge = fs.readFileSync('mt5_desktop_bridge.py','utf8');
const checks = [
  ['ChatGPT tab is registered', app.includes("'chatgpt'") && app.includes('ChatGPTTab')],
  ['ChatGPT tab is below Settings in sidebar', sidebar.indexOf("id: 'settings'") < sidebar.indexOf("id: 'chatgpt'")],
  ['Persistent ChatGPT history endpoint', server.includes('/api/chatgpt/history') && tab.includes('/api/chatgpt/history')],
  ['Live project context endpoint', server.includes('/api/chatgpt/context') && server.includes('buildProjectContext')],
  ['Source inspection is implemented', server.includes('/api/chatgpt/file') && tab.includes('Source files')],
  ['Permission levels are implemented', server.includes('APPROVE_ACTION') && tab.includes('FULL_CONTROL')],
  ['Explicit code-apply confirmation is enforced', server.includes('/api/chatgpt/apply-change') && server.includes('confirmed === true')],
  ['Chart image can be sent to ChatGPT vision', tab.includes('captureCurrentChart') && server.includes('imageDataUrl') && chatService.includes('input_image')],
  ['Direct BUY/SELL market buttons exist', chart.includes('BUY MARKET') && chart.includes('SELL MARKET') && server.includes('/api/mt5/manual-market-order')],
  ['Pending order types exist in bridge', bridge.includes('BUY_LIMIT') && bridge.includes('SELL_LIMIT') && bridge.includes('BUY_STOP') && bridge.includes('SELL_STOP')],
  ['AI pending path has independent criteria', server.includes('/api/ai/pending-order') && server.includes('qualityPass') && server.includes('pricePass')],
  ['No mandatory max-hold exit remains', !position.includes('AI-MANAGE-MAX-HOLD-FAIL') && !position.includes('ageMinutes >= maxHoldMinutes')],
  ['Post-entry protection churn is disabled', position.includes('Broker SL/TP are locked after entry')],
  ['AI chart history navigation exists', chart.includes('historyOffset') && chart.includes('← HIST') && chart.includes('LIVE')],
];
let failed=0; for (const [name, ok] of checks) { console.log(`${ok?'PASS':'FAIL'}: ${name}`); if(!ok) failed++; }
if(failed) process.exit(1);
console.log('CHATGPT_FULL_FEATURE_STATIC_TEST PASS');
