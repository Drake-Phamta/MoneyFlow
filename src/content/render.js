/**
 * render.js — Công cụ dựng chữ cho lớp nội dung.
 *
 * Mọi con số xuất hiện trong văn bản hướng dẫn đều phải đi qua đây, để một
 * chỗ đổi cách viết là cả hệ thống đổi theo. Không nơi nào trong src/content/
 * được tự gọi Intl hay tự nối chuỗi tiền.
 */

/** 12.500.000 → "12,5tr" · 3.000.000.000 → "3 tỷ" · 850.000 → "850k" */
export function money(n) {
  const v = Number(n) || 0;
  const sign = v < 0 ? '−' : '';
  const a = Math.abs(v);
  if (a >= 1e9) return `${sign}${trim(a / 1e9)} tỷ`;
  if (a >= 1e6) return `${sign}${trim(a / 1e6)}tr`;
  if (a >= 1e3) return `${sign}${trim(a / 1e3)}k`;
  return `${sign}${Math.round(a)}đ`;
}

/** Số tiền đầy đủ, dùng khi người dùng cần đối chiếu từng đồng. */
export function vnd(n) {
  return new Intl.NumberFormat('vi-VN').format(Math.round(Number(n) || 0)) + 'đ';
}

/** 0.115 → "11,5%" · 0.7 → "70%" */
export function pct(ratio, digits = 1) {
  const v = (Number(ratio) || 0) * 100;
  return `${trim(v, digits)}%`;
}

/** Bỏ số 0 thừa sau dấu phẩy và dùng dấu phẩy thập phân kiểu Việt. */
function trim(v, digits = 1) {
  const r = Number(v.toFixed(digits));
  return String(r).replace('.', ',');
}

/** "3 tháng" · "1 năm 6 tháng" — dùng cho mốc thời gian trong hướng dẫn. */
export function months(n) {
  const m = Math.max(0, Math.round(Number(n) || 0));
  if (m < 12) return `${m} tháng`;
  const y = Math.floor(m / 12);
  const rest = m % 12;
  return rest ? `${y} năm ${rest} tháng` : `${y} năm`;
}

/** Ghép danh sách theo lối tiếng Việt: "A, B và C". */
export function list(items) {
  const xs = items.filter(Boolean);
  if (xs.length <= 1) return xs[0] || '';
  return `${xs.slice(0, -1).join(', ')} và ${xs[xs.length - 1]}`;
}

/** Nối các dòng đã lọc rỗng thành một khối văn bản. */
export function lines(...xs) {
  return xs.flat().filter((x) => x !== null && x !== undefined && x !== '').join('\n');
}

/** 14.9 → "14,9" — dấu thập phân kiểu Việt, không phải kiểu Anh. */
export function num(v, digits = 1) {
  const n = Number(v);
  if (!isFinite(n)) return '—';
  return String(Number(n.toFixed(digits))).replace('.', ',');
}

/** "2026-11-04" → "04/11/2026" */
export function date(iso) {
  const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : String(iso || '');
}
