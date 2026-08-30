/**
 * _formulas.js — Tái hiện TRUNG THỰC từng công thức mà mỗi trang đang dùng,
 * tính từ cùng một bộ dữ liệu API.
 *
 * Mục đích không phải để tính đúng, mà để chứng minh các trang đang tính KHÁC
 * NHAU. Vì vậy mỗi hàm dưới đây là bản sao nguyên văn của code hiện tại, kèm
 * file:line, và cố tình KHÔNG sửa lỗi.
 */
const { getOk } = require('../rig/http');

/** Lấy một lần, dùng cho mọi công thức, để không trang nào có lợi thế dữ liệu. */
async function loadAll() {
  const [
    filled,
    summary,
    savingsSummary,
    savingsOverview,
    phase,
    phases,
    categories,
    transactions,
    savingsAccounts,
    params,
    checklist,
    snapshot,
  ] = await Promise.all([
    getOk('/api/monthly/filled'),
    getOk('/api/portfolio/summary'),
    getOk('/api/savings/summary'),
    getOk('/api/savings/overview'),
    getOk('/api/phases/active'),
    getOk('/api/phases'),
    getOk('/api/categories'),
    getOk('/api/transactions'),
    getOk('/api/savings'),
    getOk('/api/params'),
    getOk('/api/phases/checklist'),
    getOk('/api/snapshot'),
  ]);

  // Phân bổ theo từng tháng — 4 trang đều tự gọi N lần (N = số tháng đã nhập).
  // GET /api/allocations/all tồn tại ở routes.js:149 và không nơi nào dùng.
  const allAllocs = await getOk('/api/allocations/all');
  const allocsByMonth = {};
  for (const a of allAllocs) {
    (allocsByMonth[a.monthly_entry_id] ||= []).push(a);
  }

  const paramMap = {};
  for (const p of params) paramMap[p.key] = p.value;

  return {
    filled,
    summary,
    savingsSummary,
    savingsOverview,
    phase,
    phases,
    categories,
    transactions,
    savingsAccounts,
    params: paramMap,
    checklist,
    snapshot,
    allAllocs,
    allocsByMonth,
  };
}

/** Gộp phân bổ theo tên danh mục — logic dùng chung ở 4 trang. */
function allocsByCategory(d) {
  const byCat = {};
  for (const a of d.allAllocs) {
    const name = a.category_name;
    byCat[name] ||= { total: 0 };
    byCat[name].total += a.actual_amount || a.planned_amount || 0;
  }
  return byCat;
}

// ═══════════════ Các mảnh dùng chung ═══════════════

/** Dashboard.jsx:246-248 */
function dashboardCashFlow(d) {
  const totalIncome = d.filled.reduce(
    (s, m) => s + (m.income || 0) + (m.bonus || 0),
    0
  );
  const totalExpense = d.filled.reduce((s, m) => s + (Number(m.expense) || 0), 0);
  return { totalIncome, totalExpense, totalNet: totalIncome - totalExpense };
}

/** Dashboard.jsx:256-268 */
function dashboardCash(d) {
  const { totalNet } = dashboardCashFlow(d);
  const ov = d.savingsOverview || {};
  const totalAllocatedAll = (ov.totalAllocated || 0) + (ov.totalOtherAllocated || 0);
  const totalCashUnallocated = Math.max(0, totalNet - totalAllocatedAll);

  const netCashOutflow =
    d.summary.netCashOutflow !== undefined
      ? d.summary.netCashOutflow
      : d.summary.totalInvested;
  const uninvestedCash = Math.max(0, (ov.totalOtherAllocated || 0) - netCashOutflow);

  return {
    totalCashUnallocated,
    uninvestedCash,
    totalCashOnHand: totalCashUnallocated + uninvestedCash,
    netCashOutflow,
  };
}

// ═══════════════ SÁU công thức "Tổng tài sản" ═══════════════

/** #1 — Dashboard.jsx:265  grandTotal, nay đọc thẳng từ snapshot */
function netWorth_Dashboard(d) {
  return d.snapshot.netWorth.total;
}

/** #2 — Scenarios.jsx:195  totalCurrentValue, nay đọc thẳng từ snapshot */
function netWorth_Scenarios(d) {
  return d.snapshot.netWorth.total;
}

/** #3 — AllocationGoals.jsx:56  totalAssets, nay đọc thẳng từ snapshot */
function netWorth_AllocationGoals(d) {
  return d.snapshot.netWorth.total;
}

/** #4 — database.js:2592 _resolvePhase đọc core.netWorth.total */
function netWorth_PhaseEngine(d) {
  return d.snapshot.netWorth.total;
}

