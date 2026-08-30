/**
 * Scene 05 — Wizard nhập liệu 3 bước cho T9/2026 (tháng cố tình để trống lúc seed).
 * Câu 1 (0.1s)   mở wizard
 * Câu 2 (2.8s)   bước 1: gõ thu nhập / chi tiêu / thưởng, tiền nhàn rỗi tự nhảy
 * Câu 3 (7.7s)   bấm Tiếp theo → bước 2 tự phân bổ theo tỷ lệ giai đoạn
 * Câu 4 (11.9s)  bật "Điều chỉnh tạm", tăng Chứng Khoán, chọn lý do
 * Câu 5 (19.2s)  Lưu & Hoàn tất → bước 3 với checklist việc cần làm
 *
 * mutatesDb: ghi hẳn một tháng mới vào DB demo.
 */
module.exports = {
  fade: { fadeIn: 0.3 },
  mutatesDb: true,

  async setup(rec, ctx) {
    await rec.goto(ctx.BASE + '/#/cashflow', '.card');
    await rec.hold(1200);
    await rec.scrollTop({ ms: 200 });
    await rec.moveToPoint(1300, 200, 1);
  },

  async perform(rec, ctx) {
    // ── câu 1: mở wizard ──
    await ctx.atCue(1);
    await rec.clickText('Nhập liệu tháng mới', { exact: true, tag: 'button', moveMs: 700, settle: 1200 });
    await rec.page.waitForSelector('input[placeholder="15.000.000"]', { timeout: 15000 });

    // ── câu 2: bước 1 ──
    await ctx.atCue(2);
    await rec.typeInto('input[placeholder="15.000.000"]', '22.000.000', { delay: 70, moveMs: 550 });
    await rec.typeInto('input[placeholder="8.000.000"]', '9.200.000', { delay: 70, moveMs: 500 });
    await rec.typeInto('input[placeholder="0"]', '3.000.000', { delay: 70, moveMs: 500 });
    await rec.hold(900);                        // để ô "Tiền nhàn rỗi" cập nhật trên hình

    // ── câu 3: sang bước 2 ──
    await ctx.atCue(3);
    await rec.clickText('Tiếp theo', { tag: 'button', moveMs: 700, settle: 1400 });
    await rec.hold(1400);                       // xem bảng tự phân bổ

    // ── câu 4: điều chỉnh tạm ──
    await ctx.atCue(4);
    const adj = await rec.byText('Điều chỉnh tạm', { tag: 'button', exact: false }).catch(() => null);
    if (adj) {
      await rec.moveToEl(adj, 700);
      await rec.clickHere({ settle: 1100 });
      // nút "+" của dòng Chứng Khoán — tăng 5% một nhịp
      const plus = await rec.page.evaluateHandle(() => {
        const rows = [...document.querySelectorAll('div')].filter(d =>
          (d.textContent || '').includes('Chứng Khoán') && d.querySelector('button'));
        const row = rows[rows.length - 1];
        if (!row) return null;
        return [...row.querySelectorAll('button')].find(b => b.textContent.trim() === '+') || null;
      });
      if (plus.asElement()) {
        await rec.moveToEl(plus.asElement(), 700);
        await rec.clickHere({ settle: 550 });
        await rec.clickHere({ settle: 800 });
      }
      // chip lý do
      const chip = await rec.byText('Thị trường giảm', { exact: false }).catch(() => null);
      if (chip) { await rec.moveToEl(chip, 700); await rec.clickHere({ settle: 900 }); }
      await rec.hold(900);
    } else {
      await rec.hold(6500);
    }

    // ── câu 5: lưu và hoàn tất ──
    await ctx.atCue(5);
    await rec.clickText('Lưu & Hoàn tất', { tag: 'button', moveMs: 750, settle: 2000 });
    await rec.hold(1400);
  },
};
