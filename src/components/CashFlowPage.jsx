import { useState, useEffect, useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ComposedChart, Line, Area, ReferenceLine } from 'recharts';
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
  const [realInvested, setRealInvested] = useState(0);
  const [snap, setSnap] = useState(null);

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    try {
      const [sn, f] = await Promise.all([
        apiClient.snapshot.get(),
        apiClient.monthly.filled(),
      ]);
      setSnap(sn);
      setFilled(f);
      setPhase(sn.phase);
      setRealInvested(sn.portfolio.invested || 0);
      setTotalMonths(sn.params.TOTAL_MONTHS || 120);
      setPhaseAllocs(sn.phaseAllocations?.[sn.phase?.sortOrder] || []);
    } catch (err) {
      console.error('CashFlowPage load error:', err);
    }
  }

  // Savings rate target (% of income) — default 30%
  const savingsTargetPct = 30;

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
        target: savingsTargetPct,
      };
    });
  }, [filled]);

  // UseMemo for all KPIs to prevent recalculation on re-renders
  const { 
    totalIncome, totalExpense, totalNet, avgSavingsRate, avgMonthly, 
    totalInvested, avgInvestRate, investTargetPct, streak, bestMonth, worstMonth 
  } = useMemo(() => {
    const inc = filled.reduce((s, m) => s + (m.income || 0) + (m.bonus || 0), 0);
    const exp = filled.reduce((s, m) => s + (m.expense || 0), 0);
    const net = cashFlowData.reduce((s, d) => s + d.net, 0);
    const avgSav = inc > 0 ? (net / inc) * 100 : 0;
    const avgMon = filled.length > 0 ? net / filled.length : 0;
    
    // Tỷ lệ đầu tư mục tiêu từ phase allocations (loại trừ Dự phòng & Tiết kiệm)
    const iRatio = phaseAllocs
      .filter(pa => {
        const name = pa.category_name?.toLowerCase() || '';
        return !name.includes('dự phòng') && !name.includes('tiết kiệm');
      })
      .reduce((s, pa) => s + (pa.ratio || 0), 0);
    const invTarget = Math.round(iRatio * 100);

    // Mục tiêu là tỷ lệ trên TIỀN NHÀN RỖI, nên tỷ lệ thực tế cũng phải chia
    // cho tiền nhàn rỗi. Chia cho thu nhập thì hai con số không so được với nhau.
    const tInvested = realInvested;
    const idle = snap?.cashflow.totalInflow || 0;
    const avgInv = idle > 0 ? (tInvested / idle) * 100 : 0;

    let str = 0;
    for (let i = cashFlowData.length - 1; i >= 0; i--) {
      if (cashFlowData[i].net > 0) str++;
      else break;
    }
    const sorted = [...cashFlowData].sort((a, b) => b.net - a.net);

    return {
      totalIncome: inc, totalExpense: exp, totalNet: net, avgSavingsRate: avgSav, avgMonthly: avgMon,
      totalInvested: tInvested, avgInvestRate: avgInv, investTargetPct: invTarget,
      streak: str, bestMonth: sorted[0] || null, worstMonth: sorted[sorted.length - 1] || null
    };
  }, [filled, cashFlowData, phaseAllocs, realInvested, snap]);

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
            <MonthlyEntry
              onSaved={loadData}
              onComplete={() => { setShowWizard(false); loadData(); }}
            />
          </div>
        )}

        {!showWizard && (
          <div className="card text-center py-16">
            <div className="w-20 h-20 rounded-full bg-primary-50 flex items-center justify-center mx-auto mb-6">
              <TrendUp size={40} className="text-primary-600" weight="duotone" />
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
          <MonthlyEntry
              onSaved={loadData}
              onComplete={() => { setShowWizard(false); loadData(); }}
            />
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

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="kpi">
          <span className="kpi-label">Tổng thu nhập</span>
          <p className="kpi-value text-emerald-600">{formatVND(totalIncome)}</p>
          {(() => {
            const totalBonus = filled.reduce((s, m) => s + (m.bonus || 0), 0);
            return totalBonus > 0
              ? <p className="text-xs text-emerald-600 font-medium">+{formatVND(totalBonus)} thưởng</p>
              : <p className="text-xs text-slate-400">{filled.length} tháng</p>;
          })()}
        </div>
        <div className="kpi">
          <span className="kpi-label">Tổng chi tiêu</span>
          <p className="kpi-value text-red-600">{formatVND(totalExpense)}</p>
          {filled.length > 1 && (
            <p className="text-xs text-slate-500">Trung bình {formatVND(totalExpense / filled.length)}/tháng</p>
          )}
        </div>
        <div className="kpi">
          <span className="kpi-label">Tỷ lệ tiết kiệm</span>
          <p className={`kpi-value ${avgSavingsRate >= 30 ? 'text-emerald-600' : avgSavingsRate >= 20 ? 'text-amber-600' : 'text-red-600'}`}>
            {avgSavingsRate.toFixed(1)}%
          </p>
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${avgSavingsRate >= savingsTargetPct ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'}`}>
              Mục tiêu ≥ {savingsTargetPct}%
            </span>
            {streak >= 3 ? (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-amber-100 text-amber-700">
                {streak} tháng liên tục 🔥
              </span>
            ) : streak > 0 ? (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-emerald-50 text-emerald-600">
                {streak} tháng liên tục
              </span>
            ) : null}
          </div>
        </div>
        <div className="kpi">
          <span className="kpi-label">Tỷ lệ đầu tư</span>
          <p className={`kpi-value ${investTargetPct > 0 && avgInvestRate >= investTargetPct * 0.9 ? 'text-blue-600' : 'text-amber-600'}`}>
            {avgInvestRate > 0 ? `${avgInvestRate.toFixed(1)}%` : '—'}
          </p>
          <div className="flex items-center gap-1.5 flex-wrap">
            {investTargetPct > 0 && (
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                avgInvestRate >= investTargetPct * 0.9 ? 'bg-blue-50 text-blue-600' : 'bg-amber-50 text-amber-600'
              }`}>
                Mục tiêu {investTargetPct}% theo phase
              </span>
            )}
            {totalInvested > 0 && (
              <p className="text-[10px] text-slate-400 w-full">= {formatVND(totalInvested)} đã đầu tư</p>
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
                <defs>
                  <linearGradient id="colorIncome" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#0F5D4A" stopOpacity={0.9}/>
                    <stop offset="95%" stopColor="#0F5D4A" stopOpacity={0.4}/>
                  </linearGradient>
                  <linearGradient id="colorExpense" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f87171" stopOpacity={0.9}/>
                    <stop offset="95%" stopColor="#f87171" stopOpacity={0.4}/>
                  </linearGradient>
                  <linearGradient id="colorNet" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3A6B8A" stopOpacity={0.9}/>
                    <stop offset="95%" stopColor="#3A6B8A" stopOpacity={0.4}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis dataKey="month" tickLine={false} axisLine={false} tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: 600 }} tickMargin={10} />
                <YAxis tickLine={false} axisLine={false} tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: 600 }} tickFormatter={formatCompact} width={60} />
                <Tooltip content={<CustomTooltip />} cursor={{ fill: '#f1f5f9', opacity: 0.5 }} />
                <Bar dataKey="totalIncome" fill="url(#colorIncome)" name="Thu nhập" radius={[4, 4, 0, 0]} isAnimationActive={true} />
                <Bar dataKey="expense" fill="url(#colorExpense)" name="Chi tiêu" radius={[4, 4, 0, 0]} isAnimationActive={true} />
                <Bar dataKey="net" fill="url(#colorNet)" name="Tiền nhàn rỗi" radius={[4, 4, 0, 0]} isAnimationActive={true} />
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
              <ComposedChart data={cashFlowData} margin={{ top: 10, right: 10, bottom: 5, left: 0 }}>
                <defs>
                  <linearGradient id="colorSavings" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3A6B8A" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#3A6B8A" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis dataKey="month" tickLine={false} axisLine={false} tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: 600 }} tickMargin={10} />
                <YAxis tickLine={false} axisLine={false} tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: 600 }} tickFormatter={v => `${v}%`} width={40} domain={[dataMin => Math.min(0, dataMin), 100]} />
                <Tooltip formatter={(v, name) => [`${typeof v === 'number' ? v.toFixed(1) : v}%`, name]} contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                <Line type="monotone" dataKey="target" stroke="#0F5D4A" strokeWidth={2} strokeDasharray="5 5" dot={cashFlowData.length === 1 ? { r: 4, fill: '#0F5D4A', stroke: 'none' } : false} activeDot={false} name="Mục tiêu" />
                <Area type="monotone" dataKey="savingsRate" fill="url(#colorSavings)" stroke="#3A6B8A" strokeWidth={3} dot={cashFlowData.length === 1 ? { r: 4, fill: '#3A6B8A', stroke: 'none' } : false} activeDot={{ r: 4, fill: '#3A6B8A', stroke: 'none' }} name="Thực tế" isAnimationActive={true} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          {/* Bottom row */}
          <div className="grid grid-cols-2 gap-4">
            <div className="card">
              <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-4">Dự báo tích lũy</h3>
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-slate-500">Đã để dành</span>
                  <span className="text-sm font-bold text-slate-800">{formatVND(totalNet)}</span>
                </div>
                {phase?.goalAmount > 0 && (() => {
                  // Cột mốc giai đoạn là mốc TÀI SẢN, nên tiến độ đo bằng tài
                  // sản. Dòng tiền chỉ dùng để ước lượng còn bao nhiêu tháng.
                  const goal = phase.goalAmount;
                  const have = phase.current;
                  const reached = have >= goal;
                  const pct = Math.min((have / goal) * 100, 100);
                  const gap = Math.max(0, goal - have);
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
                        <span className="text-primary-600">{formatVND(have)} / {formatVND(goal)}</span>
                        {!reached && monthsToGoal && (
                          <span className="text-primary-600">còn {formatVND(gap)} · ~{monthsToGoal} tháng</span>
                        )}
                        {reached && <span className="text-emerald-600 font-medium">Đã đạt</span>}
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
                          <TrendIcon size={16} className={diff > 0 ? 'text-emerald-600' : diff < 0 ? 'text-red-600' : 'text-slate-400'} weight="bold" />
                          <div>
                            <p className="text-xs font-semibold text-slate-700">{formatVND(recentAvg)}/tháng</p>
                            {diff !== 0 && (
                              <p className={`text-[10px] ${diff > 0 ? 'text-emerald-600' : 'text-red-600'}`}>
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
