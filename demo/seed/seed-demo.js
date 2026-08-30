/**
 * seed-demo.js — Bơm dữ liệu demo vào DB demo QUA HTTP API.
 *
 * Bắt buộc seed qua API chứ không ghi thẳng file: FinancialDB giữ toàn bộ DB trong RAM
 * và save() ghi đè cả file, nên mọi thay đổi từ ngoài trong lúc server chạy sẽ bị nuốt mất.
 *
 * Chạy: node demo/seed/seed-demo.js   (demo-server.js phải đang chạy ở cổng 3001)
 */
const BASE = process.env.MF_DEMO_BASE || 'http://localhost:3001';

// PRNG deterministic — không dùng Math.random để mỗi lần seed ra số y hệt nhau.
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = mulberry32(20260823);

async function api(method, path, body) {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let data; try { data = JSON.parse(text); } catch { data = text; }
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status}: ${text.slice(0, 300)}`);
  return data;
}
const get = p => api('GET', p);
const post = (p, b) => api('POST', p, b);
const put = (p, b) => api('PUT', p, b);

const vnd = n => n.toLocaleString('vi-VN') + '₫';
const round = (n, step) => Math.round(n / step) * step;

// ─────────────────────────────────────────────────────────────────
// 1. Thông số nền
// ─────────────────────────────────────────────────────────────────
const FI_MONTHLY_EXPENSE = 11_000_000;  // chi tiêu KỲ VỌNG (cao hơn thực tế ~8.7tr — có tính lạm phát/gia đình)
const DEFAULT_INFLOW = 12_000_000;
const START_MONTH = 3, START_YEAR = 2025, TOTAL_MONTHS = 120;

// 18 tháng T3/2025 → T8/2026. Tháng 19 (T9/2026) cố tình để trống cho scene wizard.
const MONTHS = [
  { income: 14_000_000, expense: 7_500_000,  bonus: 0,          note: 'Tháng đầu ghi chép' },
  { income: 14_000_000, expense: 7_800_000,  bonus: 0,          note: '' },
  { income: 14_000_000, expense: 7_400_000,  bonus: 0,          note: '' },
  { income: 15_500_000, expense: 8_100_000,  bonus: 0,          note: 'Tăng lương' },
  { income: 15_500_000, expense: 7_900_000,  bonus: 6_000_000,  note: 'Thưởng giữa năm' },
  { income: 15_500_000, expense: 8_300_000,  bonus: 0,          note: '' },
  { income: 17_000_000, expense: 8_000_000,  bonus: 0,          note: 'Nhận dự án ngoài' },
  { income: 17_000_000, expense: 9_600_000,  bonus: 0,          note: 'Sửa xe + khám sức khoẻ' },
  { income: 17_000_000, expense: 8_200_000,  bonus: 0,          note: '' },
  { income: 18_500_000, expense: 9_800_000,  bonus: 0,          note: 'Chi tiêu cuối năm' },
  { income: 18_500_000, expense: 8_600_000,  bonus: 0,          note: '' },
  { income: 18_500_000, expense: 10_500_000, bonus: 20_000_000, note: 'Thưởng Tết' },
  { income: 20_000_000, expense: 8_400_000,  bonus: 0,          note: 'Tăng lương sau Tết' },
  { income: 20_000_000, expense: 8_700_000,  bonus: 0,          note: '' },
  { income: 20_000_000, expense: 8_500_000,  bonus: 0,          note: '' },
  { income: 22_000_000, expense: 8_900_000,  bonus: 0,          note: 'Lên vị trí mới' },
  { income: 22_000_000, expense: 9_100_000,  bonus: 9_000_000,  note: 'Thưởng giữa năm' },
  { income: 22_000_000, expense: 8_800_000,  bonus: 0,          note: '' },
];

const monthLabel = i => {
  const m = ((START_MONTH - 1 + i) % 12) + 1;
  const y = START_YEAR + Math.floor((START_MONTH - 1 + i) / 12);
  return { label: `T${m}/${y}`, m, y };
};
// ngày trong tháng thứ i (0-based), dùng cho giao dịch
const dateIn = (i, day) => {
  const { m, y } = monthLabel(i);
  return `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
};

