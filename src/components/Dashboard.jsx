import { useState, useEffect } from 'react';
import { apiClient } from '../utils/apiClient';
import { formatVND, formatPercent, formatDate } from '../utils/formatters';
import { TrendUp, TrendDown, Wallet, PiggyBank, ShieldCheck, ChartBar } from '@phosphor-icons/react';
import AllocationPie from './charts/AllocationPie';

export default function Dashboard() {
  const [data, setData] = useState({
    params: [], portfolio: null, timeline: [], allocations: [],
    phase: null, activity: [], savings: [],
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    try {
      const [params, portfolio, timeline, phase, activity, savings, allAllocs] = await Promise.all([
        apiClient.params.get(),
        apiClient.portfolio.summary(),
        apiClient.timeline.get(6),
        apiClient.phases.getActive(),
        apiClient.activity.get(10),
        apiClient.savings.get(),
        apiClient.allocations.getAll(),
      ]);
      setData({ params, portfolio, timeline: timeline.reverse(), phase, activity, savings, allocations: allAllocs });
    } catch (e) { console.error(e); }
    setLoading(false);
  }

  const getParam = (key) => data.params.find(p => p.key === key)?.value || '0';
  const monthlyIncome = parseFloat(getParam('monthly_income'));
  const totalInvested = data.portfolio?.totalInvested || 0;
  const totalValue = data.portfolio?.totalCurrentValue || 0;
  const totalGain = data.portfolio?.totalGain || 0;
  const totalSavings = data.savings.reduce((s, a) => s + (a.principal || 0), 0);
  const gainPct = totalInvested > 0 ? ((totalValue - totalInvested) / totalInvested) * 100 : 0;

  if (loading) return <div className="flex items-center justify-center h-64"><div className="text-gray-400">Đang tải...</div></div>;

  return (
    <div className="space-y-6 animate-fadeIn">
      <div className="page-header">
        <h1 className="text-2xl font-bold">Tổng Quan</h1>
        <span className="text-sm text-gray-500">{formatDate(new Date().toISOString())}</span>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <KPI icon={<Wallet size={20} className="text-blue-600" />} label="Tổng tài sản" value={formatVND(totalValue + totalSavings)} color="blue" />
        <KPI icon={<ChartBar size={20} className="text-purple-600" />} label="Đã đầu tư" value={formatVND(totalInvested)} color="purple" />
        <KPI icon={<TrendUp size={20} className={totalGain >= 0 ? 'text-emerald-600' : 'text-red-600' />} label="Giá trị hiện tại" value={formatVND(totalValue)} color={totalGain >= 0 ? 'emerald' : 'red'} />
        <KPI icon={totalGain >= 0 ? <TrendUp size={20} className="text-emerald-600" /> : <TrendDown size={20} className="text-red-600" />} label="Lãi/Lỗ" value={`${totalGain >= 0 ? '+' : ''}${formatVND(totalGain)} (${formatPercent(gainPct)})`} color={totalGain >= 0 ? 'emerald' : 'red'} />
        <KPI icon={<PiggyBank size={20} className="text-violet-600" />} label="Tiết kiệm" value={formatVND(totalSavings)} color="violet" />
        <KPI icon={<ShieldCheck size={20} className="text-teal-600" />} label="Tỷ lệ tiết kiệm" value={monthlyIncome > 0 ? formatPercent((totalSavings / monthlyIncome) * 100) : '0%'} color="teal" />
      </div>

      {/* Portfolio + Allocation */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Portfolio */}
        <div className="card">
          <h3 className="font-semibold mb-3">Danh mục đầu tư</h3>
          {data.portfolio?.portfolio?.length > 0 ? (
            <table className="table">
              <thead><tr><th>Tài sản</th><th>KL</th><th>Giá</th><th>Lãi/Lỗ</th></tr></thead>
              <tbody>
                {data.portfolio.portfolio.map(p => {
                  const val = p.total_quantity * p.current_price;
                  const gain = val - p.total_invested;
                  return (
                    <tr key={p.asset_type_id}>
                      <td><span className="mr-1">{p.icon}</span>{p.ticker}</td>
                      <td>{p.total_quantity}</td>
                      <td>{formatVND(p.current_price)}</td>
                      <td className={gain >= 0 ? 'text-emerald-600' : 'text-red-600'}>{formatVND(gain)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : <p className="text-gray-400 text-sm">Chưa có giao dịch nào</p>}
        </div>

        {/* Allocation Pie */}
        <AllocationPie allocations={data.allocations} />
      </div>

      {/* Phase Progress */}
      {data.phase && (
        <div className="card">
          <h3 className="font-semibold mb-3">Giai đoạn: {data.phase.name}</h3>
          <p className="text-sm text-gray-600 mb-2">{data.phase.description}</p>
          <p className="text-xs text-gray-500 mb-3">{data.phase.guidance}</p>
          <div className="w-full bg-gray-100 rounded-full h-3">
            <div className="bg-primary-600 h-3 rounded-full transition-all duration-500" style={{ width: `${Math.min(100, ((totalValue + totalSavings) / (data.phase.target_amount || 1)) * 100)}%` }} />
          </div>
          <div className="flex justify-between text-xs text-gray-500 mt-1">
            <span>{formatVND(totalValue + totalSavings)}</span>
            <span>Mục tiêu: {formatVND(data.phase.target_amount)}</span>
          </div>
        </div>
      )}

      {/* Activity Feed */}
      {data.activity.length > 0 && (
        <div className="card">
          <h3 className="font-semibold mb-3">Hoạt động gần đây</h3>
          <div className="space-y-2">
            {data.activity.map(a => (
              <div key={a.id} className="flex items-center gap-3 text-sm">
                <div className="w-2 h-2 rounded-full bg-primary-500 shrink-0" />
                <span className="text-gray-600">{a.details}</span>
                <span className="text-gray-400 text-xs ml-auto">{formatDate(a.created_at)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function KPI({ icon, label, value, color }) {
  return (
    <div className="kpi">
      <div className="flex items-center gap-2">{icon}<span className="text-xs text-gray-500">{label}</span></div>
      <div className="text-sm font-semibold truncate">{value}</div>
    </div>
  );
}
