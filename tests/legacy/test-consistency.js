require('./_guard');
const http = require('http');
const BASE = 'http://localhost:3001';
let passed = 0, failed = 0;
const issues = [];

function req(method, path, body) {
  return new Promise((resolve) => {
    const url = new URL(BASE + path);
    const opts = { method, hostname: url.hostname, port: url.port, path: url.pathname + url.search, headers: { 'Content-Type': 'application/json' } };
    const r = http.request(opts, (res) => {
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => { try { resolve({ status: res.statusCode, data: JSON.parse(d) }); } catch { resolve({ status: res.statusCode, data: d }); } });
    });
    r.on('error', (e) => resolve({ status: 0, error: e.message }));
    if (body) r.write(JSON.stringify(body));
    r.end();
  });
}

function ok(desc) { passed++; console.log(`  ✅ ${desc}`); }
function fail(desc, detail) { failed++; issues.push({ desc, detail }); console.log(`  ❌ ${desc}: ${detail}`); }

async function run() {
  console.log('=== DATA CONSISTENCY TEST ===\n');

  // ═══ TEST 1: Transaction → Portfolio sync ═══
  console.log('1. GIAO DỊCH → DANH MỤC');
  const portBefore = await req('GET', '/api/portfolio/summary');
  const buyRes = await req('POST', '/api/transactions', { asset_type_id: 31, type: 'buy', quantity: 20, price: 36000, total_amount: 720000, date: '2026-05-20' });
  const portAfter = await req('GET', '/api/portfolio/summary');

  if (buyRes.status === 200) ok('Mua CP thành công');
  else fail('Mua CP', `HTTP ${buyRes.status}`);

  const vn30Before = portBefore.data.portfolio?.find(p => p.asset_type_id === 31);
  const vn30After = portAfter.data.portfolio?.find(p => p.asset_type_id === 31);
  const qtyBefore = vn30Before?.total_quantity || 0;
  const qtyAfter = vn30After?.total_quantity || 0;

  if (qtyAfter === qtyBefore + 20) ok(`Portfolio cập nhật: ${qtyBefore} → ${qtyAfter} CCQ`);
  else fail('Portfolio sync', `KL trước: ${qtyBefore}, sau: ${qtyAfter}, kỳ vọng: ${qtyBefore + 20}`);

  const investedBefore = vn30Before?.total_invested || 0;
  const investedAfter = vn30After?.total_invested || 0;
  if (investedAfter > investedBefore) ok(`Tổng đầu tư tăng: ${investedBefore} → ${investedAfter}`);
  else fail('Invested sync', `Không tăng`);

  // ═══ TEST 2: Monthly → Allocation sync ═══
  console.log('\n2. DÒNG TIỀN → PHÂN BỔ');
  await req('POST', '/api/monthly', { month_index: 100, month_label: 'T_TEST/2026', income: 20000000, expense: 10000000, total_inflow: 20000000 });
  const allocRes = await req('POST', '/api/allocations/100', { allocations: [{ category_id: 1, planned_amount: 5000000, actual_amount: 5000000 }, { category_id: 2, planned_amount: 10000000, actual_amount: 8000000 }] });

  if (allocRes.status === 200) ok('Phân bổ thành công');
  else fail('Phân bổ', `HTTP ${allocRes.status}`);

  const allocData = await req('GET', '/api/allocations/100');
  if (allocData.data.length === 2) ok(`Phân bổ có ${allocData.data.length} danh mục`);
  else fail('Phân bổ count', `Kỳ vọng 2, nhận ${allocData.data.length}`);

  const dpAlloc = allocData.data.find(a => a.category_id === 1);
  if (dpAlloc?.actual_amount === 5000000) ok('Dự Phòng: 5,000,000');
  else fail('Dự Phòng amount', `Kỳ vọng 5000000, nhận ${dpAlloc?.actual_amount}`);

  // ═══ TEST 3: Savings → Deposit → Interest ═══
  console.log('\n3. TIẾT KIỆM → BƠM VỐN → LÃI');
  const savRes = await req('POST', '/api/savings', { name: 'Test Sync', bank: 'VCB', account_type: 'term', interest_rate: 6.0, term_months: 12, principal: 10000000, start_date: '2026-01-01' });
  const savId = savRes.data?.id;
  if (savId) ok(`Tạo sổ tiết kiệm #${savId}`);
  else fail('Tạo sổ', 'Không có ID');

  const savBefore = await req('GET', `/api/savings/${savId}`);
  const principalBefore = savBefore.data?.principal || 0;

  await req('POST', `/api/savings/${savId}/transactions`, { type: 'deposit', amount: 5000000, date: '2026-03-01', note: 'Bơm vốn' });
  const savAfter = await req('GET', `/api/savings/${savId}`);
  const principalAfter = savAfter.data?.principal || 0;

  if (principalAfter === principalBefore + 5000000) ok(`Vốn tăng: ${principalBefore} → ${principalAfter}`);
  else fail('Vốn sync', `Trước: ${principalBefore}, Sau: ${principalAfter}, Kỳ vọng: ${principalBefore + 5000000}`);

  // Check interest calculated
  const interest = savAfter.data?.accrued_interest || 0;
  if (interest > 0) ok(`Lãi tính được: ${interest}`);
  else fail('Lãi tính', `Lãi = ${interest}`);

  // ═══ TEST 4: Watchlist → Alerts sync ═══
  console.log('\n4. WATCHLIST → CẢNH BÁO');
  await req('POST', '/api/watchlist', { asset_type_id: 31, target_price: 30000, stop_loss: 20000 });
  const wl = await req('GET', '/api/watchlist');
  const inWatchlist = wl.data?.some(w => w.id === 31);
  if (inWatchlist) ok('VN30 ETF trong watchlist');
  else fail('Watchlist sync', 'Không tìm thấy');

  // ═══ TEST 5: Activity log tracking ═══
  console.log('\n5. HOẠT ĐỘNG');
  const activity = await req('GET', '/api/activity?limit=50');
  if (activity.data?.length > 0) ok(`${activity.data.length} hoạt động được ghi`);
  else fail('Activity log', 'Rỗng');

  const hasTransActivity = activity.data?.some(a => a.type === 'BUY' || a.type === 'SELL');
  if (hasTransActivity) ok('Giao dịch được ghi nhật ký');
  else fail('Transaction activity', `Không tìm thấy BUY/SELL trong ${activity.data?.length} entries`);

  // ═══ TEST 6: Phase auto-detect ═══
  console.log('\n6. GIAI ĐOẠN');
  const phase = await req('GET', '/api/phases/active');
  if (phase.data?.id) ok(`Giai đoạn hiện tại: ${phase.data.name}`);
  else fail('Phase detect', 'Không có giai đoạn');

  // ═══ TEST 7: Portfolio summary accuracy ═══
  console.log('\n7. TỔNG HỢP DANH MỤC');
  const summary = await req('GET', '/api/portfolio/summary');
  if (summary.data?.totalInvested > 0) ok(`Tổng đầu tư: ${summary.data.totalInvested}`);
  else fail('Total invested', `${summary.data?.totalInvested}`);

  if (summary.data?.portfolio?.length > 0) ok(`${summary.data.portfolio.length} tài sản trong danh mục`);
  else fail('Portfolio items', 'Rỗng');

  // ═══ TEST 8: Savings summary ═══
  console.log('\n8. TỔNG HỢP TIẾT KIỆM');
  const savSummary = await req('GET', '/api/savings/summary');
  if (savSummary.status === 200) ok('Tóm tắt tiết kiệm OK');
  else fail('Savings summary', `HTTP ${savSummary.status}`);

  // ═══ CLEANUP ═══
  console.log('\n--- Cleanup ---');
  await req('DELETE', '/api/monthly/100');
  await req('DELETE', `/api/savings/${savId}`);
  await req('DELETE', '/api/transactions/1'); // might not exist
  ok('Cleanup done');

  // ═══ SUMMARY ═══
  console.log(`\n${'═'.repeat(50)}`);
  console.log(`KẾT QUẢ: ${passed} ✅ | ${failed} ❌`);
  if (issues.length > 0) {
    console.log('\nVẤN ĐỀ:');
    issues.forEach(i => console.log(`  ❌ ${i.desc}: ${i.detail}`));
  }
  console.log(`${'═'.repeat(50)}`);
}

run().catch(console.error);
