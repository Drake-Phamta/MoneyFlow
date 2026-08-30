/**
 * Scene 07 — Tiết kiệm: bảng sổ, đếm ngược đáo hạn, bộ đếm tích luỹ vàng.
 * Câu 1 (0.1s)   vào tab Tiết kiệm, khoe bảng sổ (lãi suất / kỳ hạn / lãi theo ngày)
 * Câu 2 (6.7s)   sổ VCB đếm ngược 20 ngày
 * Câu 3 (9.3s)   bộ đếm vàng → bấm "Ghi nhận mua 1 chỉ vàng SJC" → modal
 * Câu 4 (15.2s)  Xác nhận mua → danh mục vàng 2 → 3 chỉ
 *
 * mutatesDb: ghi thêm một giao dịch mua vàng.
 */
module.exports = {
  fade: { fadeIn: 0.3 },
  mutatesDb: true,

  async setup(rec, ctx) {
    await rec.goto(ctx.BASE + '/#/investments', '.card');
    await rec.hold(1200);
    await rec.moveToPoint(430, 220, 1);
  },

  async perform(rec, ctx) {
    // ── câu 1: mở tab, xem bảng sổ ──
    await ctx.atCue(1);
    await rec.clickText('Tiết kiệm', { exact: true, tag: 'button', moveMs: 650, settle: 1400 });
    const table = await rec.byText('Sổ tiết kiệm', { closest: '.card' }).catch(() => null);
    if (table) {
      await rec.bring(table, { block: 'center', ms: 900 });
      await rec.moveToEl(table, 750);
    }
    await rec.hold(2200);

    // ── câu 2: đếm ngược đáo hạn ──
    await ctx.atCue(2);
    const soon = await rec.byText('20 ngày', { exact: true }).catch(() => null);
    if (soon) { await rec.moveToEl(soon, 750); await rec.hold(1100); }
    else await rec.hold(1800);

    // ── câu 3: bộ đếm vàng → mở modal ──
    await ctx.atCue(3);
    const gold = await rec.byText('Tích lũy Vàng SJC', { closest: 'div' }).catch(() => null);
    if (gold) await rec.bring(gold, { block: 'center', ms: 850 });
    await rec.clickText('Ghi nhận mua 1 chỉ vàng SJC', { exact: false, tag: 'button', moveMs: 800, settle: 1500 });
    await rec.page.waitForFunction(
      () => [...document.querySelectorAll('h3')].some(e => e.textContent.trim() === 'Ghi nhận mua vàng SJC'),
      { timeout: 12000 },
    ).catch(() => {});
    await rec.hold(1300);

    // ── câu 4: xác nhận ──
    await ctx.atCue(4);
    await rec.clickText('Xác nhận mua', { exact: false, tag: 'button', moveMs: 750, settle: 2200 });
    await rec.hold(1200);
  },
};
