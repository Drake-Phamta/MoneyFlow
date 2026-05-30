import { useState, useEffect } from 'react';

function formatWithDots(value) {
  const nums = value.replace(/\D/g, '');
  if (!nums) return '';
  return nums.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

export default function FormattedInput({ value, onChange, onBlur, placeholder, className, disabled }) {
  const [isFocused, setIsFocused] = useState(false);
  const [displayValue, setDisplayValue] = useState('');

  useEffect(() => {
    if (!isFocused) {
      setDisplayValue(value != null && value !== '' ? formatWithDots(String(value)) : '');
    }
  }, [value, isFocused]);

  function handleFocus(e) {
    setIsFocused(true);
    setDisplayValue(value ? formatWithDots(String(value)) : '');
    setTimeout(() => e.target.select(), 0);
  }

  function handleBlur(e) {
    setIsFocused(false);
    const raw = e.target.value.replace(/\D/g, '');
    const num = parseFloat(raw) || 0;
    setDisplayValue(raw ? formatWithDots(raw) : '');
    onChange(num);
    if (onBlur) onBlur(num);
  }

  function handleChange(e) {
    const raw = e.target.value.replace(/\D/g, '');
    setDisplayValue(formatWithDots(raw));
    const num = parseFloat(raw) || 0;
    onChange(num);
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter') {
      e.target.blur();
    }
  }

  return (
    <input
      type="text"
      inputMode="numeric"
      value={displayValue || ''}
      onChange={handleChange}
      onFocus={handleFocus}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
      placeholder={placeholder || '0'}
      disabled={disabled}
      className={className}
    />
  );
}
