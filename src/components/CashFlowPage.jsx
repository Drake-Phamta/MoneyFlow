import { useState, useEffect, useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line } from 'recharts';
import { formatVND, formatCompact } from '../utils/formatters';
import { apiClient } from '../utils/apiClient';
import MonthlyEntry from './MonthlyEntry';
import { TrendUp, TrendDown, Minus } from '../utils/iconMap';
import MasterLedger from './MasterLedger';
import CustomTooltip from '../utils/CustomTooltip';

export default function CashFlowPage() {
  const [showWizard, setShowWizard] = useState(false);
  const [filled, setFilled] = useState([]);
  const [totalMonths, setTotalMonths] = useState(120);
  const [activeSection, setActiveSection] = useState('charts'); // 'charts' | 'ledger'
  const [phase, setPhase] = useState(null);
  const [phaseAllocs, setPhaseAllocs] = useState([]);

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    try {
      const [f, params, p] = await Promise.all([
        apiClient.monthly.filled(),
        apiClient.params.get(),
        apiClient.phases.active().catch(() => null),
      ]);
      setFilled(f);
      setPhase(p);
      const paramMap = {};
      for (const param of params) paramMap[param.key] = param.value;
      setTotalMonths(paramMap.TOTAL_MONTHS || 120);
      if (p?.id) {
        try {
          const pa = await apiClient.phases.allocations(p.id);
          setPhaseAllocs(pa || []);
        } catch { setPhaseAllocs([]); }
      }
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

  // Savings rate target (% of income) — default 30%
  const savingsTargetPct = 30;

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

  // Empty state
  if (filled.length === 0) {
    return (
      <div className="space-y-6 animate-fade-in">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="page-title">Dòng tiền</h1>
            <p className="page-subtitle">Chưa có dữ liệu dòng tiền</p>
          </div>
          <button onClick={() => setShowWizard(true)} className="btn-primary">
            Nhập liệu tháng mới
          </button>
        </div>

        {showWizard && (
          <div className="card border-primary-200 bg-primary-50/30">
            <MonthlyEntry onComplete={() => { setShowWizard(false); loadData(); }} />
          </div>
        )}

        {!showWizard && (
          <div className="card text-center py-16">
            <div className="w-20 h-20 rounded-full bg-primary-50 flex items-center justify-center mx-auto mb-6">
              <TrendUp size={40} className="text-primary-500" weight="duotone" />
            </div>
            <h2 className="text-xl font-bold text-slate-800 mb-2">Bắt đầu theo dõi dòng tiền</h2>
            <p className="text-sm text-slate-500 mb-6 max-w-md mx-auto">
              Ghi lại thu nhập và chi tiêu hàng tháng để theo dõi dòng tiền nhàn rỗi, phân bổ vào các danh mục đầu tư.
            </p>
            <button onClick={() => setShowWizard(true)} className="btn-primary-lg">
              Nhập liệu tháng đầu tiên →
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title">Dòng tiền</h1>
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
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="kpi">
          <span className="kpi-label">Tổng thu nhập</span>
          <p className="kpi-value text-emerald-600">{formatVND(totalIncome)}</p>
          {(() => {
            const totalBonus = filled.reduce((s, m) => s + (m.bonus || 0), 0);
            return totalBonus > 0
              ? <p className="text-xs text-emerald-500 font-medium">+{formatVND(totalBonus)} thưởng</p>
              : <p className="text-xs text-slate-400">{filled.length} tháng</p>;
          })()}
        </div>
        <div className="kpi">
          <span className="kpi-label">Tổng chi tiêu</span>
          <p className="kpi-value text-red-500">{formatVND(totalExpense)}</p>
          <p className="text-xs text-slate-500">{formatVND(totalExpense / filled.length)}<span className="text-slate-300">/tháng</span></p>
        </div>
        <div className="kpi">
          <span className="kpi-label">Tiền nhàn rỗi</span>
          <p className={`kpi-value ${totalNet >= 0 ? 'text-primary-600' : 'text-red-500'}`}>{formatVND(totalNet)}</p>
          <p className="text-xs text-slate-500">{formatVND(avgMonthly)}<span className="text-slate-300">/tháng</span></p>
        </div>
        <div className="kpi">
          <span className="kpi-label">Tỷ lệ tiết kiệm</span>
          <p className={`kpi-value ${avgSavingsRate >= 30 ? 'text-emerald-600' : avgSavingsRate >= 20 ? 'text-amber-600' : 'text-red-500'}`}>
            {avgSavingsRate.toFixed(1)}%
          </p>
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${avgSavingsRate >= savingsTargetPct ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'}`}>
              ≥ {savingsTargetPct}%
            </span>
            {streak >= 3 ? (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-gradient-to-r from-amber-100 to-amber-50 text-amber-700">
                {streak} tháng liên tục 🔥
              </span>
            ) : streak > 0 ? (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-emerald-50 text-emerald-600">
                {streak} tháng liên tục
              </span>
            ) : cashFlowData.length > 0 && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-slate-50 text-slate-400">
                Bắt đầu lại
              </span>
            )}
          </div>
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
                <Bar dataKey="totalIncome" fill="#10b981" name="Thu nhập" radius={[4, 4, 0, 0]} />
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
                <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-blue-500" /> Thực tế</span>
                <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500" /> Mục tiêu</span>
              </div>
            </div>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={cashFlowData.map(d => ({ ...d, target: savingsTargetPct }))} margin={{ top: 5, right: 10, bottom: 5, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="month" tick={{ fill: '#94a3b8', fontSize: 10 }} />
                <YAxis tick={{ fill: '#94a3b8', fontSize: 10 }} tickFormatter={v => `${v}%`} width={40} domain={[0, 100]} />
                <Tooltip formatter={(v, name) => [`${v.toFixed(1)}%`, name]} />
                <Line type="monotone" dataKey="savingsRate" stroke="#3b82f6" strokeWidth={2} dot={{ fill: '#3b82f6', r: 3 }} name="Thực tế" />
                <Line type="monotone" dataKey="target" stroke="#10b981" strokeWidth={2} dot={{ fill: '#10b981', r: 3 }} name="Mục tiêu" />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Bottom row */}
          <div className="grid grid-cols-2 gap-4">
            <div className="card">
              <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-4">Dự báo tích lũy</h3>
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-slate-500">Đã tích lũy</span>
                  <span className="text-sm font-bold text-slate-800">{formatVND(totalNet)}</span>
                </div>
                {phase?.goal_amount > 0 && (() => {
                  const goal = phase.goal_amount;
                  const reached = totalNet >= goal;
                  const pct = Math.min((totalNet / goal) * 100, 100);
                  const gap = Math.max(0, goal - totalNet);
                  const monthsToGoal = avgMonthly > 0 ? Math.ceil(gap / avgMonthly) : null;
                  return (
                    <div className="p-3 bg-primary-50 border border-primary-100 rounded-xl">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-medium text-primary-700">{phase.name}</span>
                        <span className="text-xs font-bold text-primary-600">{pct.toFixed(0)}%</span>
                      </div>
                      <div className="h-2 bg-primary-100 rounded-full overflow-hidden mb-2">
                        <div className="h-full bg-primary-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
                      </div>
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="text-primary-600">{formatVND(totalNet)} / {formatVND(goal)}</span>
                        {!reached && monthsToGoal && (
                          <span className="text-primary-500">~{monthsToGoal} tháng nữa</span>
                        )}
                        {reached && <span className="text-emerald-600 font-medium">✓ Đã đạt</span>}
                      </div>
                    </div>
                  );
                })()}
                <div className="flex justify-between items-center">
                  <span className="text-sm text-slate-500">Còn lại {Math.max(0, totalMonths - filled.length)} tháng</span>
                  <span className="text-sm font-bold text-primary-600">+{formatVND(avgMonthly * Math.max(0, totalMonths - filled.length))}</span>
                </div>
                <div className="border-t border-slate-100 pt-2 flex justify-between items-center">
                  <span className="text-sm font-semibold text-slate-700">Tổng dự kiến</span>
                  <span className="text-lg font-bold text-primary-700">{formatVND(totalNet + avgMonthly * Math.max(0, totalMonths - filled.length))}</span>
                </div>
                <p className="text-[10px] text-slate-400">Dựa trên trung bình {formatVND(avgMonthly)}/tháng · Kế hoạch {totalMonths} tháng</p>
                {filled.length >= 3 && (
                  <div className="mt-2 pt-2 border-t border-slate-100">
                    <p className="text-xs text-slate-500 mb-1">Xu hướng 3 tháng gần nhất</p>
                    {(() => {
                      const recent3 = cashFlowData.slice(-3);
                      const recentAvg = recent3.reduce((s, d) => s + d.net, 0) / 3;
                      const diff = recentAvg - avgMonthly;
                      const TrendIcon = diff > 0 ? TrendUp : diff < 0 ? TrendDown : Minus;
                      return (
                        <div className="flex items-center gap-2">
                          <TrendIcon size={16} className={diff > 0 ? 'text-emerald-500' : diff < 0 ? 'text-red-500' : 'text-slate-400'} weight="bold" />
                          <div>
                            <p className="text-xs font-semibold text-slate-700">{formatVND(recentAvg)}/tháng</p>
                            {diff !== 0 && (
                              <p className={`text-[10px] ${diff > 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                                {diff > 0 ? '↑' : '↓'} {formatVND(Math.abs(diff))} so với trung bình
                              </p>
                            )}
                          </div>
                        </div>
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
                    <p className="text-xs text-emerald-600 mb-1">Tháng tiền nhàn rỗi cao nhất</p>
                    <p className="text-sm font-bold text-emerald-700">{bestMonth.month}: {formatVND(bestMonth.net)}</p>
                  </div>
                )}
                {worstMonth && (
                  <div className="p-3 bg-red-50 rounded-xl">
                    <p className="text-xs text-red-600 mb-1">Tháng tiền nhàn rỗi thấp nhất</p>
                    <p className="text-sm font-bold text-red-700">{worstMonth.month}: {formatVND(worstMonth.net)}</p>
                  </div>
                )}
                <div className="p-3 bg-blue-50 rounded-xl">
                  <p className="text-xs text-blue-600 mb-1">Chuỗi tháng dương liên tục</p>
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
