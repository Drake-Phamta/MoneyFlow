/**
 * Scene 02 — Tổng quan (Dashboard).
 * 5 câu thoại, mỗi câu ứng với một vùng trên trang:
 *   1. mở app, toàn cảnh              → giữ ở đầu trang
 *   2. hai lời nhắc đầu trang         → chuột lướt banner đáo hạn + nhắc nhập liệu
 *   3. giai đoạn + tiến độ            → thẻ phase (bento-card đầu tiên), zoom nhẹ
 *   4. tài sản ròng / lợi nhuận       → cuộn tới hero, zoom
 *   5. tách 2 nhóm đầu tư / an toàn   → 2 panel KPI
 *
 * Lưu ý selector: chữ trên màn hình viết hoa là do CSS `uppercase`,
 * textContent trong DOM vẫn là chữ thường — phải khớp theo chuỗi gốc.
 */
module.exports = {
  fade: { fadeIn: 0.45 },

  async setup(rec, ctx) {
    await rec.goto(ctx.BASE + '/#/', '.bento-card');
    await rec.hold(1500);                       // chờ chart + animation mount xong
    await rec.scrollTop({ ms: 200 });
    await rec.moveToPoint(760, 300, 1);         // đặt sẵn chuột, tránh nó bay từ góc màn hình
  },

  async perform(rec, ctx) {
    // ── câu 1: toàn cảnh ──
    await ctx.atCue(1);
    await rec.moveToPoint(980, 430, 1400);

    // ── câu 2: hai lời nhắc ──
    await ctx.atCue(2);
    await rec.moveToEl(await rec.byText('Sắp đáo hạn'), 900);
    await rec.hold(1500);
    await rec.moveToEl(await rec.byText('Nhắc nhở nhập liệu'), 900);
    await rec.hold(1300);

    // ── câu 3: giai đoạn + thanh tiến độ ──
    await ctx.atCue(3);
    const phase = await rec.nth('.bento-card', 0);   // thẻ giai đoạn luôn là bento đầu tiên
    await rec.moveToEl(phase, 900);
    await rec.zoomElement(phase, 1.16, 800);
    await rec.hold(1600);
    await rec.zoomReset(700);

    // ── câu 4: tài sản ròng ──
    await ctx.atCue(4);
    const hero = await rec.byText('Tổng tài sản ròng', { closest: '.bento-card' });
    await rec.bring(hero, { block: 'center', ms: 800 });
    await rec.moveToEl(hero, 700);
    await rec.zoomElement(hero, 1.18, 700);
    await rec.hold(1500);
    await rec.zoomReset(600);

    // ── câu 5: hai nhóm tài sản ──
    await ctx.atCue(5);
    const invest = await rec.byText('Đầu tư & Tích sản', { closest: '.bento-card' });
    await rec.bring(invest, { block: 'center', ms: 950 });
    await rec.moveToEl(invest, 850);
    await rec.hold(2200);
    await rec.moveToEl(await rec.byText('An toàn & Tiền mặt', { closest: '.bento-card' }), 900);
    await rec.hold(1600);
    await rec.scrollBy(300, { ms: 1000 });
  },
};
