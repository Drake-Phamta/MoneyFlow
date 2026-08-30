/**
 * U09 — Lịch sử xếp mới nhất trước, ở mọi màn hình.
 *
 * Trước đây mỗi danh sách một chiều: Sổ cái chạy cũ→mới, Lịch sử nhập liệu
 * chạy mới→cũ, và trong CÙNG một thẻ ở trang Lộ trình có hai danh sách chạy
 * ngược nhau. Người dùng phải đoán mỗi lần.
 *
 * Quy tắc: quá khứ thì mới nhất trước; mốc tương lai thì gần nhất trước.
 */
const { group, t, ok } = require('../rig/assert');
const { reset } = require('../rig/reset');
const { Browser } = require('./_browser');

/** Đọc các nhãn tháng "T5/2026" trong một vùng, theo đúng thứ tự hiển thị. */
async function monthsIn(b, selector) {
  return b.rec.page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    return [...(el.innerText || '').matchAll(/T(\d+)\/(\d+)/g)].map((m) => ({
      m: Number(m[1]),
      y: Number(m[2]),
    }));
  }, selector);
}

/** true nếu dãy tháng đi từ mới về cũ. */
function newestFirst(list) {
  for (let i = 1; i < list.length; i++) {
    const a = list[i - 1].y * 12 + list[i - 1].m;
    const c = list[i].y * 12 + list[i].m;
    if (c > a) return false;
  }
  return true;
}

function show(list) {
  return list.map((x) => `T${x.m}/${x.y}`).join(' → ');
}

async function run() {
  group('U09 — Lịch sử mới nhất trước');
  await reset();

  const b = await new Browser().open();
  try {
    await t(
      'UI-H-01',
      'Sổ cái: tháng vừa ghi nằm ở dòng đầu',
      ['ui:monthly.getAll'],
      async () => {
        await b.goto('/cashflow');
        await b.rec.page.evaluate(() => {
          const tab = document.querySelector('[data-testid="tab-ledger"]');
          if (tab) tab.click();
        });
        await new Promise((r) => setTimeout(r, 900));

        const months = await monthsIn(b, 'table.table tbody');
        ok(months && months.length > 1, 'không đọc được tháng nào trong sổ cái');
        ok(
          newestFirst(months),
          `sổ cái đang chạy cũ → mới: ${show(months.slice(0, 5))}. ` +
            `Tháng vừa ghi phải nằm ngay dòng đầu, không phải sau khi cuộn hết.`
        );
      }
    );

    await t(
      'UI-H-02',
      'Lộ trình: hai danh sách trong cùng một thẻ chạy cùng chiều',
      ['ui:snapshot.get'],
      async () => {
        await b.goto('/scenarios');
        const txt = await b.mainText();
        const i = txt.indexOf('Kế hoạch so với thực tế');
        ok(i >= 0, 'không thấy khối kế hoạch so với thực tế');

        const block = txt.slice(i, i + 2000);
        const cut = block.indexOf('lần điều chỉnh');
        // Phần trên là danh sách tháng, phần dưới là danh sách điều chỉnh.
        const top = [...block.slice(0, cut < 0 ? block.length : cut).matchAll(/T(\d+)\/(\d+)/g)].map(
          (m) => ({ m: Number(m[1]), y: Number(m[2]) })
        );
        ok(top.length > 1, 'không đọc được danh sách tháng');
        ok(
          newestFirst(top),
          `danh sách tháng chạy cũ → mới (${show(top)}) trong khi danh sách điều ` +
            `chỉnh ngay bên dưới chạy mới → cũ. Hai chiều ngược nhau trong một thẻ.`
        );

        if (cut >= 0) {
          const bottom = [...block.slice(cut).matchAll(/T(\d+)\/(\d+)/g)].map((m) => ({
            m: Number(m[1]),
            y: Number(m[2]),
          }));
          if (bottom.length > 1) {
            ok(newestFirst(bottom), `danh sách điều chỉnh chạy cũ → mới: ${show(bottom)}`);
          }
        }
      }
    );

    await t(
      'UI-H-03',
      'Giao dịch: lệnh mới nhất ở trên, và không còn cột số thứ tự chạy ngược',
      ['ui:transactions.get'],
      async () => {
        await b.goto('/investments?tab=portfolio');
        const heads = await b.rec.page.evaluate(() =>
          [...document.querySelectorAll('table.table thead th')].map((x) => x.innerText.trim())
        );
        ok(
          !heads.includes('#'),
          'bảng giao dịch còn cột "#" — số chạy ngược và đổi mỗi lần thêm giao dịch'
        );

        const dates = await b.rec.page.evaluate(() =>
          [...document.querySelectorAll('table.table tbody tr')]
            .map((tr) => tr.children[0]?.innerText.trim())
            .filter(Boolean)
        );
        if (dates.length > 1) {
          const key = (d) => {
            const m = String(d).match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
            return m ? Number(m[3]) * 10000 + Number(m[2]) * 100 + Number(m[1]) : null;
          };
          const ks = dates.map(key).filter((x) => x !== null);
          for (let i = 1; i < ks.length; i++) {
            ok(ks[i] <= ks[i - 1], `giao dịch không xếp mới nhất trước: ${dates.slice(0, 4).join(', ')}`);
          }
        }
      }
    );
  } finally {
    await b.close();
  }
}

module.exports = { run };
