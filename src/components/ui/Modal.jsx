import { useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';

/**
 * Cửa sổ phủ, dùng chung cho mọi hộp thoại.
 *
 * Ba thứ mọi hộp thoại trong app đều thiếu, và thiếu ở từng chỗ một:
 *   · Escape đóng được
 *   · Tab không chạy ra ngoài hộp rồi lạc vào trang phía sau
 *   · trang phía sau không cuộn khi lăn chuột trên hộp
 * Gom về một chỗ thì không hộp nào có thể quên.
 */
const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export default function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
  closeOnBackdrop = true,
  labelledBy,
}) {
  const boxRef = useRef(null);
  const restoreRef = useRef(null);

  const focusFirst = useCallback(() => {
    const box = boxRef.current;
    if (!box) return;
    const items = box.querySelectorAll(FOCUSABLE);
    (items[0] || box).focus?.();
  }, []);

  useEffect(() => {
    if (!open) return;

    restoreRef.current = document.activeElement;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose?.();
        return;
      }
      if (e.key !== 'Tab') return;

      const box = boxRef.current;
      if (!box) return;
      const items = [...box.querySelectorAll(FOCUSABLE)].filter(
        (el) => el.offsetParent !== null
      );
      if (!items.length) {
        e.preventDefault();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown, true);
    const id = requestAnimationFrame(focusFirst);

    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      cancelAnimationFrame(id);
      document.body.style.overflow = prevOverflow;
      // Trả tiêu điểm về đúng chỗ người dùng đang đứng trước khi mở hộp.
      restoreRef.current?.focus?.();
    };
  }, [open, onClose, focusFirst]);

  if (!open) return null;

  const width =
    size === 'sm' ? 'max-w-sm' : size === 'lg' ? 'max-w-2xl' : size === 'xl' ? 'max-w-4xl' : 'max-w-md';

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgb(var(--c-shadow) / 0.45)', backdropFilter: 'blur(2px)' }}
      onMouseDown={(e) => {
        if (closeOnBackdrop && e.target === e.currentTarget) onClose?.();
      }}
    >
      <div
        ref={boxRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy || (title ? 'modal-title' : undefined)}
        tabIndex={-1}
        className={`bg-white rounded-card shadow-2xl w-full ${width} max-h-[88vh] overflow-y-auto animate-fade-in outline-none`}
      >
        {(title || description) && (
          <div className="px-6 pt-6 pb-3">
            {title && (
              <h3 id="modal-title" className="text-base font-bold text-slate-800">
                {title}
              </h3>
            )}
            {description && <p className="text-fs-3 text-slate-500 mt-1">{description}</p>}
          </div>
        )}

        <div className="px-6 pb-4">{children}</div>

        {footer && (
          <div className="px-6 py-4 border-t border-slate-100 flex gap-2 justify-end">{footer}</div>
        )}
      </div>
    </div>,
    document.body
  );
}
