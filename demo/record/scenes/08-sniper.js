/**
 * Scene 08 — Bắn Tỉa: radar sụt giảm từ đỉnh + bộ quy tắc 4 cấp.
 * Câu 1 (0.1s)  vào tab Bắn Tỉa, khoe 3 thẻ kho đạn
 * Câu 2 (3.2s)  radar — dừng ở VNM (-25.6%), HPG và SSI (~18%)
 * Câu 3 (10.7s) bộ quy tắc 4 cấp
 */
module.exports = {
  fade: { fadeIn: 0.3 },

  async setup(rec, ctx) {
    await rec.goto(ctx.BASE + '/#/investments', '.card');
    await rec.hold(1200);
    await rec.moveToPoint(560, 220, 1);
  },

  async perform(rec, ctx) {
    // ── câu 1: mở tab ──
    await ctx.atCue(1);
    await rec.clickText('Bắn Tỉa', { exact: true, tag: 'button', moveMs: 700, settle: 1400 });
    await rec.moveToPoint(1650, 440, 800);      // thẻ "Khả dụng — Sẵn sàng bắn tỉa"
    await rec.hold(700);

    // ── câu 2: radar ──
    await ctx.atCue(2);
    for (const ticker of ['VNM', 'SSI', 'HPG']) {
      const row = await rec.byText(ticker, { tag: 'p,div,span', exact: true }).catch(() => null);
      if (row) { await rec.moveToEl(row, 750); await rec.hold(1300); }
      else await rec.hold(1000);
    }
    await rec.hold(600);

    // ── câu 3: bộ quy tắc ──
    await ctx.atCue(3);
    const rules = await rec.byText('Bộ quy tắc', { closest: '.card' }).catch(() => null);
    if (rules) {
      await rec.bring(rules, { block: 'center', ms: 900 });
      await rec.moveToEl(rules, 800);
      await rec.hold(1300);
      await rec.zoomElement(rules, 1.14, 750);
      await rec.hold(1500);
      await rec.zoomReset(650);
    } else {
      await rec.scrollBy(700, { ms: 950 });
      await rec.hold(3500);
    }
  },
};
