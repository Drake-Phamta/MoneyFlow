/**
 * Bộ component dùng chung. Mỗi thứ ở đây tồn tại vì nó đã bị chép tay ở nhiều
 * chỗ và mỗi bản chép lại thiếu một thứ khác nhau.
 */
import { forwardRef, useId } from 'react';

export { default as Modal } from './Modal.jsx';
export { default as ErrorBoundary } from './ErrorBoundary.jsx';
export { ConfirmProvider, useConfirm } from './ConfirmDialog.jsx';
export { ThemeProvider, useTheme } from './ThemeProvider.jsx';

/* ── Nút ─────────────────────────────────────────────────────────────────── */

const VARIANTS = {
  primary: 'btn-primary',
  secondary: 'btn-secondary',
  ghost: 'btn-ghost',
  success: 'btn-success',
  danger: 'btn-danger',
};

/**
 * Nút có trạng thái `loading` sẵn: người dùng bấm "Lưu" trên mạng chậm mà nút
 * không đổi gì thì họ bấm tiếp, và tháng đó được lưu hai lần.
 */
export const Button = forwardRef(function Button(
  { variant = 'secondary', loading = false, disabled, children, className = '', ...rest },
  ref
) {
  return (
    <button
      ref={ref}
      type="button"
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={`${VARIANTS[variant] || VARIANTS.secondary} ${className}`}
      {...rest}
    >
      {loading ? (
        <span className="inline-flex items-center gap-2">
          <Spinner />
          <span>Đang xử lý…</span>
        </span>
      ) : (
        children
      )}
    </button>
  );
});

function Spinner() {
  return (
    <svg className="animate-spin" width="14" height="14" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

/* ── Ô nhập có nhãn ──────────────────────────────────────────────────────── */

/**
 * Nối <label> với ô nhập bằng id. 45 chỗ trong app có nhãn nhưng không nối,
 * nên bấm vào nhãn không đưa con trỏ vào ô, và trình đọc màn hình đọc ô đó là
 * "hộp văn bản" không tên.
 */
export function Field({ label, hint, error, children, required, className = '' }) {
  const id = useId();
  const describedBy = [hint && `${id}-hint`, error && `${id}-err`].filter(Boolean).join(' ');

  return (
    <div className={className}>
      <label htmlFor={id} className="text-fs-2 text-slate-500 mb-1 block">
        {label}
        {required && <span className="text-red-600 ml-0.5">*</span>}
      </label>
      {typeof children === 'function'
        ? children({ id, 'aria-describedby': describedBy || undefined })
        : children}
      {hint && !error && (
        <p id={`${id}-hint`} className="text-fs-1 text-slate-400 mt-1">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-err`} role="alert" className="text-fs-1 text-red-600 mt-1">
          {error}
        </p>
      )}
    </div>
  );
}

/* ── Trạng thái ──────────────────────────────────────────────────────────── */

/** Khung xám lúc chờ dữ liệu — giữ nguyên chiều cao để trang không nhảy. */
export function Skeleton({ className = '', rows = 1 }) {
  return (
    <div className={className} aria-hidden="true">
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="h-4 bg-slate-100 rounded animate-pulse"
          style={{ marginTop: i ? 8 : 0, width: i === rows - 1 && rows > 1 ? '70%' : '100%' }}
        />
      ))}
    </div>
  );
}

/**
 * Màn hình trống phải MỜI làm gì đó, không chỉ báo là trống. Đây là màn hình
 * đầu tiên người dùng mới nhìn thấy.
 */
export function EmptyState({ title, message, action, icon }) {
  return (
    <div className="text-center py-12">
      {icon && <div className="text-3xl mb-2">{icon}</div>}
      <p className="text-sm font-medium text-slate-600">{title}</p>
      {message && <p className="text-fs-2 text-slate-400 mt-1 max-w-sm mx-auto">{message}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/* ── Số tiền ─────────────────────────────────────────────────────────────── */

/**
 * Mọi số tiền hiển thị đi qua đây: chữ số thẳng cột khi xếp chồng, và
 * `data-value` để test đối chiếu được với API mà không phải đọc chuỗi.
 */
export function Money({ value, className = '', sign = false, testId }) {
  const n = Number(value) || 0;
  const text = new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
    maximumFractionDigits: 0,
  }).format(n);
  return (
    <span className={`tabular ${className}`} data-value={n} data-testid={testId}>
      {sign && n > 0 ? '+' : ''}
      {text}
    </span>
  );
}

/* ── Thẻ tab ─────────────────────────────────────────────────────────────── */

/** Tab đi được bằng phím mũi tên, đúng cách một bộ tab phải hoạt động. */
export function Tabs({ tabs, value, onChange, className = '' }) {
  const onKeyDown = (e) => {
    const i = tabs.findIndex((t) => t.id === value);
    if (i < 0) return;
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault();
      const next = (i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length;
      onChange(tabs[next].id);
    }
  };

  return (
    <div role="tablist" onKeyDown={onKeyDown} className={`flex gap-1 ${className}`}>
      {tabs.map((t) => {
        const active = t.id === value;
        return (
          <button
            key={t.id}
            role="tab"
            type="button"
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(t.id)}
            data-testid={`tab-${t.id}`}
            className={`px-4 py-2 rounded-input text-sm font-medium transition ${
              active ? 'bg-primary-600 text-oncolor' : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

/* ── Dải trạng thái ──────────────────────────────────────────────────────── */

const BANNER_TONES = {
  success: 'bg-emerald-50 border-emerald-200 text-emerald-700',
  error: 'bg-red-50 border-red-200 text-red-700',
  warning: 'bg-amber-50 border-amber-200 text-amber-700',
  info: 'bg-primary-50 border-primary-200 text-primary-700',
};

/**
 * Một dòng báo kết quả. Bốn biến thể từng được chép tay ở mỗi chỗ cần, nên
 * cùng một thông báo lỗi lại có bốn kiểu viền khác nhau.
 */
export function Banner({ tone = 'info', children, className = '' }) {
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={`mt-3 px-3 py-2.5 rounded-input border text-fs-3 ${BANNER_TONES[tone] || BANNER_TONES.info} ${className}`}
    >
      {children}
    </div>
  );
}
