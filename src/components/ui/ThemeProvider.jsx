import { createContext, useContext, useEffect, useState, useCallback } from 'react';

/**
 * Nền sáng / nền tối / theo hệ thống.
 *
 * Lựa chọn nằm ở MỘT thuộc tính data-theme trên <html>, không phải ở lớp
 * `dark:` rải khắp JSX. Nhờ vậy màn hình mới viết ra tự có nền tối, không ai
 * phải nhớ thêm gì.
 */
const ThemeContext = createContext({ theme: 'system', resolved: 'light', setTheme: () => {} });

const STORAGE_KEY = 'moneyflow.theme';
const VALID = ['light', 'dark', 'system'];

function readStored() {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return VALID.includes(v) ? v : 'system';
  } catch {
    return 'system';
  }
}

function systemPrefersDark() {
  try {
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  } catch {
    return false;
  }
}

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(readStored);
  const [systemDark, setSystemDark] = useState(systemPrefersDark);

  // Theo hệ thống thì phải theo cả khi người dùng đổi giữa chừng.
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

  const resolved = theme === 'system' ? (systemDark ? 'dark' : 'light') : theme;

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'system') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', theme);
  }, [theme]);

  const setTheme = useCallback((next) => {
    if (!VALID.includes(next)) return;
    setThemeState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Chế độ riêng tư chặn lưu — vẫn đổi được cho phiên này.
    }
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, resolved, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
