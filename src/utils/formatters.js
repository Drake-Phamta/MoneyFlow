export function formatVND(amount) {
  if (amount == null || isNaN(amount)) return '0 ₫';
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(amount);
}

export function formatNumber(num) {
  if (num == null || isNaN(num)) return '0';
  return new Intl.NumberFormat('vi-VN').format(num);
}

export function formatCompact(num) {
  if (num == null || isNaN(num)) return '0';
  if (num >= 1e9) return (num / 1e9).toFixed(1) + 'B';
  if (num >= 1e6) return (num / 1e6).toFixed(1) + 'M';
  if (num >= 1e3) return (num / 1e3).toFixed(1) + 'K';
  return num.toString();
}

export function formatPercent(num) {
  if (num == null || isNaN(num)) return '0%';
  return num.toFixed(1) + '%';
}

export function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleDateString('vi-VN');
}
