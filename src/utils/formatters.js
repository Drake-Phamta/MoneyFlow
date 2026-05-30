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
