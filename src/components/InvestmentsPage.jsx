import { useState } from 'react';
import ExecutionLog from './ExecutionLog';
import SniperPlaybook from './SniperPlaybook';
import SavingsSection from './SavingsSection';
import AllocationGoals from './dashboard/AllocationGoals';
import { ChartLineUp, Bank, CrosshairSimple, ListChecks } from '@phosphor-icons/react';

const TABS = [
  { id: 'portfolio', label: 'Danh mục', Icon: ChartLineUp },
  { id: 'savings', label: 'Tiết kiệm', Icon: Bank },
  { id: 'sniper', label: 'Bắn Tỉa', Icon: CrosshairSimple },
  { id: 'allocation', label: 'Phân bổ', Icon: ListChecks },
];

const TAB_DESCRIPTIONS = {
  portfolio: 'Cổ phiếu, ETF, Vàng, Crypto — tài sản có giá thị trường',
  savings: 'Sổ tiết kiệm ngân hàng, trái phiếu — theo dõi lãi suất & đáo hạn',
  sniper: 'Chiến lược bắn tỉa — chờ dip mua, quản lý watchlist & alert',
  allocation: 'So sánh phân bổ thực tế vs mục tiêu theo giai đoạn',
};

export default function InvestmentsPage() {
  const [activeTab, setActiveTab] = useState('portfolio');

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title">Đầu Tư</h1>
          <p className="page-subtitle">Quản lý danh mục, tiết kiệm và cơ hội đầu tư</p>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 bg-slate-100 rounded-xl p-1 w-fit">
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-5 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-1.5 ${
              activeTab === tab.id
                ? 'bg-white text-slate-800 shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <tab.Icon size={16} weight="regular" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab description */}
      <p className="text-xs text-slate-400">{TAB_DESCRIPTIONS[activeTab]}</p>

      {/* Tab content */}
      {activeTab === 'portfolio' && <ExecutionLog embedded />}
      {activeTab === 'savings' && <SavingsSection />}
      {activeTab === 'sniper' && <SniperPlaybook embedded />}
      {activeTab === 'allocation' && <AllocationGoals />}
    </div>
  );
}
