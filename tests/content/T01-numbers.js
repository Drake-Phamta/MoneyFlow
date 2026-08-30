/**
 * T01 — Không con số nào trong văn bản được đóng băng.
 *
 * Lỗi nội dung nguy hiểm nhất không phải lỗi chính tả mà là con số chép tay:
 * hướng dẫn từng ghi "đủ ~16 triệu mua 1 chỉ SJC" khi giá thật là 14,72tr, và
 * ví dụ "12M/24M/96M" tính theo chi tiêu 4tr trong khi tham số thật là 10tr.
 * Bộ này khẳng định mọi con số trong chữ đều suy từ dữ liệu sống.
 */
const { group, t, ok, eq, fmt } = require('../rig/assert');
const { reset } = require('../rig/reset');
const { getOk } = require('../rig/http');

let C = null;

async function content() {
  if (!C) {
    const [phases, knowledge] = await Promise.all([
      import('../../src/content/phases.js'),
      import('../../src/content/knowledge.js'),
    ]);
    C = { ...phases, ...knowledge };
  }
  return C;
}

async function run() {
  group('T01 — Con số trong chữ suy từ dữ liệu');
  await reset();

  const c = await content();
  const sn = await getOk('/api/snapshot');
  const expense = sn.params.FI_MONTHLY_EXPENSE;

  await t(
    'CT-01',
    'Cột mốc trong hướng dẫn đúng bằng bội số × chi tiêu mục tiêu',
    ['rest:GET /api/snapshot'],
    () => {
      const phases = sn.phaseAllocations || {};
      for (const sort of [1, 2, 3, 4]) {
        const mult = { 1: 3, 2: 6, 3: 24, 4: 0 }[sort];
        const g = c.buildPhaseGuidance(
          { sortOrder: sort, name: `x${sort}`, goalMultiplier: mult },
          phases[sort] || [],
          { targetExpense: expense }
        );
        ok(g, `không dựng được hướng dẫn giai đoạn ${sort}`);
        if (mult > 0) {
          // Số hiện trong câu phải là bội số × chi tiêu mục tiêu, không phải
          // một con số chép tay nào khác.
          const shown = mult * expense;
          ok(
            g.exit.includes(shortMoney(shown)),
            `giai đoạn ${sort}: câu điều kiện lên giai đoạn "${g.exit}" không chứa ` +
              `mốc ${fmt(shown)} suy từ ${mult} × ${fmt(expense)}`
          );
        }
      }
    }
  );

  await t(
    'CT-02',
    'Giá vàng trong hướng dẫn là giá đang lưu, không phải số chép tay',
    ['rest:GET /api/snapshot'],
    () => {
      const gold = sn.prices?.goldUnit || 0;
      ok(gold > 0, 'snapshot phải trả về giá 1 chỉ SJC để văn bản dùng');

      const g = c.buildPhaseGuidance(
        { sortOrder: 2, name: 'x', goalMultiplier: 6 },
        sn.phaseAllocations?.[2] || [],
        { targetExpense: expense, goldUnitPrice: gold }
      );
      const goldLine = g.actions.find((x) => x.includes('SJC'));
      ok(goldLine, 'giai đoạn 2 phải có việc cần làm nhắc tới vàng SJC');
      ok(
        goldLine.includes(shortMoney(gold)),
        `câu "${goldLine}" không dùng giá đang lưu ${fmt(gold)}`
      );
      ok(
        !/16 ?tr|16 triệu/.test(goldLine),
        'vẫn còn mức giá 16 triệu chép tay trong hướng dẫn'
      );
    }
  );

  await t(
    'CT-03',
    'Ví dụ trong phần Kiến thức tính theo chi tiêu mục tiêu của người dùng',
    ['rest:GET /api/params'],
    () => {
      const secs = c.knowledgeSections({
        targetExpense: expense,
        inflation: sn.params.INFLATION_RATE,
        stockReturn: sn.params.EXPECTED_RETURN_STOCK,
      });
      const four = secs.find((s) => s.id === 'four_pct');
      ok(four, 'thiếu mục quy tắc 4%');

      const fiNumber = (expense * 12) / 0.04;
      ok(
        four.content.includes(new Intl.NumberFormat('vi-VN').format(fiNumber)),
        `mục quy tắc 4% không nhắc mốc ${fmt(fiNumber)} suy từ chi tiêu mục tiêu`
      );
      ok(
        !four.content.includes('1.2 tỷ') && !four.content.includes('48 triệu'),
        'vẫn còn ví dụ 48 triệu/năm → 1,2 tỷ chép tay từ bản cũ'
      );
    }
  );

  await t(
    'CT-04',
    'Lãi suất sổ không kỳ hạn chỉ có MỘT bộ số trong toàn hệ thống',
    ['rest:GET /api/params'],
    () => {
      const liquid = c.RATE_GUIDE.find((r) => r.term === 'Không kỳ hạn');
      const spectrum = c.RISK_SPECTRUM.find((r) => r.name === 'Dự Phòng');
      ok(liquid && spectrum, 'thiếu bảng lãi suất hoặc phổ rủi ro');
      eq(liquid.low, spectrum.low, 'cận dưới lãi sổ không kỳ hạn ở hai bảng');
      eq(liquid.high, spectrum.high, 'cận trên lãi sổ không kỳ hạn ở hai bảng');
      ok(
        liquid.high <= 0.01,
        `lãi sổ không kỳ hạn ghi tới ${(liquid.high * 100).toFixed(1)}% — ` +
          `mức thật ở Việt Nam là 0,1–0,5%`
      );
    }
  );

  await t(
    'CT-05',
    'Phổ rủi ro xếp từ thấp lên cao, không đảo lộn',
    [],
    () => {
      const xs = c.RISK_SPECTRUM;
      for (let i = 1; i < xs.length; i++) {
        ok(
          xs[i].low >= xs[i - 1].low && xs[i].high >= xs[i - 1].high,
          `"${xs[i].name}" (${xs[i].low}–${xs[i].high}) đứng sau ` +
            `"${xs[i - 1].name}" (${xs[i - 1].low}–${xs[i - 1].high}) nhưng rủi ro lại thấp hơn`
        );
      }
    }
  );
}

/** Bản rút gọn giống hệt render.money(), để so chuỗi. */
function shortMoney(n) {
  const a = Math.abs(Number(n) || 0);
  const trim = (v) => String(Number(v.toFixed(1))).replace('.', ',');
  if (a >= 1e9) return `${trim(a / 1e9)} tỷ`;
  if (a >= 1e6) return `${trim(a / 1e6)}tr`;
  if (a >= 1e3) return `${trim(a / 1e3)}k`;
  return `${Math.round(a)}đ`;
}

module.exports = { run };
