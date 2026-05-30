import { formatNumberInput, parseNumberInput } from '../utils/numberFormat';

export default function FormattedInput({ value, onChange, placeholder, className = '', ...props }) {
  const displayValue = formatNumberInput(value);

  function handleChange(e) {
    const raw = e.target.value;
    const num = parseNumberInput(raw);
    onChange(num);
  }

  return (
    <input
      type="text"
      value={displayValue}
      onChange={handleChange}
      placeholder={placeholder || '0'}
      className={`input ${className}`}
      {...props}
    />
  );
}
