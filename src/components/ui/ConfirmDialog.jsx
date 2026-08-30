import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import Modal from './Modal.jsx';

/**
 * Thay 26 chỗ gọi alert() và confirm() gốc của trình duyệt.
 *
 * Hộp thoại gốc có ba vấn đề với một app quản lý tiền:
 *   · nó khoá cả tiến trình, nên không kịp hiện số liệu người dùng cần để
 *     quyết định — "Xoá tháng này?" mà không nói xoá bao nhiêu tiền
 *   · trong Electron nó trông như hộp thoại của hệ điều hành, không phải của app
 *   · không kiểm thử được
 *
 * Dùng: `const confirm = useConfirm()` rồi `if (await confirm({...})) { ... }`
 */
const ConfirmContext = createContext(null);

export function ConfirmProvider({ children }) {
  const [state, setState] = useState(null);
  const resolveRef = useRef(null);

  const close = useCallback((result) => {
    resolveRef.current?.(result);
    resolveRef.current = null;
    setState(null);
  }, []);

  const confirm = useCallback((opts) => {
    return new Promise((resolve) => {
      resolveRef.current = resolve;
      setState({
        title: 'Xác nhận',
        confirmLabel: 'Đồng ý',
        cancelLabel: 'Huỷ',
        tone: 'default',
        ...(typeof opts === 'string' ? { message: opts } : opts),
      });
    });
  }, []);

  /** Chỉ báo tin, không hỏi gì. Thay cho alert(). */
  const notify = useCallback(
    (opts) =>
      confirm({
        confirmLabel: 'Đã hiểu',
        cancelLabel: null,
        ...(typeof opts === 'string' ? { message: opts } : opts),
      }),
    [confirm]
  );

  const value = useMemo(() => ({ confirm, notify }), [confirm, notify]);

  return (
    <ConfirmContext.Provider value={value}>
      {children}
      <Modal
        open={!!state}
        onClose={() => close(false)}
        title={state?.title}
        size="sm"
        closeOnBackdrop={state?.cancelLabel !== null}
        footer={
          <>
            {state?.cancelLabel !== null && (
              <button type="button" className="btn-secondary" onClick={() => close(false)}>
                {state?.cancelLabel}
              </button>
            )}
            <button
              type="button"
              className={state?.tone === 'danger' ? 'btn bg-red-600 text-white hover:bg-red-700' : 'btn-primary'}
              onClick={() => close(true)}
            >
              {state?.confirmLabel}
            </button>
          </>
        }
      >
        {state?.message && (
          <p className="text-sm text-slate-600 whitespace-pre-line">{state.message}</p>
        )}

        {/* Chỗ để nói RÕ hậu quả bằng con số, thứ confirm() gốc không làm được. */}
        {state?.details?.length > 0 && (
          <div className="mt-3 bg-slate-50 border border-slate-200 rounded-input divide-y divide-slate-200">
            {state.details.map((d, i) => (
              <div key={i} className="flex items-center justify-between px-3 py-2">
                <span className="text-fs-2 text-slate-500">{d.label}</span>
                <span className="text-fs-3 font-semibold text-slate-700 tabular">{d.value}</span>
              </div>
            ))}
          </div>
        )}

        {state?.warning && (
          <p className="mt-3 text-fs-2 text-amber-700 bg-amber-50 border border-amber-200 rounded-input px-3 py-2">
            {state.warning}
          </p>
        )}
      </Modal>
    </ConfirmContext.Provider>
  );
}

/**
 * Trả về { confirm, notify }. Ngoài cây provider thì rơi về hộp thoại gốc để
 * không màn hình nào chết chỉ vì thiếu provider.
 */
export function useConfirm() {
  const ctx = useContext(ConfirmContext);
  if (ctx) return ctx;
  return {
    confirm: async (o) => window.confirm(typeof o === 'string' ? o : o?.message || ''),
    notify: async (o) => {
      window.alert(typeof o === 'string' ? o : o?.message || '');
      return true;
    },
  };
}
