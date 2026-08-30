/**
 * A01 — Tham số hệ thống và dòng thời gian.
 */
const { group, t } = require('../rig/assert');
const H = require('./_helpers');

async function run() {
  group('A01 — Tham số & dòng thời gian');
  await H.fresh();

  await t(
    'API-PAR-01',
    'GET /api/params trả về danh sách tham số có key và value',
    ['rest:GET /api/params', 'ipc:params:get', 'bridge:params.get', 'client:params.get'],
    async () => {
      const rows = await H.getOk('/api/params');
      H.expectShape(rows, ['key', 'value'], 'GET /api/params');
      const keys = rows.map((r) => r.key);
      for (const need of ['FI_MONTHLY_EXPENSE', 'DEFAULT_INFLOW', 'TOTAL_MONTHS', 'START_MONTH', 'START_YEAR']) {
        H.ok(keys.includes(need), `thiếu tham số bắt buộc ${need}`);
      }
    }
  );

  await t(
    'API-PAR-02',
    'PUT /api/params ghi được giá trị và đọc lại đúng',
    ['rest:PUT /api/params', 'ipc:params:update', 'bridge:params.update', 'client:params.update'],
    async () => {
      const before = (await H.getOk('/api/params')).find((r) => r.key === 'DEFAULT_INFLOW');
      const target = (before?.value || 0) + 1234;
      H.expectOk(await H.put('/api/params', { key: 'DEFAULT_INFLOW', value: target }), 'PUT /api/params');
      const after = (await H.getOk('/api/params')).find((r) => r.key === 'DEFAULT_INFLOW');
      H.eq(after.value, target, 'DEFAULT_INFLOW sau khi ghi');
      await H.put('/api/params', { key: 'DEFAULT_INFLOW', value: before.value });
    }
  );

  await t(
    'API-PAR-03',
    'Đổi FI_MONTHLY_EXPENSE thì mục tiêu mọi giai đoạn tính lại theo bội số',
    ['rest:PUT /api/params', 'rest:GET /api/phases'],
    async () => {
      const before = (await H.getOk('/api/params')).find((r) => r.key === 'FI_MONTHLY_EXPENSE').value;
      const probe = 7000000;
      await H.put('/api/params', { key: 'FI_MONTHLY_EXPENSE', value: probe });

      const phases = await H.getOk('/api/phases');
      for (const p of phases) {
        if (!p.goal_multiplier) continue;
        H.eq(
          Math.round(p.goal_amount),
          Math.round(p.goal_multiplier * probe),
          `Giai đoạn ${p.sort_order}: goal_amount phải = ${p.goal_multiplier} × ${H.fmt(probe)}`
        );
      }
      await H.put('/api/params', { key: 'FI_MONTHLY_EXPENSE', value: before });
    }
  );

  await t(
    'API-PAR-04',
    'GET /api/params/avg-expense trả về số, khớp trung bình các tháng đã ghi',
    ['rest:GET /api/params/avg-expense', 'ipc:params:avgExpense', 'bridge:params.avgExpense', 'client:params.avgExpense'],
    async () => {
      const avg = await H.getOk('/api/params/avg-expense');
      const val = typeof avg === 'object' ? avg.avgExpense ?? avg.value ?? avg : avg;
      H.ok(typeof val === 'number' && isFinite(val), `phải là số, nhận ${JSON.stringify(avg)}`);

      const filled = await H.getOk('/api/monthly/filled');
      const withExpense = filled.filter((m) => m.expense > 0);
      if (withExpense.length) {
        const expected = withExpense.reduce((s, m) => s + m.expense, 0) / withExpense.length;
        H.ok(
          Math.abs(val - expected) < 1,
          `avg-expense ${H.fmt(val)} ≠ trung bình tính tay ${H.fmt(expected)} trên ${withExpense.length} tháng`
        );
      }
    }
  );

  await t(
    'API-PAR-05',
    'POST /api/params/recalc-goals chạy được và giữ mục tiêu đúng bội số',
    ['rest:POST /api/params/recalc-goals', 'ipc:params:recalcGoals', 'bridge:params.recalcGoals', 'client:params.recalcGoals'],
    async () => {
      H.expectOk(await H.post('/api/params/recalc-goals'), 'POST /api/params/recalc-goals');
      const expense = (await H.getOk('/api/params')).find((r) => r.key === 'FI_MONTHLY_EXPENSE').value;
      for (const p of await H.getOk('/api/phases')) {
        if (!p.goal_multiplier) continue;
        H.eq(Math.round(p.goal_amount), Math.round(p.goal_multiplier * expense), `Giai đoạn ${p.sort_order}`);
      }
    }
  );

  await t(
    'API-TL-01',
    'POST /api/timeline/regenerate đổi tham số và giữ nguyên các tháng đã có dữ liệu',
    ['rest:POST /api/timeline/regenerate', 'ipc:timeline:regenerate', 'bridge:timeline.regenerate', 'client:timeline.regenerate'],
    async () => {
      await H.fresh();
      const filledBefore = await H.getOk('/api/monthly/filled');
      const params = await H.getOk('/api/params');
      const orig = {
        total: params.find((p) => p.key === 'TOTAL_MONTHS').value,
        month: params.find((p) => p.key === 'START_MONTH').value,
        year: params.find((p) => p.key === 'START_YEAR').value,
      };

      H.expectOk(
        await H.post('/api/timeline/regenerate', { totalMonths: 60, startMonth: orig.month, startYear: orig.year }),
        'POST /api/timeline/regenerate'
      );

      const after = await H.getOk('/api/params');
      H.eq(after.find((p) => p.key === 'TOTAL_MONTHS').value, 60, 'TOTAL_MONTHS sau khi sinh lại');

      const filledAfter = await H.getOk('/api/monthly/filled');
      H.eq(
        filledAfter.length,
        filledBefore.length,
        'sinh lại dòng thời gian không được làm mất tháng đã ghi nhận'
      );

      await H.post('/api/timeline/regenerate', {
        totalMonths: orig.total,
        startMonth: orig.month,
        startYear: orig.year,
      });
      await H.fresh();
    }
  );
}

module.exports = { run };
