/**
 * Scene 09 — Phân bổ: thực tế vs mục tiêu, cảnh báo lệch, rủi ro tập trung.
 * Chỉ 1 câu thoại (9.9s) nên đi liền mạch: mở tab → donut → bullet chart
 * → thẻ "Cần rebalance" → panel rủi ro.
 */
module.exports = {
  fade: { fadeIn: 0.3 },

  async setup(rec, ctx) {
    await rec.goto(ctx.BASE + '/#/investments', '.card');
    await rec.hold(1200);
    await rec.moveToPoint(830, 220, 1);
  },

  async perform(rec, ctx) {
    await ctx.atCue(1);
    await rec.clickText('Phân bổ', { exact: true, tag: 'button', moveMs: 650, settle: 1000 });

    await rec.moveToPoint(560, 640, 600);       // donut phân bổ hiện tại
    await rec.hold(800);
    await rec.moveToPoint(1450, 640, 600);      // bullet chart mục tiêu
    await rec.hold(900);

    const reb = await rec.byText('Cần rebalance', { closest: '.card' }).catch(() => null);
    if (reb) {
      await rec.bring(reb, { block: 'center', ms: 700 });
      await rec.moveToEl(reb, 600);
      await rec.hold(900);
    } else {
      await rec.scrollBy(600, { ms: 700 });
      await rec.hold(900);
    }

    const risk = await rec.byText('Đa dạng hóa', { closest: '.card' }).catch(() => null);
    if (risk) {
      await rec.bring(risk, { block: 'center', ms: 700 });
      await rec.moveToEl(risk, 600);
    } else {
      await rec.scrollBy(650, { ms: 700 });
    }
    await rec.hold(800);
  },
};
