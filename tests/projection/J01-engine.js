/**
 * J01 — Động cơ dự phóng.
 *
 * Mô hình này là chỗ dễ sai mà khó thấy nhất trong app: kết quả là một con số
 * duy nhất ("còn 21 năm"), không ai đối chiếu được bằng mắt. Bộ này khẳng định
 * các bất biến mà một con số sai chắc chắn phá vỡ.
 */
const { group, t, ok, eq, approx, fmt } = require('../rig/assert');
const { reset } = require('../rig/reset');
const { getOk } = require('../rig/http');

let P = null;
async function lib() {
  if (!P) P = await import('../../src/lib/projection.mjs');
  return P;
}

async function run() {
  group('J01 — Động cơ dự phóng');
  await reset();

  const p = await lib();
  const sn = await getOk('/api/snapshot');
  const input = p.inputFromSnapshot(sn);

  await t(
    'C23',
    'Máy dò giai đoạn của mô hình và của backend xếp cùng một giai đoạn',
    ['rest:GET /api/snapshot', 'rest:GET /api/phases/active'],
    async () => {
      const active = await getOk('/api/phases/active');
      const mine = p.detectPhase(input.buckets, input.phaseExpense);
      const total = Object.values(input.buckets).reduce((s, v) => s + v, 0);
      eq(
        mine,
        active.sort_order,
        'mô hình xếp giai đoạn ' + mine + ', backend xếp ' + active.sort_order +
          ' — dự phòng ' + fmt(input.buckets.reserve) + ', tổng ' + fmt(total) +
          ', ngưỡng ' + fmt(input.phaseExpense)
      );
      eq(mine, sn.phase.sortOrder, 'mô hình và snapshot');
    }
  );

  await t(
    'C24',
    'Không có tiền vào và không có lãi thì trả về "không tới", không lặp vô hạn',
    [],
    () => {
      const started = Date.now();
      const r = p.project({
        ...input,
        contribution: 0,
        returns: { reserve: 0, savings: 0, gold: 0, stocks: 0, sniper: 0 },
        inflation: 0,
      });
      ok(Date.now() - started < 2000, 'chạy quá 2 giây — nghi vòng lặp không có lối ra');
      eq(r.reached, false, 'không tiền không lãi mà vẫn báo tới đích');
      eq(r.monthsToFI, null, 'số tháng tới đích phải là null khi không tới');
      ok(Number.isFinite(r.finalTotal), 'tổng cuối là ' + r.finalTotal);
    }
  );

  await t(
    'C25',
    'Mốc tăng dần theo thời gian và nhãn tháng khớp chỉ số tháng',
    [],
    () => {
      const r = p.project(input);
      ok(r.milestones.length > 0, 'không sinh được mốc nào');

      let prev = 0;
      for (const m of r.milestones) {
        ok(
          m.monthIndex > prev,
          'mốc "' + m.id + '" ở tháng ' + m.monthIndex + ' không lớn hơn mốc trước (' + prev + ')'
        );
        prev = m.monthIndex;

        // Nhãn phải sinh từ đúng chỉ số đó — chỗ lệch một đơn vị hay trốn ở đây.
        eq(
          m.label,
          p.monthLabel(m.monthIndex, input.startMonth, input.startYear),
          'mốc "' + m.id + '": nhãn tháng'
        );
      }

      const phases = r.milestones.filter((m) => m.kind === 'phase').map((m) => m.phase);
      for (let i = 1; i < phases.length; i++) {
        ok(phases[i] > phases[i - 1], 'giai đoạn nhảy lùi: ' + phases.join(', '));
      }
    }
  );

  await t(
    'C26p',
    'Mốc không bao giờ rơi vào tháng người dùng đã ghi',
    ['rest:GET /api/monthly/filled'],
    async () => {
      const filled = await getOk('/api/monthly/filled');
      const lastIndex = filled.reduce((m, x) => Math.max(m, x.month_index), 0);
      const r = p.project(input);
      for (const m of r.milestones) {
        ok(
          m.monthIndex > lastIndex,
          'mốc "' + m.id + '" rơi vào ' + m.label + ' (tháng ' + m.monthIndex + ') — ' +
            'người dùng đã ghi tới tháng ' + lastIndex + ', mốc nằm trong quá khứ'
        );
      }
    }
  );

  await t(
    'C27p',
    'Thanh trượt chi tiêu KHÔNG được chạm vào ngưỡng giai đoạn',
    [],
    () => {
      // Bất biến giữ cho trang Kịch bản và trang Tổng quan không nói hai chuyện
      // khác nhau về cùng một cột mốc.
      const halved = p.project({ ...input, fiExpense: input.fiExpense / 2 });
      const base = p.project(input);

      const phaseOf = (r, n) => r.milestones.find((m) => m.kind === 'phase' && m.phase === n);
      for (const n of [2, 3, 4]) {
        const a = phaseOf(base, n);
        const b = phaseOf(halved, n);
        if (!a || !b) continue;
        eq(
          b.monthIndex,
          a.monthIndex,
          'hạ chi tiêu mục tiêu một nửa làm mốc lên giai đoạn ' + n + ' đổi từ ' +
            a.label + ' sang ' + b.label + ' — thanh trượt đang rò vào ngưỡng giai đoạn'
        );
      }
      ok(halved.fiTarget < base.fiTarget, 'hạ chi tiêu mục tiêu mà đích tự do tài chính không giảm');
      ok(
        halved.monthsToFI < base.monthsToFI,
        'hạ chi tiêu mục tiêu mà thời gian tới đích không rút ngắn'
      );
    }
  );

  await t(
    'C28p',
    'Lợi suất mở đúng bằng mix tài sản THẬT, không phải mix mục tiêu',
    ['rest:GET /api/snapshot'],
    () => {
      const r = p.project(input);
      const total = Object.values(input.buckets).reduce((s, v) => s + v, 0);
      const byHand =
        total > 0
          ? p.CLASSES.reduce((s, k) => s + input.buckets[k] * input.returns[k], 0) / total
          : 0;
      approx(r.blendedReturnStart, byHand, 1e-9, 'lợi suất mở không khớp bình quân gia quyền');

      if (r.reached) {
        ok(
          r.blendedReturnEnd > r.blendedReturnStart,
          'lợi suất cuối ' + (r.blendedReturnEnd * 100).toFixed(2) + '% không cao hơn ' +
            'lợi suất mở ' + (r.blendedReturnStart * 100).toFixed(2) + '% — glide path không chạy'
        );
      }
    }
  );

  await t(
    'C29p',
    'Dải bất định bao quanh kết quả cơ sở và hẹp lại khi ghi thêm tháng',
    ['rest:GET /api/snapshot'],
    () => {
      const b = p.band(input, { cashflow: sn.cashflow, risk: sn.risk });
      ok(b.base.reached, 'kịch bản cơ sở không tới đích — không kiểm được dải');
      ok(
        b.low.monthsToFI >= b.base.monthsToFI,
        'nhánh xấu (' + b.low.monthsToFI + ' tháng) nhanh hơn cơ sở (' + b.base.monthsToFI + ')'
      );
      ok(
        b.high.monthsToFI <= b.base.monthsToFI,
        'nhánh tốt (' + b.high.monthsToFI + ' tháng) chậm hơn cơ sở (' + b.base.monthsToFI + ')'
      );
      ok(
        b.uncertainty.contributionStdErrorNextMonth < b.uncertainty.contributionStdError,
        'ghi thêm một tháng mà sai số không hẹp lại'
      );
    }
  );

  await t(
    'C30p',
    'Chi tiêu phải đứng đầu bảng đòn bẩy',
    [],
    () => {
      const s = p.sensitivity(input);
      ok(s.levers.length > 0, 'không xếp hạng được đòn bẩy nào');
      eq(
        s.levers[0].id,
        'fiExpense',
        'đòn bẩy mạnh nhất là "' + s.levers[0].label + '" chứ không phải chi tiêu — ' +
          s.levers.map((l) => l.label + ' ' + l.monthsSaved + 'th').join(', ')
      );
      for (const l of s.levers) {
        ok(Number.isFinite(l.monthsSaved), l.label + ': số tháng rút ngắn là ' + l.monthsSaved);
      }
    }
  );

  await t(
    'C31p',
    'Quên tái tục sổ đáo hạn làm đích lùi lại một khoảng đo được',
    ['rest:GET /api/savings'],
    () => {
      const terms = (sn.savings.accounts || []).filter(
        (a) => a.status === 'active' && a.type !== 'liquid' && a.maturity_date
      );
      if (!terms.length) return; // không có sổ kỳ hạn thì không có gì để quên

      const withRenew = p.project({ ...input, events: p.maturityEvents(sn) });
      const forget = p.project({
        ...input,
        events: p.maturityEvents(sn, { forgetRenew: true }),
      });

      ok(
        forget.monthsToFI > withRenew.monthsToFI,
        'quên tái tục mà đích không lùi (' + forget.monthsToFI + ' so với ' +
          withRenew.monthsToFI + ' tháng) — sự kiện chưa nối vào vòng lặp'
      );
    }
  );

  await t(
    'C32p',
    'Chạy đủ nhanh cho thanh trượt kéo trực tiếp',
    [],
    () => {
      p.project(input);
      p.project(input);
      const t0 = process.hrtime.bigint();
      for (let i = 0; i < 100; i++) p.project(input);
      const ms = Number(process.hrtime.bigint() - t0) / 1e6 / 100;
      ok(ms < 3, 'một lần chạy mất ' + ms.toFixed(2) + 'ms — thanh trượt sẽ giật');
    }
  );
}

module.exports = { run };
