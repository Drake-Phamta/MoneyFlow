import { useState, useEffect, useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line } from 'recharts';
import { formatVND, formatCompact } from '../utils/formatters';
import { apiClient } from '../utils/apiClient';
import MonthlyEntry from './MonthlyEntry';
import { TrendUp, TrendDown, Minus } from '@phosphor-icons/react';
import MasterLedger from './MasterLedger';

export default function CashFlowPage() {
  const [showWizard, setShowWizard] = useState(false);
  const [filled, setFilled] = useState([]);
  const [totalMonths, setTotalMonths] = useState(120);
  const [activeSection, setActiveSection] = useState('charts'); // 'charts' | 'ledger'

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    try {
      const [f, params] = await Promise.all([
        apiClient.monthly.filled(),
        apiClient.params.get(),
      ]);
      setFilled(f);
      const paramMap = {};
      for (const p of params) paramMap[p.key] = p.value;
      setTotalMonths(paramMap.TOTAL_MONTHS || 120);
    } catch (err) {
      console.error('CashFlowPage load error:', err);
    }
  }

  // Cash flow data per month
  const cashFlowData = useMemo(() => {
    return filled.map(m => {
      const income = m.income || 0;
      const bonus = m.bonus || 0;
      const expense = m.expense || 0;
      const totalIncome = income + bonus;
      const net = totalIncome - expense; // raw net, can be negative
      return {
        month: m.month_label,
        income,
        bonus,
        totalIncome,
        expense,
        net,
        savingsRate: totalIncome > 0 ? ((net / totalIncome) * 100) : 0,
      };
    });
  }, [filled]);

  // Totals
  const totalIncome = filled.reduce((s, m) => s + (m.income || 0) + (m.bonus || 0), 0);
  const totalExpense = filled.reduce((s, m) => s + (m.expense || 0), 0);
  const totalNet = cashFlowData.reduce((s, d) => s + d.net, 0);
  const avgSavingsRate = totalIncome > 0 ? (totalNet / totalIncome) * 100 : 0;
  const avgMonthly = filled.length > 0 ? totalNet / filled.length : 0;

  // Streak — consecutive months with positive net cash flow
  let streak = 0;
  for (let i = cashFlowData.length - 1; i >= 0; i--) {
    if (cashFlowData[i].net > 0) streak++;
    else break;
  }

  // Best/worst months
  const sortedByNet = [...cashFlowData].sort((a, b) => b.net - a.net);
  const bestMonth = sortedByNet[0];
  const worstMonth = sortedByNet[sortedByNet.length - 1];

  const CustomTooltip = ({ active, payload, label }) => {
    if (!active || !payload) return null;
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-3 shadow-xl">
        <p className="text-slate-500 text-xs mb-2 font-medium">{label}</p>
        {payload.map(e => (
          <p key={e.name} className="text-xs font-semibold" style={{ color: e.color }}>
            {e.name}: {formatVND(e.value)}
          </p>
        ))}
      </div>
    );
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title">Dòng Tiền</h1>
          <p className="page-subtitle">
            {filled.length} tháng đã ghi nhận · Trung bình {formatVND(avgMonthly)}/tháng
          </p>
        </div>
        <button onClick={() => setShowWizard(!showWizard)} className="btn-primary">
          {showWizard ? 'Đóng' : 'Nhập liệu tháng mới'}
        </button>
      </div>

      {/* Monthly Entry Wizard (collapsible) */}
      {showWizard && (
        <div className="card border-primary-200 bg-primary-50/30">
          <MonthlyEntry onComplete={() => { setShowWizard(false); loadData(); }} />
        </div>
      )}

      {/* Section Toggle */}
      <div className="flex gap-1 bg-slate-100 rounded-xl p-1 w-fit">
        <button onClick={() => setActiveSection('charts')}
          className={`px-5 py-2 rounded-lg text-sm font-medium transition-all ${activeSection === 'charts' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
          Biểu đồ
        </button>
        <button onClick={() => setActiveSection('ledger')}
          className={`px-5 py-2 rounded-lg text-sm font-medium transition-all ${activeSection === 'ledger' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
          Sổ cái
        </button>
      </div>

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
          <span className="kpi-label">Tiền nhàn rỗi</span>
          <p className={`kpi-value ${totalNet >= 0 ? 'text-primary-600' : 'text-red-500'}`}>{formatVND(totalNet)}</p>
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

      {/* Charts Section */}
      {activeSection === 'charts' && (
        <div className="space-y-6">
          {/* Cash Flow Chart */}
          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-slate-700">Dòng tiền theo tháng</h3>
              <div className="flex gap-4 text-xs text-slate-400">
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500" /> Thu nhập</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-400" /> Chi tiêu</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-500" /> Tiền nhàn rỗi</span>
              </div>
            </div>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={cashFlowData} margin={{ top: 5, right: 10, bottom: 5, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="month" tick={{ fill: '#94a3b8', fontSize: 10 }} />
                <YAxis tick={{ fill: '#94a3b8', fontSize: 10 }} tickFormatter={formatCompact} width={60} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="totalIncome" fill="#10b981" name="Thu nhập" radius={[4, 4, 0, 0]} />
                <Bar dataKey="expense" fill="#f87171" name="Chi tiêu" radius={[4, 4, 0, 0]} />
                <Bar dataKey="net" fill="#3b82f6" name="Tiền nhàn rỗi" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Savings Rate Chart */}
          <div className="card">
            <h3 className="text-sm font-semibold text-slate-700 mb-4">Tỷ lệ tiết kiệm theo tháng</h3>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={cashFlowData} margin={{ top: 5, right: 10, bottom: 5, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="month" tick={{ fill: '#94a3b8', fontSize: 10 }} />
                <YAxis tick={{ fill: '#94a3b8', fontSize: 10 }} tickFormatter={v => `${v}%`} width={40} />
                <Tooltip formatter={v => `${v.toFixed(1)}%`} />
                <Line type="monotone" dataKey="savingsRate" stroke="#3b82f6" strokeWidth={2} dot={{ fill: '#3b82f6', r: 3 }} name="Tỷ lệ tiết kiệm" />
                <Line type="monotone" dataKey={() => 30} stroke="#10b981" strokeWidth={1} strokeDasharray="5 5" dot={false} name="Mục tiêu 30%" />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Bottom row */}
          <div className="grid grid-cols-2 gap-4">
            <div className="card">
              <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-4">Dự báo</h3>
              <div className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-sm text-slate-500">Đã tích lũy</span>
                  <span className="text-sm font-bold text-slate-800">{formatVND(totalNet)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-slate-500">Còn lại {Math.max(0, totalMonths - filled.length)} tháng</span>
                  <span className="text-sm font-bold text-primary-600">+{formatVND(avgMonthly * Math.max(0, totalMonths - filled.length))}</span>
                </div>
                <div className="border-t border-slate-100 pt-2 flex justify-between">
                  <span className="text-sm font-semibold text-slate-700">Tổng dự kiến</span>
                  <span className="text-lg font-bold text-primary-700">{formatVND(totalNet + avgMonthly * Math.max(0, totalMonths - filled.length))}</span>
                </div>
                <p className="text-[10px] text-slate-400">Dựa trên dòng tiền trung bình {formatVND(avgMonthly)}/tháng</p>
                {filled.length >= 3 && (
                  <div className="mt-2 pt-2 border-t border-slate-100">
                    <p className="text-xs text-slate-500 mb-1">Xu hướng gần đây (3 tháng)</p>
                    {(() => {
                      const recent3 = cashFlowData.slice(-3);
                      const recentAvg = recent3.reduce((s, d) => s + d.net, 0) / 3;
                      const diff = recentAvg - avgMonthly;
                      const TrendIcon = diff > 0 ? TrendUp : diff < 0 ? TrendDown : Minus;
                      return (
                        <p className="text-xs flex items-center gap-1">
                          <TrendIcon size={14} className={diff > 0 ? 'text-emerald-500' : diff < 0 ? 'text-red-500' : 'text-slate-400'} weight="regular" />
                          TB gần: <span className="font-semibold">{formatVND(recentAvg)}</span>
                          {diff !== 0 && (
                            <span className={diff > 0 ? 'text-emerald-600' : 'text-red-500'}>
                              {' '}({diff > 0 ? '+' : ''}{formatVND(diff)} vs TB chung)
                            </span>
                          )}
                        </p>
                      );
                    })()}
                  </div>
                )}
              </div>
            </div>
            <div className="card">
              <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-4">Kỷ lục</h3>
              <div className="space-y-3">
                {bestMonth && (
                  <div className="p-3 bg-emerald-50 rounded-xl">
                    <p className="text-xs text-emerald-600 mb-1">Tháng dòng tiền cao nhất</p>
                    <p className="text-sm font-bold text-emerald-700">{bestMonth.month_label}: {formatVND(bestMonth.net)}</p>
                  </div>
                )}
                {worstMonth && (
                  <div className="p-3 bg-red-50 rounded-xl">
                    <p className="text-xs text-red-600 mb-1">Tháng dòng tiền thấp nhất</p>
                    <p className="text-sm font-bold text-red-700">{worstMonth.month_label}: {formatVND(worstMonth.net)}</p>
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
      )}

      {/* Ledger Section */}
      {activeSection === 'ledger' && (
        <MasterLedger />
      )}
    </div>
  );
}
