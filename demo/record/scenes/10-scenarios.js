/**
 * Scene 10 — Kịch bản: lộ trình 4 giai đoạn + 3 kịch bản tự do tài chính.
 * Câu 1 (0.1s)  sang trang Kịch bản
 * Câu 2 (2.1s)  mở accordion 1 giai đoạn, khoe bảng kiểm tra tự động
 * Câu 3 (7.8s)  cuộn tới 3 thẻ kịch bản FI
 * Câu 4 (16.2s) chuyển Theo thực tế ↔ Theo kỳ vọng, số năm đạt FI đổi
 */
module.exports = {
  fade: { fadeIn: 0.3 },

  async setup(rec, ctx) {
    await rec.goto(ctx.BASE + '/#/', '.bento-card');
    await rec.hold(900);
    await rec.moveToPoint(150, 360, 1);
  },

  async perform(rec, ctx) {
    // ── câu 1: sang trang ──
    await ctx.atCue(1);
    await rec.click('a[href="#/scenarios"]', { moveMs: 650, settle: 1300 });
    await rec.page.waitForSelector('.card', { timeout: 15000 });

    // ── câu 2: mở một giai đoạn, khoe bảng kiểm tra ──
    await ctx.atCue(2);
    const roadmap = await rec.byText('Lộ trình giai đoạn', { closest: '.card' }).catch(() => null);
    if (roadmap) await rec.bring(roadmap, { block: 'start', ms: 800 });
    const phase = await rec.byText('Giai đoạn 2', { tag: 'button,div' }).catch(() => null);
    if (phase) {
      await rec.moveToEl(phase, 750);
      await rec.clickHere({ settle: 1100 });
      await rec.scrollBy(300, { ms: 800 });
      await rec.hold(1600);
    } else {
      await rec.hold(3800);
    }

    // ── câu 3: ba kịch bản FI ──
    await ctx.atCue(3);
    const fi = await rec.byText('Kịch bản tự do tài chính', { closest: '.card' });
    await rec.bring(fi, { block: 'center', ms: 950 });
    await rec.hold(900);
    for (const name of ['Thận trọng', 'Cơ sở', 'Lạc quan']) {
      const card = await rec.byText(name, { exact: true }).catch(() => null);
      if (card) { await rec.moveToEl(card, 700); await rec.hold(1250); }
    }

    // ── câu 4: đổi giả định ──
    await ctx.atCue(4);
    await rec.clickText('Theo kỳ vọng', { exact: true, tag: 'button', moveMs: 700, settle: 1500 });
    await rec.moveToPoint(1150, 830, 700);      // hàng "Thời gian đạt FI"
    await rec.hold(1300);
    await rec.clickText('Theo thực tế', { exact: true, tag: 'button', moveMs: 650, settle: 1200 });
  },
};
