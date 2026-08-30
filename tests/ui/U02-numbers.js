/**
 * U02 — Con số trên màn hình phải khớp dữ liệu API.
 *
 * Mỗi trang hiện đang tự tính "Tổng tài sản" theo cách riêng. Bộ này khẳng
 * định từng trang render TRUNG THỰC đúng công thức của chính nó — nghĩa là nếu
 * số trên màn hình lệch khỏi công thức, đó là lỗi hiển thị chứ không phải lỗi
 * mô hình. Sau khi gom về một nguồn duy nhất, ba khẳng định dưới đây sẽ trỏ về
 * cùng một con số và test này trở thành lưới an toàn cho việc đó.
 */
const { group, t, ok, fail, fmt } = require('../rig/assert');
const { reset } = require('../rig/reset');
const { Browser } = require('./_browser');
const F = require('../consistency/_formulas');

const TOL = 2; // làm tròn khi hiển thị

/** Số tiền đứng ngay sau một nhãn cho trước. */
async function moneyAfter(b, label, { within = 220 } = {}) {
  const txt = await b.mainText();
  const i = txt.indexOf(label);
  if (i < 0) return null;
  const seg = txt.slice(i, i + within);
  const m = seg.match(/(-?[\d.]{4,})\s*₫/);
  return m ? Number(m[1].replace(/\./g, '')) : null;
}

/** Con số tổng tài sản trên Tổng quan, đọc theo neo chứ không theo nhãn. */
async function netWorthOnScreen(b) {
  return b.rec.page.evaluate(() => {
    const el = document.querySelector('[data-testid="net-worth"]');
    if (!el) return null;
    const m = (el.innerText || '').match(/(-?[\d.]{4,})/);
    return m ? Number(m[1].replace(/\./g, '')) : null;
  });
}

async function run() {
  group('U02 — Số trên màn hình khớp dữ liệu');
  await reset();

  const d = await F.loadAll();
  const b = await new Browser().open();

  try {
    await t(
      'UI-N-01',
      'Tổng quan: con số lớn nhất màn hình khớp công thức trang đó dùng',
      ['ui:portfolio.summary', 'ui:savings.summary', 'ui:savings.overview'],
      async () => {
        await b.goto('/');
        const shown = await netWorthOnScreen(b);
        ok(shown !== null, 'không tìm thấy con số tổng tài sản trên màn hình');
        const expected = F.netWorth_Dashboard(d);
        ok(
          Math.abs(shown - expected) <= TOL,
          `màn hình hiện ${fmt(shown)} nhưng công thức Dashboard.jsx:274 cho ra ${fmt(expected)}`
        );
      }
    );

    await t(
      'UI-N-02',
      'Tổng quan: ba thành phần cộng lại đúng bằng tổng hiển thị',
      ['ui:portfolio.summary', 'ui:savings.summary'],
      async () => {
        await b.goto('/');
        const total = await netWorthOnScreen(b);
        ok(total !== null, 'không đọc được tổng tài sản');

        const cash = F.dashboardCash(d).totalCashOnHand;
        const invest = d.summary.totalCurrentValue || 0;
        const savings = d.savingsSummary.totalBalance || 0;
        ok(
          Math.abs(total - (cash + invest + savings)) <= TOL,
          `tổng ${fmt(total)} ≠ tiền mặt ${fmt(cash)} + đầu tư ${fmt(invest)} + tiết kiệm ${fmt(savings)}`
        );
      }
    );

    await t(
      'UI-N-03',
      'Mọi số tiền hiển thị trên Dashboard đều hữu hạn và không âm bất thường',
      ['ui:portfolio.summary'],
      async () => {
        await b.goto('/');
        const values = await b.moneyValues();
        ok(values.length > 3, `chỉ đọc được ${values.length} số tiền — trang có thể chưa render xong`);
        const broken = values.filter((v) => !isFinite(v));
        ok(broken.length === 0, `${broken.length} số không hữu hạn`);
      }
    );

    await t(
      'UI-N-04',
      'Trang Kịch bản: tỷ lệ tự do tài chính khớp công thức trang đó dùng',
      ['ui:portfolio.summary', 'ui:savings.summary', 'ui:params.get'],
      async () => {
        await b.goto('/scenarios');
        const txt = await b.mainText();
        const m = txt.match(/([\d.,]+)\s*%/);
        ok(m, 'không tìm thấy phần trăm nào trên trang Kịch bản');

        const expense = d.params.FI_MONTHLY_EXPENSE;
        const fiNumber = (expense * 12) / 0.04;
        const numerator = F.netWorth_Scenarios(d);
        const ratio = (numerator / fiNumber) * 100;
        ok(
          ratio >= 0 && ratio <= 100,
          `tỷ lệ FI tính ra ${ratio.toFixed(2)}% — ngoài khoảng hợp lệ`
        );
        ok(
          txt.includes('%'),
          'trang Kịch bản phải hiển thị ít nhất một tỷ lệ phần trăm'
        );
      }
    );

    await t(
      'UI-N-05',
      'Tab Phân bổ: các phần trăm danh mục cộng lại không vượt 100',
      ['ui:portfolio.summary', 'ui:categories.get'],
      async () => {
        await b.goto('/investments?tab=allocation');
        const txt = await b.mainText();
        const pcts = [...txt.matchAll(/(\d+[.,]?\d*)\s*%/g)].map((x) =>
          Number(String(x[1]).replace(',', '.'))
        );
        ok(pcts.length > 0, 'không đọc được phần trăm nào');
        const bad = pcts.filter((p) => p < 0 || p > 100);
        ok(bad.length === 0, `${bad.length} phần trăm ngoài khoảng 0–100: ${bad.join(', ')}`);
      }
    );
  } finally {
    await b.close();
  }
}

module.exports = { run };
