import { useState } from 'react';
import ExecutionLog from './ExecutionLog';
import SavingsSection from './SavingsSection';
import SniperPlaybook from './SniperPlaybook';
import AllocationGoals from './dashboard/AllocationGoals';
import { ChartBar, PiggyBank, Crosshair, PieSlice } from '@phosphor-icons/react';

const TABS = [
  { id: 'portfolio', label: 'Danh mục', icon: ChartBar },
  { id: 'savings', label: 'Tiết kiệm', icon: PiggyBank },
  { id: 'sniper', label: 'Bắn Tỉa', icon: Crosshair },
  { id: 'allocation', label: 'Phân bổ', icon: PieSlice },
];

export default function InvestmentsPage() {
  const [tab, setTab] = useState('portfolio');

  return (
    <div className="space-y-6 animate-fadeIn">
      <div className="page-header">
        <h1 className="text-2xl font-bold">Đầu Tư</h1>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              tab === t.id ? 'bg-white text-primary-700 shadow-sm' : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <t.icon size={16} /> {t.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {tab === 'portfolio' && <ExecutionLog />}
      {tab === 'savings' && <SavingsSection />}
      {tab === 'sniper' && <SniperPlaybook />}
      {tab === 'allocation' && <AllocationGoals />}
    </div>
  );
}
