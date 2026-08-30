/**
 * Scene 03 — Modal "Tổng tài sản ròng": đường quỹ đạo tích luỹ theo ngày.
 * Câu 1 (0.1s)  mở modal
 * Câu 2 (3.8s)  giữ trên biểu đồ, để người xem đọc đường
 * Câu 3 (9.0s)  đổi bộ lọc 1 Tháng → 6 Tháng → Tất cả, rồi soi 4 ô thống kê
 *
 * KHÔNG zoom trong scene này: modal render ngoài #root nên CSS transform không ăn.
 */
module.exports = {
  fade: { fadeIn: 0.35 },

  async setup(rec, ctx) {
    await rec.goto(ctx.BASE + '/#/', '.bento-card');
    await rec.hold(1500);
    const hero = await rec.byText('Tổng tài sản ròng', { closest: '.bento-card' });
    await rec.bring(hero, { block: 'center', ms: 700 });
    const [x, y] = await rec.centerOf(hero);
    await rec.moveToPoint(x - 220, y + 60, 1);
  },

  async perform(rec, ctx) {
    // ── câu 1: bấm mở modal ──
    await ctx.atCue(1);
    const hero = await rec.byText('Tổng tài sản ròng', { closest: '.bento-card' });
    await rec.moveToEl(hero, 800);
    await rec.clickHere({ settle: 400 });
    await rec.page.waitForFunction(
      () => [...document.querySelectorAll('h3,h2')].some(e => e.textContent.trim() === 'Tổng tài sản ròng'),
      { timeout: 15000 },
    ).catch(() => {});
    await rec.hold(1200);                       // chờ fetch lịch sử giá + chart mount

    // ── câu 2: để yên cho người xem đọc biểu đồ ──
    await ctx.atCue(2);
    await rec.moveToPoint(1000, 560, 1100);
    await rec.hold(3400);

    // ── câu 3: đổi mốc thời gian ──
    await ctx.atCue(3);
    for (const label of ['6 Tháng', 'Tất cả']) {
      await rec.clickText(label, { exact: true, tag: 'button', moveMs: 560, settle: 980 });
    }
    await rec.moveToPoint(690, 950, 800);       // xuống hàng thống kê Đỉnh / Đáy
    await rec.hold(1000);
    await rec.moveToPoint(1480, 950, 650);
    await rec.hold(800);
  },
};
