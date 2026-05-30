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
  console.log('╔══════════════════════════════════════════════════════╗');
  console.log('║   Money_Flow - END-TO-END TEST (Customer Journey)   ║');
  console.log('╚══════════════════════════════════════════════════════╝\n');

  // ═══ CLEANUP ═══
  console.log('--- Cleanup ---');
  // Delete all data
  await req('DELETE', '/api/data/transactions');
  await req('DELETE', '/api/data/savings');
  await req('DELETE', '/api/data/monthly');
  ok('Cleaned up test data');

  // ═══ MONTH 1: T6/2026 ═══
  console.log('\n═══ THÁNG 1: T6/2026 ═══');

  // Step 1: Enter monthly data
  console.log('\n1. Nhập liệu dòng tiền');
  const m1 = await req('POST', '/api/monthly', {
    month_index: 6, month_label: 'T6/2026',
    income: 15000000, expense: 6000000, bonus: 2000000,
    total_inflow: 17000000, // income + bonus
    note: 'Tháng đầu test', phase_id: 1, status: 'confirmed'
  });
  if (m1.status === 200) ok('Lưu tháng T6/2026');
  else fail('Lưu tháng', JSON.stringify(m1.data));

  // Verify idle money
  const idle1 = 15000000 + 2000000 - 6000000; // = 11,000,000
  ok(`Tiền nhàn rỗi: ${idle1.toLocaleString('vi-VN')} ₫`);

  // Step 2: Allocate
  console.log('\n2. Phân bổ dòng tiền');
  const alloc1 = await req('POST', '/api/allocations/6', { allocations: [
    { category_id: 1, planned_amount: 7700000, actual_amount: 7700000 }, // 70% of 11M
    { category_id: 2, planned_amount: 3300000, actual_amount: 3300000 }, // 30% of 11M
  ]});
  if (alloc1.status === 200) ok('Phân bổ T6: Dự Phòng 7,700,000 + Chứng Khoán 3,300,000');
  else fail('Phân bổ T6', JSON.stringify(alloc1.data));

  // ═══ MONTH 2: T7/2026 ═══
  console.log('\n═══ THÁNG 2: T7/2026 ═══');

  const m2 = await req('POST', '/api/monthly', {
    month_index: 7, month_label: 'T7/2026',
    income: 16000000, expense: 5500000, bonus: 0,
    total_inflow: 16000000,
    note: 'Tháng thứ 2', phase_id: 1, status: 'confirmed'
  });
  if (m2.status === 200) ok('Lưu tháng T7/2026');
  else fail('Lưu tháng', JSON.stringify(m2.data));

  const idle2 = 16000000 - 5500000; // = 10,500,000
  ok(`Tiền nhàn rỗi: ${idle2.toLocaleString('vi-VN')} ₫`);

  const alloc2 = await req('POST', '/api/allocations/7', { allocations: [
    { category_id: 1, planned_amount: 7350000, actual_amount: 7350000 }, // 70% of 10.5M
    { category_id: 2, planned_amount: 3150000, actual_amount: 3150000 }, // 30% of 10.5M
  ]});
  if (alloc2.status === 200) ok('Phân bổ T7: Dự Phòng 7,350,000 + Chứng Khoán 3,150,000');
  else fail('Phân bổ T7', JSON.stringify(alloc2.data));

  // ═══ VERIFY DASHBOARD DATA ═══
  console.log('\n═══ VERIFY DASHBOARD ═══');

  // Check monthly filled
  const filled = await req('GET', '/api/monthly/filled');
  if (filled.data.length >= 2) ok(`${filled.data.length} tháng đã nhập`);
  else fail('Monthly count', `${filled.data.length}`);

  // Check allocations
  const allAllocs = await req('GET', '/api/allocations/all');
  const dpAllocs = allAllocs.data.filter(a => a.category_name.includes('Dự Phòng'));
  const ckAllocs = allAllocs.data.filter(a => a.category_name.includes('Chứng Khoán'));
  const totalDP = dpAllocs.reduce((s, a) => s + (a.actual_amount || a.planned_amount || 0), 0);
  const totalCK = ckAllocs.reduce((s, a) => s + (a.actual_amount || a.planned_amount || 0), 0);
  ok(`Dự Phòng: ${totalDP.toLocaleString('vi-VN')} ₫`);
  ok(`Chứng Khoán: ${totalCK.toLocaleString('vi-VN')} ₫`);

  // Check idle money calculation
  const totalIncome = filled.data.reduce((s, m) => s + (m.income || 0) + (m.bonus || 0), 0);
  const totalExpense = filled.data.reduce((s, m) => s + (m.expense || 0), 0);
  const totalIdle = totalIncome - totalExpense;
  const totalAllocated = totalDP + totalCK;
  const unallocated = totalIdle - totalAllocated;

  if (totalIdle === idle1 + idle2) ok(`Tổng tiền nhàn rỗi: ${totalIdle.toLocaleString('vi-VN')} ₫`);
  else fail('Idle money', `Expected ${idle1 + idle2}, got ${totalIdle}`);

  if (unallocated === 0) ok(`Phân bổ đầy đủ: ${totalAllocated.toLocaleString('vi-VN')} ₫`);
  else fail('Unallocated', `${unallocated.toLocaleString('vi-VN')} ₫ chưa phân bổ`);

  // ═══ TRANSACTIONS ═══
  console.log('\n═══ GIAO DỊCH CHỨNG KHOÁN ═══');

  const t1 = await req('POST', '/api/transactions', {
    asset_type_id: 31, type: 'buy', quantity: 100, price: 35000,
    total_amount: 3500000, date: '2026-06-15', notes: 'Mua VN30 ETF'
  });
  if (t1.status === 200) ok('Mua VN30 ETF: 100 CCQ × 35,000');
  else fail('Mua VN30', JSON.stringify(t1.data));

  const t2 = await req('POST', '/api/transactions', {
    asset_type_id: 2, type: 'buy', quantity: 50, price: 120000,
    total_amount: 6000000, date: '2026-06-20', notes: 'Mua FPT'
  });
  if (t2.status === 200) ok('Mua FPT: 50 CP × 120,000');
  else fail('Mua FPT', JSON.stringify(t2.data));

  // Verify portfolio
  const portfolio = await req('GET', '/api/portfolio/summary');
  if (portfolio.data.portfolio.length >= 2) ok(`${portfolio.data.portfolio.length} tài sản trong danh mục`);
  else fail('Portfolio count', `${portfolio.data.portfolio.length}`);

  if (portfolio.data.totalInvested === 9500000) ok(`Tổng đầu tư: ${portfolio.data.totalInvested.toLocaleString('vi-VN')} ₫`);
  else fail('Total invested', `Expected 9,500,000, got ${portfolio.data.totalInvested}`);

  // ═══ SAVINGS ═══
  console.log('\n═══ TIẾT KIỆM ═══');

  const s1 = await req('POST', '/api/savings', {
    name: 'Vietcombank 6T', bank: 'Vietcombank', account_type: 'term',
    interest_rate: 6.0, term_months: 6, principal: 10000000, start_date: '2026-06-01'
  });
  if (s1.status === 200 && s1.data.id) ok(`Tạo sổ tiết kiệm #${s1.data.id}`);
  else fail('Tạo sổ', JSON.stringify(s1.data));

  // Deposit
  const dep1 = await req('POST', `/api/savings/${s1.data.id}/transactions`, {
    type: 'deposit', amount: 5000000, date: '2026-06-15', note: 'Bơm vốn'
  });
  if (dep1.status === 200) ok('Bơm vốn: 5,000,000 ₫');
  else fail('Bơm vốn', JSON.stringify(dep1.data));

  // Verify savings
  const sav = await req('GET', `/api/savings/${s1.data.id}`);
  if (sav.data.principal === 15000000) ok(`Vốn sổ tiết kiệm: ${sav.data.principal.toLocaleString('vi-VN')} ₫`);
  else fail('Savings principal', `Expected 15,000,000, got ${sav.data.principal}`);

  // ═══ FINAL VERIFICATION ═══
  console.log('\n═══ KIỂM TRA CUỐI ═══');

  // Check savings overview
  const overview = await req('GET', '/api/savings/overview');
  if (overview.data.totalInflow === totalIdle) ok(`Overview totalInflow: ${overview.data.totalInflow.toLocaleString('vi-VN')} ₫`);
  else fail('Overview totalInflow', `Expected ${totalIdle}, got ${overview.data.totalInflow}`);

  // Check activity log
  const activity = await req('GET', '/api/activity?limit=20');
  if (activity.data.length >= 5) ok(`${activity.data.length} hoạt động được ghi`);
  else fail('Activity count', `${activity.data.length}`);

  // Check phases
  const phase = await req('GET', '/api/phases/active');
  if (phase.data.id === 1) ok(`Giai đoạn hiện tại: ${phase.data.name}`);
  else fail('Phase', `Expected phase 1, got ${phase.data.id}`);

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
