import { NavLink } from 'react-router-dom';
import { ChartBar, Money, TrendUp, ChartLineUp, Gear } from '@phosphor-icons/react';

const NAV = [
  { to: '/', label: 'Tổng Quan', icon: ChartBar },
  { to: '/cashflow', label: 'Dòng Tiền', icon: Money },
  { to: '/investments', label: 'Đầu Tư', icon: TrendUp },
  { to: '/scenarios', label: 'Kịch Bản', icon: ChartLineUp },
  { to: '/settings', label: 'Cài Đặt', icon: Gear },
];

export default function Layout({ children }) {
  return (
    <div className="flex h-screen bg-gray-50">
      {/* Sidebar */}
      <aside className="w-56 bg-white border-r border-gray-200 flex flex-col shrink-0">
        <div className="p-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center">
              <Money size={18} weight="bold" className="text-white" />
            </div>
            <span className="text-lg font-bold bg-gradient-to-r from-emerald-600 to-teal-600 bg-clip-text text-transparent">
              Money_Flow
            </span>
          </div>
        </div>

        <nav className="flex-1 p-3 space-y-1">
          {NAV.map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 ${
                  isActive
                    ? 'bg-primary-50 text-primary-700 shadow-sm'
                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                }`
              }
            >
              <item.icon size={20} weight="regular" />
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="p-3 border-t border-gray-100">
          <div className="text-xs text-gray-400 text-center">Money_Flow v1.0</div>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-7xl mx-auto p-6">
          {children}
        </div>
      </main>
    </div>
  );
}
