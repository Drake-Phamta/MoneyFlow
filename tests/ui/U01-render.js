/**
 * U01 — Mọi màn hình phải mở được và không lộ dấu hiệu tính toán hỏng.
 *
 * Bộ này cố tình chỉ bám vào thứ mà việc đổi giao diện không làm sai được:
 * trang có mount không, có lỗi JS không, và có chuỗi nào như NaN hay undefined
 * lọt ra màn hình không. Nhờ vậy nó sống sót qua đợt viết lại nội dung và đợt
 * thiết kế lại sắp tới — khác với nhóm test thao tác vốn bám vào nhãn tiếng Việt.
 */
const { group, t, ok, fail } = require('../rig/assert');
const { reset } = require('../rig/reset');
const { Browser } = require('./_browser');
const { routes } = require('./_routes');

/** Các thao tác cần làm sau khi tải trang để mount những phần không hiện sẵn. */
const ACTIONS = {
  async openLedger(b) {
    return b.clickText('Sổ cái', { tag: 'button' });
  },
  async openWizard(b) {
    return b.clickText('Nhập liệu tháng mới', { tag: 'button' });
  },
  async openNetWorth(b) {
    // Neo vào data-testid, không vào chữ: đổi nhãn không được làm đỏ test.
    const clicked = await b.rec.page.evaluate(() => {
      const el = document.querySelector('[data-testid="net-worth"]');
      if (!el) return false;
      el.click();
      return true;
    });
    if (clicked) await b.sleep(1400);
    return clicked;
  },
  async openAssetDetail(b) {
    const clicked = await b.rec.page.evaluate(() => {
      const cell = document.querySelector('table.table tbody tr td button');
      if (!cell) return false;
      cell.click();
      return true;
    });
    if (clicked) await b.sleep(1400);
    return clicked;
  },
};

async function run() {
  group('U01 — Mọi màn hình mở được');
  await reset();

  const b = await new Browser().open();
  try {
    for (const r of routes()) {
      await t(
        `UI-R-${r.id}`,
        `${r.label} — mở được, không lỗi JS, không lộ NaN/undefined`,
        r.covers,
        async () => {
          await b.goto(r.hash);

          if (r.afterLoad) {
            const done = await ACTIONS[r.afterLoad](b);
            ok(done, `không mở được phần "${r.afterLoad}" trên ${r.hash}`);
          }

          const empty = await b.mainIsEmpty();
          ok(!empty, 'vùng nội dung trống — trang không render được gì');

          const bad = await b.badTokens();
          if (bad.length) {
            const txt = await b.mainText();
            const around = bad
              .map((tok) => {
                const i = txt.indexOf(tok);
                return `"…${txt.slice(Math.max(0, i - 45), i + tok.length + 25).replace(/\n/g, ' ')}…"`;
              })
              .join('  ·  ');
            fail(`lộ ${bad.join(', ')} ra màn hình — ${around}`);
          }

          if (b.errors.length) {
            fail(`${b.errors.length} lỗi JS: ${b.errors.slice(0, 3).join(' | ')}`);
          }
        }
      );
    }
  } finally {
    await b.close();
  }
}

module.exports = { run };
