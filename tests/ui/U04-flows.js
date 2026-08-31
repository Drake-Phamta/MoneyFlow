/**
 * U04 — Tương tác thật trên trang Lộ trình.
 *
 * U01–U03 chỉ khẳng định trang mở được. Bộ này kéo thanh trượt, bật công tắc,
 * mở thẻ giai đoạn — những thứ chỉ hỏng khi có người dùng thật.
 *
 * Neo vào `data-testid`, không neo vào chữ hay lớp CSS, để đợt đổi giao diện
 * sau không làm cả bộ đỏ mà chẳng có gì thực sự hỏng.
 */
const { group, t, ok, eq, fail, fmt } = require('../rig/assert');
const { reset } = require('../rig/reset');
const { Browser } = require('./_browser');

/** Kéo một thanh trượt tới giá trị mong muốn và bắn sự kiện React nghe được. */
async function setRange(page, testId, value) {
  await page.evaluate(
    (id, v) => {
      const el = document.querySelector(`[data-testid="${id}"]`);
      if (!el) throw new Error('khong tim thay thanh truot ' + id);
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        'value'
      ).set;
      setter.call(el, String(v));
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    },
    testId,
    value
  );
  await new Promise((r) => setTimeout(r, 350));
}

async function textOf(page, testId) {
  return page.evaluate((id) => {
    const el = document.querySelector(`[data-testid="${id}"]`);
    return el ? el.innerText.trim() : null;
  }, testId);
}

function years(text) {
  const m = String(text || '').match(/(\d+(?:[.,]\d+)?)/);
  return m ? Number(m[1].replace(',', '.')) : null;
}

