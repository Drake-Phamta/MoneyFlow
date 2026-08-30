/**
 * Scene 04 — Dòng tiền.
 * Câu 1 (0.1s)  điều hướng sang trang, khoe 4 thẻ KPI
 * Câu 2 (4.6s)  biểu đồ cột 18 tháng — dừng ở cột thưởng Tết (T2/2026)
 * Câu 3 (10.6s) tỷ lệ tiết kiệm + chuỗi tháng + Kỷ lục
 */
module.exports = {
  fade: { fadeIn: 0.3 },

  async setup(rec, ctx) {
    await rec.goto(ctx.BASE + '/#/', '.bento-card');
    await rec.hold(900);
    await rec.moveToPoint(150, 300, 1);         // sẵn ở sidebar
  },

  async perform(rec, ctx) {
    // ── câu 1: sang trang Dòng tiền ──
    await ctx.atCue(1);
    await rec.click('a[href="#/cashflow"]', { moveMs: 700, settle: 1500 });
    await rec.page.waitForSelector('.card', { timeout: 15000 });
    await rec.hold(900);
    await rec.moveToPoint(980, 300, 800);       // lướt hàng KPI
    await rec.hold(700);

    // ── câu 2: biểu đồ cột 18 tháng ──
    await ctx.atCue(2);
    const chart = await rec.byText('Dòng tiền theo tháng', { closest: '.card' });
    await rec.bring(chart, { block: 'center', ms: 850 });
    await rec.moveToEl(chart, 800);
    await rec.hold(1200);
    // Rê vào đúng cột T2/2026 (thưởng Tết) để tooltip hiện đúng tháng lời thoại nhắc.
    // Bám theo nhãn trục X chứ không dò "cột cao nhất" — nhóm cột có nhiều series,
    // dò theo chiều cao dễ trúng nhầm tháng khác.
    const tick = await rec.page.evaluate(() => {
      const t = [...document.querySelectorAll('.recharts-xAxis .recharts-cartesian-axis-tick-value')]
        .find(e => (e.textContent || '').trim() === 'T2/2026');
      if (!t) return null;
      const r = t.getBoundingClientRect();
      const plot = document.querySelector('.recharts-cartesian-grid');
      const p = plot ? plot.getBoundingClientRect() : null;
      return { x: r.x + r.width / 2, y: p ? p.y + p.height * 0.45 : r.y - 120 };
    });
    if (tick) {
      await rec.moveToPoint(tick.x, tick.y, 850);
      await rec.hold(1700);
    } else {
      await rec.hold(2500);
    }

    // ── câu 3: tỷ lệ tiết kiệm + kỷ lục ──
    await ctx.atCue(3);
    const rate = await rec.byText('Tỷ lệ tiết kiệm theo tháng', { closest: '.card' });
    await rec.bring(rate, { block: 'center', ms: 850 });
    await rec.moveToEl(rate, 750);
    await rec.hold(1700);
    await rec.scrollBy(560, { ms: 950 });
    await rec.moveToPoint(1500, 620, 750);      // sang thẻ Kỷ lục
    await rec.hold(1400);
  },
};