// ─────────────────────────────────────────────────────────────────
// 2. Danh mục đầu tư — chuỗi giá nội suy tuyến tính + nhiễu deterministic
// ─────────────────────────────────────────────────────────────────
const PRICE_PATH = {
  E1VFVN30: { from: 24_500,   to: 34_500,     step: 10,      noise: 0.025 },
  FPT:      { from: 96_000,   to: 138_000,    step: 100,     noise: 0.03  },
  MBB:      { from: 21_200,   to: 26_800,     step: 50,      noise: 0.025 },
  HPG:      { from: 29_000,   to: 27_200,     step: 50,      noise: 0.03  },
  MWG:      { from: 58_000,   to: 76_300,     step: 100,     noise: 0.03  },
  SJC:      { from: 8_600_000, to: 11_500_000, step: 50_000, noise: 0.012 },
};
function priceAt(ticker, monthIdx) {
  const p = PRICE_PATH[ticker];
  const t = monthIdx / (MONTHS.length - 1);
  const base = p.from + (p.to - p.from) * t;
  const jitter = 1 + (rnd() - 0.5) * 2 * p.noise;
  return round(base * jitter, p.step);
}

// Lịch mua: ticker → mảng chỉ số tháng (0-based)
const BUY_PLAN = {
  E1VFVN30: [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17],
  FPT:      [5, 9, 13, 16],
  MBB:      [7, 12],
  MWG:      [10, 15],
  HPG:      [8, 14],
  SJC:      [6, 11],          // 2 chỉ — chừa đủ quỹ vàng để scene 7 mua chỉ thứ 3 trên camera
};
// Số tiền mỗi lệnh (VND) — ETF tăng dần theo thu nhập.
// Tổng triển khai (đầu tư + tiết kiệm) phải NHỎ HƠN tổng dòng tiền tích luỹ 201,9tr,
// phần dư chính là "kho đạn" Bắn Tỉa + tiền chưa phân bổ hiện trên Dashboard.
const BUY_BUDGET = {
  E1VFVN30: i => 1_300_000 + i * 70_000,
  FPT:      () => 3_000_000,
  MBB:      () => 2_800_000,
  MWG:      () => 3_200_000,
  HPG:      () => 2_600_000,
  SJC:      () => null,       // vàng mua tròn 1 chỉ
};

// ─────────────────────────────────────────────────────────────────
// 3. Watchlist — peak/current set sao cho có 2 mã drawdown ≥15%
//    => bật thẻ "Cơ hội bắn tỉa!" ở tab Bắn Tỉa
// ─────────────────────────────────────────────────────────────────
const WATCHLIST = [
  { ticker: 'VNM', current: 58_000,  peak: 78_000  },  // -25.6%  Cấp 2
  { ticker: 'SSI', current: 27_800,  peak: 34_000  },  // -18.2%  Cấp 1
  { ticker: 'HPG', current: 27_200,  peak: 33_500  },  // -18.8%  Cấp 1 — mã đang nắm giữ, sinh cảnh báo price_drop
  { ticker: 'MWG', current: 76_300,  peak: 82_000  },  //  -7.0%
  { ticker: 'FPT', current: 138_000, peak: 145_000 },  //  -4.8%
  { ticker: 'MBB', current: 26_800,  peak: 27_500  },  //  -2.5%
  { ticker: 'E1VFVN30', current: 34_500, peak: 35_800 }, // -3.6%
];

// ─────────────────────────────────────────────────────────────────
// 4. Sổ tiết kiệm. Hôm nay = 2026-08-23 → sổ VCB đáo hạn 2026-09-12 (còn 20 ngày)
//    => bật banner hổ phách "Sắp đáo hạn" trên Dashboard.
// ─────────────────────────────────────────────────────────────────
const SAVINGS = [
  // Gốc phải ≥ 3× FI_MONTHLY_EXPENSE (33tr) thì getActivePhase mới cho qua Giai đoạn 2,
  // rồi tổng tài sản ≥ 6× (66tr) đẩy tiếp lên Giai đoạn 3 "Tích lũy" — đúng chỗ đẹp để quay.
  { name: 'Quỹ Dự Phòng MB', bank: 'MBBANK', type: 'liquid', principal: 5_000_000,
    interest_rate: 4.5, term_months: 0, start_date: '2025-03-10', maturity_date: null,
    category_id: 1, auto_renew: 0, note: 'Sổ không kỳ hạn — rút bất cứ lúc nào',
    deposits: [
      ['2025-06-12', 4_000_000], ['2025-09-15', 4_500_000], ['2025-12-10', 5_000_000],
      ['2026-03-11', 5_500_000], ['2026-06-14', 6_000_000], ['2026-08-12', 5_000_000],
    ] },
  { name: 'Sổ 6 tháng VCB', bank: 'Vietcombank', type: 'term', principal: 20_000_000,
    interest_rate: 5.6, term_months: 6, start_date: '2026-03-12', maturity_date: '2026-09-12',
    category_id: 5, auto_renew: 1, note: 'Đáo hạn tái tục tự động' },
  { name: 'Sổ 12 tháng Techcombank', bank: 'Techcombank', type: 'term', principal: 22_000_000,
    interest_rate: 6.1, term_months: 12, start_date: '2026-01-15', maturity_date: '2027-01-15',
    category_id: 5, auto_renew: 0, note: 'Thang bậc — kỳ hạn dài, lãi cao nhất' },
  { name: 'Sổ 3 tháng ACB (gom vàng)', bank: 'ACB', type: 'term', principal: 8_000_000,
    interest_rate: 5.2, term_months: 3, start_date: '2026-07-05', maturity_date: '2026-10-05',
    category_id: 3, auto_renew: 0, note: 'Gom tiền mua vàng SJC' },
];