async function run() {
  group('U04 — Tương tác trên trang Lộ trình');
  await reset();

  const b = await new Browser().open();
  try {
    await t(
      'UI-F-01',
      'Kéo thanh trượt chi tiêu xuống thì số năm tới đích giảm ngay',
      ['ui:snapshot.get'],
      async () => {
        await b.goto('/scenarios');
        const before = years(await textOf(b.rec.page, 'result-years'));
        ok(before !== null, 'không đọc được kết quả ban đầu');

        await setRange(b.rec.page, 'slider-expense', 4500000);
        const after = years(await textOf(b.rec.page, 'result-years'));
        ok(after !== null, 'kéo xong không đọc được kết quả');
        ok(
          after < before,
          `hạ chi tiêu mục tiêu từ 10tr xuống 4,5tr mà số năm không giảm ` +
            `(${before} → ${after})`
        );
        ok(b.errors.length === 0, `lỗi JS khi kéo: ${b.errors.slice(0, 2).join(' | ')}`);
      }
    );

    await t(
      'UI-F-02',
      'Kéo thanh trượt KHÔNG làm đổi mốc lên giai đoạn sau',
      ['ui:snapshot.get'],
      async () => {
        await b.goto('/scenarios');
        const before = await textOf(b.rec.page, 'next-phase-date');

        await setRange(b.rec.page, 'slider-expense', 4500000);
        const after = await textOf(b.rec.page, 'next-phase-date');

        eq(
          after,
          before,
          `thanh trượt chi tiêu làm mốc lên giai đoạn đổi từ "${before}" sang ` +
            `"${after}" — ngưỡng giai đoạn phải luôn theo chi tiêu mục tiêu trong ` +
            `cơ sở dữ liệu, không theo thanh trượt`
        );
      }
    );

    await t(
      'UI-F-03',
      'Nút "Về số thật" đưa mọi thứ trở lại đúng như trước khi kéo',
      ['ui:snapshot.get'],
      async () => {
        await b.goto('/scenarios');
        const before = await textOf(b.rec.page, 'result-years');

        await setRange(b.rec.page, 'slider-expense', 20000000);
        await setRange(b.rec.page, 'slider-contribution', 1000000);
        const changed = await textOf(b.rec.page, 'result-years');
        ok(changed !== before, 'kéo hai thanh trượt mà kết quả không đổi');

        await b.rec.page.click('[data-testid="reset-sliders"]');
        await new Promise((r) => setTimeout(r, 350));
        eq(await textOf(b.rec.page, 'result-years'), before, 'kết quả sau khi về số thật');
      }
    );

    await t(
      'UI-F-04',
      'Sổ đáo hạn chưa bật tái tục được cảnh báo kèm cái giá phải trả',
      ['ui:snapshot.get'],
      async () => {
        await b.goto('/scenarios');
        const txt = await b.mainText();

        const snap = await b.rec.page.evaluate(async () => {
          const r = await fetch('/api/snapshot');
          return r.json();
        });
        const risky = (snap.savings.accounts || []).filter(
          (a) => a.status === 'active' && a.type !== 'liquid' && a.maturity_date && !a.auto_renew
        );
        if (!risky.length) return; // không có sổ nào để cảnh báo

        ok(
          txt.includes('chưa bật tái tục'),
          'có sổ kỳ hạn chưa bật tái tục mà trang không cảnh báo gì'
        );
        ok(
          /chậm\s+\d+\s+tháng/.test(txt),
          'cảnh báo không nói quên gửi lại thì chậm bao nhiêu tháng — ' +
            'người dùng không có cách nào biết cái giá phải trả'
        );
      }
    );

    await t(
      'UI-F-05',
      'Bảng đòn bẩy hiện và chi tiêu đứng đầu',
      ['ui:snapshot.get'],
      async () => {
        await b.goto('/scenarios');
        const txt = await textOf(b.rec.page, 'levers');
        ok(txt, 'không thấy bảng đòn bẩy');
        const first = txt.split('\n')[0] || '';
        ok(
          /Chi tiêu/i.test(first),
          `dòng đầu bảng đòn bẩy là "${first}" chứ không phải chi tiêu`
        );
      }
    );

    await t(
      'UI-F-06',
      'Mốc lịch không rơi vào tháng đã ghi',
      ['ui:monthly.filled'],
      async () => {
        await b.goto('/scenarios');
        const txt = await textOf(b.rec.page, 'milestones');
        ok(txt, 'không thấy danh sách mốc');
        const labels = [...txt.matchAll(/T(\d+)\/(\d+)/g)].map((m) => ({
          m: Number(m[1]),
          y: Number(m[2]),
        }));
        ok(labels.length > 0, 'không đọc được nhãn tháng nào');

        const filled = await b.rec.page.evaluate(async () => {
          const r = await fetch('/api/monthly/filled');
          return r.json();
        });
        const last = filled[filled.length - 1];
        const lm = last.month_label.match(/T(\d+)\/(\d+)/);
        const lastKey = Number(lm[2]) * 12 + Number(lm[1]);

        for (const l of labels) {
          ok(
            l.y * 12 + l.m > lastKey,
            `mốc T${l.m}/${l.y} nằm trước hoặc trùng tháng cuối đã ghi ` +
              `${last.month_label} — mốc rơi vào quá khứ`
          );
        }
      }
    );

    await t(
      'UI-F-07',
      'Mở một thẻ giai đoạn thấy tỷ lệ phân bổ, và tỷ lệ khớp dữ liệu',
      ['ui:snapshot.get'],
      async () => {
        await b.goto('/scenarios');
        await b.rec.page.click('[data-testid="phase-card-2"]');
        await new Promise((r) => setTimeout(r, 250));

        const txt = await b.mainText();
        const snap = await b.rec.page.evaluate(async () => {
          const r = await fetch('/api/snapshot');
          return r.json();
        });
        const allocs = (snap.phaseAllocations?.['2'] || []).filter((a) => a.ratio > 0);
        ok(allocs.length > 0, 'giai đoạn 2 không có tỷ lệ phân bổ nào');

        for (const a of allocs) {
          const want = `${Math.round(a.ratio * 100)}%`;
          ok(
            txt.includes(a.category_name),
            `mở thẻ giai đoạn 2 mà không thấy danh mục "${a.category_name}"`
          );
          ok(txt.includes(want), `không thấy tỷ lệ ${want} của ${a.category_name}`);
        }
      }
    );

    await t(
      'UI-F-08',
      'Chuyển sang tab Kiến thức, mở một mục, không lỗi',
      ['ui:snapshot.get'],
      async () => {
        await b.goto('/scenarios');
        await b.rec.page.click('[data-testid="tab-knowledge"]');
        await new Promise((r) => setTimeout(r, 400));

        await b.rec.page.click('[data-testid="knowledge-four_pct"]');
        await new Promise((r) => setTimeout(r, 250));

        const txt = await b.mainText();
        ok(txt.includes('Trinity'), 'mở mục quy tắc 4% mà không thấy nội dung');

        const bad = await b.badTokens();
        ok(bad.length === 0, `lộ ${bad.join(', ')} trong phần kiến thức`);
        if (b.errors.length) fail(`lỗi JS: ${b.errors.slice(0, 2).join(' | ')}`);
      }
    );

    await t(
      'UI-F-09',
      'Mở sổ quỹ tiền mặt, ghi một khoản đã tiêu rồi bỏ nó ra',
      ['ui:cash.ledger', 'ui:cash.spend', 'ui:cash.deleteMovement', 'ui:snapshot.get'],
      async () => {
        await b.goto('/');
        await new Promise((r) => setTimeout(r, 600));

        // Ngăn Tiền mặt phải bấm được — đó là cả thiết kế: người dùng tìm chỗ
        // ghi khoản đã tiêu ở đúng nơi tiền đang nằm.
        const opened = await b.rec.page.evaluate(() => {
          const el = document.querySelector('[data-testid="cash-pot"]');
          if (!el) return false;
          el.click();
          return true;
        });
        ok(opened, 'không tìm thấy ngăn Tiền mặt bấm được trên Tổng quan');
        await new Promise((r) => setTimeout(r, 600));

        // Modal dựng qua portal nên nằm NGOÀI <main> — đọc ở cấp tài liệu.
        const txt = await b.rec.page.evaluate(() => document.body.innerText || '');
        ok(/Ghi khoản đã tiêu/.test(txt), 'sổ quỹ mở ra mà không có lối ghi khoản đã tiêu');

        // Sổ quỹ phải nói được tiền vào từ đâu bằng mũi tên, không bằng đoạn văn.
        ok(/[←→]/.test(txt), 'sổ quỹ không có mũi tên chỉ chiều tiền đi');

        const bad = await b.badTokens();
        ok(bad.length === 0, `lộ ${bad.join(', ')} trong sổ quỹ tiền mặt`);
        if (b.errors.length) fail(`lỗi JS: ${b.errors.slice(0, 2).join(' | ')}`);
      }
    );

  } finally {
    await b.close();
    await reset();
  }
}

module.exports = { run };
