import { createContext, useContext, useEffect, useState, useCallback } from 'react';

/**
 * Nền sáng hoặc nền tối.
 *
 * Lựa chọn nằm ở MỘT thuộc tính data-theme trên <html>, không phải ở lớp
 * `dark:` rải khắp JSX. Nhờ vậy màn hình mới viết ra tự có nền tối, không ai
 * phải nhớ thêm gì.
 *
 * Chưa chọn lần nào thì đi theo hệ điều hành. Bấm một lần là thành lựa chọn
 * của người dùng và app nhớ luôn — không có nấc "theo máy" riêng, vì hai nấc
 * đã đủ và ba nấc thì phải giải thích.
 */
const ThemeContext = createContext({ theme: 'light', setTheme: () => {}, toggle: () => {} });

const STORAGE_KEY = 'moneyflow.theme';

function systemPrefersDark() {
  try {
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  } catch {
    return false;
  }
}

/** Lựa chọn đã lưu, hoặc null nếu người dùng chưa từng chọn. */
function readStored() {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v === 'light' || v === 'dark' ? v : null;
  } catch {
    return null;
  }
}

export function ThemeProvider({ children }) {
  const [chosen, setChosen] = useState(readStored);
  const [systemDark, setSystemDark] = useState(systemPrefersDark);

  // Chưa chọn thì vẫn theo hệ điều hành, kể cả khi người dùng đổi giữa chừng.
  useEffect(() => {
    let mq;
    try {
      mq = window.matchMedia('(prefers-color-scheme: dark)');
    } catch {
      return;
    }
    const onChange = (e) => setSystemDark(e.matches);
    mq.addEventListener?.('change', onChange);
    return () => mq.removeEventListener?.('change', onChange);
  }, []);

  const theme = chosen ?? (systemDark ? 'dark' : 'light');

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  const setTheme = useCallback((next) => {
    if (next !== 'light' && next !== 'dark') return;
    setChosen(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Chế độ riêng tư chặn lưu — vẫn đổi được cho phiên này.
    }
  }, []);

  const toggle = useCallback(() => {
    setTheme(theme === 'dark' ? 'light' : 'dark');
  }, [theme, setTheme]);

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggle }}>{children}</ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
