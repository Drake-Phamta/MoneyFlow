export function formatNumberInput(value) {
  if (value == null || value === '') return '';
  const num = typeof value === 'string' ? parseInt(value.replace(/\./g, ''), 10) : value;
  if (isNaN(num)) return '';
  return num.toLocaleString('vi-VN');
}

export function parseNumberInput(value) {
  if (!value) return 0;
  return parseInt(String(value).replace(/\./g, ''), 10) || 0;
}
