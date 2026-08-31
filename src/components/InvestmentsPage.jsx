import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Tabs } from './ui/index.jsx';
import ExecutionLog from './ExecutionLog';
import SniperPlaybook from './SniperPlaybook';
import SavingsSection from './SavingsSection';
import AllocationGoals from './dashboard/AllocationGoals';
// Bốn tab này từng khai thêm trường `Icon`, nhưng `Tabs` chưa bao giờ vẽ nó —
// và hai bộ tab kia (Dòng tiền, Lộ trình) cũng không có icon. Bỏ trường chết
// đi thay vì vẽ icon cho riêng một chỗ.
const TABS = [
  { id: 'portfolio', label: 'Giao dịch' },
  { id: 'savings', label: 'Tiết kiệm' },
  { id: 'sniper', label: 'Bắn Tỉa' },
  { id: 'allocation', label: 'Phân bổ' },
];

const TAB_DESCRIPTIONS = {
  portfolio: 'Cổ phiếu, chứng chỉ quỹ, vàng — tài sản có giá thị trường',
  savings: 'Sổ tiết kiệm ngân hàng, trái phiếu — theo dõi lãi suất & đáo hạn',
  sniper: 'Chờ mã giảm sâu mới mua — danh sách theo dõi và cảnh báo giá',
  allocation: 'Phân bổ thực tế so với tỷ lệ mục tiêu của giai đoạn',
};

export default function InvestmentsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState(searchParams.get('tab') || 'portfolio');

  // Sync URL when tab changes
  useEffect(() => {
    setSearchParams({ tab: activeTab }, { replace: true });
  }, [activeTab, setSearchParams]);

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title">Đầu tư</h1>
          <p className="page-subtitle">Quản lý danh mục, tiết kiệm và cơ hội đầu tư</p>
        </div>
      </div>

      {/* Tab bar */}
      <Tabs tabs={TABS} value={activeTab} onChange={setActiveTab} />

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
