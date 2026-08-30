import { useState, useEffect } from 'react';
import {
  formatNumberInput as formatWithDots,
  sanitizeQuantityInput,
  parseQuantityInput,
  formatQuantity,
} from '../utils/numberFormat';

/**
 * Ô nhập TIỀN. Số nguyên đồng, chấm ngăn nghìn.
 *
 * Đừng dùng ô này cho số lượng: nó lọc bỏ mọi ký tự không phải chữ số, nên
 * dấu phẩy thập phân biến mất. Số lượng dùng QuantityInput bên dưới.
 */
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
    if (e.key === 'Enter') e.target.blur();
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

/**
 * Ô nhập SỐ LƯỢNG. Cho phép dấu phẩy thập phân.
 *
 * 0,5 chỉ vàng và 12,75 chứng chỉ quỹ đều là số lượng hợp lệ. Ô nhập tiền
 * xoá dấu phẩy nên "0,5" thành 5 — sai gấp mười lần.
 */
export function QuantityInput({
  value,
  onChange,
  onBlur,
  placeholder,
  className,
  disabled,
  unit,
  id,
  'aria-describedby': describedBy,
}) {
  const [isFocused, setIsFocused] = useState(false);
  const [text, setText] = useState('');

  useEffect(() => {
    if (!isFocused) {
      setText(value === '' || value == null ? '' : formatQuantity(value));
    }
  }, [value, isFocused]);

  function handleChange(e) {
    const next = sanitizeQuantityInput(e.target.value);
    setText(next);
    onChange(parseQuantityInput(next));
  }

  function handleBlur() {
    setIsFocused(false);
    const n = parseQuantityInput(text);
    setText(text === '' ? '' : formatQuantity(n));
    onChange(n);
    if (onBlur) onBlur(n);
  }

  return (
    <span className="relative block">
      <input
        id={id}
        aria-describedby={describedBy}
        type="text"
        inputMode="decimal"
        value={text}
        onChange={handleChange}
        onFocus={(e) => {
          setIsFocused(true);
          setTimeout(() => e.target.select(), 0);
        }}
        onBlur={handleBlur}
        onKeyDown={(e) => e.key === 'Enter' && e.target.blur()}
        placeholder={placeholder || '0'}
        disabled={disabled}
        className={className}
      />
      {unit && (
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-fs-2 text-slate-400 pointer-events-none">
          {unit}
        </span>
      )}
    </span>
  );
}
