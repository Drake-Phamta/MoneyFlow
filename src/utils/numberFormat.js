/**
 * numberFormat.js — Đọc và viết số theo lối Việt Nam: chấm ngăn nghìn, phẩy
 * ngăn phần thập phân.
 *
 * Có HAI loại số trong app và chúng cần hai cách xử lý khác nhau:
 *   · tiền — luôn là số nguyên đồng, không có phần lẻ
 *   · số lượng — 0,5 chỉ vàng và 12,75 cổ phiếu đều hợp lệ
 *
 * Trước đây cả hai dùng chung một bộ lọc `replace(/\D/g, '')`, tức xoá mọi ký
 * tự không phải chữ số — kể cả dấu phẩy. Người dùng gõ "0,5" chỉ vàng thì ô
 * nhập nuốt dấu phẩy còn lại "05", và hệ thống ghi 5 chỉ. Sai gấp mười lần mà
 * không có gì báo.
 */

/** "1000000" → "1.000.000". Chỉ dùng cho TIỀN. */
export function formatNumberInput(value) {
  const nums = String(value).replace(/\D/g, '');
  if (!nums) return '';
  return nums.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

/** "1.000.000" → 1000000. Chỉ dùng cho TIỀN. */
export function parseNumberInput(value) {
  return parseFloat(String(value).replace(/\./g, '')) || 0;
}

/** Tối đa mấy chữ số sau dấu phẩy cho một số lượng. */
export const QUANTITY_DECIMALS = 4;

/**
 * Giữ lại chữ số và MỘT dấu phẩy khi người dùng đang gõ.
 * Không định dạng ngăn nghìn giữa chừng — chèn dấu chấm trong lúc gõ làm con
 * trỏ nhảy lung tung.
 */
export function sanitizeQuantityInput(value) {
  let s = String(value ?? '').replace(/\./g, ',');
  s = s.replace(/[^\d,]/g, '');

  const first = s.indexOf(',');
  if (first !== -1) {
    // Dấu phẩy thứ hai trở đi là gõ nhầm — bỏ đi.
    s = s.slice(0, first + 1) + s.slice(first + 1).replace(/,/g, '');
    const [whole, frac = ''] = s.split(',');
    s = whole + ',' + frac.slice(0, QUANTITY_DECIMALS);
  }
  return s;
}

/** "0,5" → 0.5 · "12" → 12 · "" → 0 */
export function parseQuantityInput(value) {
  const s = sanitizeQuantityInput(value).replace(',', '.');
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}

/** 0.5 → "0,5" · 12 → "12" — bỏ số 0 thừa ở đuôi. */
export function formatQuantity(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '';
  const s = n.toFixed(QUANTITY_DECIMALS).replace(/0+$/, '').replace(/\.$/, '');
  return s.replace('.', ',');
}
