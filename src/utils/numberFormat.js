// Format number string with dot separators (Vietnamese convention: 1.000.000)
export function formatNumberInput(value) {
  const nums = String(value).replace(/\D/g, '');
  if (!nums) return '';
  return nums.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

// Parse formatted string back to number: "1.000.000" → 1000000
export function parseNumberInput(value) {
  return parseFloat(String(value).replace(/\./g, '')) || 0;
}
