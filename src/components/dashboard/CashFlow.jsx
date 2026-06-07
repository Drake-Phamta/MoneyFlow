import { useState, useEffect, useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, Legend } from 'recharts';
import { formatVND, formatCompact } from '../../utils/formatters';
import { apiClient } from '../../utils/apiClient';
import CustomTooltip from '../../utils/CustomTooltip';

export default function CashFlow() {
  const [filled, setFilled] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [totalMonths, setTotalMonths] = useState(120);

  useEffect(() => {
    (async () => {
      try {
        const [f, t, params] = await Promise.all([
          apiClient.monthly.filled(),
          apiClient.transactions.get(),
          apiClient.params.get(),
        ]);
        setFilled(f);
        setTransactions(t);
        const paramMap = {};
        for (const p of params) paramMap[p.key] = p.value;
        setTotalMonths(paramMap.TOTAL_MONTHS || 120);
      } catch (err) {
        console.error('CashFlow load error:', err);
      }
    })();
  }, []);

  // Cash flow data per month
  const cashFlowData = useMemo(() => {
    return filled.map(m => ({
      month: m.month_label,
      income: m.income || 0,
      expense: m.expense || 0,
      bonus: m.bonus || 0,
      net: m.total_inflow || 0,
      savingsRate: m.income > 0 ? ((m.total_inflow / (m.income + (m.bonus || 0))) * 100) : 0,
    }));
  }, [filled]);

  // Totals
  const totalIncome = filled.reduce((s, m) => s + (m.income || 0) + (m.bonus || 0), 0);
  const totalExpense = filled.reduce((s, m) => s + (m.expense || 0), 0);
  const totalNet = filled.reduce((s, m) => s + (m.total_inflow || 0), 0);
  const avgSavingsRate = totalIncome > 0 ? (totalNet / totalIncome) * 100 : 0;
  const avgMonthly = filled.length > 0 ? totalNet / filled.length : 0;

  // Passive income (from transactions with dividend/interest notes)
  const passiveIncome = useMemo(() => {
    return transactions.filter(t =>
      t.note?.toLowerCase().includes('cổ tức') ||
      t.note?.toLowerCase().includes('lãi')
    );
  }, [transactions]);

  const totalPassive = passiveIncome.reduce((s, t) => s + t.total_amount, 0);

  // Projection
  const monthsWithData = filled.length;
  const remainingMonths = Math.max(0, totalMonths - monthsWithData);
  const projectedAdditional = avgMonthly * remainingMonths;

  // Best/worst months
  const sortedByNet = [...filled].sort((a, b) => (b.total_inflow || 0) - (a.total_inflow || 0));
  const bestMonth = sortedByNet[0];
  const worstMonth = sortedByNet[sortedByNet.length - 1];

  // Streak: consecutive months with data
  let streak = 0;
  for (let i = filled.length - 1; i >= 0; i--) {
    if (filled[i].total_inflow > 0) streak++;
    else break;
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* KPI Row */}
      <div className="grid grid-cols-5 gap-4">
        <div className="kpi">
          <span className="kpi-label">Tổng thu nhập</span>
          <p className="kpi-value text-emerald-600">{formatVND(totalIncome)}</p>
        </div>
        <div className="kpi">
          <span className="kpi-label">Tổng chi tiêu</span>
          <p className="kpi-value text-red-500">{formatVND(totalExpense)}</p>
        </div>
        <div className="kpi">
          <span className="kpi-label">Tổng tiết kiệm</span>
          <p className="kpi-value text-primary-600">{formatVND(totalNet)}</p>
        </div>
        <div className="kpi">
          <span className="kpi-label">Tỷ lệ tiết kiệm</span>
          <p className={`kpi-value ${avgSavingsRate >= 30 ? 'text-emerald-600' : avgSavingsRate >= 20 ? 'text-amber-600' : 'text-red-500'}`}>
            {avgSavingsRate.toFixed(1)}%
          </p>
          <p className="text-xs text-slate-400">Mục tiêu: ≥ 30%</p>
        </div>
        <div className="kpi">
          <span className="kpi-label">Trung bình/tháng</span>
          <p className="kpi-value text-blue-600">{formatVND(avgMonthly)}</p>
          <p className="text-xs text-slate-400">{streak} tháng liên tục</p>
        </div>
      </div>

      {/* Cash Flow Chart */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-slate-700">Dòng tiền theo tháng</h3>
          <div className="flex gap-4 text-xs text-slate-400">
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500" /> Thu nhập</span>
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-red-400" /> Chi tiêu</span>
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-blue-500" /> Tiền nhàn rỗi</span>
          </div>
        </div>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={cashFlowData} margin={{ top: 5, right: 10, bottom: 5, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="month" tick={{ fill: '#94a3b8', fontSize: 10 }} />
            <YAxis tick={{ fill: '#94a3b8', fontSize: 10 }} tickFormatter={formatCompact} width={60} />
            <Tooltip content={<CustomTooltip />} />
            <Bar dataKey="income" fill="#10b981" name="Thu nhập" radius={[4, 4, 0, 0]} />
            <Bar dataKey="expense" fill="#f87171" name="Chi tiêu" radius={[4, 4, 0, 0]} />
            <Bar dataKey="net" fill="#3b82f6" name="Tiền nhàn rỗi" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Savings Rate Chart */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-slate-700">Tỷ lệ tiết kiệm theo tháng</h3>
          <div className="flex gap-4 text-xs text-slate-400">
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-500" /> Thực tế</span>
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500" /> Mục tiêu</span>
          </div>
        </div>
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={cashFlowData} margin={{ top: 5, right: 10, bottom: 5, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="month" tick={{ fill: '#94a3b8', fontSize: 10 }} />
            <YAxis tick={{ fill: '#94a3b8', fontSize: 10 }} tickFormatter={v => `${v}%`} width={40} />
            <Tooltip formatter={v => `${v.toFixed(1)}%`} />
            <Line type="monotone" dataKey="savingsRate" stroke="#3b82f6" strokeWidth={2} dot={{ fill: '#3b82f6', r: 3 }} name="Thực tế" />
            <Line type="monotone" dataKey={() => 30} stroke="#10b981" strokeWidth={2} dot={{ fill: '#10b981', r: 3 }} name="Mục tiêu" />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Bottom row */}
      <div className="grid grid-cols-2 gap-4">
        {/* Projection */}
        <div className="card">
          <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-4">Dự báo</h3>
          <div className="space-y-3">
            <div className="flex justify-between">
              <span className="text-sm text-slate-500">Đã tiết kiệm</span>
              <span className="text-sm font-bold text-slate-800">{formatVND(totalNet)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-slate-500">Còn lại {remainingMonths} tháng</span>
              <span className="text-sm font-bold text-primary-600">+{formatVND(projectedAdditional)}</span>
            </div>
            <div className="border-t border-slate-100 pt-2 flex justify-between">
              <span className="text-sm font-semibold text-slate-700">Tổng dự kiến</span>
              <span className="text-lg font-bold text-primary-700">{formatVND(totalNet + projectedAdditional)}</span>
            </div>
            <p className="text-[10px] text-slate-400">Dựa trên dòng tiền trung bình {formatVND(avgMonthly)}/tháng</p>
          </div>
        </div>

        {/* Records */}
        <div className="card">
          <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-4">Kỷ lục</h3>
          <div className="space-y-3">
            {bestMonth && (
              <div className="p-3 bg-emerald-50 rounded-xl">
                <p className="text-xs text-emerald-600 mb-1">Tháng tiết kiệm nhiều nhất</p>
                <p className="text-sm font-bold text-emerald-700">{bestMonth.month_label}: {formatVND(bestMonth.total_inflow)}</p>
              </div>
            )}
            {worstMonth && worstMonth.total_inflow > 0 && (
              <div className="p-3 bg-red-50 rounded-xl">
                <p className="text-xs text-red-600 mb-1">Tháng tiết kiệm ít nhất</p>
                <p className="text-sm font-bold text-red-700">{worstMonth.month_label}: {formatVND(worstMonth.total_inflow)}</p>
              </div>
            )}
            <div className="p-3 bg-blue-50 rounded-xl">
              <p className="text-xs text-blue-600 mb-1">Chuỗi nhập liệu liên tục</p>
              <p className="text-sm font-bold text-blue-700">{streak} tháng</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
