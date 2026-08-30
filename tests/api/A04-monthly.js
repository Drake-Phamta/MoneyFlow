/**
 * A04 — Nhập liệu hằng tháng.
 */
const { group, t } = require('../rig/assert');
const H = require('./_helpers');

async function run() {
  group('A04 — Nhập liệu hằng tháng');
  await H.fresh();

  await t(
    'API-MON-01',
    'GET /api/monthly trả đủ dòng thời gian, month_index liên tục từ 1',
    ['rest:GET /api/monthly', 'ipc:monthly:getAll', 'bridge:monthly.getAll', 'client:monthly.getAll'],
    async () => {
      const rows = await H.getOk('/api/monthly');
      H.expectShape(rows, ['id', 'month_index', 'month_label', 'income', 'expense', 'bonus', 'total_inflow', 'status'], 'GET /api/monthly');
      const total = (await H.getOk('/api/params')).find((p) => p.key === 'TOTAL_MONTHS').value;
      H.eq(rows.length, total, 'số dòng phải bằng TOTAL_MONTHS');
      const idx = rows.map((r) => r.month_index);
      H.ok(idx[0] === 1 && idx[idx.length - 1] === total, `month_index chạy từ ${idx[0]} tới ${idx[idx.length - 1]}`);
    }
  );

  await t(
    'API-MON-02',
    'GET /api/monthly/filled chỉ trả tháng đã ghi nhận, là tập con của /api/monthly',
    ['rest:GET /api/monthly/filled', 'ipc:monthly:filled', 'bridge:monthly.filled', 'client:monthly.filled'],
    async () => {
      const all = await H.getOk('/api/monthly');
      const filled = await H.getOk('/api/monthly/filled');
      H.ok(filled.length > 0, 'fixture không có tháng nào đã ghi');
      H.ok(filled.length <= all.length, 'filled nhiều hơn tổng số tháng');
      const allIdx = new Set(all.map((m) => m.month_index));
      const orphan = filled.filter((m) => !allIdx.has(m.month_index));
      H.ok(orphan.length === 0, `${orphan.length} tháng trong filled không có trong /api/monthly`);
    }
  );

  await t(
    'API-MON-03',
    'GET /api/monthly/next trả tháng chưa ghi đầu tiên',
    ['rest:GET /api/monthly/next', 'ipc:monthly:next', 'bridge:monthly.next', 'client:monthly.next'],
    async () => {
      const next = await H.getOk('/api/monthly/next');
      if (!next) return; // đã ghi hết
      H.ok(next.month_index, 'next phải có month_index');
      const all = await H.getOk('/api/monthly');
      const earlier = all.filter((m) => m.month_index < next.month_index && m.total_inflow === 0);
      H.ok(
        earlier.length === 0,
        `next trả T${next.month_index} nhưng còn ${earlier.length} tháng trống sớm hơn`
      );
    }
  );

  await t(
    'API-MON-04',
    'GET /api/monthly/:index trả đúng tháng được hỏi',
    ['rest:GET /api/monthly/:index', 'ipc:monthly:get', 'bridge:monthly.get', 'client:monthly.get'],
    async () => {
      const m = await H.filledMonth();
      const one = await H.getOk(`/api/monthly/${m.month_index}`);
      H.eq(one.month_index, m.month_index, 'month_index');
      H.eq(one.month_label, m.month_label, 'month_label');
    }
  );

  await t(
    'API-MON-05',
    'POST /api/monthly luôn tự tính total_inflow từ thu + thưởng − chi',
    ['rest:POST /api/monthly', 'ipc:monthly:save', 'bridge:monthly.save', 'client:monthly.save'],
    async () => {
      await H.fresh();
      const saved = await H.createMonth({ income: 12000000, expense: 5000000, bonus: 3000000 });
      H.eq(saved.total_inflow, 10000000, 'total_inflow = 12tr + 3tr − 5tr');
      H.eq(saved.status, 'confirmed', 'trạng thái sau khi lưu');
    }
  );

  await t(
    'API-MON-06',
    'Lưu tháng sinh một dòng nhật ký hoạt động, không sinh trùng khi lưu lại',
    ['rest:POST /api/monthly', 'rest:GET /api/activity'],
    async () => {
      await H.fresh();
      const target = await H.emptyMonth();
      const before = (await H.getOk('/api/activity?limit=100')).length;

      for (let i = 0; i < 3; i++) {
        await H.post('/api/monthly', {
          month_index: target.month_index,
          month_label: target.month_label,
          income: 9000000,
          expense: 4000000,
          bonus: 0,
        });
      }

      const after = await H.getOk('/api/activity?limit=100');
      const forThisMonth = after.filter(
        (a) => a.type === 'MONTHLY_ENTRY' && String(a.description).includes(target.month_label)
      );
      H.eq(forThisMonth.length, 1, `lưu 3 lần cùng một tháng sinh ${forThisMonth.length} dòng nhật ký`);
      H.ok(after.length >= before, 'nhật ký không được ngắn đi');
    }
  );

  await t(
    'API-MON-07',
    'DELETE /api/monthly/:index xoá dữ liệu tháng và phân bổ kèm theo',
    ['rest:DELETE /api/monthly/:index', 'ipc:monthly:delete', 'bridge:monthly.delete', 'client:monthly.delete'],
    async () => {
      await H.fresh();
      const m = await H.filledMonth();
      const allocsBefore = await H.getOk(`/api/allocations/${m.id}`);
      H.ok(allocsBefore.length > 0, 'tháng này phải có phân bổ để test có nghĩa');

      H.expectOk(await H.del(`/api/monthly/${m.month_index}`), 'DELETE /api/monthly/:index');

      const after = await H.getOk(`/api/monthly/${m.month_index}`);
      H.eq(after.total_inflow, 0, 'total_inflow sau khi xoá');
      H.eq(after.income, 0, 'income sau khi xoá');
      const allocsAfter = await H.getOk(`/api/allocations/${m.id}`);
      H.eq(allocsAfter.length, 0, 'phân bổ của tháng đã xoá vẫn còn');
      await H.fresh();
    }
  );
}

module.exports = { run };
