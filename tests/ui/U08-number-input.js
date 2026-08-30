/**
 * U08 — Ô nhập số không được ăn mất dấu thập phân.
 *
 * Ô nhập tiền lọc bằng `replace(/\D/g, '')` — xoá mọi ký tự không phải chữ số.
 * Cùng ô đó từng được dùng cho SỐ LƯỢNG, nên ghi mua 0,5 chỉ vàng thì dấu phẩy
 * biến mất và hệ thống lưu 5 chỉ. Sai gấp mười lần, không có gì báo.
 *
 * Bộ này kiểm cả hàm thuần lẫn ô nhập thật trên màn hình.
 */
const { group, t, ok, eq } = require('../rig/assert');
const { reset } = require('../rig/reset');
const { Browser } = require('./_browser');

let N = null;
async function lib() {
  if (!N) N = await import('../../src/utils/numberFormat.js');
  return N;
}

async function run() {
  group('U08 — Ô nhập số');
  await reset();

  const n = await lib();

  await t(
    'UI-Q-01',
    'Số lượng giữ được phần thập phân, gõ kiểu nào cũng hiểu',
    [],
    () => {
      for (const [input, want] of [
        ['0,5', 0.5],
        ['0.5', 0.5], // gõ dấu chấm cũng hiểu là thập phân
        ['1,25', 1.25],
        ['12', 12],
        ['', 0],
        ['0,12345', 0.1234], // cắt còn 4 chữ số sau dấu phẩy
      ]) {
        eq(
          n.parseQuantityInput(input),
          want,
          `gõ "${input}" phải ra ${want}`
        );
      }
    }
  );

  await t(
    'UI-Q-02',
    'Số lượng hiện lại đúng kiểu Việt, không thừa số 0',
    [],
    () => {
      eq(n.formatQuantity(0.5), '0,5', 'nửa chỉ vàng');
      eq(n.formatQuantity(12), '12', 'số nguyên không có phần lẻ');
      eq(n.formatQuantity(1.25), '1,25', 'hai chữ số sau dấu phẩy');
    }
  );

  await t(
    'UI-Q-03',
    'Tiền vẫn là số nguyên đồng, không nhận phần lẻ',
    [],
    () => {
      // Tiền Việt không có phần lẻ; giữ nguyên hành vi cũ cho ô tiền.
      eq(n.parseNumberInput('1.000.000'), 1000000, 'chấm là dấu ngăn nghìn');
      eq(n.formatNumberInput('1000000'), '1.000.000', 'ngăn nghìn khi hiển thị');
    }
  );

  const b = await new Browser().open();
  try {
    await t
      (
      'UI-Q-04',
      'Gõ 0,5 vào ô số lượng thật trên màn hình thì nó giữ nguyên 0,5',
      ['ui:transactions.get'],
      async () => {
        await b.goto('/investments?tab=portfolio');

        // Mở biểu mẫu thêm giao dịch.
        const opened = await b.rec.page.evaluate(() => {
          const btn = [...document.querySelectorAll('button')].find((x) =>
            /thêm lệnh/i.test(x.innerText || '')
          );
          if (!btn) return false;
          btn.click();
          return true;
        });
        ok(opened, 'không tìm thấy nút thêm giao dịch');
        await new Promise((r) => setTimeout(r, 500));

        const typed = await b.rec.page.evaluate(() => {
          const label = [...document.querySelectorAll('label')].find((l) =>
            /số lượng/i.test(l.innerText || '')
          );
          const input = label?.parentElement?.querySelector('input');
          if (!input) return null;

          const setter = Object.getOwnPropertyDescriptor(
            window.HTMLInputElement.prototype,
            'value'
          ).set;
          setter.call(input, '0,5');
          input.dispatchEvent(new Event('input', { bubbles: true }));
          return input.value;
        });

        ok(typed !== null, 'không tìm thấy ô nhập số lượng');
        eq(
          typed,
          '0,5',
          `gõ "0,5" mà ô hiển thị "${typed}" — dấu phẩy bị nuốt, ` +
            `nửa chỉ vàng sẽ được ghi thành năm chỉ`
        );
      }
    );
  } finally {
    await b.close();
  }
}

module.exports = { run };
