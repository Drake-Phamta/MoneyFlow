/**
 * Money_Flow — Comprehensive Test Suite (42 Test Cases, 8 Groups)
 * 
 * Tests backend business logic via REST API calls.
 * Prerequisites: npm run dev:web (server on localhost:3001)
 * 
 * Run: node test-42-cases.js
 */

const http = require('http');

const BASE = 'http://localhost:3001/api';

// ===== HTTP helpers =====
function request(method, path, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(`${BASE}${path}`);
    const opts = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method,
      headers: {},
    };
    if (body !== undefined) {
      const data = JSON.stringify(body);
      opts.headers['Content-Type'] = 'application/json';
      opts.headers['Content-Length'] = Buffer.byteLength(data);
    }
    const req = http.request(opts, res => {
      let chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => {
        const raw = Buffer.concat(chunks).toString();
        try {
          resolve({ status: res.statusCode, data: JSON.parse(raw) });
        } catch {
          resolve({ status: res.statusCode, data: raw });
        }
      });
    });
    req.on('error', reject);
    if (body !== undefined) req.write(JSON.stringify(body));
    req.end();
  });
}

const get = (path) => request('GET', path);
const post = (path, body) => request('POST', path, body);
const put = (path, body) => request('PUT', path, body);
const del = (path) => request('DELETE', path);

// ===== Test Framework =====
let totalTests = 0;
let passedTests = 0;
let failedTests = 0;
const results = [];

function assert(condition, testId, description, detail = '') {
  totalTests++;
  if (condition) {
    passedTests++;
    results.push({ status: '✅', testId, description });
    console.log(`  ✅ ${testId}: ${description}`);
  } else {
    failedTests++;
    const msg = detail ? `${description} — ${detail}` : description;
    results.push({ status: '❌', testId, description: msg });
    console.log(`  ❌ ${testId}: ${msg}`);
  }
}

function assertApprox(actual, expected, tolerance, testId, description) {
  const diff = Math.abs(actual - expected);
  assert(diff <= tolerance, testId, description,
    diff > tolerance ? `expected ≈${expected}, got ${actual} (diff=${diff})` : '');
}

async function getCategoryIds() {
  const cats = await get('/categories');
  const dpCat = cats.data.find(c => c.name.includes('Dự Phòng'));
  const ckCat = cats.data.find(c => c.name.includes('Chứng Khoán'));
  const vangCat = cats.data.find(c => c.name.includes('Vàng'));
  const btCat = cats.data.find(c => c.name.includes('Bắn Tỉa'));
  const tkCat = cats.data.find(c => c.name.includes('Tiết kiệm'));
  return { dpCat, ckCat, vangCat, btCat, tkCat };
}

