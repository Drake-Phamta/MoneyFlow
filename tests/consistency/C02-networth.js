/**
 * C02 — "Tổng tài sản" và "tiến độ giai đoạn" phải là MỘT con số.
 *
 * Đây là phát hiện trung tâm của cả đợt kiểm toán: cùng một khái niệm được
 * tính lại độc lập ở sáu nơi, cho ra bốn con số khác nhau, và người dùng nhìn
 * thấy chúng cạnh nhau khi chuyển trang.
 */
const { group, t, fail, ok, fmt, approx } = require('../rig/assert');
const { reset } = require('../rig/reset');
const F = require('./_formulas');

// Dung sai 1₫ — các công thức này lẽ ra phải bằng nhau tuyệt đối.
const TOL = 1;

async function run() {
  group('C02 — Tổng tài sản & tiến độ giai đoạn');
  await reset();
  const d = await F.loadAll();

  const values = F.NET_WORTH_FORMULAS.map((f) => ({ ...f, value: f.fn(d) }));

  await t(
    'C2',
    'Sáu công thức "Tổng tài sản" phải cho cùng một kết quả',
    [
      'rest:GET /api/portfolio/summary',
      'rest:GET /api/savings/summary',
      'rest:GET /api/savings/overview',
      'rest:GET /api/phases/active',
      'rest:GET /api/phases/checklist',
    ],
    () => {
      const distinct = [...new Set(values.map((v) => Math.round(v.value)))];
      if (distinct.length > 1) {
        const min = Math.min(...distinct);
        const max = Math.max(...distinct);
        const lines = values
          .sort((a, b) => b.value - a.value)
          .map((v) => `${v.key.padEnd(17)} ${fmt(v.value).padStart(15)}  ${v.src} — ${v.label}`);
        fail(
          `${distinct.length} giá trị khác nhau cho cùng một khái niệm ` +
            `(chênh ${fmt(max - min)}, tức ${(((max - min) / max) * 100).toFixed(0)}%):\n      ` +
            lines.join('\n      ')
        );
      }
    },
    {
      knownFail:
        'Sáu định nghĩa: Dashboard có tiền mặt; Scenarios/AllocationGoals không; ' +
        'máy dò giai đoạn dùng giá vốn; checklist dùng giá thị trường; ' +
        'CashFlowPage dùng dòng tiền cộng dồn.',
    }
  );

  await t(
    'C3',
    'Ba trang phải hiển thị cùng một phần trăm tiến độ cho cùng một mục tiêu',
    ['rest:GET /api/phases/active', 'rest:GET /api/phases/:id/allocations'],
    () => {
      const progs = F.PHASE_PROGRESS_FORMULAS.map((f) => ({ ...f, r: f.fn(d) }));
      ok(progs.every((p) => p.r), 'không có giai đoạn đang hoạt động');
      const pcts = [...new Set(progs.map((p) => p.r.pct.toFixed(1)))];
      if (pcts.length > 1) {
        const lines = progs.map(
          (p) =>
            `${p.key.padEnd(17)} ${fmt(p.r.current).padStart(15)} / ` +
            `${fmt(p.r.goal)} = ${p.r.pct.toFixed(1)}%   ${p.src}`
        );
        fail(
          `Giai đoạn "${d.phase.name}" hiện ${pcts.length} phần trăm khác nhau:\n      ` +
            lines.join('\n      ')
        );
      }
    },
    {
      knownFail:
        'Dashboard.jsx:299 dùng grandTotal (có tiền mặt); Scenarios.jsx:264 và ' +
        'AllocationGoals.jsx:318 dùng tổng không có tiền mặt.',
    }
  );

  await t(
    'C3b',
    'Nếu máy dò xếp giai đoạn N thì tử số tiến độ phải đạt ngưỡng giai đoạn N',
    ['rest:GET /api/phases/active'],
    () => {
      const p = d.phase;
      ok(p, 'không có giai đoạn đang hoạt động');
      const expense = d.params.FI_MONTHLY_EXPENSE || 4000000;
      const thresholds = { 1: 0, 2: 3, 3: 6, 4: 24 };
      const need = (thresholds[p.sort_order] || 0) * expense;
      if (p.sort_order < 2) return; // giai đoạn 1 không có ngưỡng vào

      const bad = F.PHASE_PROGRESS_FORMULAS.map((f) => ({ ...f, r: f.fn(d) })).filter(
        (x) => x.r && x.r.current < need
      );
      if (bad.length) {
        fail(
          `Máy dò xếp "${p.name}" (cần ≥ ${fmt(need)} = ` +
            `${thresholds[p.sort_order]}× ${fmt(expense)}), nhưng ` +
            `${bad.length}/3 trang hiển thị tử số thấp hơn ngưỡng đó:\n      ` +
            bad.map((x) => `${x.key}: ${fmt(x.r.current)}  ${x.src}`).join('\n      ')
        );
      }
    }
  );

  await t(
    'C12',
    'Mục tiêu giai đoạn luôn suy từ FI_MONTHLY_EXPENSE, không từ chi tiêu thực tế trung bình',
    ['rest:GET /api/phases', 'rest:GET /api/params'],
    () => {
      const expense = d.params.FI_MONTHLY_EXPENSE;
      ok(expense, 'thiếu tham số FI_MONTHLY_EXPENSE');
      for (const p of d.phases) {
        if (!p.goal_multiplier) continue;
        approx(
          p.goal_amount,
          p.goal_multiplier * expense,
          1,
          `Giai đoạn ${p.sort_order}: goal_amount phải = ${p.goal_multiplier}× ` +
            `FI_MONTHLY_EXPENSE (${fmt(expense)})`
        );
      }
    }
  );

  await t(
    'C12b',
    'Dashboard không được đổi sang chi tiêu thực tế trung bình khi goal_amount = 0',
    ['rest:GET /api/phases'],
    () => {
      // Dashboard.jsx:279-282: goal = phase.goal_amount || goal_multiplier × avg(chi tiêu thực tế)
      const zeroGoal = d.phases.filter((p) => !p.goal_amount);
      if (!zeroGoal.length) return; // không có giai đoạn nào goal=0 thì không lộ lỗi

      const avgActual =
        d.filled.length > 0
          ? d.filled.reduce((s, m) => s + (m.expense || 0), 0) / d.filled.length
          : 4000000;
      const target = d.params.FI_MONTHLY_EXPENSE;
      if (Math.abs(avgActual - target) > 1) {
        fail(
          `Giai đoạn ${zeroGoal.map((p) => p.sort_order).join(',')} có goal_amount = 0 ` +
            `nên Dashboard.jsx:282 rơi về chi tiêu thực tế trung bình ` +
            `(${fmt(avgActual)}) thay vì chi tiêu mục tiêu (${fmt(target)}) — ` +
            `hai cơ sở khác nhau cho cùng một cột mốc.`
        );
      }
    },
    {
      knownFail:
        'Dashboard.jsx:279-282 dùng avg(m.expense) làm cơ sở dự phòng, trong khi ' +
        'database.js:849,959 luôn dùng FI_MONTHLY_EXPENSE.',
    }
  );

  await t(
    'C17',
    'byCategory phải phân hoạch tài sản đúng một lần (không sót, không đếm hai)',
    ['rest:GET /api/portfolio/summary', 'rest:GET /api/savings'],
    () => {
      const sumByCat = F.netWorth_AllocationGoals(d);
      const invest = d.summary.totalCurrentValue || 0;
      const savingsBal = d.savingsAccounts
        .filter((a) => a.status === 'active')
        .reduce((s, a) => s + (a.current_balance || a.principal || 0), 0);
      approx(
        sumByCat,
        invest + savingsBal,
        TOL,
        `Σ byCategory.currentTotal (${fmt(sumByCat)}) phải bằng ` +
          `giá trị đầu tư (${fmt(invest)}) + số dư tiết kiệm (${fmt(savingsBal)})`
      );
    }
  );
}

module.exports = { run };
