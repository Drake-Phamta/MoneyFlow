/**
 * A03 — Giai đoạn, tỷ lệ phân bổ, bảng kiểm tra.
 *
 * Lưu ý kỷ luật: KHÔNG khẳng định mục checklist nào đang bật hay tắt — vị từ
 * của chúng sắp được siết lại. Chỉ khẳng định hình dạng và các bất biến còn
 * đúng sau khi siết.
 */
const { group, t } = require('../rig/assert');
const H = require('./_helpers');

async function run() {
  group('A03 — Giai đoạn & bảng kiểm tra');
  await H.fresh();

  await t(
    'API-PHS-01',
    'GET /api/phases trả 4 giai đoạn theo đúng thứ tự',
    ['rest:GET /api/phases', 'ipc:phases:get', 'bridge:phases.get', 'client:phases.get'],
    async () => {
      const phases = await H.getOk('/api/phases');
      H.expectShape(phases, ['id', 'name', 'sort_order', 'goal_multiplier', 'goal_amount', 'entry_condition'], 'GET /api/phases');
      H.eq(phases.length, 4, 'số giai đoạn');
      const orders = phases.map((p) => p.sort_order);
      H.ok(
        orders.every((o, i) => o === i + 1),
        `sort_order phải là 1,2,3,4 — nhận [${orders.join(', ')}]`
      );
    }
  );

  await t(
    'API-PHS-02',
    'GET /api/phases/active trả về đúng một giai đoạn nằm trong danh sách',
    ['rest:GET /api/phases/active', 'ipc:phases:active', 'bridge:phases.active', 'client:phases.active'],
    async () => {
      const active = await H.getOk('/api/phases/active');
      H.ok(active && active.id, 'không có giai đoạn nào đang hoạt động');
      const phases = await H.getOk('/api/phases');
      H.ok(phases.some((p) => p.id === active.id), 'giai đoạn đang hoạt động không nằm trong /api/phases');
      const flagged = phases.filter((p) => p.is_active === 1);
      H.eq(flagged.length, 1, 'số giai đoạn được đánh dấu is_active');
      H.eq(flagged[0].id, active.id, 'cờ is_active phải khớp giai đoạn /active trả về');
    }
  );

  await t(
    'API-PHS-03',
    'Tỷ lệ phân bổ của mỗi giai đoạn cộng lại bằng 100%',
    ['rest:GET /api/phases/:id/allocations', 'ipc:phases:allocations', 'bridge:phases.allocations', 'client:phases.allocations'],
    async () => {
      const phases = await H.getOk('/api/phases');
      const cats = await H.categories();
      for (const p of phases) {
        const allocs = await H.getOk(`/api/phases/${p.id}/allocations`);
        H.expectShape(allocs, ['category_id', 'category_name', 'ratio'], `allocations của giai đoạn ${p.sort_order}`);
        const sum = allocs.reduce((s, a) => s + a.ratio, 0);
        H.ok(
          Math.abs(sum - 1) < 0.001,
          `Giai đoạn ${p.sort_order}: tổng tỷ lệ ${(sum * 100).toFixed(1)}% ≠ 100% — ` +
            allocs.map((a) => `${a.category_name} ${(a.ratio * 100).toFixed(0)}%`).join(', ')
        );
        const orphan = allocs.filter((a) => !cats.some((c) => c.id === a.category_id));
        H.ok(orphan.length === 0, `Giai đoạn ${p.sort_order} có tỷ lệ trỏ vào danh mục không tồn tại`);
      }
    }
  );

  await t(
    'API-PHS-04',
    'POST /api/phases/:id/allocations ghi được tỷ lệ mới',
    ['rest:POST /api/phases/:id/allocations', 'ipc:phases:updateAllocations', 'bridge:phases.updateAllocations', 'client:phases.updateAllocations'],
    async () => {
      const phases = await H.getOk('/api/phases');
      const p = phases[1];
      const before = await H.getOk(`/api/phases/${p.id}/allocations`);
      const probe = before.map((a, i) => ({ category_id: a.category_id, ratio: i === 0 ? 0.5 : 0.5 / (before.length - 1) }));

      H.expectOk(await H.post(`/api/phases/${p.id}/allocations`, { allocations: probe }), 'POST allocations');
      const after = await H.getOk(`/api/phases/${p.id}/allocations`);
      H.ok(Math.abs(after[0].ratio - 0.5) < 0.001, `tỷ lệ đầu sau khi ghi: ${after[0].ratio}`);

      await H.post(`/api/phases/${p.id}/allocations`, {
        allocations: before.map((a) => ({ category_id: a.category_id, ratio: a.ratio })),
      });
      await H.fresh();
    }
  );

  await t(
    'API-PHS-05',
    'POST /api/phases/:id/active đặt được giai đoạn thủ công',
    ['rest:POST /api/phases/:id/active', 'ipc:phases:setActive', 'bridge:phases.setActive', 'client:phases.setActive'],
    async () => {
      const phases = await H.getOk('/api/phases');
      const target = phases.find((p) => p.sort_order === 2);
      H.expectOk(await H.post(`/api/phases/${target.id}/active`), 'POST /api/phases/:id/active');
      const flagged = (await H.getOk('/api/phases')).filter((p) => p.is_active === 1);
      H.eq(flagged.length, 1, 'chỉ được một giai đoạn mang cờ is_active');
      await H.fresh();
    }
  );

  await t(
    'API-CHK-01',
    'GET /api/phases/checklist trả 4 nhóm, mọi giá trị là boolean',
    ['rest:GET /api/phases/checklist', 'ipc:phases:checklist', 'bridge:phases.checklist', 'client:phases.checklist'],
    async () => {
      const cl = await H.getOk('/api/phases/checklist');
      H.ok(cl && typeof cl === 'object', 'checklist phải là object');
      for (const k of ['1', '2', '3', '4']) {
        H.ok(k in cl, `thiếu nhóm giai đoạn ${k}`);
        H.expectAllBoolean(cl[k], `checklist giai đoạn ${k}`);
        H.ok(Object.keys(cl[k]).length > 0, `checklist giai đoạn ${k} rỗng`);
      }
    }
  );

  await t(
    'API-CHK-02',
    'Checklist phản ứng với dữ liệu: xoá hết tiết kiệm thì mục sổ tiết kiệm phải tắt',
    ['rest:GET /api/phases/checklist', 'rest:DELETE /api/data/savings'],
    async () => {
      await H.fresh();
      const before = await H.getOk('/api/phases/checklist');
      H.eq(before['1'].savings_acc, true, 'fixture phải có sổ tiết kiệm để test này có nghĩa');

      H.expectOk(await H.del('/api/data/savings'), 'DELETE /api/data/savings');
      const after = await H.getOk('/api/phases/checklist');
      H.eq(after['1'].savings_acc, false, 'sau khi xoá hết sổ, mục "có sổ tiết kiệm" vẫn bật');
      await H.fresh();
    }
  );
}

module.exports = { run };
