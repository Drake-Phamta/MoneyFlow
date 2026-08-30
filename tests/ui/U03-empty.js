/**
 * U03 — Người dùng mới, chưa có một dòng dữ liệu nào.
 *
 * Đây là nhóm sinh ra chia cho 0, "0 ₫" ở chỗ lẽ ra phải là lời mời bắt đầu,
 * và các phép tính trung bình trên mảng rỗng. Cũng là màn hình đầu tiên mà một
 * người dùng mới nhìn thấy, nên nó phải mời gọi chứ không được trông như hỏng.
 */
const { group, t, ok, fail } = require('../rig/assert');
const { resetEmpty } = require('../rig/reset');
const { reset } = require('../rig/reset');
const { Browser } = require('./_browser');
const { routes } = require('./_routes');

// Modal và wizard cần dữ liệu mới mở được — trên DB rỗng thì không có gì để mở.
const SKIP_ON_EMPTY = new Set(['networth-modal', 'asset-modal', 'ledger', 'wizard']);

async function run() {
  group('U03 — Màn hình khi chưa có dữ liệu');
  await resetEmpty();

  const b = await new Browser().open();
  try {
    for (const r of routes()) {
      if (SKIP_ON_EMPTY.has(r.id)) continue;

      await t(
        `UI-E-${r.id}`,
        `${r.label} — mở được trên cơ sở dữ liệu trống`,
        r.covers,
        async () => {
          await b.goto(r.hash);

          ok(!(await b.mainIsEmpty()), 'vùng nội dung trống hoàn toàn');

          const bad = await b.badTokens();
          ok(bad.length === 0, `lộ ${bad.join(', ')} khi chưa có dữ liệu`);

          const txt = await b.mainText();
          const pcts = [...txt.matchAll(/(-?[\d.,]+)\s*%/g)].map((x) =>
            Number(String(x[1]).replace(/\./g, '').replace(',', '.'))
          );
          const insane = pcts.filter((p) => !isFinite(p) || Math.abs(p) > 1000);
          ok(
            insane.length === 0,
            `phần trăm vô lý khi mẫu số bằng 0: ${insane.join(', ')}`
          );

          if (b.errors.length) {
            fail(`${b.errors.length} lỗi JS: ${b.errors.slice(0, 3).join(' | ')}`);
          }
        }
      );
    }

    await t(
      'UI-E-guide',
      'Màn hình đầu tiên mời người dùng bắt đầu, không chỉ báo trống',
      ['ui:monthly.filled'],
      async () => {
        await b.goto('/');
        const txt = (await b.mainText()).toLowerCase();
        const invites = ['nhập liệu', 'bắt đầu', 'thêm', 'ghi nhận'];
        ok(
          invites.some((w) => txt.includes(w)),
          `không có lời mời hành động nào. Người dùng mới chỉ thấy các số 0.`
        );
      }
    );
  } finally {
    await b.close();
    await reset();
  }
}

module.exports = { run };
