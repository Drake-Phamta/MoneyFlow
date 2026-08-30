import { useEffect, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { SquaresFour, ArrowsLeftRight, ChartLineUp, BookOpen, Gear } from '../utils/iconMap';
import { useTheme } from './ui/index.jsx';

const navItems = [
  { path: '/', label: 'Tổng quan', Icon: SquaresFour },
  { path: '/cashflow', label: 'Dòng tiền', Icon: ArrowsLeftRight },
  { path: '/investments', label: 'Đầu tư', Icon: ChartLineUp },
  { path: '/scenarios', label: 'Lộ trình', Icon: BookOpen },
  { path: '/settings', label: 'Cài đặt', Icon: Gear },
];

const RAIL_KEY = 'moneyflow.sidebar';

export default function Layout({ children }) {
  // Thu gọn thanh bên: cửa sổ 1000px thì 264px cho điều hướng là quá nhiều,
  // bảng số liệu bị ép đến mức phải cuộn ngang.
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(RAIL_KEY) === '1';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(RAIL_KEY, collapsed ? '1' : '0');
    } catch {
      // Chế độ riêng tư chặn lưu — vẫn thu gọn được cho phiên này.
    }
  }, [collapsed]);

  // Cửa sổ hẹp thì tự thu, nhưng không ghi đè lựa chọn của người dùng khi rộng.
  useEffect(() => {
    const onResize = () => {
      if (window.innerWidth < 1100) setCollapsed(true);
    };
    onResize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  return (
    <div className="flex h-screen w-screen bg-page overflow-hidden relative">
      {/* Vùng kéo cửa sổ, chừa 150px bên phải cho nút điều khiển của hệ điều hành */}
      <div
        className="absolute top-0 left-0 right-[150px] h-9 z-40 select-none"
        style={{ WebkitAppRegion: 'drag' }}
      />

      <a
        href="#noi-dung"
        className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:top-2 focus:left-2 focus:bg-white focus:px-3 focus:py-2 focus:rounded-input focus:shadow-lg text-sm"
      >
        Bỏ qua điều hướng
      </a>

      <aside
        className={`${
          collapsed ? 'w-[68px]' : 'w-64'
        } bg-white border-r border-slate-200 flex flex-col shrink-0 pt-6 transition-[width] duration-200`}
      >
        <div className={`${collapsed ? 'px-3' : 'p-5'} pb-4 border-b border-slate-100`}>
          <div className="flex items-center gap-3">
            <img src="/icon.png" alt="" className="w-10 h-10 rounded-xl shadow-sm shrink-0" />
            {!collapsed && (
              <div className="min-w-0">
                <h1 className="text-base font-bold text-slate-800 tracking-tight">Money Flow</h1>
                <p className="text-fs-1 text-slate-400 truncate">Quản lý tài chính cá nhân</p>
              </div>
            )}
          </div>
        </div>

        <nav className="flex-1 py-3 px-3 overflow-y-auto" aria-label="Điều hướng chính">
          <div className="space-y-0.5">
            {navItems.map(({ path, label, Icon }) => (
              <NavLink
                key={path}
                to={path}
                end={path === '/'}
                title={collapsed ? label : undefined}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2.5 rounded-input text-sm font-medium transition-all duration-200 ${
                    collapsed ? 'justify-center' : ''
                  } ${
                    isActive
                      ? 'bg-primary-50 text-primary-700 shadow-sm'
                      : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700'
                  }`
                }
              >
                <Icon size={18} weight="regular" />
                {!collapsed && <span>{label}</span>}
              </NavLink>
            ))}
          </div>
        </nav>

        <div className="p-3 border-t border-slate-100 space-y-2">
          <ThemeToggle collapsed={collapsed} />
          <button
            type="button"
            onClick={() => setCollapsed((v) => !v)}
            aria-expanded={!collapsed}
            data-testid="sidebar-toggle"
            className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-input text-fs-2 text-slate-500 hover:bg-slate-100 transition"
          >
            <span aria-hidden="true">{collapsed ? '›' : '‹'}</span>
            {!collapsed && <span>Thu gọn</span>}
          </button>
        </div>
      </aside>

      <main id="noi-dung" className="flex-1 overflow-y-auto overflow-x-hidden">
        <div className="w-full max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 pt-10 pb-6 min-w-0">
          {children}
        </div>
      </main>
    </div>
  );
}

/** Ba trạng thái, không phải công tắc hai nấc: sáng · tối · theo máy. */
function ThemeToggle({ collapsed }) {
  const { theme, setTheme } = useTheme();
  const options = [
    { id: 'light', label: 'Sáng', glyph: '☀' },
    { id: 'dark', label: 'Tối', glyph: '☾' },
    { id: 'system', label: 'Theo máy', glyph: '◐' },
  ];

  if (collapsed) {
    const i = options.findIndex((o) => o.id === theme);
    const next = options[(i + 1) % options.length];
    return (
      <button
        type="button"
        onClick={() => setTheme(next.id)}
        title={`Giao diện: ${options[i]?.label}. Bấm để chuyển sang ${next.label}.`}
        data-testid="theme-toggle"
        className="w-full flex items-center justify-center px-3 py-2 rounded-input text-slate-500 hover:bg-slate-100 transition"
      >
        <span aria-hidden="true">{options[i]?.glyph}</span>
        <span className="sr-only">Đổi giao diện</span>
      </button>
    );
  }

  return (
    <div role="group" aria-label="Giao diện" className="flex gap-1" data-testid="theme-toggle">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          onClick={() => setTheme(o.id)}
          aria-pressed={theme === o.id}
          title={o.label}
          className={`flex-1 px-2 py-1.5 rounded-input text-fs-1 transition ${
            theme === o.id
              ? 'bg-primary-50 text-primary-700 font-medium'
              : 'text-slate-400 hover:bg-slate-100'
          }`}
        >
          <span aria-hidden="true" className="mr-1">
            {o.glyph}
          </span>
          {o.label}
        </button>
      ))}
    </div>
  );
}
