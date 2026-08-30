require('./_guard');
const http = require('http');

const BASE = 'http://localhost:3001';
let passed = 0, failed = 0, errors = [];

function request(method, path, body) {
  return new Promise((resolve) => {
    const url = new URL(BASE + path);
    const opts = { method, hostname: url.hostname, port: url.port, path: url.pathname + url.search, headers: { 'Content-Type': 'application/json' } };
    const req = http.request(opts, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, data, parseError: true }); }
      });
    });
    req.on('error', (e) => resolve({ status: 0, error: e.message }));
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function test(method, path, body, validate, desc) {
  const res = await request(method, path, body);
  if (res.error) { failed++; errors.push(`❌ ${desc}: ${res.error}`); return; }
  if (res.parseError && res.status !== 200) { failed++; errors.push(`❌ ${desc}: HTTP ${res.status} - not JSON`); return; }
  try {
    const ok = validate(res);
    if (ok) { passed++; console.log(`  ✅ ${desc}`); }
    else { failed++; errors.push(`❌ ${desc}: validation failed - got ${JSON.stringify(res.data).substring(0, 100)}`); }
  } catch (e) { failed++; errors.push(`❌ ${desc}: ${e.message}`); }
}

async function run() {
  console.log('=== Money_Flow API Tests ===\n');

  // ─── Params ───
  console.log('--- Params ---');
  await test('GET', '/api/params', null, r => Array.isArray(r.data), 'GET /api/params');
  await test('PUT', '/api/params', { key: 'DEFAULT_INFLOW', value: '3700000' }, r => r.status === 200, 'PUT /api/params');
  await test('GET', '/api/params/avg-expense', null, r => r.status === 200, 'GET /api/params/avg-expense');

  // ─── Categories ───
  console.log('\n--- Categories ---');
  await test('GET', '/api/categories', null, r => Array.isArray(r.data) && r.data.length >= 5, 'GET /api/categories');

  // ─── Phases ───
  console.log('\n--- Phases ---');
  await test('GET', '/api/phases', null, r => Array.isArray(r.data) && r.data.length >= 4, 'GET /api/phases');
  await test('GET', '/api/phases/active', null, r => r.data && r.data.id, 'GET /api/phases/active');
  await test('POST', '/api/phases/2/active', null, r => r.status === 200, 'POST /api/phases/2/active');
  await test('POST', '/api/phases/1/active', null, r => r.status === 200, 'POST restore phase 1');
  await test('GET', '/api/phases/1/allocations', null, r => Array.isArray(r.data), 'GET /api/phases/:id/allocations');

  // ─── Assets ───
  console.log('\n--- Assets ---');
  await test('GET', '/api/assets', null, r => Array.isArray(r.data) && r.data.length >= 5, 'GET /api/assets');
  await test('POST', '/api/assets', { name: 'Test Asset', ticker: 'TEST', unit: 'CP', category: 'Giao dịch' }, r => r.status === 200, 'POST /api/assets');
  await test('PUT', '/api/assets/1/price', { price: 25000 }, r => r.status === 200, 'PUT /api/assets/:id/price');

  // ─── Catalog ───
  console.log('\n--- Catalog ---');
  await test('GET', '/api/catalog', null, r => r.status === 200, 'GET /api/catalog');

  // ─── Timeline ───
  console.log('\n--- Timeline ---');
  await test('POST', '/api/timeline/regenerate', { totalMonths: 12, startMonth: 1, startYear: 2026 }, r => r.status === 200, 'POST /api/timeline/regenerate');

  // ─── Monthly Entries ───
  console.log('\n--- Monthly ---');
  await test('GET', '/api/monthly', null, r => Array.isArray(r.data), 'GET /api/monthly');
  await test('GET', '/api/monthly/filled', null, r => Array.isArray(r.data), 'GET /api/monthly/filled');
  await test('GET', '/api/monthly/next', null, r => r.status === 200, 'GET /api/monthly/next');
  await test('POST', '/api/monthly', { month_index: 99, month_label: 'T99/2026', income: 15000000, expense: 8000000 }, r => r.status === 200, 'POST /api/monthly');

  // ─── Allocations ───
  console.log('\n--- Allocations ---');
  await test('GET', '/api/allocations/1', null, r => Array.isArray(r.data), 'GET /api/allocations/:entryId');
  await test('POST', '/api/allocations/1', { allocations: [{ category_id: 1, planned_amount: 3000000, actual_amount: 3000000 }] }, r => r.status === 200, 'POST /api/allocations/:entryId');
  await test('POST', '/api/allocations/adjust', { discrepancyAmount: 100000 }, r => r.status === 200, 'POST /api/allocations/adjust');

  // ─── Transactions ───
  console.log('\n--- Transactions ---');
  await test('GET', '/api/transactions', null, r => Array.isArray(r.data), 'GET /api/transactions');
  await test('POST', '/api/transactions', { asset_type_id: 31, type: 'buy', quantity: 10, price: 35000, total_amount: 350000, date: '2026-05-01' }, r => r.status === 200, 'POST /api/transactions');

  // ─── Portfolio ───
  console.log('\n--- Portfolio ---');
  await test('GET', '/api/portfolio', null, r => Array.isArray(r.data), 'GET /api/portfolio');
  await test('GET', '/api/portfolio/summary', null, r => r.data && typeof r.data.totalInvested === 'number', 'GET /api/portfolio/summary');

  // ─── Savings ───
  console.log('\n--- Savings ---');
  await test('GET', '/api/savings', null, r => Array.isArray(r.data), 'GET /api/savings');
  await test('GET', '/api/savings/summary', null, r => r.status === 200, 'GET /api/savings/summary');
  await test('GET', '/api/savings/overview', null, r => r.status === 200, 'GET /api/savings/overview');
  await test('GET', '/api/savings/maturities', null, r => r.status === 200, 'GET /api/savings/maturities');
  let savId;
  await test('POST', '/api/savings', { name: 'Test Savings', bank: 'VCB', account_type: 'term', interest_rate: 5.5, term_months: 6, principal: 10000000, start_date: '2026-01-01' }, r => { savId = r.data?.id; return r.status === 200; }, 'POST /api/savings');
  if (savId) {
    await test('GET', `/api/savings/${savId}`, null, r => r.data && r.data.id, 'GET /api/savings/:id');
    await test('POST', `/api/savings/${savId}/transactions`, { type: 'deposit', amount: 5000000, date: '2026-02-01', note: 'Test deposit' }, r => r.status === 200, 'POST /api/savings/:id/transactions');
    await test('PUT', `/api/savings/${savId}`, { interest_rate: 6.0 }, r => r.status === 200, 'PUT /api/savings/:id');
    await test('DELETE', `/api/savings/${savId}`, null, r => r.status === 200, 'DELETE /api/savings/:id');
  }

  // ─── Watchlist ───
  console.log('\n--- Watchlist ---');
  await test('GET', '/api/watchlist', null, r => Array.isArray(r.data), 'GET /api/watchlist');
  await test('POST', '/api/watchlist', { asset_type_id: 31, target_price: 30000, stop_loss: 20000 }, r => r.status === 200, 'POST /api/watchlist');

  // ─── Alerts ───
  console.log('\n--- Alerts ---');
  await test('GET', '/api/alerts', null, r => Array.isArray(r.data), 'GET /api/alerts');
  await test('GET', '/api/alerts?unread=true', null, r => Array.isArray(r.data), 'GET /api/alerts?unread=true');
  await test('GET', '/api/alerts/count', null, r => r.data && typeof r.data.count === 'number', 'GET /api/alerts/count');
  await test('PUT', '/api/alerts/read-all', null, r => r.status === 200, 'PUT /api/alerts/read-all');

  // ─── Activity ───
  console.log('\n--- Activity ---');
  await test('GET', '/api/activity', null, r => Array.isArray(r.data), 'GET /api/activity');

  // ─── Price History ───
  console.log('\n--- Prices ---');
  await test('GET', '/api/price-history/31', null, r => Array.isArray(r.data), 'GET /api/price-history/:assetId');
  await test('POST', '/api/prices/refresh', null, r => r.status === 200, 'POST /api/prices/refresh');

  // ─── Data Management ───
  console.log('\n--- Data ---');
  await test('GET', '/api/data/stats', null, r => r.status === 200, 'GET /api/data/stats');
  await test('GET', '/api/export/excel', null, r => r.status === 200, 'GET /api/export/excel');
  await test('GET', '/api/database/download', null, r => r.status === 200, 'GET /api/database/download');

  // ─── Summary ───
  console.log(`\n${'='.repeat(40)}`);
  console.log(`Results: ${passed} passed, ${failed} failed`);
  if (errors.length > 0) {
    console.log('\nFailed tests:');
    errors.forEach(e => console.log('  ' + e));
  }
}

run().catch(console.error);
