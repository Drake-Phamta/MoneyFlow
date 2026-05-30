import { useState, useEffect } from 'react';
import { apiClient } from '../utils/apiClient';
import { formatVND } from '../utils/formatters';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import MonthlyEntry from './MonthlyEntry';
import MasterLedger from './MasterLedger';

export default function CashFlowPage() {
  const [timeline, setTimeline] = useState([]);
  const [params, setParams] = useState([]);
  const [showLedger, setShowLedger] = useState(false);

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    const [t, p] = await Promise.all([apiClient.timeline.get(12), apiClient.params.get()]);
    setTimeline(t.reverse()); setParams(p);
  }

  const getParam = (key) => params.find(p => p.key === key)?.value || '0';
  const monthlyIncome = parseFloat(getParam('monthly_income'));
  const savingsRate = parseFloat(getParam('savings_rate'));
  const totalIncome = timeline.reduce((s, t) => s + t.income, 0);
  const totalExpenses = timeline.reduce((s, t) => s + t.expenses, 0);
  const totalSavings = timeline.reduce((s, t) => s + t.savings, 0);

  return (
    <div className="space-y-6 animate-fadeIn">
      <div className="page-header">
        <h1 className="text-2xl font-bold">Dòng Tiền</h1>
        <button onClick={() => setShowLedger(!showLedger)} className="btn-secondary text-sm">
          {showLedger ? 'Ẩn sổ cái' : 'Xem sổ cái'}
        </button>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="kpi">
          <span className="text-xs text-gray-500">Tổng thu nhập</span>
          <span className="text-lg font-bold text-emerald-600">{formatVND(totalIncome)}</span>
        </div>
        <div className="kpi">
          <span className="text-xs text-gray-500">Tổng chi tiêu</span>
          <span className="text-lg font-bold text-red-600">{formatVND(totalExpenses)}</span>
        </div>
        <div className="kpi">
          <span className="text-xs text-gray-500">Tổng tiết kiệm</span>
          <span className="text-lg font-bold text-violet-600">{formatVND(totalSavings)}</span>
        </div>
        <div className="kpi">
          <span className="text-xs text-gray-500">Tỷ lệ tiết kiệm</span>
          <span className="text-lg font-bold text-primary-600">{totalIncome > 0 ? ((totalSavings / totalIncome) * 100).toFixed(1) : 0}%</span>
        </div>
      </div>

      {/* Chart */}
      {timeline.length > 0 && (
        <div className="card">
          <h3 className="font-semibold mb-3">Biểu đồ dòng tiền</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={timeline.map(t => ({ ...t, label: `${t.month}/${t.year}` }))}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="label" tick={{ fontSize: 12 }} />
              <YAxis tickFormatter={v => v >= 1e6 ? (v/1e6)+'M' : v} tick={{ fontSize: 12 }} />
              <Tooltip formatter={v => formatVND(v)} />
              <Bar dataKey="income" name="Thu nhập" fill="#10b981" radius={[4,4,0,0]} />
              <Bar dataKey="expenses" name="Chi tiêu" fill="#ef4444" radius={[4,4,0,0]} />
              <Bar dataKey="savings" name="Tiết kiệm" fill="#8b5cf6" radius={[4,4,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Monthly Entry Form */}
      <MonthlyEntry onSaved={loadData} />

      {/* Master Ledger */}
      {showLedger && <MasterLedger />}
    </div>
  );
}
