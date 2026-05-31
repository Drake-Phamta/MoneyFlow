import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { formatVND, formatCompact } from '../utils/formatters';
import { formatNumberInput, parseNumberInput } from '../utils/numberFormat';
import { apiClient } from '../utils/apiClient';
import AllocationPie from './charts/AllocationPie';
import AppIcon from '../utils/iconMap';
import { ArrowClockwise, Bell, Calendar, Warning, NotePencil, ArrowDownLeft, ArrowUpRight, Trash, BookmarkSimple, Lightbulb, CheckCircle, PiggyBank } from '@phosphor-icons/react';

// Display labels (DB name → user-facing label)
const CATEGORY_LABELS = {
  'Chứng Khoán': 'Đầu Tư',
};

// Category metadata (matching database seed order)
const CATEGORY_META = [
  { name: 'Dự Phòng', color: '#10b981', icon: 'shield-check' },
  { name: 'Chứng Khoán', color: '#3b82f6', icon: 'trend-up' },
  { name: 'Vàng', color: '#f59e0b', icon: 'gem' },
  { name: 'Bắn Tỉa', color: '#ef4444', icon: 'crosshair' },
  { name: 'Tiết kiệm & Trái phiếu', color: '#8b5cf6', icon: 'bank' },
];

export default function Dashboard() {
  const navigate = useNavigate();
  const [summary, setSummary] = useState(null);
  const [phase, setPhase] = useState(null);
  const [phaseAllocs, setPhaseAllocs] = useState([]);
  const [allPhases, setAllPhases] = useState([]);
  const [filled, setFilled] = useState([]);
  const [activity, setActivity] = useState([]);
  const [nextMonth, setNextMonth] = useState(null);
  const [editingPrice, setEditingPrice] = useState(null);
  const [priceValue, setPriceValue] = useState('');
  const [alertCount, setAlertCount] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefresh, setLastRefresh] = useState(null);
  const [savingsSummary, setSavingsSummary] = useState(null);
  const [maturities, setMaturities] = useState([]);

  useEffect(() => {
    loadData();
    const lastRefreshTime = localStorage.getItem('lastPriceRefresh');
    const oneHour = 60 * 60 * 1000;
    if (!lastRefreshTime || (Date.now() - parseInt(lastRefreshTime)) > oneHour) {
      handleRefreshPrices(true);
    }
  }, []);

  async function loadData() {
    try {
      const [s, p, f, a, n, ac, ss, mats, phases] = await Promise.all([
        apiClient.portfolio.summary().catch(e => { console.error('portfolio.summary error:', e); return null; }),
        apiClient.phases.active(),
        apiClient.monthly.filled(),
        apiClient.activity.get(10),
        apiClient.monthly.next(),
        apiClient.alerts.count().catch(() => ({ count: 0 })),
        apiClient.savings.summary().catch(() => null),
        apiClient.savings.maturities(30).catch(() => []),
        apiClient.phases.get().catch(() => []),
      ]);
      setSummary(s);
      setPhase(p);
      setFilled(f);
      setActivity(a);
      setNextMonth(n);
      setAlertCount(ac?.count || 0);
      setSavingsSummary(ss);
      setMaturities(mats);
      setAllPhases(phases);

      // Fetch phase allocations for active phase
      if (p?.id) {
        try {
          const allocs = await apiClient.phases.allocations(p.id);
          setPhaseAllocs(allocs || []);
        } catch { setPhaseAllocs([]); }
      }
    } catch (err) {
      console.error('Dashboard load error:', err);
    }
  }

  const portfolio = summary?.portfolio || [];
  const totalInvested = summary?.totalInvested || 0;
  const totalCurrentValue = summary?.totalCurrentValue || 0;
  const totalGain = summary?.totalGain || 0;
  const totalGainPct = totalInvested > 0 ? (totalGain / totalInvested) * 100 : 0;
  const byCategory = summary?.byCategory || {};

  // Cash flow data for mini chart (last 6 months)
  const miniChartData = useMemo(() => {
    return filled.slice(-6).map(m => ({
      month: m.month_label,
      income: m.income || 0,
      expense: m.expense || 0,
      net: (m.income || 0) + (m.bonus || 0) - (m.expense || 0),
    }));
  }, [filled]);

  // Savings rate (for KPI) — calculate from income/expense directly
  const totalIncome = filled.reduce((s, m) => s + (m.income || 0) + (m.bonus || 0), 0);
  const totalExpense = filled.reduce((s, m) => s + (Number(m.expense) || 0), 0);
  const totalNet = totalIncome - totalExpense;
  const hasExpenseData = filled.some(m => Number(m.expense) > 0);
  const savingsRate = totalIncome > 0 && hasExpenseData
    ? (totalNet / totalIncome) * 100
    : null;

  // Total assets = investments + savings
  const totalSavingsBalance = savingsSummary?.totalBalance || 0;
  const grandTotal = totalCurrentValue + totalSavingsBalance;

  // Phase progress calculation
  const phaseProgress = useMemo(() => {
    if (!phase) return null;
    const monthlyExpense = filled.length > 0
      ? filled.reduce((s, m) => s + (m.expense || 0), 0) / filled.length
      : 4000000;
    const goal = phase.goal_amount || (phase.goal_multiplier * monthlyExpense);

    let current = 0;
    let label = '';
    if (phase.sort_order === 1) {
      // Phase 1: Savings balance (Dự Phòng) vs 3× expense
      current = totalSavingsBalance;
      label = `Dự phòng: ${formatVND(current)} / ${formatVND(goal)}`;
    } else if (phase.sort_order === 2) {
      // Phase 2: Total assets vs 6× expense
      current = grandTotal;
      label = `Tổng tài sản: ${formatVND(current)} / ${formatVND(goal)}`;
    } else if (phase.sort_order === 3) {
      // Phase 3: Total assets vs 24× expense
      current = grandTotal;
      label = `Tổng tài sản: ${formatVND(current)} / ${formatVND(goal)}`;
    } else {
      // Phase 4: FI reached
      current = goal || 1;
      label = 'Đã đạt tự do tài chính!';
    }

    const pct = goal > 0 ? Math.min((current / goal) * 100, 100) : 100;
    return { current, goal, pct, label };
  }, [phase, byCategory, grandTotal, filled]);

  // Next phase info
  const nextPhase = useMemo(() => {
    if (!phase || !allPhases.length) return null;
    const idx = allPhases.findIndex(p => p.id === phase.id);
    if (idx < 0 || idx >= allPhases.length - 1) return null;
    return allPhases[idx + 1];
  }, [phase, allPhases]);

  // Allocation pie data (all 5 categories)
  const allocPieData = useMemo(() => {
    return CATEGORY_META.map(c => ({
      name: CATEGORY_LABELS[c.name] || c.name,
      value: byCategory[c.name]?.currentTotal || 0,
      color: c.color,
      icon: c.icon,
    }));
  }, [byCategory]);

  async function handlePriceUpdate(assetId) {
    const price = parseFloat(priceValue);
    if (isNaN(price) || price <= 0) return;
    try {
      await apiClient.assets.updatePrice(assetId, price);
      setEditingPrice(null);
      setPriceValue('');
      loadData();
    } catch (err) {
      console.error('Price update error:', err);
    }
  }

  async function handleRefreshPrices(silent = false) {
    if (refreshing) return;
    setRefreshing(true);
    try {
      const result = await apiClient.prices.refresh();
      setLastRefresh(new Date());
      localStorage.setItem('lastPriceRefresh', Date.now().toString());
      await loadData();
      if (!silent && result?.results) {
        const failed = result.results.filter(r => r.status !== 'ok');
        if (failed.length > 0) {
          console.warn('Price sync issues:', failed);
        }
      }
    } catch (err) {
      console.error('Refresh error:', err);
      if (!silent) alert('Lỗi đồng bộ giá: ' + err.message);
      localStorage.setItem('lastPriceRefresh', Date.now().toString());
    } finally {
      setRefreshing(false);
    }
  }

  function formatTime(date) {
    if (!date) return '';
    return date.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
  }

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
          <h1 className="page-title">Tổng Quan</h1>
          <p className="page-subtitle">
            {filled.length > 0 ? `Đã ghi nhận ${filled.length} tháng` : 'Bắt đầu ghi nhận dòng tiền'}
            {lastRefresh && <span className="text-slate-300 ml-2">· Giá cập nhật {formatTime(lastRefresh)}</span>}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {alertCount > 0 && (
            <button onClick={() => navigate('/investments')} className="relative btn-ghost text-sm">
              <Bell size={18} weight="regular" />
              <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] rounded-full w-4 h-4 flex items-center justify-center">{alertCount}</span>
            </button>
          )}
          <button onClick={() => handleRefreshPrices(false)} disabled={refreshing} className="btn-ghost text-sm flex items-center gap-1.5">
            <ArrowClockwise size={16} className={refreshing ? 'animate-spin' : ''} weight="regular" />
            <span>{refreshing ? 'Đang tải...' : 'Đồng bộ giá'}</span>
          </button>
        </div>
      </div>

      {/* Alerts Banner */}
      {maturities.length > 0 && (
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-amber-700">Sắp đáo hạn ({maturities.length} sổ trong 30 ngày tới)</p>
            <p className="text-xs text-amber-600 mt-0.5">
              {maturities.slice(0, 3).map(m => m.name).join(', ')}
              {maturities.length > 3 && ` +${maturities.length - 3} sổ khác`}
            </p>
          </div>
          <button onClick={() => navigate('/investments')} className="btn-ghost text-sm text-amber-700">Xem</button>
        </div>
      )}

      {/* Next Month Reminder */}
      {nextMonth && (
        <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Calendar size={16} className="text-blue-500" weight="regular" />
            <p className="text-sm text-blue-700">
              Chưa nhập liệu <span className="font-semibold">{nextMonth.month_label}</span>
            </p>
          </div>
          <button onClick={() => navigate('/cashflow')} className="btn-ghost text-sm text-blue-700 font-medium">Nhập ngay →</button>
        </div>
      )}

      {/* Phase Card — Enhanced */}
      {phase && (
        <div className="card bg-gradient-to-r from-primary-50 to-violet-50 border-primary-100">
          <div className="flex items-center justify-between mb-3">
            <div>
              <span className="badge bg-primary-100 text-primary-700 mb-1">{phase.name}</span>
              <p className="text-sm text-slate-600">{phase.goal_description}</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-slate-400">Mục tiêu</p>
              <p className="text-lg font-bold text-primary-600">
                {phase.goal_amount > 0 ? formatVND(phase.goal_amount) : 'Tự do tài chính'}
              </p>
            </div>
          </div>

          {/* Progress bar */}
          {phaseProgress && phase.goal_amount > 0 && (
            <div className="mb-3">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-slate-500">{phaseProgress.label}</span>
                <span className="text-xs font-semibold text-primary-600">{phaseProgress.pct.toFixed(1)}%</span>
              </div>
              <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-primary-500 to-violet-500 rounded-full transition-all duration-700"
                  style={{ width: `${phaseProgress.pct}%` }}
                />
              </div>
            </div>
          )}

          {/* Phase allocation targets */}
          {phaseAllocs.length > 0 && (
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
              <span className="font-medium text-slate-600">Phân bổ:</span>
              {phaseAllocs.map(a => (
                <span key={a.category_id}>
                  {a.ratio * 100}% {a.category_name}
                </span>
              ))}
            </div>
          )}

          {/* Next phase hint */}
          {nextPhase && (
            <p className="text-xs text-slate-400 mt-2">
              Tiếp theo: <span className="text-primary-600 font-medium">{nextPhase.name}</span>
              {nextPhase.entry_condition && ` — ${nextPhase.entry_condition}`}
            </p>
          )}
        </div>
      )}

      {/* KPI Row — 6 cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-4">
        <div className="kpi">
          <span className="kpi-label">Tổng tài sản</span>
          <p className="kpi-value text-slate-800">{formatVND(grandTotal)}</p>
          <p className="text-xs text-slate-400">Đầu tư + Thanh khoản</p>
        </div>
        <div className="kpi">
          <span className="kpi-label">Vốn đầu tư</span>
          <p className="kpi-value text-blue-600">{formatVND(totalInvested)}</p>
        </div>
        <div className="kpi">
          <span className="kpi-label">Giá trị hiện tại</span>
          <p className="kpi-value text-primary-600">{formatVND(totalCurrentValue)}</p>
        </div>
        <div className="kpi">
          <span className="kpi-label">Lãi / Lỗ</span>
          <p className={`kpi-value ${totalGain >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
            {totalGain >= 0 ? '+' : ''}{formatVND(totalGain)}
          </p>
          {totalGainPct !== 0 && (
            <p className={`text-xs font-medium ${totalGain >= 0 ? 'text-emerald-500' : 'text-red-400'}`}>
              {totalGain >= 0 ? '+' : ''}{totalGainPct.toFixed(2)}%
            </p>
          )}
        </div>
        <div className="kpi">
          <span className="kpi-label">Tỷ lệ tiết kiệm</span>
          {savingsRate !== null ? (
            <>
              <p className={`kpi-value ${savingsRate >= 30 ? 'text-emerald-600' : savingsRate >= 20 ? 'text-amber-600' : 'text-red-500'}`}>
                {savingsRate.toFixed(1)}%
              </p>
              <p className="text-xs text-slate-400">Tiết kiệm / Thu nhập</p>
            </>
          ) : (
            <>
              <p className="kpi-value text-slate-300">--</p>
              <p className="text-xs text-slate-400">Nhập chi tiêu để tính</p>
            </>
          )}
        </div>
        <div className="kpi">
          <span className="kpi-label">Thanh khoản</span>
          <p className="kpi-value text-violet-600">{formatVND(totalSavingsBalance)}</p>
          {savingsSummary && <p className="text-xs text-slate-400">{savingsSummary.accountCount} sổ tiết kiệm</p>}
        </div>
      </div>

      {/* Main content grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Left: Portfolio table (2 cols) */}
        <div className="lg:col-span-2 space-y-4">
          {/* Portfolio Table */}
          <div className="card p-0 overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100">
              <h3 className="text-sm font-semibold text-slate-700">Danh mục đầu tư</h3>
              <p className="text-xs text-slate-400 mt-0.5">Click vào giá hiện tại để cập nhật</p>
            </div>
            {portfolio.length === 0 ? (
              <div className="text-center py-16 text-slate-400">
                <p className="text-sm">Chưa có tài sản nào</p>
                <button onClick={() => navigate('/cashflow')} className="btn-primary mt-3 text-sm">Nhập liệu tháng đầu tiên</button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full" style={{ tableLayout: 'fixed' }}>
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200">
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">Tài sản</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase" style={{ width: '80px' }}>KL</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase" style={{ width: '110px' }}>Giá vốn</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase" style={{ width: '130px' }}>Giá hiện tại</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase" style={{ width: '120px' }}>Giá trị</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase" style={{ width: '110px' }}>Lãi/Lỗ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {portfolio.map(p => {
                      const gain = p.current_value - p.total_invested;
                      const gainPct = p.total_invested > 0 ? (gain / p.total_invested) * 100 : 0;
                      const isEditing = editingPrice === p.asset_type_id;
                      return (
                        <tr key={p.asset_type_id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2 min-w-0">
                              <AppIcon name={p.icon} size={18} />
                              <div className="min-w-0">
                                <p className="text-sm font-medium text-slate-800 truncate">{p.name}</p>
                                <p className="text-[10px] text-slate-400">{p.category}</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-right text-sm text-slate-600 font-mono">{p.total_quantity}</td>
                          <td className="px-4 py-3 text-right text-sm text-slate-500 font-mono">{formatVND(p.avg_cost)}</td>
                          <td className="px-4 py-3 text-right">
                            {isEditing ? (
                              <input autoFocus type="text" inputMode="numeric" value={priceValue ? formatNumberInput(priceValue) : ''}
                                onChange={e => setPriceValue(e.target.value.replace(/\D/g, ''))}
                                onBlur={() => handlePriceUpdate(p.asset_type_id)}
                                onKeyDown={e => { if (e.key === 'Enter') handlePriceUpdate(p.asset_type_id); if (e.key === 'Escape') setEditingPrice(null); }}
                                className="input text-sm py-1 w-28 text-right font-mono" />
                            ) : (
                              <button onClick={() => { setEditingPrice(p.asset_type_id); setPriceValue(p.current_price?.toString() || ''); }}
                                className="text-sm font-medium text-primary-600 hover:bg-primary-50 px-2 py-1 rounded cursor-pointer font-mono"
                                title="Click để cập nhật giá">
                                {p.current_price > 0 ? formatVND(p.current_price) : 'Cập nhật'}
                              </button>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right text-sm font-semibold text-slate-800">{formatVND(p.current_value)}</td>
                          <td className="px-4 py-3 text-right">
                            <div className={gain >= 0 ? 'text-emerald-600' : 'text-red-500'}>
                              <p className="text-sm font-semibold">{gain >= 0 ? '+' : ''}{formatVND(gain)}</p>
                              <p className="text-[10px]">{gain >= 0 ? '+' : ''}{gainPct.toFixed(2)}%</p>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="bg-slate-50 font-semibold border-t border-slate-200">
                      <td className="px-4 py-3 text-sm text-slate-700">Tổng</td>
                      <td className="px-4 py-3"></td>
                      <td className="px-4 py-3 text-right text-sm text-slate-600">{formatVND(totalInvested)}</td>
                      <td className="px-4 py-3"></td>
                      <td className="px-4 py-3 text-right text-sm font-semibold text-slate-800">{formatVND(totalCurrentValue)}</td>
                      <td className="px-4 py-3 text-right">
                        <div className={totalGain >= 0 ? 'text-emerald-600' : 'text-red-500'}>
                          <p className="text-sm font-bold">{totalGain >= 0 ? '+' : ''}{formatVND(totalGain)}</p>
                          <p className="text-[10px]">{totalGain >= 0 ? '+' : ''}{totalGainPct.toFixed(2)}%</p>
                        </div>
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>

          {/* Mini Cash Flow Chart */}
          {miniChartData.length > 0 && (
            <div className="card">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-slate-700">Thu chi 6 tháng gần nhất</h3>
                <button onClick={() => navigate('/cashflow')} className="text-xs text-primary-600 hover:underline">Xem tất cả</button>
              </div>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={miniChartData} margin={{ top: 5, right: 10, bottom: 5, left: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="month" tick={{ fill: '#94a3b8', fontSize: 10 }} />
                  <YAxis tick={{ fill: '#94a3b8', fontSize: 10 }} tickFormatter={formatCompact} width={55} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="income" fill="#10b981" name="Thu nhập" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="expense" fill="#f87171" name="Chi tiêu" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="net" fill="#3b82f6" name="Tiết kiệm" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* Right sidebar */}
        <div className="space-y-4">
          {/* Quick Actions */}
          <div className="card">
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Thao tác nhanh</h3>
            <div className="space-y-2">
              <button onClick={() => navigate('/cashflow')} className="btn-secondary w-full text-left text-sm">Nhập liệu tháng</button>
              <button onClick={() => navigate('/investments')} className="btn-secondary w-full text-left text-sm">Ghi giao dịch</button>
              <button onClick={() => navigate('/investments')} className="btn-ghost w-full text-left text-sm">Quản lý danh mục đầu tư</button>
              <button onClick={() => handleRefreshPrices(false)} disabled={refreshing} className="btn-ghost w-full text-left text-sm">
                {refreshing ? 'Đang đồng bộ...' : 'Đồng bộ giá'}
              </button>
            </div>
          </div>

          {/* Allocation Pie — all 5 categories */}
          <div className="card">
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Phân bổ danh mục</h3>
            <AllocationPie data={allocPieData} />
          </div>

          {/* Phase Allocation Targets vs Actual */}
          {phaseAllocs.length > 0 && (
            <div className="card">
              <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Phân bổ mục tiêu</h3>
              <div className="space-y-2">
                {phaseAllocs.map(a => {
                  // Include savings for Dự Phòng and TK&TP categories
                  let actual = byCategory[a.category_name]?.currentTotal || 0;
                  if (a.category_name?.includes('Dự Phòng') || a.category_name?.includes('Tiết kiệm')) {
                    actual += totalSavingsBalance;
                  }
                  const totalAssets = grandTotal;
                  const actualPct = totalAssets > 0 ? (actual / totalAssets) * 100 : 0;
                  const targetPct = a.ratio * 100;
                  const diff = actualPct - targetPct;
                  const meta = CATEGORY_META.find(c => c.name === a.category_name);
                  return (
                    <div key={a.category_id}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs text-slate-600 flex items-center gap-1">
                          <AppIcon name={meta?.icon} size={14} /> {a.category_name}
                        </span>
                        <span className="text-xs text-slate-400">Mục tiêu: {targetPct.toFixed(0)}%</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all"
                            style={{
                              width: `${Math.min(actualPct, 100)}%`,
                              background: meta?.color || '#94a3b8',
                            }}
                          />
                        </div>
                        <span className={`text-[10px] font-medium w-12 text-right ${
                          Math.abs(diff) > 10 ? 'text-amber-600' : 'text-slate-500'
                        }`}>
                          {actualPct.toFixed(0)}%
                        </span>
                      </div>
                      {Math.abs(diff) > 10 && (
                        <p className="text-[10px] text-amber-600 mt-0.5">
                          <Warning size={12} className="inline mr-0.5" weight="fill" /> {diff > 0 ? 'Thừa' : 'Thiếu'} {Math.abs(diff).toFixed(0)}% so với mục tiêu
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Category breakdown */}
          <div className="card">
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Theo danh mục</h3>
            <div className="space-y-3">
              {Object.entries(byCategory).map(([cat, data]) => {
                const gain = data.currentTotal - data.total;
                const gainPct = data.total > 0 ? (gain / data.total) * 100 : 0;
                const meta = CATEGORY_META.find(c => c.name === cat);
                return (
                  <div key={cat}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium text-slate-700 flex items-center gap-1.5">
                        {meta?.Icon && <meta.Icon size={16} weight="regular" />}
                        {cat}
                      </span>
                      <span className="text-sm font-bold text-slate-800">{formatVND(data.currentTotal)}</span>
                    </div>
                    <div className="flex items-center justify-between text-xs text-slate-400">
                      <span>Vốn: {formatVND(data.total)}</span>
                      <span className={gain >= 0 ? 'text-emerald-500' : 'text-red-400'}>{gain >= 0 ? '+' : ''}{gainPct.toFixed(1)}%</span>
                    </div>
                  </div>
                );
              })}
              {Object.keys(byCategory).length === 0 && (
                <p className="text-xs text-slate-400 text-center py-4">Chưa có dữ liệu</p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Activity Feed */}
      {activity.length > 0 && (
        <div className="card">
          <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Hoạt động gần đây</h3>
          <div className="space-y-2">
            {activity.map(a => {
              const ACTIVITY_ICONS = {
                MONTHLY_ENTRY: { Icon: NotePencil, bg: 'bg-blue-50', color: 'text-blue-600' },
                BUY: { Icon: ArrowDownLeft, bg: 'bg-emerald-50', color: 'text-emerald-600' },
                SELL: { Icon: ArrowUpRight, bg: 'bg-red-50', color: 'text-red-600' },
                CLEAR: { Icon: Trash, bg: 'bg-slate-100', color: 'text-slate-500' },
                DELETE_ENTRY: { Icon: Trash, bg: 'bg-slate-100', color: 'text-slate-500' },
              };
              const { Icon, bg, color } = ACTIVITY_ICONS[a.type] || { Icon: BookmarkSimple, bg: 'bg-slate-100', color: 'text-slate-500' };
              return (
                <div key={a.id} className="flex items-center gap-3 py-2 border-b border-slate-50 last:border-0">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${bg} ${color}`}>
                    <Icon size={16} weight="regular" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-slate-700 truncate">{a.description}</p>
                    <p className="text-xs text-slate-400">{a.date}</p>
                  </div>
                  {a.amount > 0 && <span className="text-sm font-semibold text-slate-800">{formatVND(a.amount)}</span>}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Onboarding */}
      {filled.length === 0 && (
        <div className="card bg-amber-50 border-amber-200">
          <h3 className="text-sm font-bold text-amber-800 mb-2">Bắt đầu thôi!</h3>
          <p className="text-sm text-amber-700 mb-3">Nhập liệu tháng đầu tiên để bắt đầu theo dõi tài chính.</p>
          <div className="flex gap-2">
            <button onClick={() => navigate('/cashflow')} className="btn-primary text-sm">Nhập liệu ngay</button>
            <button onClick={() => navigate('/settings')} className="btn-secondary text-sm">Import từ Excel</button>
          </div>
        </div>
      )}
    </div>
  );
}
