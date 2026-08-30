export function formatVND(amount) {
  if (amount == null) return '—';
  return new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatNumber(num) {
  if (num == null) return '—';
  return new Intl.NumberFormat('vi-VN').format(Math.round(num));
}

export function formatCompact(amount) {
  if (amount == null) return '—';
  if (amount >= 1000000000) return `${(amount / 1000000000).toFixed(1)} tỷ`;
  if (amount >= 1000000) return `${(amount / 1000000).toFixed(1)} tr`;
  if (amount >= 1000) return `${(amount / 1000).toFixed(1)}K`;
  return formatNumber(amount);
}

export function formatPercent(value) {
  if (value == null) return '—';
  return `${(value * 100).toFixed(2)}%`;
}

export function formatDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  return d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

/**
 * Ngày hôm nay theo giờ địa phương, dạng YYYY-MM-DD.
 *
 * KHÔNG dùng new Date().toISOString().split('T')[0] cho việc này: toISOString()
 * trả về giờ UTC, mà Việt Nam là UTC+7, nên từ 00:00 đến 07:00 giờ Việt Nam nó
 * cho ra ngày HÔM QUA. Giao dịch ghi lúc 6h sáng sẽ bị lùi một ngày, và khoá
 * dạng YYYY-MM sinh vào ngày 1 hàng tháng sẽ trỏ vào tháng trước.
 */
export function todayLocal() {
  return toLocalDateStr(new Date());
}

/** Một đối tượng Date bất kỳ → chuỗi YYYY-MM-DD theo giờ địa phương. */
export function toLocalDateStr(date) {
  const d = date instanceof Date ? date : new Date(date);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Tháng hiện tại theo giờ địa phương, dạng YYYY-MM. */
export function currentMonthKey() {
  return todayLocal().slice(0, 7);
}
