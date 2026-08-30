/**
 * A11 — Hợp đồng của GET /api/snapshot.
 *
 * Snapshot là nguồn sự thật duy nhất cho mọi con số tài chính. Bộ này khẳng
 * định các bất biến bên trong nó — nếu chúng đúng thì không còn chỗ nào để sáu
 * định nghĩa "Tổng tài sản" khác nhau tái sinh.
 */
const { group, t } = require('../rig/assert');
const H = require('./_helpers');

const TOL = 1;

async function run() {
  group('A11 — Snapshot tài chính');
  await H.fresh();

  const s = await H.getOk('/api/snapshot');

  await t(
    'API-SNP-01',
    'Snapshot có đủ các khối mà mọi trang cần',
    ['rest:GET /api/snapshot', 'ipc:snapshot:get', 'bridge:snapshot.get', 'client:snapshot.get'],
    () => {
      for (const k of [
        'asOf', 'params', 'categories', 'cashflow', 'allocations',
        'portfolio', 'savings', 'cash', 'liquidity', 'netWorth',
        'phase', 'checklist', 'sniper', 'plan', 'risk',
      ]) {
        H.ok(k in s, `snapshot thiếu khối "${k}"`);
      }
    }
  );

  await t(
    'API-SNP-02',
    'Tổng tài sản đúng bằng tiền mặt + đầu tư + tiết kiệm',
    ['rest:GET /api/snapshot'],
    () => {
      const n = s.netWorth;
      H.ok(
        Math.abs(n.total - (n.cash + n.portfolio + n.savings)) <= TOL,
        `${H.fmt(n.total)} ≠ ${H.fmt(n.cash)} + ${H.fmt(n.portfolio)} + ${H.fmt(n.savings)}`
      );
      H.ok(Math.abs(n.cash - s.cash.total) <= TOL, 'netWorth.cash phải bằng cash.total');
      H.ok(Math.abs(n.portfolio - s.portfolio.marketValue) <= TOL, 'netWorth.portfolio phải bằng giá thị trường danh mục');
      H.ok(Math.abs(n.savings - s.savings.balance) <= TOL, 'netWorth.savings phải bằng số dư tiết kiệm');
    }
  );

  await t(
    'API-SNP-03',
    'Số dư tiết kiệm = gốc + lãi đã tính; lãi dự kiến là con số riêng',
    ['rest:GET /api/snapshot'],
    () => {
      const sv = s.savings;
      H.ok(Math.abs(sv.balance - (sv.principal + sv.accrued)) <= TOL, 'balance ≠ principal + accrued');
      H.ok(Math.abs(sv.principal - (sv.liquidPrincipal + sv.termPrincipal)) <= TOL, 'gốc không tách hết thành không kỳ hạn + có kỳ hạn');
      H.ok('projectedInterest' in sv, 'thiếu projectedInterest — lãi tới đáo hạn phải là field riêng, không được gọi nhầm là lãi đã tính');
    }
  );

  await t(
    'API-SNP-04',
    'Thanh khoản chỉ gồm tiền mặt và sổ không kỳ hạn',
    ['rest:GET /api/snapshot'],
    () => {
      H.ok(
        Math.abs(s.liquidity.total - (s.cash.total + s.savings.liquidBalance)) <= TOL,
        `thanh khoản ${H.fmt(s.liquidity.total)} ≠ tiền mặt ${H.fmt(s.cash.total)} + sổ không kỳ hạn ${H.fmt(s.savings.liquidBalance)}`
      );
      if (s.savings.termPrincipal > 0) {
        H.ok(
          s.liquidity.total < s.netWorth.total,
          'có sổ có kỳ hạn thì thanh khoản phải nhỏ hơn tổng tài sản'
        );
      }
    }
  );

  await t(
    'API-SNP-05',
    'Tiền mặt = chưa phân bổ + đã chia nhưng chưa mua',
    ['rest:GET /api/snapshot'],
    () => {
      H.ok(
        Math.abs(s.cash.total - (s.cash.unallocated + s.cash.awaitingInvestment)) <= TOL,
        `${H.fmt(s.cash.total)} ≠ ${H.fmt(s.cash.unallocated)} + ${H.fmt(s.cash.awaitingInvestment)}`
      );
      H.ok(s.cash.unallocated >= 0 && s.cash.awaitingInvestment >= 0, 'hai thành phần tiền mặt không được âm');
    }
  );

  await t(
    'API-SNP-06',
    'Mục tiêu giai đoạn luôn tính sống từ chi tiêu mục tiêu',
    ['rest:GET /api/snapshot'],
    () => {
      const expense = s.params.FI_MONTHLY_EXPENSE;
      H.ok(expense > 0, 'thiếu FI_MONTHLY_EXPENSE');
      if (s.phase.goalMultiplier) {
        H.ok(
          Math.abs(s.phase.goalAmount - s.phase.goalMultiplier * expense) <= TOL,
          `mục tiêu ${H.fmt(s.phase.goalAmount)} ≠ ${s.phase.goalMultiplier} × ${H.fmt(expense)}`
        );
      }
      H.ok(s.phase.basis, 'phase phải nói rõ nó đang so con số nào — thiếu trường basis');
      H.ok(s.phase.pct >= 0 && s.phase.pct <= 100, `tiến độ ${s.phase.pct} ngoài khoảng 0–100`);
    }
  );

  await t(
    'API-SNP-07',
    'Đã giải ngân tính một lần và có tính phí',
    ['rest:GET /api/snapshot'],
    async () => {
      const txns = await H.getOk('/api/transactions');
      const withFee = txns.reduce(
        (x, tr) => x + (tr.type === 'BUY' ? tr.total_amount + (tr.fee || 0) : -tr.total_amount + (tr.fee || 0)),
        0
      );
      H.ok(
        Math.abs(s.portfolio.deployed - withFee) <= TOL,
        `deployed ${H.fmt(s.portfolio.deployed)} ≠ tổng có phí ${H.fmt(withFee)}`
      );
      H.eq(s.sniper.feePolicy, 'included', 'snapshot phải nói rõ chính sách phí');
    }
  );

  await t(
    'API-SNP-08',
    'byCategory chỉ dùng tên có thật trong bảng danh mục',
    ['rest:GET /api/snapshot'],
    () => {
      const names = s.categories.map((c) => c.name);
      for (const src of [s.portfolio.byCategory, s.allocations.byCategory, s.savings.byCategory]) {
        const orphan = Object.keys(src || {}).filter((k) => !names.includes(k));
        H.ok(orphan.length === 0, `khoá không có trong bảng categories: ${orphan.join(', ')}`);
      }
    }
  );

  await t(
    'API-SNP-09',
    'Thống kê dòng tiền khớp với các tháng đã ghi nhận',
    ['rest:GET /api/snapshot'],
    async () => {
      const filled = await H.getOk('/api/monthly/filled');
      H.eq(s.cashflow.months, filled.length, 'số tháng');
      const inflow = filled.reduce((x, m) => x + m.total_inflow, 0);
      H.ok(Math.abs(s.cashflow.totalInflow - inflow) <= TOL, 'tổng tiền nhàn rỗi');
      H.ok('inflowSd' in s.cashflow && 'inflowCv' in s.cashflow, 'thiếu độ lệch chuẩn dòng tiền');
      H.ok('salaryNet' in s.cashflow, 'thiếu salaryNet — cần để tách lương ổn định khỏi thưởng bất thường');
    }
  );

  await t(
    'API-SNP-10',
    'Máy dò giai đoạn và snapshot xếp cùng một giai đoạn',
    ['rest:GET /api/snapshot', 'rest:GET /api/phases/active'],
    async () => {
      const active = await H.getOk('/api/phases/active');
      H.eq(s.phase.id, active.id, 'snapshot và /api/phases/active phải trỏ cùng một giai đoạn');
      H.eq(s.phase.sortOrder, active.sort_order, 'thứ tự giai đoạn');
    }
  );

  await t(
    'API-SNP-11',
    'Kế hoạch vs thực tế có đủ dữ liệu để đối chiếu',
    ['rest:GET /api/snapshot'],
    () => {
      H.ok(Array.isArray(s.plan.byMonth), 'plan.byMonth phải là mảng');
      H.ok(Array.isArray(s.plan.discrepancies), 'plan.discrepancies phải là mảng');
      if (s.plan.byMonth.length) {
        H.expectShape(s.plan.byMonth, ['month_index', 'month_label', 'planned', 'actual', 'diff'], 'plan.byMonth');
        for (const m of s.plan.byMonth) {
          H.ok(Math.abs(m.diff - (m.actual - m.planned)) <= TOL, `${m.month_label}: diff ≠ thực tế − kế hoạch`);
        }
      }
    }
  );

  await t(
    'API-SNP-12',
    'Thống kê rủi ro chỉ báo cáo mã có đủ dữ liệu giá',
    ['rest:GET /api/snapshot'],
    () => {
      H.ok(s.risk && typeof s.risk.byAsset === 'object', 'thiếu risk.byAsset');
      for (const [ticker, r] of Object.entries(s.risk.byAsset)) {
        H.ok(r.sessions >= 60, `${ticker} chỉ có ${r.sessions} phiên — không đủ để tính biến động`);
        H.ok(isFinite(r.annualVol) && r.annualVol >= 0, `${ticker}: biến động ${r.annualVol} không hợp lệ`);
        H.ok(r.maxDrawdown <= 0, `${ticker}: mức sụt sâu nhất phải là số âm hoặc 0, nhận ${r.maxDrawdown}`);
      }
    }
  );
}

module.exports = { run };
