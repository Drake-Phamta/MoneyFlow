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

/** #1 — Dashboard.jsx:274  grandTotal (con số hiển thị to nhất app) */
function netWorth_Dashboard(d) {
  const { totalCashOnHand } = dashboardCash(d);
  return (
    totalCashOnHand +
    (d.summary.totalCurrentValue || 0) +
    (d.savingsSummary.totalBalance || 0)
  );
}

/** #2 — Scenarios.jsx:218-220  (không có tiền mặt; fallback về tổng phân bổ) */
function netWorth_Scenarios(d) {
  const byCat = allocsByCategory(d);
  const totalAllocated = Object.values(byCat).reduce((s, c) => s + c.total, 0);
  const totalSavingsBalance = d.savingsSummary.totalBalance || 0;
  return (d.summary.totalCurrentValue || totalAllocated) + totalSavingsBalance;
}

/** #3 — AllocationGoals.jsx:63  Σ byCategory.currentTotal (không có tiền mặt) */
function netWorth_AllocationGoals(d) {
  return Object.values(d.summary.byCategory || {}).reduce(
    (s, c) => s + (c.currentTotal || 0),
    0
  );
}

/** #4 — database.js:1107-1126 getActivePhase (giá VỐN, không có lãi/tiền mặt) */
function netWorth_PhaseEngine(d) {
  const portfolioTotal = d.transactions.reduce(
    (s, t) => s + (t.type === 'BUY' ? t.total_amount : -t.total_amount),
    0
  );
  const totalSavings = d.savingsAccounts
    .filter((a) => a.status === 'active')
    .reduce((s, a) => s + (a.principal || 0), 0);
  const allocationsTotal = d.allAllocs.reduce(
    (s, a) => s + (a.actual_amount > 0 ? a.actual_amount : a.planned_amount || 0),
    0
  );
  return Math.max(portfolioTotal + totalSavings, allocationsTotal);
}

/** #5 — database.js:1163-1165 getChecklistStatus (giá THỊ TRƯỜNG, không tiền mặt) */
function netWorth_Checklist(d) {
  const portfolioValue = (d.summary.portfolio || []).reduce(
    (s, p) => s + (p.current_value || p.total_invested || 0),
    0
  );
  const totalSavings = d.savingsAccounts
    .filter((a) => a.status === 'active')
    .reduce((s, a) => s + (a.principal || 0), 0);
  return portfolioValue + totalSavings;
}

/** #6 — CashFlowPage.jsx:311-317 "Đã tích lũy" = dòng tiền cộng dồn */
function netWorth_CashFlowPage(d) {
  return dashboardCashFlow(d).totalNet;
}

const NET_WORTH_FORMULAS = [
  { key: 'Dashboard',       label: 'Dashboard "Tổng tài sản ròng"', src: 'Dashboard.jsx:274',        fn: netWorth_Dashboard },
  { key: 'Scenarios',       label: 'Kịch bản (tử số tỷ lệ FI)',     src: 'Scenarios.jsx:218-220',    fn: netWorth_Scenarios },
  { key: 'AllocationGoals', label: 'Tab Phân bổ (mẫu số mọi %)',    src: 'AllocationGoals.jsx:63',   fn: netWorth_AllocationGoals },
  { key: 'PhaseEngine',     label: 'Máy dò giai đoạn (backend)',    src: 'database.js:1126',         fn: netWorth_PhaseEngine },
  { key: 'Checklist',       label: 'Bảng kiểm tra (backend)',       src: 'database.js:1165',         fn: netWorth_Checklist },
  { key: 'CashFlowPage',    label: 'Dòng tiền "Đã tích lũy"',       src: 'CashFlowPage.jsx:317',     fn: netWorth_CashFlowPage },
];

// ═══════════════ BA công thức "tiến độ giai đoạn" ═══════════════

/** Dashboard.jsx:279-312 */
function phaseProgress_Dashboard(d) {
  const p = d.phase;
  if (!p) return null;
  const monthlyExpense =
    d.filled.length > 0
      ? d.filled.reduce((s, m) => s + (m.expense || 0), 0) / d.filled.length
      : 4000000;
  const goal = p.goal_amount || p.goal_multiplier * monthlyExpense;

  const { totalCashOnHand } = dashboardCash(d);
  const totalSavingsBalance = d.savingsSummary.totalBalance || 0;
  const grandTotal = netWorth_Dashboard(d);

  const dpAlloc = (d.savingsOverview.phaseAllocs || []).find(
    (a) => a.category_name === 'Dự Phòng'
  );

  let current;
  if (p.sort_order === 1) {
    current = totalSavingsBalance + Math.max(0, totalCashOnHand * (dpAlloc?.ratio || 0.7));
  } else if (p.sort_order === 4) {
    current = goal || 1;
  } else {
    current = grandTotal;
  }
  return { current, goal, pct: goal > 0 ? Math.min((current / goal) * 100, 100) : 100 };
}

/** Scenarios.jsx:258-267 */
function phaseProgress_Scenarios(d) {
  const p = d.phase;
  if (!p) return null;
  const byCategory = d.summary.byCategory || {};
  const goal = p.goal_amount;
  const current =
    p.sort_order === 1
      ? byCategory['Dự Phòng']?.currentTotal || 0
      : netWorth_Scenarios(d);
  return { current, goal, pct: goal > 0 ? Math.min((current / goal) * 100, 100) : 100 };
}

/** AllocationGoals.jsx:313-321 */
function phaseProgress_AllocationGoals(d) {
  const p = d.phase;
  if (!p) return null;
  const byCategory = d.summary.byCategory || {};
  const goal = p.goal_amount;
  const current =
    p.sort_order === 1
      ? byCategory['Dự Phòng']?.currentTotal || 0
      : netWorth_AllocationGoals(d);
  return { current, goal, pct: goal > 0 ? Math.min((current / goal) * 100, 100) : 100 };
}

const PHASE_PROGRESS_FORMULAS = [
  { key: 'Dashboard',       src: 'Dashboard.jsx:291-312',       fn: phaseProgress_Dashboard },
  { key: 'Scenarios',       src: 'Scenarios.jsx:258-267',       fn: phaseProgress_Scenarios },
  { key: 'AllocationGoals', src: 'AllocationGoals.jsx:313-321', fn: phaseProgress_AllocationGoals },
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

/** ExecutionLog.jsx:184 — KHÔNG tính phí */
function deployed_exFee(d) {
  return d.transactions.reduce(
    (s, t) => s + (t.type === 'BUY' ? t.total_amount : -t.total_amount),
    0
  );
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
