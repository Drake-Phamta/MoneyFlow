/**
 * T03 — Danh sách phân bổ trong chữ SINH RA từ dữ liệu, không chép tay.
 *
 * Đây là bất biến giữ cho lớp lỗi "Đầu Tư vs Chứng Khoán" không tái diễn:
 * đổi tên một danh mục hoặc đổi một tỷ lệ thì văn bản phải đổi theo ngay,
 * không cần ai sửa chữ.
 */
const { group, t, ok, eq, fmt } = require('../rig/assert');
const { reset } = require('../rig/reset');
const { getOk } = require('../rig/http');

async function run() {
  group('T03 — Chữ sinh từ dữ liệu');
  await reset();

  const { buildPhaseGuidance, SNIPER_TIERS } = await import('../../src/content/phases.js');
  const sn = await getOk('/api/snapshot');
  const expense = sn.params.FI_MONTHLY_EXPENSE;

  await t(
    'CT-20',
    'Mỗi dòng phân bổ trong chữ khớp đúng một dòng phase_allocations',
    ['rest:GET /api/snapshot', 'rest:GET /api/phases/allocations/:phaseId'],
    () => {
      for (const sort of [1, 2, 3, 4]) {
        const allocs = (sn.phaseAllocations?.[sort] || []).filter((a) => a.ratio > 0);
        if (!allocs.length) continue;

        const g = buildPhaseGuidance(
          { sortOrder: sort, name: `x${sort}`, goalMultiplier: 6 },
          sn.phaseAllocations[sort],
          { targetExpense: expense }
        );

        eq(
          g.allocation.length,
          allocs.length,
          `giai đoạn ${sort}: số dòng phân bổ trong chữ so với trong bảng`
        );
        for (const row of g.allocation) {
          const src = allocs.find((a) => a.category_name === row.name);
          ok(src, `giai đoạn ${sort}: chữ nhắc danh mục "${row.name}" không có trong bảng`);
          eq(row.ratio, src.ratio, `giai đoạn ${sort} · ${row.name}: tỷ lệ`);
        }
      }
    }
  );

  await t(
    'CT-21',
    'Đổi tên một danh mục thì chữ đổi theo, không cần sửa nội dung',
    [],
    () => {
      // Bảng categories không có route sửa tên — nó đổi qua migration, đúng
      // như migrateToV5 từng đổi 'Đầu Tư' thành 'Chứng Khoán'. Chính lần đổi
      // đó làm các bản guidance chép tay nói sai suốt nhiều phiên bản.
      const base = sn.phaseAllocations?.[2] || [];
      ok(base.length > 0, 'fixture cần phân bổ cho giai đoạn 2');

      const gold = base.find((a) => a.category_name.includes('Vàng'));
      ok(gold, 'fixture cần danh mục Vàng trong phân bổ giai đoạn 2');

      const renamed = 'Vàng SJC tích luỹ';
      const after = base.map((a) =>
        a === gold ? { ...a, category_name: renamed } : a
      );

      const g = buildPhaseGuidance(
        { sortOrder: 2, name: 'x', goalMultiplier: 6 },
        after,
        { targetExpense: expense }
      );
      const names = g.allocation.map((a) => a.name);

      ok(
        names.includes(renamed),
        `đổi tên thành "${renamed}" nhưng chữ vẫn ghi: ${names.join(', ')}`
      );
      ok(
        !names.includes(gold.category_name),
        `chữ vẫn còn tên cũ "${gold.category_name}"`
      );

      // Việc cần làm cũng phải đi theo tên mới, không mất hướng dẫn.
      const row = g.allocation.find((a) => a.name === renamed);
      ok(
        row.action && row.action.includes('SJC'),
        `đổi tên xong thì mất luôn hướng dẫn: "${row.action}"`
      );
    }
  );

  await t(
    'CT-22',
    'Bậc Bắn Tỉa trong chữ khớp bộ ngưỡng mà backend cảnh báo',
    [],
    () => {
      const fs = require('fs');
      const path = require('path');
      const { REPO_ROOT } = require('../rig/env');
      const src = fs.readFileSync(path.join(REPO_ROOT, 'electron/priceService.js'), 'utf8');
      const m = src.match(/DROP_THRESHOLDS\s*=\s*\[([^\]]+)\]/);
      ok(m, 'không tìm thấy DROP_THRESHOLDS trong priceService.js');
      const backend = m[1].split(',').map((x) => Number(x.trim()));

      for (const tier of SNIPER_TIERS) {
        ok(
          backend.includes(tier.from),
          `chữ hứa bậc từ ${(tier.from * 100).toFixed(0)}% nhưng backend không cảnh báo ở ngưỡng đó`
        );
      }
      const total = SNIPER_TIERS.reduce((s, x) => s + x.deploy, 0);
      ok(
        Math.abs(total - 1) < 0.001,
        `ba bậc cộng lại bắn ${(total * 100).toFixed(0)}% số đạn — phải đúng 100%`
      );
    }
  );

  await t(
    'CT-23',
    'Hướng dẫn không nhắc danh mục nào ngoài bảng categories',
    ['rest:GET /api/categories'],
    async () => {
      const cats = (await getOk('/api/categories')).map((c) => c.name);
      for (const sort of [1, 2, 3, 4]) {
        const g = buildPhaseGuidance(
          { sortOrder: sort, name: 'x', goalMultiplier: 6 },
          sn.phaseAllocations?.[sort] || [],
          { targetExpense: expense }
        );
        for (const row of g.allocation) {
          ok(
            cats.includes(row.name),
            `giai đoạn ${sort}: hướng dẫn nhắc "${row.name}" — không có trong bảng categories`
          );
        }
      }
    }
  );
}

module.exports = { run };