// ═════════════════════════════════════════════════════════════════
async function main() {
  console.log('┌─ SEED DEMO DATA ────────────────────────────────');

  // -- guard: chắc chắn đang seed vào DB demo, không phải DB thật
  const health = await get('/api/demo/health');
  if (!/demo[\\/]build[\\/]demo\.sqlite$/.test(health.db)) {
    throw new Error(`TỪ CHỐI SEED: server không chạy trên DB demo (${health.db})`);
  }
  console.log('│ DB demo OK:', health.db);

  // -- 1. Tham số + timeline
  await put('/api/params', { key: 'FI_MONTHLY_EXPENSE', value: FI_MONTHLY_EXPENSE });
  await put('/api/params', { key: 'DEFAULT_INFLOW', value: DEFAULT_INFLOW });
  await post('/api/timeline/regenerate', { totalMonths: TOTAL_MONTHS, startMonth: START_MONTH, startYear: START_YEAR });
  await post('/api/params/recalc-goals', {});
  const phases = await get('/api/phases');
  console.log('│ Mục tiêu phase:', phases.map(p => `${p.sort_order}:${vnd(p.goal_amount)}`).join('  '));

  // tỷ lệ phân bổ của từng phase
  const phaseRatios = {};
  for (const p of phases) phaseRatios[p.id] = await get(`/api/phases/${p.id}/allocations`);

  // -- 2. 18 tháng dòng tiền + phân bổ
  let cumulative = 0;
  const inflowByMonth = [];
  for (let i = 0; i < MONTHS.length; i++) {
    const M = MONTHS[i];
    const { label } = monthLabel(i);
    const inflow = M.income + M.bonus - M.expense;
    inflowByMonth.push(inflow);
    cumulative += inflow;

    // phase theo tiến độ tích luỹ
    let phase = phases[0];
    for (const p of phases) if (p.goal_amount > 0 && cumulative >= p.goal_amount) phase = phases[Math.min(p.sort_order, phases.length - 1)];

    const entry = await post('/api/monthly', {
      month_index: i + 1, month_label: label,
      income: M.income, expense: M.expense, bonus: M.bonus,
      total_inflow: inflow, note: M.note, phase_id: phase.id, status: 'confirmed',
    });

    const ratios = phaseRatios[phase.id] || [];
    if (ratios.length) {
      const allocations = ratios.map(r => {
        const planned = Math.round(inflow * r.ratio);
        return { category_id: r.category_id, planned_amount: planned, actual_amount: planned };
      });
      await post(`/api/allocations/${entry.id ?? i + 1}`, { allocations });
    }
  }
  console.log(`│ 18 tháng dòng tiền — tổng tích luỹ ${vnd(cumulative)}`);

  // -- 3. Giao dịch
  const assets = await get('/api/assets');
  const byTicker = Object.fromEntries(assets.filter(a => a.ticker).map(a => [a.ticker, a]));
  let txCount = 0, invested = 0;

  const orders = [];
  for (const [ticker, months] of Object.entries(BUY_PLAN)) {
    for (const mi of months) orders.push({ ticker, mi });
  }
  orders.sort((a, b) => a.mi - b.mi || a.ticker.localeCompare(b.ticker));

  for (const { ticker, mi } of orders) {
    const asset = byTicker[ticker];
    if (!asset) { console.warn('│ ! bỏ qua, không thấy ticker', ticker); continue; }
    const price = priceAt(ticker, mi);
    let qty;
    if (ticker === 'SJC') qty = 1;
    else qty = Math.max(1, Math.floor(BUY_BUDGET[ticker](mi) / price));
    const total = qty * price;
    const day = 4 + Math.floor(rnd() * 22);
    await post('/api/transactions', {
      date: dateIn(mi, day), asset_type_id: asset.id, asset_name: ticker,
      type: 'BUY', quantity: qty, price, total_amount: total, fee: 0,
      strategy: ticker === 'E1VFVN30' ? 'DCA' : 'Thường',
      note: '', monthly_entry_id: mi + 1,
    });
    txCount++; invested += total;
  }
  console.log(`│ ${txCount} giao dịch — tổng vốn ${vnd(invested)}`);

  // -- 4. Giá hiện tại (đặt SAU giao dịch để P/L ra đúng)
  for (const [ticker, p] of Object.entries(PRICE_PATH)) {
    const a = byTicker[ticker];
    if (a) await put(`/api/assets/${a.id}/price`, { price: p.to });
  }

  // -- 4b. Lịch sử giá hằng ngày cho NetWorthModal (biểu đồ quỹ đạo tích luỹ).
  //        Không có sẵn nên phải tự sinh; dùng cùng đường giá với giao dịch để số liệu nhất quán.
  //        Random walk có ràng buộc: luôn kéo về đường xu hướng nên không trôi lung tung.
  const DAY = 86400000;
  const t0 = Date.UTC(START_YEAR, START_MONTH - 1, 1);
  const tEnd = Date.UTC(2026, 7, 23);                 // 2026-08-23
  const totalDays = Math.round((tEnd - t0) / DAY);
  let snapRows = 0;
  for (const [ticker, cfg] of Object.entries(PRICE_PATH)) {
    const a = byTicker[ticker];
    if (!a) continue;
    const walk = mulberry32(ticker.split('').reduce((s, c) => s + c.charCodeAt(0), 7));
    const rows = [];
    let drift = 0;
    for (let d = 0; d <= totalDays; d++) {
      const t = d / totalDays;
      const trend = cfg.from + (cfg.to - cfg.from) * t;
      drift = drift * 0.94 + (walk() - 0.5) * cfg.noise * 2.2;  // mean-reverting
      const close = round(Math.max(trend * 0.55, trend * (1 + drift)), cfg.step);
      const dt = new Date(t0 + d * DAY).toISOString().slice(0, 10);
      rows.push({ date: dt, close });
    }
    rows[rows.length - 1].close = cfg.to;             // ngày cuối phải khớp giá hiện tại
    await post('/api/demo/price-snapshots', { assetId: a.id, rows });
    snapRows += rows.length;
  }
  console.log(`│ Lịch sử giá: ${snapRows} phiên / ${Object.keys(PRICE_PATH).length} mã (${totalDays + 1} ngày)`);

  // -- 5. Sổ tiết kiệm
  let savingsTotal = 0;
  for (const s of SAVINGS) {
    const id = await post('/api/savings', s);
    savingsTotal += s.principal;
    for (const [date, amount] of (s.deposits || [])) {
      await post(`/api/savings/${id}/transactions`, { type: 'deposit', amount, date, note: 'Bơm vốn định kỳ' });
      savingsTotal += amount;
    }
  }
  console.log(`│ ${SAVINGS.length} sổ tiết kiệm — tổng gốc ${vnd(savingsTotal)}`);

  // -- 6. Watchlist + peak price (peak phải set SAU current, vì updateAssetPrice dùng MAX)
  for (const w of WATCHLIST) {
    const a = byTicker[w.ticker];
    if (!a) { console.warn('│ ! bỏ qua watchlist', w.ticker); continue; }
    await post('/api/watchlist', { ticker: w.ticker, name: a.name, current_price: w.current });
    await put(`/api/watchlist/${a.id}`, { current_price: w.current, peak_price: w.peak });
  }
  const wl = await get('/api/watchlist');
  const dd = wl.map(w => `${w.ticker} ${(((w.peak_price - w.current_price) / w.peak_price) * 100).toFixed(1)}%`);
  console.log('│ Watchlist drawdown:', dd.join('  '));

  // -- 7. Sinh cảnh báo
  await post('/api/demo/generate-alerts', {});
  const alertCount = await get('/api/alerts/count');
  console.log('│ Cảnh báo chưa đọc:', alertCount.count);

  // -- 8. Kiểm tra: tổng triển khai không được vượt dòng tiền tích luỹ
  const pf = await get('/api/portfolio/summary');
  const sv = await get('/api/savings/summary');
  const deployed = (pf.totalInvested || 0) + (sv.totalPrincipal || 0);
  console.log(`│ Triển khai ${vnd(deployed)} / tích luỹ ${vnd(cumulative)} = ${((deployed / cumulative) * 100).toFixed(1)}%`);
  if (deployed > cumulative) {
    console.warn('│ ! CẢNH BÁO: triển khai vượt dòng tiền — Dashboard sẽ ra tiền mặt âm');
  }

  console.log('└─ SEED XONG');
}

main().catch(e => { console.error('SEED FAILED:', e.message); process.exit(1); });