/** #5 — database.js:1151 getChecklistStatus đọc core.netWorth.total */
function netWorth_Checklist(d) {
  return d.snapshot.netWorth.total;
}

/** #6 — CashFlowPage.jsx:315-320 tiến độ cột mốc, nay đo bằng tài sản */
function netWorth_CashFlowPage(d) {
  return d.snapshot.phase.sortOrder === 1
    ? d.snapshot.netWorth.total // giai đoạn 1 đo quỹ dự phòng, không so ở đây
    : d.snapshot.phase.current;
}

const NET_WORTH_FORMULAS = [
  { key: 'Dashboard',       label: 'Dashboard "Tổng tài sản ròng"', src: 'Dashboard.jsx:265',        fn: netWorth_Dashboard },
  { key: 'Scenarios',       label: 'Kịch bản (tử số tỷ lệ FI)',     src: 'Scenarios.jsx:195',        fn: netWorth_Scenarios },
  { key: 'AllocationGoals', label: 'Tab Phân bổ (mẫu số mọi %)',    src: 'AllocationGoals.jsx:56',   fn: netWorth_AllocationGoals },
  { key: 'PhaseEngine',     label: 'Máy dò giai đoạn (backend)',    src: 'database.js:2592',         fn: netWorth_PhaseEngine },
  { key: 'Checklist',       label: 'Bảng kiểm tra (backend)',       src: 'database.js:1151',         fn: netWorth_Checklist },
  { key: 'CashFlowPage',    label: 'Dòng tiền — tiến độ cột mốc',   src: 'CashFlowPage.jsx:318',     fn: netWorth_CashFlowPage },
];

// ═══════════════ BA công thức "tiến độ giai đoạn" ═══════════════

/** Dashboard.jsx:280-282 — nay đọc thẳng snapshot.phase */
function phaseProgress_Dashboard(d) {
  const ph = d.snapshot.phase;
  if (!ph) return null;
  return { current: ph.current, goal: ph.goalAmount, pct: ph.pct };
}

/** Scenarios.jsx:249-259 — cùng ngưỡng với máy dò giai đoạn */
function phaseProgress_Scenarios(d) {
  const p = d.phase;
  if (!p) return null;
  const goal = (p.goal_multiplier || 0) * d.params.FI_MONTHLY_EXPENSE;
  const current =
    p.sort_order === 1 ? d.snapshot.savings.reserveBalance : netWorth_Scenarios(d);
  return { current, goal, pct: goal > 0 ? Math.min((current / goal) * 100, 100) : 100 };
}

/** AllocationGoals.jsx:295-299 — cùng ngưỡng với máy dò giai đoạn */
function phaseProgress_AllocationGoals(d) {
  const p = d.phase;
  if (!p) return null;
  const goal = (p.goal_multiplier || 0) * d.params.FI_MONTHLY_EXPENSE;
  const current =
    p.sort_order === 1 ? d.snapshot.savings.reserveBalance : netWorth_AllocationGoals(d);
  return { current, goal, pct: goal > 0 ? Math.min((current / goal) * 100, 100) : 100 };
}

const PHASE_PROGRESS_FORMULAS = [
  { key: 'Dashboard',       src: 'Dashboard.jsx:280-282',       fn: phaseProgress_Dashboard },
  { key: 'Scenarios',       src: 'Scenarios.jsx:249-259',       fn: phaseProgress_Scenarios },
  { key: 'AllocationGoals', src: 'AllocationGoals.jsx:295-299', fn: phaseProgress_AllocationGoals },
];

// ═══════════════ "Đã giải ngân" — hai định nghĩa ═══════════════

/** database.js:1594 — CÓ tính phí (dùng cho "Tiền chờ đầu tư" trên Dashboard) */
function deployed_withFee(d) {
  return d.transactions.reduce(
    (s, t) =>
      s + (t.type === 'BUY' ? t.total_amount + (t.fee || 0) : -t.total_amount + (t.fee || 0)),
    0
  );
}

/** ExecutionLog.jsx:167 — nay đọc snapshot, cùng chính sách phí */
function deployed_exFee(d) {
  return d.snapshot.portfolio.deployed;
}

module.exports = {
  loadAll,
  allocsByCategory,
  dashboardCashFlow,
  dashboardCash,
  NET_WORTH_FORMULAS,
  PHASE_PROGRESS_FORMULAS,
  netWorth_Dashboard,
  netWorth_Scenarios,
  netWorth_AllocationGoals,
  netWorth_PhaseEngine,
  netWorth_Checklist,
  netWorth_CashFlowPage,
  deployed_withFee,
  deployed_exFee,
};
