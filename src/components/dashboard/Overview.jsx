import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { formatVND } from '../../utils/formatters';
import { apiClient } from '../../utils/apiClient';
import AllocationPie from '../charts/AllocationPie';
import AppIcon, { Bell, ArrowClockwise, NotePencil, ArrowDownLeft, ArrowUpRight, Trash, PiggyBank, BookmarkSimple, CheckCircle, XCircle, Warning, Info, X, CaretDown, CaretUp } from '../../utils/iconMap';

export default function Overview() {
  const navigate = useNavigate();
  const [summary, setSummary] = useState(null);
  const [phase, setPhase] = useState(null);
  const [filled, setFilled] = useState([]);
  const [activity, setActivity] = useState([]);
  const [nextMonth, setNextMonth] = useState(null);
  const [editingPrice, setEditingPrice] = useState(null);
  const [priceValue, setPriceValue] = useState('');
  const [alertCount, setAlertCount] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefresh, setLastRefresh] = useState(null);
  const [toast, setToast] = useState(null);
  const [phaseAllocs, setPhaseAllocs] = useState([]);
  const [expandedCategory, setExpandedCategory] = useState(null);

  useEffect(() => {
    loadData();
    // Auto-refresh prices silently on mount (throttle: 1 hour)
    const lastRefreshTime = localStorage.getItem('lastPriceRefresh');
    const oneHour = 60 * 60 * 1000;
    if (!lastRefreshTime || (Date.now() - parseInt(lastRefreshTime)) > oneHour) {
      handleRefreshPrices(true);
    }
  }, []);

  // Poll activity every 30s (only when tab visible)
  useEffect(() => {
    let lastActivityId = activity.length > 0 ? activity[0].id : 0;
    const POLL_INTERVAL = 30000;

    const poll = async () => {
      if (document.hidden) return;
      try {
        const latest = await apiClient.activity.get(1);
        if (latest.length > 0 && latest[0].id !== lastActivityId) {
          lastActivityId = latest[0].id;
          const fresh = await apiClient.activity.get(10);
          setActivity(fresh);
          const ac = await apiClient.alerts.count().catch(() => ({ count: 0 }));
          setAlertCount(ac?.count || 0);
        }
      } catch (e) { /* silent */ }
    };

    const interval = setInterval(poll, POLL_INTERVAL);
    const onVisibility = () => { if (!document.hidden) poll(); };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [activity]);

  async function loadData() {
    try {
      const [s, p, f, a, n, ac] = await Promise.all([
        apiClient.portfolio.summary(),
        apiClient.phases.active(),
        apiClient.monthly.filled(),
        apiClient.activity.get(10),
        apiClient.monthly.next(),
        apiClient.alerts.count().catch(() => ({ count: 0 })),
      ]);
      setSummary(s);
      setPhase(p);
      setFilled(f);
      setActivity(a);
      setNextMonth(n);
      setAlertCount(ac?.count || 0);

      // Fetch phase allocations for actual-vs-target comparison
      if (p?.id) {
        try {
          const allocs = await apiClient.phases.allocations(p.id);
          setPhaseAllocs(allocs || []);
        } catch { setPhaseAllocs([]); }
      }
    } catch (err) {
      console.error('Overview load error:', err);
    }
  }

  async function handleDeleteActivity(id) {
    if (!window.confirm('Bạn có chắc chắn muốn xóa hoạt động này khỏi nhật ký?')) return;
    try {
      await apiClient.activity.delete(id);
      setToast({ type: 'success', message: 'Đã xóa hoạt động thành công' });
      setTimeout(() => setToast(null), 3000);
      const fresh = await apiClient.activity.get(10);
      setActivity(fresh);
    } catch (err) {
      console.error('Delete activity error:', err);
      setToast({ type: 'error', message: 'Lỗi khi xóa hoạt động: ' + err.message });
      setTimeout(() => setToast(null), 4000);
    }
  }

  const portfolio = summary?.portfolio || [];
  const totalInvested = summary?.totalInvested || 0;
  const totalCurrentValue = summary?.totalCurrentValue || 0;
  const totalGain = summary?.totalGain || 0;
  const totalGainPct = totalInvested > 0 ? (totalGain / totalInvested) * 100 : 0;
  const totalInflow = filled.reduce((s, m) => s + (m.total_inflow || 0), 0);
  const byCategory = summary?.byCategory || {};

  // Category metadata for allocation display
  const CATEGORY_META = [
    { name: 'Dự Phòng', color: '#10b981', icon: 'wallet' },
    { name: 'Đầu Tư', color: '#3b82f6', icon: 'chart-line' },
    { name: 'Vàng', color: '#f59e0b', icon: 'coins' },
    { name: 'Bắn Tỉa', color: '#ef4444', icon: 'crosshair' },
    { name: 'Tiết kiệm & Trái phiếu', color: '#8b5cf6', icon: 'bank' },
  ];

  // Pie chart data (all 5 categories)
  const allocPieData = CATEGORY_META.map(c => ({
    name: c.name,
    value: byCategory[c.name]?.currentTotal || 0,
    color: c.color,
    icon: c.icon,
  }));

  // Target allocation lookup — VND per category
  const targetLookup = (() => {
    if (!phaseAllocs.length || !phaseGoal) return {};
    const maxRatio = Math.max(...phaseAllocs.map(a => a.ratio));
    if (maxRatio <= 0) return {};
    const totalGoal = phaseGoal / maxRatio;
    const lookup = {};
    phaseAllocs.forEach(a => { lookup[a.category_name] = totalGoal * a.ratio; });
    return lookup;
  })();

  // Total assets for percentage calculation
  const totalAssets = CATEGORY_META.reduce((s, c) => s + (byCategory[c.name]?.currentTotal || 0), 0);

  // Phase goal for category target VND calculation
  const avgMonthlyExpense = filled.length > 0
    ? filled.reduce((s, m) => s + (m.expense || 0), 0) / filled.length
    : 4000000;
  const phaseGoal = phase?.goal_amount || (phase?.goal_multiplier ? phase.goal_multiplier * avgMonthlyExpense : null);

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
      alert('Lỗi khi cập nhật giá: ' + err.message);
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

      if (!silent && result) {
        const { total = 0, success = 0, failed = 0 } = result;
        if (total === 0) {
          setToast({ type: 'info', message: 'Không có tài sản nào đang đầu tư để cập nhật' });
        } else if (failed === 0) {
          setToast({ type: 'success', message: 'Đã cập nhật giá thành công' });
        } else if (success > 0) {
          setToast({ type: 'warning', message: `Cập nhật ${success}/${total} thành công, ${failed} lỗi` });
        } else {
          setToast({ type: 'error', message: 'Không thể cập nhật giá. Kiểm tra kết nối mạng.' });
        }
        setTimeout(() => setToast(null), failed > 0 ? 5000 : 4000);
      }
    } catch (err) {
      console.error('Refresh error:', err);
      if (!silent) {
        setToast({ type: 'error', message: 'Lỗi đồng bộ giá: ' + err.message });
        setTimeout(() => setToast(null), 5000);
      }
      localStorage.setItem('lastPriceRefresh', Date.now().toString());
    } finally {
      setRefreshing(false);
    }
  }

  function formatTime(date) {
    if (!date) return '';
    return date.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
  }

  return (
    <div className="space-y-6">
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
            <button onClick={() => navigate('/sniper')} className="relative btn-ghost text-sm">
              <Bell size={18} />
              <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] rounded-full w-4 h-4 flex items-center justify-center">{alertCount}</span>
            </button>
          )}
          <button onClick={() => handleRefreshPrices(false)} disabled={refreshing} className="btn-ghost text-sm flex items-center gap-1.5" title={lastRefresh ? `Cập nhật lúc ${formatTime(lastRefresh)}` : 'Cập nhật giá thị trường'}>
            <ArrowClockwise size={16} className={refreshing ? 'animate-spin' : ''} />
            <span>{refreshing ? 'Đang tải...' : 'Đồng bộ giá'}</span>
          </button>
          <button onClick={() => navigate('/monthly')} className="btn-primary">
            {nextMonth ? `Nhập liệu ${nextMonth.month_label}` : 'Nhập liệu'}
          </button>
        </div>
      </div>

      {/* Phase Card */}
      {phase && (
        <div className="card bg-gradient-to-r from-primary-50 to-violet-50 border-primary-100">
          <div className="flex items-center justify-between">
            <div>
              <span className="badge bg-primary-100 text-primary-700 mb-1">{phase.name}</span>
              <p className="text-sm text-slate-600">{phase.goal_description}</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-slate-400">Mục tiêu</p>
              <p className="text-lg font-bold text-primary-600">{phase.goal_amount > 0 ? formatVND(phase.goal_amount) : 'Tự do tài chính'}</p>
            </div>
          </div>
        </div>
      )}

      {/* KPI Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="kpi">
          <span className="kpi-label">Tổng dòng tiền</span>
          <p className="kpi-value text-slate-800">{formatVND(totalInflow)}</p>
          <p className="text-xs text-slate-400">{filled.length} tháng</p>
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
      </div>

      {/* Portfolio Table + Allocation */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 card p-0 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100">
            <h3 className="text-sm font-semibold text-slate-700">Danh mục giao dịch</h3>
            <p className="text-xs text-slate-400 mt-0.5">Click vào giá hiện tại để cập nhật</p>
          </div>
          {portfolio.length === 0 ? (
            <div className="text-center py-16 text-slate-400">
              <p className="text-sm">Chưa có tài sản nào</p>
              <button onClick={() => navigate('/monthly')} className="btn-primary mt-3 text-sm">Nhập liệu tháng đầu tiên</button>
            </div>
          ) : (
            <div className="overflow-auto max-h-[400px]">
              <table className="table">
                <thead>
                  <tr>
                    <th>Tài sản</th>
                    <th className="text-right">Khối lượng</th>
                    <th className="text-right">Giá vốn</th>
                    <th className="text-right">Giá hiện tại</th>
                    <th className="text-right">Giá trị</th>
                    <th className="text-right">Lãi/Lỗ</th>
                  </tr>
                </thead>
                <tbody>
                  {portfolio.map(p => {
                    const gain = p.current_value - p.total_invested;
                    const gainPct = p.total_invested > 0 ? (gain / p.total_invested) * 100 : 0;
                    const isEditing = editingPrice === p.asset_type_id;
                    return (
                      <tr key={p.asset_type_id}>
                        <td>
                          <div className="flex items-center gap-2">
                            <AppIcon emoji={p.icon} size={16} />
                            <div>
                              <p className="text-sm font-medium text-slate-800">{p.name}</p>
                              <p className="text-[10px] text-slate-400">{p.category}</p>
                            </div>
                          </div>
                        </td>
                        <td className="text-right font-mono text-sm">{p.total_quantity} {p.unit}</td>
                        <td className="text-right text-sm text-slate-500">{formatVND(p.avg_cost)}</td>
                        <td className="text-right">
                          {isEditing ? (
                            <input autoFocus type="number" value={priceValue} onChange={e => setPriceValue(e.target.value)}
                              onBlur={() => handlePriceUpdate(p.asset_type_id)}
                              onKeyDown={e => { if (e.key === 'Enter') handlePriceUpdate(p.asset_type_id); if (e.key === 'Escape') setEditingPrice(null); }}
                              className="input text-xs py-1 w-24 text-right" />
                          ) : (
                            <button onClick={() => { setEditingPrice(p.asset_type_id); setPriceValue(p.current_price?.toString() || ''); }}
                              className="text-sm font-medium text-primary-600 hover:bg-primary-50 px-2 py-0.5 rounded cursor-pointer"
                              title="Click để cập nhật giá">
                              {p.current_price > 0 ? formatVND(p.current_price) : 'Cập nhật'}
                            </button>
                          )}
                        </td>
                        <td className="text-right font-semibold text-sm">{formatVND(p.current_value)}</td>
                        <td className="text-right">
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
                  <tr className="bg-slate-50 font-semibold">
                    <td colSpan={2}>Tổng</td>
                    <td className="text-right text-sm text-slate-600">{formatVND(totalInvested)}</td>
                    <td></td>
                    <td className="text-right text-sm">{formatVND(totalCurrentValue)}</td>
                    <td className="text-right">
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

        <div className="space-y-4">
          {/* Merged Allocation Card */}
          <div className="card">
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-4">Phân Bổ Danh Mục</h3>

            {/* Pie chart */}
            <div className="mb-4">
              <AllocationPie data={allocPieData} />
            </div>

            {/* Divider */}
            <div className="border-t border-slate-100 mb-3" />

            {/* Category list with target VND progress */}
            <div className="space-y-1">
              {CATEGORY_META.filter(c => (byCategory[c.name]?.currentTotal || 0) > 0).map(c => {
                const catData = byCategory[c.name];
                const actual = catData?.currentTotal || 0;
                const invested = catData?.total || 0;
                const gain = actual - invested;
                const gainPct = invested > 0 ? (gain / invested) * 100 : 0;
                const catTarget = targetLookup[c.name] || null; // already VND
                const targetPct = catTarget && catTarget > 0 ? Math.min((actual / catTarget) * 100, 100) : null;
                const diff = catTarget ? actual - catTarget : null;
                const items = catData?.items || [];
                const isExpanded = expandedCategory === c.name;

                return (
                  <div key={c.name} className="py-2.5 border-b border-slate-50 last:border-0">
                    {/* Category header */}
                    <div
                      className="flex items-center justify-between cursor-pointer hover:bg-slate-50 -mx-1 px-1 py-1 rounded-lg transition-colors"
                      onClick={() => setExpandedCategory(isExpanded ? null : c.name)}
                    >
                      <span className="text-sm font-medium text-slate-700 flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: c.color }}></span>
                        {c.name}
                        {items.length > 0 && (
                          <span className="text-[10px] text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded-full">{items.length}</span>
                        )}
                      </span>
                      <span className="flex items-center gap-1.5">
                        <span className="text-sm font-bold text-slate-800">{formatVND(actual)}</span>
                        {items.length > 0 && (
                          isExpanded
                            ? <CaretUp size={14} className="text-slate-400" weight="bold" />
                            : <CaretDown size={14} className="text-slate-400" weight="bold" />
                        )}
                      </span>
                    </div>

                    {/* Progress bar: actual / target VND */}
                    {catTarget !== null && (
                      <div className="ml-[18px] mt-1.5">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-[10px] text-slate-400">
                            {formatVND(actual)} / {formatVND(catTarget)}
                          </span>
                          {diff !== null && diff !== 0 && (
                            <span className={`text-[10px] font-medium ${diff > 0 ? 'text-emerald-500' : 'text-blue-500'}`}>
                              {diff > 0 ? '+' : ''}{formatVND(diff)}
                            </span>
                          )}
                        </div>
                        <div className="relative h-2 bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all duration-500"
                            style={{
                              width: `${targetPct}%`,
                              background: diff > 0 ? '#10b981' : c.color,
                            }}
                          />
                        </div>
                      </div>
                    )}

                    {/* Gain info (no target) */}
                    {catTarget === null && invested > 0 && (
                      <div className="flex items-center justify-between text-xs text-slate-400 mt-1 ml-[18px]">
                        <span>Vốn: {formatVND(invested)}</span>
                        <span className={gain >= 0 ? 'text-emerald-500' : 'text-red-400'}>
                          {gain >= 0 ? '+' : ''}{gainPct.toFixed(1)}%
                        </span>
                      </div>
                    )}

                    {/* Expanded: individual assets */}
                    {isExpanded && items.length > 0 && (
                      <div className="mt-2.5 ml-[18px] space-y-1.5 bg-slate-50 rounded-lg p-2.5">
                        {items.map((item, idx) => {
                          const isSavings = item.type === 'savings' || item.type === 'term' || item.type === 'liquid';
                          const itemInvested = isSavings ? (item.principal || 0) : (item.total_invested || 0);
                          const itemValue = isSavings ? (item.current_balance || item.principal || 0) : (item.current_value || 0);
                          const itemGain = itemValue - itemInvested;
                          const itemGainPct = itemInvested > 0 ? (itemGain / itemInvested) * 100 : 0;
                          const isPositive = itemGain >= 0;
                          return (
                            <div key={idx} className="flex items-center justify-between py-1">
                              <div className="flex items-center gap-2 min-w-0">
                                <AppIcon name={item.icon} size={14} />
                                <span className="text-xs text-slate-700 truncate">
                                  {item.ticker || item.name}
                                </span>
                                {item.total_quantity > 0 && (
                                  <span className="text-[10px] text-slate-400">{item.total_quantity} {item.unit || 'cp'}</span>
                                )}
                              </div>
                              <div className="text-right flex-shrink-0">
                                <span className="text-xs font-semibold text-slate-800">
                                  {formatVND(itemValue)}
                                </span>
                                {itemInvested > 0 && itemGain !== 0 && (
                                  <span className={`text-[10px] ml-1 ${isPositive ? 'text-emerald-500' : 'text-red-400'}`}>
                                    {isPositive ? '+' : ''}{itemGainPct.toFixed(1)}%
                                  </span>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
              {CATEGORY_META.filter(c => (byCategory[c.name]?.currentTotal || 0) > 0).length === 0 && (
                <p className="text-xs text-slate-400 text-center py-4">Chưa có dữ liệu phân bổ</p>
              )}
            </div>
          </div>

          {/* Quick Actions */}
          <div className="card">
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Thao tác</h3>
            <div className="space-y-2">
              <button onClick={() => navigate('/monthly')} className="btn-secondary w-full text-left text-sm">Nhập liệu tháng</button>
              <button onClick={() => navigate('/execution')} className="btn-secondary w-full text-left text-sm">Ghi giao dịch</button>
              <button onClick={() => navigate('/sniper')} className="btn-ghost w-full text-left text-sm">Sniper Playbook</button>
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
                SAVINGS: { Icon: PiggyBank, bg: 'bg-violet-50', color: 'text-violet-600' },
              };
              const { Icon, bg, color } = ACTIVITY_ICONS[a.type] || { Icon: BookmarkSimple, bg: 'bg-slate-100', color: 'text-slate-500' };
              return (
                <div key={a.id} className="group flex items-center gap-3 py-2 border-b border-slate-50 last:border-0 hover:bg-slate-50/50 px-2 -mx-2 rounded-lg transition-all duration-200">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${bg} ${color}`}>
                    <Icon size={16} weight="regular" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-slate-700 truncate">{a.description}</p>
                    <p className="text-xs text-slate-400">{a.date}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    {a.amount > 0 && <span className="text-sm font-semibold text-slate-800">{formatVND(a.amount)}</span>}
                    <button
                      onClick={() => handleDeleteActivity(a.id)}
                      className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-red-500 p-1 rounded transition-all duration-200 flex items-center justify-center"
                      title="Xóa hoạt động này"
                    >
                      <Trash size={16} />
                    </button>
                  </div>
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
            <button onClick={() => navigate('/monthly')} className="btn-primary text-sm">Nhập liệu ngay</button>
            <button onClick={() => navigate('/settings')} className="btn-secondary text-sm">Import từ Excel</button>
          </div>
        </div>
      )}

      {/* Toast notification */}
      {toast && (
        <div className={`fixed bottom-6 right-6 z-50 animate-slide-up ${
          toast.type === 'error' ? 'bg-red-500' :
          toast.type === 'success' ? 'bg-emerald-500' :
          toast.type === 'warning' ? 'bg-amber-500' :
          toast.type === 'info' ? 'bg-slate-500' : 'bg-slate-700'
        } text-white px-5 py-3 rounded-xl shadow-2xl flex items-center gap-3 max-w-sm`}>
          {toast.type === 'success' && <CheckCircle size={20} weight="fill" />}
          {toast.type === 'error' && <XCircle size={20} weight="fill" />}
          {toast.type === 'warning' && <Warning size={20} weight="fill" />}
          {toast.type === 'info' && <Info size={20} weight="fill" />}
          <span className="text-sm font-medium">{toast.message}</span>
          <button onClick={() => setToast(null)} className="text-white/70 hover:text-white">
            <X size={18} />
          </button>
        </div>
      )}
    </div>
  );
}
