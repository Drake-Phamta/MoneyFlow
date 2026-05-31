import { NavLink } from 'react-router-dom';
import { SquaresFour, ArrowsLeftRight, ChartLineUp, BookOpen, Gear, TrendUp } from '@phosphor-icons/react';

const navItems = [
  { path: '/', label: 'Tổng Quan', Icon: SquaresFour },
  { path: '/cashflow', label: 'Dòng Tiền', Icon: ArrowsLeftRight },
  { path: '/investments', label: 'Đầu Tư', Icon: ChartLineUp },
  { path: '/scenarios', label: 'Kịch Bản', Icon: BookOpen },
  { path: '/settings', label: 'Cài Đặt', Icon: Gear },
];

export default function Layout({ children }) {
  return (
    <div className="flex h-screen w-screen bg-slate-50">
      {/* Sidebar */}
      <aside className="w-64 bg-white border-r border-slate-200 flex flex-col shrink-0">
        {/* Logo */}
        <div className="p-5 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-sm">
              <TrendUp size={22} color="white" weight="bold" />
            </div>
            <div>
              <h1 className="text-base font-bold text-slate-800 tracking-tight">Money_Flow</h1>
              <p className="text-[11px] text-slate-400">Quản lý tài chính cá nhân</p>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 py-3 px-3 overflow-y-auto">
          <div className="space-y-0.5">
            {navItems.map(({ path, label, Icon }) => (
              <NavLink
                key={path}
                to={path}
                end={path === '/'}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 ${
                    isActive
                      ? 'bg-primary-50 text-primary-700 shadow-sm'
                      : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'
                  }`
                }
              >
                <Icon size={18} weight="regular" />
                <span>{label}</span>
              </NavLink>
            ))}
          </div>
        </nav>

        {/* Footer */}
        <div className="p-4 border-t border-slate-100">
          <p className="text-[10px] text-slate-300 text-center">Phiên bản 1.0</p>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-y-auto">
        <div className="w-full max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 py-6 min-w-0">
          {children}
        </div>
      </main>
    </div>
  );
}
