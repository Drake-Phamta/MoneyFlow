/**
 * Scene 06 — Sổ cái: bảng kê + sửa trực tiếp trên ô như bảng tính.
 * Câu 1 (0.1s)  chuyển sang tab Sổ cái
 * Câu 2 (2.7s)  bấm vào ô Thu nhập, gõ số mới, Enter
 * Câu 3 (8.6s)  các bộ lọc theo giai đoạn
 *
 * mutatesDb: sửa 1 ô là ghi vào DB thật của bản demo.
 */
module.exports = {
  fade: { fadeIn: 0.3 },
  mutatesDb: true,

  async setup(rec, ctx) {
    await rec.goto(ctx.BASE + '/#/cashflow', '.card');
    await rec.hold(1200);
    await rec.moveToPoint(420, 300, 1);
  },

  async perform(rec, ctx) {
    // ── câu 1: mở Sổ cái ──
    await ctx.atCue(1);
    await rec.clickText('Sổ cái', { exact: true, tag: 'button', moveMs: 700, settle: 1300 });

    // ── câu 2: sửa trực tiếp một ô ──
    await ctx.atCue(2);
    // Sửa đúng dòng T9/2026 vừa nhập ở scene 05: liền mạch câu chuyện, và không
    // làm lệch số liệu của các scene đã quay trước đó (biểu đồ, FI, phân bổ).
    // Bảng cuộn trong .table-wrap nên phải kéo dòng vào tầm nhìn TRƯỚC khi bấm,
    // không thì boundingBox nằm ngoài viewport và cú click rơi vào chỗ khác.
    await rec.page.evaluate(() => {
      const row = [...document.querySelectorAll('table tbody tr')]
        .find(r => (r.textContent || '').includes('T9/2026'));
      if (row) row.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
    await rec.hold(1000);
    // onClick nằm trên <span> bên trong <td> (MasterLedger.jsx), không phải trên td —
    // bấm vào tâm td dễ trượt ra vùng padding và không mở được ô nhập.
    const cell = await rec.page.evaluateHandle(() => {
      const row = [...document.querySelectorAll('table tbody tr')]
        .find(r => (r.textContent || '').includes('T9/2026'));
      if (!row) return null;
      const td = row.querySelectorAll('td')[1];        // cột "Thu nhập"
      return td ? (td.querySelector('span') || td) : null;
    });
    if (cell.asElement()) {
      await rec.moveToEl(cell.asElement(), 900);
      await rec.hold(500);
      await rec.clickHere({ settle: 700 });
      // Ô chuyển thành <input>. Gõ bằng keyboard.type vào element ĐANG focus,
      // không dùng page.type(selector) — selector bị resolve lại sau mỗi lần React
      // render, dễ mất ký tự và commit sớm (từng lưu nhầm thành "23").
      const focused = await rec.page.evaluate(() => {
        const i = document.querySelector('table input');
        if (!i) return false;
        i.focus();
        i.setSelectionRange(0, i.value.length);
        return true;
      });
      if (focused) {
        await rec.page.keyboard.press('Backspace');   // xoá phần đang bôi đen
        await rec.page.keyboard.type('23000000', { delay: 115 });
        await rec.hold(650);
        await rec.page.keyboard.press('Enter');
        await rec.hold(1100);
      } else {
        await rec.hold(2200);
      }
    } else {
      await rec.hold(3500);
    }

    // ── câu 3: bộ lọc ──
    await ctx.atCue(3);
    await rec.moveToPoint(520, 250, 800);
    await rec.hold(900);
    await rec.scrollBy(420, { ms: 900 });
    await rec.hold(1200);
  },
};
