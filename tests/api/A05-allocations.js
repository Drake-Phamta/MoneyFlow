/**
 * A05 — Phân bổ theo tháng và điều chỉnh chênh lệch.
 */
const { group, t } = require('../rig/assert');
const H = require('./_helpers');

async function run() {
  group('A05 — Phân bổ & chênh lệch');
  await H.fresh();

  await t(
    'API-ALC-01',
    'GET /api/allocations/:entryId trả phân bổ kèm tên và màu danh mục',
    ['rest:GET /api/allocations/:entryId', 'ipc:allocations:get', 'bridge:allocations.get', 'client:allocations.get'],
    async () => {
      const m = await H.filledMonth();
      const rows = await H.getOk(`/api/allocations/${m.id}`);
      H.expectShape(rows, ['category_id', 'category_name', 'color', 'icon', 'planned_amount', 'actual_amount'], 'GET allocations');
      H.ok(rows.length > 0, 'tháng đã ghi phải có phân bổ');
    }
  );

  await t(
    'API-ALC-02',
    'GET /api/allocations/all gộp đúng bằng tổng các lần gọi lẻ',
    ['rest:GET /api/allocations/all', 'ipc:allocations:all', 'bridge:allocations.all', 'client:allocations.all'],
    async () => {
      const all = await H.getOk('/api/allocations/all');
      H.expectShape(all, ['monthly_entry_id', 'category_id', 'category_name', 'planned_amount'], 'GET /api/allocations/all');

      const filled = await H.getOk('/api/monthly/filled');
      let sumOfCalls = 0;
      for (const m of filled) sumOfCalls += (await H.getOk(`/api/allocations/${m.id}`)).length;
      const forFilled = all.filter((a) => filled.some((m) => m.id === a.monthly_entry_id));
      H.eq(forFilled.length, sumOfCalls, 'số dòng gộp một lần so với gọi lẻ từng tháng');
    }
  );

  await t(
    'API-ALC-03',
    'POST /api/allocations/:entryId ghi đè trọn bộ, không cộng dồn',
    ['rest:POST /api/allocations/:entryId', 'ipc:allocations:save', 'bridge:allocations.save', 'client:allocations.save'],
    async () => {
      await H.fresh();
      const m = await H.filledMonth();
      const cats = await H.categories();
      const payload = [
        { category_id: cats[0].id, planned_amount: 1000000, actual_amount: 1000000 },
        { category_id: cats[1].id, planned_amount: 500000, actual_amount: 500000 },
      ];

      H.expectOk(await H.post(`/api/allocations/${m.id}`, { allocations: payload }), 'POST allocations lần 1');
      let rows = await H.getOk(`/api/allocations/${m.id}`);
      H.eq(rows.length, 2, 'số dòng sau lần ghi 1');

      H.expectOk(await H.post(`/api/allocations/${m.id}`, { allocations: payload }), 'POST allocations lần 2');
      rows = await H.getOk(`/api/allocations/${m.id}`);
      H.eq(rows.length, 2, 'ghi lại lần 2 không được cộng dồn thành 4 dòng');
      const total = rows.reduce((s, r) => s + r.planned_amount, 0);
      H.eq(total, 1500000, 'tổng phân bổ sau lần ghi 2');
      await H.fresh();
    }
  );

  await t(
    'API-ALC-04',
    'GET /api/allocations/discrepancies trả lịch sử điều chỉnh có lý do',
    ['rest:GET /api/allocations/discrepancies', 'ipc:allocations:discrepancies', 'bridge:allocations.discrepancies', 'client:allocations.discrepancies'],
    async () => {
      const rows = await H.getOk('/api/allocations/discrepancies');
      H.ok(Array.isArray(rows), 'phải trả về mảng');
      if (rows.length) {
        H.expectShape(rows, ['id', 'date', 'month_label', 'amount', 'reason'], 'GET discrepancies');
      }
    }
  );

  await t(
    'API-ALC-05',
    'POST /api/allocations/adjust cộng đúng số tiền vào danh mục đích và ghi một dòng lịch sử',
    ['rest:POST /api/allocations/adjust', 'ipc:allocations:adjust', 'bridge:allocations.adjust', 'client:allocations.adjust'],
    async () => {
      await H.fresh();
      const target = await H.categoryByName('Chứng Khoán');
      const logsBefore = (await H.getOk('/api/allocations/discrepancies')).length;
      const sumFor = async () =>
        (await H.getOk('/api/allocations/all'))
          .filter((a) => a.category_id === target.id)
          .reduce((s, a) => s + (a.actual_amount > 0 ? a.actual_amount : a.planned_amount || 0), 0);
      const before = await sumFor();

      H.expectOk(
        await H.post('/api/allocations/adjust', {
          discrepancyAmount: 750000,
          categoryId: target.id,
          reason: 'Kiểm thử',
          date: new Date().toISOString().slice(0, 10),
        }),
        'POST /api/allocations/adjust'
      );

      const after = await sumFor();
      H.eq(after - before, 750000, 'phần cộng thêm vào danh mục đích');
      const logsAfter = await H.getOk('/api/allocations/discrepancies');
      H.eq(logsAfter.length, logsBefore + 1, 'số dòng lịch sử điều chỉnh');
      H.eq(logsAfter[0].amount, 750000, 'số tiền của dòng mới nhất');
      await H.fresh();
    }
  );
}

module.exports = { run };