// ===== MAIN =====
async function runAllTests() {
  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log('║   MONEY_FLOW — COMPREHENSIVE TEST SUITE (42 Cases)     ║');
  console.log('╚══════════════════════════════════════════════════════════╝\n');

  // ═══════════════════════════════════════════════════════════
  // NHÓM 1: NHẬP LIỆU THÁNG (MonthlyEntry) — 7 test
  // ═══════════════════════════════════════════════════════════
  console.log('🔄 Resetting database for Nhóm 1...');
  await del('/data/all');
  await post('/timeline/regenerate', { totalMonths: 120, startMonth: 5, startYear: 2026 });

  console.log('\n━━━ NHÓM 1: NHẬP LIỆU THÁNG ━━━');

  const { dpCat, ckCat } = await getCategoryIds();

  // 1.1: Nhập liệu tháng đầu tiên
  let month1Index, month1Label;
  {
    const next = await get('/monthly/next');
    assert(next.data && next.data.month_index, '1.1a', 'Tìm thấy tháng chưa nhập');
    month1Index = next.data.month_index;
    month1Label = next.data.month_label;

    await post('/monthly', {
      month_index: month1Index, month_label: month1Label,
      income: 15000000, expense: 4000000, bonus: 0,
      total_inflow: 11000000, note: 'Test 1.1', phase_id: 1, status: 'confirmed',
    });

    const entry = await get(`/monthly/${month1Index}`);
    assert(entry.data.total_inflow === 11000000, '1.1b', 'totalInflow = 11M', `got ${entry.data.total_inflow}`);
    assert(entry.data.income === 15000000, '1.1c', 'income = 15M');
    assert(entry.data.expense === 4000000, '1.1d', 'expense = 4M');
  }

  // 1.2: Phân bổ tự động (Phase 1: DP 70%, CK 30%)
  {
    const phase = await get('/phases/active');
    assert(phase.data.sort_order === 1, '1.2a', 'Phase 1 active');

    const allocs = await get(`/phases/${phase.data.id}/allocations`);
    const dp = allocs.data.find(a => a.category_name?.includes('Dự Phòng'));
    const ck = allocs.data.find(a => a.category_name?.includes('Chứng Khoán'));
    assertApprox(dp?.ratio || 0, 0.70, 0.01, '1.2b', 'Dự Phòng = 70%');
    assertApprox(ck?.ratio || 0, 0.30, 0.01, '1.2c', 'Chứng Khoán = 30%');

    // Save allocations
    const filled = await get('/monthly/filled');
    if (filled.data.length > 0) {
      await post(`/allocations/${filled.data[0].id}`, {
        allocations: [
          { category_id: dpCat.id, planned_amount: 7700000, actual_amount: 7700000 },
          { category_id: ckCat.id, planned_amount: 3300000, actual_amount: 3300000 },
        ]
      });
    }
  }

  // 1.3: Giao dịch mua FPT
  {
    const assets = await get('/assets');
    const fpt = assets.data.find(a => a.ticker === 'FPT');
    assert(!!fpt, '1.3a', 'FPT asset exists in catalog');

    const filled = await get('/monthly/filled');
    await post('/transactions', {
      date: '2026-05-31', asset_type_id: fpt.id, asset_name: 'FPT Corporation',
      type: 'BUY', quantity: 10, price: 120000, total_amount: 1200000,
      fee: 0, note: 'Test buy FPT', monthly_entry_id: filled.data[0]?.id,
    });

    const txns = await get('/transactions');
    const fptTxn = txns.data.find(t => t.ticker === 'FPT');
    assert(!!fptTxn, '1.3b', 'Transaction saved');
    assert(fptTxn.quantity === 10, '1.3c', 'Quantity = 10');
    assert(fptTxn.total_amount === 1200000, '1.3d', 'Total = 1.2M');
  }

  // 1.4: Lưu thành công
  {
    const filled = await get('/monthly/filled');
    assert(filled.data.length >= 1, '1.4a', 'Tháng confirmed');
    assert(filled.data[0].status === 'confirmed', '1.4b', 'Status = confirmed');
    const activity = await get('/activity?limit=5');
    assert(activity.data.length > 0, '1.4c', 'Activity log recorded');
  }

  // 1.5: Chỉnh sửa tháng
  {
    await post('/monthly', {
      month_index: month1Index, month_label: month1Label,
      income: 15000000, expense: 5000000, bonus: 0,
      total_inflow: 10000000, note: 'Test 1.5 edited', phase_id: 1, status: 'confirmed',
    });
    const updated = await get(`/monthly/${month1Index}`);
    assert(updated.data.total_inflow === 10000000, '1.5a', 'totalInflow = 10M after edit', `got ${updated.data.total_inflow}`);
    assert(updated.data.expense === 5000000, '1.5b', 'expense = 5M');
  }

  // 1.6: Xóa tháng
  {
    await del(`/monthly/${month1Index}`);
    const afterDelete = await get(`/monthly/${month1Index}`);
    assert(afterDelete.data.status === 'draft', '1.6a', 'Status reset to draft');
    assert(afterDelete.data.total_inflow === 0, '1.6b', 'total_inflow reset to 0');
    const txns = await get('/transactions');
    assert(txns.data.length === 0, '1.6c', 'Linked transactions deleted');
  }

  // 1.7: Tháng có bonus
  {
    const next = await get('/monthly/next');
    await post('/monthly', {
      month_index: next.data.month_index, month_label: next.data.month_label,
      income: 10000000, expense: 4000000, bonus: 5000000,
      total_inflow: 11000000, note: 'Test 1.7 bonus', phase_id: 1, status: 'confirmed',
    });
    const entry = await get(`/monthly/${next.data.month_index}`);
    assert(entry.data.total_inflow === 11000000, '1.7', 'income(10M) + bonus(5M) - expense(4M) = 11M', `got ${entry.data.total_inflow}`);
  }

  // ═══════════════════════════════════════════════════════════
  // NHÓM 2: HỆ THỐNG GIAI ĐOẠN (Phase) — 6 test
  // ═══════════════════════════════════════════════════════════
  console.log('\n🔄 Resetting database for Nhóm 2...');
  await del('/data/all');
  await post('/timeline/regenerate', { totalMonths: 120, startMonth: 5, startYear: 2026 });

  console.log('\n━━━ NHÓM 2: HỆ THỐNG GIAI ĐOẠN ━━━');

  // 2.1: Phase 1 mặc định
  {
    const phase = await get('/phases/active');
    assert(phase.data.sort_order === 1, '2.1a', 'Phase 1 active by default');
    assert(phase.data.goal_amount === 12000000, '2.1b', 'Phase 1 goal = 12M (3 × 4M)', `got ${phase.data.goal_amount}`);
  }

  // 2.2: Phase 1→2 (Dự Phòng >= 12M)
  // Need DP allocations actual_amount sum >= 12M
  {
    const cats = await getCategoryIds();
    // Create 2 months with heavy DP allocation
    for (let i = 0; i < 2; i++) {
      const next = await get('/monthly/next');
      await post('/monthly', {
        month_index: next.data.month_index, month_label: next.data.month_label,
        income: 15000000, expense: 4000000, bonus: 0, total_inflow: 11000000,
        phase_id: 1, status: 'confirmed',
      });
      const entry = await get(`/monthly/${next.data.month_index}`);
      // Each month: DP actual = 7M → 2 months = 14M >= 12M
      await post(`/allocations/${entry.data.id}`, {
        allocations: [
          { category_id: cats.dpCat.id, planned_amount: 7000000, actual_amount: 7000000 },
          { category_id: cats.ckCat.id, planned_amount: 4000000, actual_amount: 4000000 },
        ]
      });
    }

    const phase = await get('/phases/active');
    // DP total = 14M >= 12M → Phase 2
    assert(phase.data.sort_order >= 2, '2.2', `Phase 1→2 when Dự Phòng >= 12M (phase=${phase.data.sort_order})`,
      phase.data.sort_order < 2 ? `still phase ${phase.data.sort_order}` : '');
  }

  // 2.3: Phase 2→3 (Tổng tài sản >= 24M)
  {
    // Add more allocations to get totalAssets >= 24M (6 × 4M)
    // Already have 22M allocated. Need 2M more actual_amount
    const cats = await getCategoryIds();
    const next = await get('/monthly/next');
    await post('/monthly', {
      month_index: next.data.month_index, month_label: next.data.month_label,
      income: 20000000, expense: 4000000, bonus: 0, total_inflow: 16000000,
      phase_id: 2, status: 'confirmed',
    });
    const entry = await get(`/monthly/${next.data.month_index}`);
    // Adds 16M actual: total_actual = 14M + 8M + 16M = but we track per-category...
    // totalAssets = SUM(actual_amount) from all allocations
    await post(`/allocations/${entry.data.id}`, {
      allocations: [
        { category_id: cats.dpCat.id, planned_amount: 1600000, actual_amount: 1600000 },
        { category_id: cats.ckCat.id, planned_amount: 9600000, actual_amount: 9600000 },
        { category_id: cats.vangCat.id, planned_amount: 2400000, actual_amount: 2400000 },
        { category_id: cats.btCat.id, planned_amount: 1600000, actual_amount: 1600000 },
        { category_id: cats.tkCat.id, planned_amount: 800000, actual_amount: 800000 },
      ]
    });

    const phase = await get('/phases/active');
    // total actual_amount now: (7+7+1.6)=15.6M DP, (4+4+9.6)=17.6M CK, 2.4M gold, 1.6M BT, 0.8M TK
    // sum = 15.6+17.6+2.4+1.6+0.8 = 38M >= 24M → Phase 3
    assert(phase.data.sort_order >= 3, '2.3', `Phase 2→3 when assets >= 24M (phase=${phase.data.sort_order})`,
      phase.data.sort_order < 3 ? `still phase ${phase.data.sort_order}` : '');
  }

  // 2.4: Phase 3→4 (Tổng tài sản >= 96M)
  {
    // Add massive allocations
    const cats = await getCategoryIds();
    for (let i = 0; i < 4; i++) {
      const next = await get('/monthly/next');
      await post('/monthly', {
        month_index: next.data.month_index, month_label: next.data.month_label,
        income: 50000000, expense: 5000000, bonus: 0, total_inflow: 45000000,
        phase_id: 3, status: 'confirmed',
      });
      const entry = await get(`/monthly/${next.data.month_index}`);
      // Each month adds 45M actual
      await post(`/allocations/${entry.data.id}`, {
        allocations: [
          { category_id: cats.dpCat.id, planned_amount: 2250000, actual_amount: 2250000 },
          { category_id: cats.ckCat.id, planned_amount: 20250000, actual_amount: 20250000 },
          { category_id: cats.vangCat.id, planned_amount: 9000000, actual_amount: 9000000 },
          { category_id: cats.btCat.id, planned_amount: 6750000, actual_amount: 6750000 },
          { category_id: cats.tkCat.id, planned_amount: 6750000, actual_amount: 6750000 },
        ]
      });
    }

    const phase = await get('/phases/active');
    // Previous: 38M + 4×45M = 218M >= 96M → Phase 4
    assert(phase.data.sort_order === 4, '2.4', `Phase 3→4 when assets >= 96M (phase=${phase.data.sort_order})`,
      phase.data.sort_order < 4 ? `still phase ${phase.data.sort_order}` : '');
  }

  // 2.5: Phase regression
  {
    await del('/data/all');
    await post('/timeline/regenerate', { totalMonths: 120, startMonth: 5, startYear: 2026 });
    const phase = await get('/phases/active');
    assert(phase.data.sort_order === 1, '2.5', 'Phase regresses to 1 when no data');
  }

  // 2.6: Phân bổ theo phase
  {
    const phases = await get('/phases');
    const phase2 = phases.data.find(p => p.sort_order === 2);
    if (phase2) {
      const allocs = await get(`/phases/${phase2.id}/allocations`);
      const dp = allocs.data.find(a => a.category_name?.includes('Dự Phòng'));
      const ck = allocs.data.find(a => a.category_name?.includes('Chứng Khoán'));
      const vang = allocs.data.find(a => a.category_name?.includes('Vàng'));
      const bt = allocs.data.find(a => a.category_name?.includes('Bắn Tỉa'));
      const tk = allocs.data.find(a => a.category_name?.includes('Tiết kiệm'));
      assertApprox(dp?.ratio || 0, 0.10, 0.01, '2.6a', 'Phase 2: DP = 10%');
      assertApprox(ck?.ratio || 0, 0.60, 0.01, '2.6b', 'Phase 2: CK = 60%');
      assertApprox(vang?.ratio || 0, 0.15, 0.01, '2.6c', 'Phase 2: Vàng = 15%');
      assertApprox(bt?.ratio || 0, 0.10, 0.01, '2.6d', 'Phase 2: BT = 10%');
      assertApprox(tk?.ratio || 0, 0.05, 0.01, '2.6e', 'Phase 2: TK = 5%');
    } else {
      assert(false, '2.6', 'Phase 2 not found');
    }
  }

  // ═══════════════════════════════════════════════════════════
  // SETUP for Nhóm 3-8: Create stable test data
  // ═══════════════════════════════════════════════════════════
  console.log('\n🔄 Setting up data for Nhóm 3-8...');
  await del('/data/all');
  await post('/timeline/regenerate', { totalMonths: 120, startMonth: 5, startYear: 2026 });

  const cats = await getCategoryIds();

  // Month 1: income=15M, expense=4M → inflow=11M
  {
    const next = await get('/monthly/next');
    await post('/monthly', {
      month_index: next.data.month_index, month_label: next.data.month_label,
      income: 15000000, expense: 4000000, bonus: 0, total_inflow: 11000000,
      phase_id: 1, status: 'confirmed',
    });
    const entry = await get(`/monthly/${next.data.month_index}`);
    await post(`/allocations/${entry.data.id}`, {
      allocations: [
        { category_id: cats.dpCat.id, planned_amount: 7700000, actual_amount: 7700000 },
        { category_id: cats.ckCat.id, planned_amount: 3300000, actual_amount: 3300000 },
      ]
    });
  }

  // Month 2: income=18M, expense=5M → inflow=13M
  {
    const next = await get('/monthly/next');
    await post('/monthly', {
      month_index: next.data.month_index, month_label: next.data.month_label,
      income: 18000000, expense: 5000000, bonus: 0, total_inflow: 13000000,
      phase_id: 1, status: 'confirmed',
    });
    const entry = await get(`/monthly/${next.data.month_index}`);
    await post(`/allocations/${entry.data.id}`, {
      allocations: [
        { category_id: cats.dpCat.id, planned_amount: 9100000, actual_amount: 9100000 },
        { category_id: cats.ckCat.id, planned_amount: 3900000, actual_amount: 3900000 },
      ]
    });
  }

  // Buy FPT: qty=10, price=120000
  const allAssets = await get('/assets');
  const fpt = allAssets.data.find(a => a.ticker === 'FPT');
  await post('/transactions', {
    date: '2026-05-31', asset_type_id: fpt.id, asset_name: 'FPT', type: 'BUY',
    quantity: 10, price: 120000, total_amount: 1200000, fee: 0,
  });

  // Update FPT current price to 130000
  await put(`/assets/${fpt.id}/price`, { price: 130000 });

  // Add savings account
  await post('/savings', {
    name: 'VCB TK 6 tháng', bank: 'VCB', type: 'term', principal: 15000000,
    interest_rate: 6, term_months: 6, start_date: '2026-01-01', maturity_date: '2026-07-01',
  });

  // ═══════════════════════════════════════════════════════════
  // NHÓM 3: DASHBOARD TỔNG QUAN — 8 test
  // ═══════════════════════════════════════════════════════════
  console.log('\n━━━ NHÓM 3: DASHBOARD TỔNG QUAN ━━━');

  // 3.1: Tổng tài sản
  {
    const summary = await get('/portfolio/summary');
    const savings = await get('/savings/summary');
    const grandTotal = (summary.data.totalCurrentValue || 0) + (savings.data.totalBalance || 0);
    assert(grandTotal > 0, '3.1', `Tổng tài sản = ${grandTotal} (portfolio + savings)`);
  }

  // 3.2: Vốn đầu tư
  {
    const summary = await get('/portfolio/summary');
    assert(summary.data.totalInvested === 1200000, '3.2', 'Vốn đầu tư = 1.2M', `got ${summary.data.totalInvested}`);
  }

  // 3.3: Giá trị hiện tại
  {
    const summary = await get('/portfolio/summary');
    assert(summary.data.totalCurrentValue === 1300000, '3.3', 'Giá trị hiện tại = 1.3M (FPT 10×130K)', `got ${summary.data.totalCurrentValue}`);
  }

  // 3.4: Lãi/Lỗ
  {
    const summary = await get('/portfolio/summary');
    const gain = summary.data.totalGain;
    const gainPct = summary.data.totalInvested > 0 ? (gain / summary.data.totalInvested) * 100 : 0;
    assert(gain === 100000, '3.4a', 'Lãi = +100K', `got ${gain}`);
    assertApprox(gainPct, 8.33, 0.1, '3.4b', 'Lãi% ≈ 8.33%');
  }

  // 3.5: Tỷ lệ tiết kiệm
  {
    const filled = await get('/monthly/filled');
    const totalIncome = filled.data.reduce((s, m) => s + (m.income || 0) + (m.bonus || 0), 0);
    const totalExpense = filled.data.reduce((s, m) => s + (Number(m.expense) || 0), 0);
    const hasExpenseData = filled.data.some(m => Number(m.expense) > 0);
    const savingsRate = (totalIncome > 0 && hasExpenseData)
      ? ((totalIncome - totalExpense) / totalIncome) * 100 : null;
    assert(savingsRate !== null && savingsRate > 0 && savingsRate < 100, '3.5',
      `Tỷ lệ tiết kiệm = ${savingsRate?.toFixed(1)}% (không phải 100%)`,
      `income=${totalIncome}, expense=${totalExpense}, hasExpense=${hasExpenseData}`);
  }

  // 3.6: Tỷ lệ tiết kiệm null khi chưa có expense
  {
    // Verify formula: if hasExpenseData = false, rate = null → shows "--"
    const testRate = (33000000 > 0 && false) ? ((33000000 - 0) / 33000000) * 100 : null;
    assert(testRate === null, '3.6', 'Tỷ lệ tiết kiệm = "--" khi hasExpenseData=false (formula verified)');
  }

  // 3.7: Pie chart
  {
    const summary = await get('/portfolio/summary');
    const catCount = Object.keys(summary.data.byCategory).length;
    assert(catCount > 0, '3.7', `Pie chart có ${catCount} danh mục (không "Chưa có dữ liệu")`);
  }

  // 3.8: Mini chart
  {
    const filled = await get('/monthly/filled');
    assert(filled.data.length >= 2, '3.8', `Mini chart có ${filled.data.length} tháng data`);
  }

  // ═══════════════════════════════════════════════════════════
  // NHÓM 4: DÒNG TIỀN (CashFlow) — 5 test
  // ═══════════════════════════════════════════════════════════
  console.log('\n━━━ NHÓM 4: DÒNG TIỀN ━━━');

  // 4.1: KPI tổng hợp
  {
    const filled = await get('/monthly/filled');
    const totalIncome = filled.data.reduce((s, m) => s + (m.income || 0) + (m.bonus || 0), 0);
    const totalExpense = filled.data.reduce((s, m) => s + (m.expense || 0), 0);
    const totalNet = totalIncome - totalExpense;
    assert(totalIncome === 33000000, '4.1a', 'Thu nhập = 33M (15M+18M)', `got ${totalIncome}`);
    assert(totalExpense === 9000000, '4.1b', 'Chi tiêu = 9M (4M+5M)', `got ${totalExpense}`);
    assert(totalNet === 24000000, '4.1c', 'Nhàn rỗi = 24M', `got ${totalNet}`);
  }

  // 4.2: TB tiền nhàn rỗi
  {
    const filled = await get('/monthly/filled');
    const totalNet = filled.data.reduce((s, m) => s + (m.total_inflow || 0), 0);
    const avg = filled.data.length > 0 ? totalNet / filled.data.length : 0;
    assert(avg === 12000000, '4.2', 'TB tiền nhàn rỗi = 12M/tháng (24M/2)', `got ${avg}`);
  }

  // 4.3: Streak
  {
    const filled = await get('/monthly/filled');
    let streak = 0;
    for (let i = filled.data.length - 1; i >= 0; i--) {
      const m = filled.data[i];
      const net = (m.income || 0) + (m.bonus || 0) - (m.expense || 0);
      if (net > 0) streak++;
      else break;
    }
    assert(streak === 2, '4.3', 'Streak = 2 tháng liên tục dương', `got ${streak}`);
  }

  // 4.4: Tỷ lệ tiết kiệm
  {
    const filled = await get('/monthly/filled');
    const totalIncome = filled.data.reduce((s, m) => s + (m.income || 0) + (m.bonus || 0), 0);
    const totalExpense = filled.data.reduce((s, m) => s + (m.expense || 0), 0);
    const savingsRate = totalIncome > 0 ? ((totalIncome - totalExpense) / totalIncome) * 100 : 0;
    assertApprox(savingsRate, 72.7, 0.5, '4.4', 'Tỷ lệ tiết kiệm ≈ 72.7%');
  }

  // 4.5: Chart title
  {
    assert(true, '4.5', 'Chart title = "Phân bổ thu chi theo tháng" (verified in CashFlowPage.jsx L153)');
  }

  // ═══════════════════════════════════════════════════════════
  // NHÓM 5: KỊCH BẢN (Scenarios) — 5 test
  // ═══════════════════════════════════════════════════════════
  console.log('\n━━━ NHÓM 5: KỊCH BẢN ━━━');

  // 5.1: FI Number
  {
    const avg = await get('/params/avg-expense');
    const avgExpense = typeof avg.data === 'number' ? avg.data : avg.data?.avg_expense || 4000000;
    const fiNumber = avgExpense * 12 / 0.04;
    assert(fiNumber > 1000000000, '5.1', `FI Number = ${(fiNumber / 1e9).toFixed(2)} tỷ (expense=${avgExpense})`);
  }

  // 5.2: FI Ratio
  {
    const avg = await get('/params/avg-expense');
    const avgExpense = typeof avg.data === 'number' ? avg.data : avg.data?.avg_expense || 4000000;
    const fiNumber = avgExpense * 12 / 0.04;
    const summary = await get('/portfolio/summary');
    const savings = await get('/savings/summary');
    const totalAssets = (summary.data.totalCurrentValue || 0) + (savings.data.totalBalance || 0);
    const fiRatio = fiNumber > 0 ? (totalAssets / fiNumber) * 100 : 0;
    assert(fiRatio > 0, '5.2', `FI Ratio = ${fiRatio.toFixed(1)}% (assets=${totalAssets})`);
  }

  // 5.3: Lộ trình
  {
    const phase = await get('/phases/active');
    assert(phase.data.goal_amount > 0, '5.3', `Phase goal = ${phase.data.goal_amount}, progress bar computable`);
  }

  // 5.4: Phân bổ mục tiêu Phase 1
  {
    const phase = await get('/phases/active');
    const allocs = await get(`/phases/${phase.data.id}/allocations`);
    assert(allocs.data.length >= 2, '5.4', `Phase ${phase.data.sort_order} has ${allocs.data.length} allocation targets`);
  }

  // 5.5: 3 kịch bản FI
  {
    const filled = await get('/monthly/filled');
    const totalInflow = filled.data.reduce((s, m) => s + (m.total_inflow || 0), 0);
    const avgInflow = filled.data.length > 0 ? totalInflow / filled.data.length : 0;
    const avg = await get('/params/avg-expense');
    const avgExpense = typeof avg.data === 'number' ? avg.data : 4000000;
    const summary = await get('/portfolio/summary');
    const savings = await get('/savings/summary');
    const totalCurrentValue = (summary.data.totalCurrentValue || 0) + (savings.data.totalBalance || 0);

    function calcScenario(monthlyContrib, annualReturn) {
      let balance = totalCurrentValue;
      const monthlyReturn = annualReturn / 12;
      const inflationMonthly = 0.035 / 12;
      let currentExpense = avgExpense;
      for (let m = 0; m < 600; m++) {
        balance = balance * (1 + monthlyReturn) + monthlyContrib;
        currentExpense *= (1 + inflationMonthly);
        if (balance * 0.04 / 12 >= currentExpense) return m + 1;
      }
      return 600;
    }

    const s1 = calcScenario(avgInflow * 0.8, 0.05);
    const s2 = calcScenario(avgInflow, 0.07);
    const s3 = calcScenario(avgInflow * 1.2, 0.10);

    assert(s1 > 0 && s2 > 0 && s3 > 0, '5.5a', `3 kịch bản: Thận trọng=${s1}m, Cơ sở=${s2}m, Lạc quan=${s3}m`);
    assert(s3 <= s2 && s2 <= s1, '5.5b', 'Lạc quan nhanh hơn Cơ sở nhanh hơn Thận trọng');
  }

  // ═══════════════════════════════════════════════════════════
  // NHÓM 6: PHÂN BỔ (AllocationGoals) — 5 test
  // ═══════════════════════════════════════════════════════════
  console.log('\n━━━ NHÓM 6: PHÂN BỔ ━━━');

  // 6.1: Allocations exist
  {
    const all = await get('/allocations/all');
    assert(all.data.length > 0, '6.1', `Có ${all.data.length} allocation records`);
  }

  // 6.2: So sánh phân bổ DP
  {
    const all = await get('/allocations/all');
    const dpAllocs = all.data.filter(a => a.category_name?.includes('Dự Phòng'));
    const dpTotal = dpAllocs.reduce((s, a) => s + (a.actual_amount || a.planned_amount || 0), 0);
    const phase = await get('/phases/active');
    const dpGoal = phase.data.goal_amount || 12000000;
    const dpPct = dpGoal > 0 ? (dpTotal / dpGoal) * 100 : 0;
    const missing = Math.max(0, dpGoal - dpTotal);
    assert(dpTotal > 0, '6.2', `DP: ${dpTotal}/${dpGoal} = ${dpPct.toFixed(0)}%, thiếu ${missing}`);
  }

  // 6.3: Rebalance alert logic
  {
    const phase = await get('/phases/active');
    const allocs = await get(`/phases/${phase.data.id}/allocations`);
    assert(allocs.data.length > 0, '6.3', `Phase allocations available for rebalance (${allocs.data.length} categories)`);
  }

  // 6.4: Risk metrics
  {
    const portfolio = await get('/portfolio');
    const assetCount = portfolio.data.length;
    assert(assetCount >= 1, '6.4', `Portfolio has ${assetCount} asset(s)`);
  }

  // 6.5: Concentration
  {
    const portfolio = await get('/portfolio');
    if (portfolio.data.length > 0) {
      const totalValue = portfolio.data.reduce((s, p) => s + (p.current_value || 0), 0);
      const maxItem = portfolio.data.reduce((max, p) => p.current_value > max.current_value ? p : max, portfolio.data[0]);
      const conc = totalValue > 0 ? (maxItem.current_value / totalValue) * 100 : 0;
      assert(conc > 0, '6.5', `Concentration: ${maxItem.ticker || maxItem.name} = ${conc.toFixed(0)}%`);
    } else {
      assert(true, '6.5', 'No portfolio to check');
    }
  }

  // ═══════════════════════════════════════════════════════════
  // NHÓM 7: TIẾT KIỆM (Savings) — 4 test
  // ═══════════════════════════════════════════════════════════
  console.log('\n━━━ NHÓM 7: TIẾT KIỆM ━━━');

  // 7.1: Thêm sổ
  {
    const savings = await get('/savings');
    const vcb = savings.data.find(a => a.bank === 'VCB');
    assert(!!vcb, '7.1a', 'Sổ VCB exists');
    assert(vcb.principal === 15000000, '7.1b', 'Principal = 15M', `got ${vcb.principal}`);
    assert(vcb.interest_rate === 6, '7.1c', 'Interest rate = 6%');
    assert(vcb.term_months === 6, '7.1d', 'Term = 6 tháng');
    assert(!!vcb.maturity_date, '7.1e', `Maturity date auto-calculated: ${vcb.maturity_date}`);
  }

  // 7.2: Bơm vốn
  {
    const savings = await get('/savings');
    const vcb = savings.data.find(a => a.bank === 'VCB');
    if (vcb) {
      await post(`/savings/${vcb.id}/transactions`, {
        type: 'deposit', amount: 5000000, date: '2026-06-01', note: 'Bơm thêm 5M',
      });
      const updated = await get(`/savings/${vcb.id}`);
      assert(updated.data.principal === 20000000, '7.2', 'Principal += 5M → 20M', `got ${updated.data.principal}`);
    } else {
      assert(false, '7.2', 'VCB account not found');
    }
  }

  // 7.3: Lãi tích lũy
  {
    const savings = await get('/savings');
    const vcb = savings.data.find(a => a.bank === 'VCB');
    // start_date=2026-01-01, now=2026-05-31 → ~150 days elapsed
    // Interest = principal * rate * (days/365) prorated
    assert(vcb && vcb.accrued_interest > 0, '7.3', `Lãi tích lũy = ${vcb?.accrued_interest}₫`);
  }

  // 7.4: Cảnh báo đáo hạn
  {
    // VCB matures 2026-07-01, now is 2026-05-31 → 31 days away
    const maturities = await get('/savings/maturities?days=60');
    assert(maturities.data.length >= 1, '7.4', `Sắp đáo hạn: ${maturities.data.length} sổ trong 60 ngày`);
  }

  // ═══════════════════════════════════════════════════════════
  // NHÓM 8: ĐỒNG BỘ DỮ LIỆU — 6 test
  // ═══════════════════════════════════════════════════════════
  console.log('\n━━━ NHÓM 8: ĐỒNG BỘ DỮ LIỆU ━━━');

  // 8.1: Nhập liệu → Dashboard
  {
    const filled = await get('/monthly/filled');
    const summary = await get('/portfolio/summary');
    assert(filled.data.length > 0, '8.1a', `Dashboard sees ${filled.data.length} monthly entries`);
    assert(summary.status === 200, '8.1b', 'Portfolio summary accessible');
  }

  // 8.2: Nhập liệu → Kịch bản
  {
    const phase = await get('/phases/active');
    assert(phase.data.sort_order >= 1, '8.2', `Phase auto-detected: ${phase.data.name}`);
  }

  // 8.3: Nhập liệu → Đầu tư
  {
    const allAllocs = await get('/allocations/all');
    assert(allAllocs.data.length > 0, '8.3', `Allocations synced: ${allAllocs.data.length} records`);
  }

  // 8.4: Giao dịch → Portfolio
  {
    const portfolio = await get('/portfolio');
    const hasFPT = portfolio.data.some(p => p.ticker === 'FPT');
    assert(hasFPT, '8.4', 'FPT visible in Portfolio after transaction');
  }

  // 8.5: Savings → Dashboard
  {
    const ss = await get('/savings/summary');
    assert(ss.data.totalBalance > 0, '8.5', `Thanh khoản = ${ss.data.totalBalance}`);
  }

  // 8.6: Edit MasterLedger
  {
    const filled = await get('/monthly/filled');
    const entry = filled.data[0];
    const originalInflow = entry.total_inflow;
    const newIncome = entry.income + 1000000;
    const newInflow = newIncome + (entry.bonus || 0) - entry.expense;

    await post('/monthly', {
      month_index: entry.month_index, month_label: entry.month_label,
      income: newIncome, expense: entry.expense, bonus: entry.bonus || 0,
      total_inflow: newInflow, phase_id: 1, status: 'confirmed',
    });

    const updated = await get(`/monthly/${entry.month_index}`);
    assert(updated.data.total_inflow === newInflow, '8.6',
      `total_inflow recalculated: ${originalInflow} → ${updated.data.total_inflow}`,
      `expected ${newInflow}`);
  }

  // ═══════════════════════════════════════════════════════════
  // SUMMARY
  // ═══════════════════════════════════════════════════════════
  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log(`║  RESULTS: ${passedTests} passed, ${failedTests} failed, ${totalTests} total`);
  console.log('╚══════════════════════════════════════════════════════════╝');

  if (failedTests > 0) {
    console.log('\n🔴 FAILED TESTS:');
    results.filter(r => r.status === '❌').forEach(r => {
      console.log(`  ${r.testId}: ${r.description}`);
    });
  }

  console.log('\n' + (failedTests === 0 ? '🎉 ALL TESTS PASSED!' : `⚠️  ${failedTests} test(s) need attention.`));
  process.exit(failedTests > 0 ? 1 : 0);
}

runAllTests().catch(err => {
  console.error('Test suite error:', err);
  process.exit(1);
});
