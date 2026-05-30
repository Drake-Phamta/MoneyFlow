import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { formatVND } from '../../utils/formatters';
import { apiClient } from '../../utils/apiClient';
import AllocationPie from '../charts/AllocationPie';

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

  useEffect(() => {
    loadData();
    // Auto-refresh prices silently on mount
    handleRefreshPrices(true);
  }, []);

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
    } catch (err) {
      console.error('Overview load error:', err);
    }
  }

  const portfolio = summary?.portfolio || [];
  const totalInvested = summary?.totalInvested || 0;
  const totalCurrentValue = summary?.totalCurrentValue || 0;
  const totalGain = summary?.totalGain || 0;
  const totalGainPct = totalInvested > 0 ? (totalGain / totalInvested) * 100 : 0;
  const totalInflow = filled.reduce((s, m) => s + (m.total_inflow || 0), 0);
  const byCategory = summary?.byCategory || {};

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
      await apiClient.prices.refresh();
      setLastRefresh(new Date());
      await loadData();
    } catch (err) {
      if (!silent) console.error('Refresh error:', err);
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
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
              <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] rounded-full w-4 h-4 flex items-center justify-center">{alertCount}</span>
            </button>
          )}
          <button onClick={() => handleRefreshPrices(false)} disabled={refreshing} className="btn-ghost text-sm flex items-center gap-1.5" title={lastRefresh ? `Cập nhật lúc ${formatTime(lastRefresh)}` : 'Cập nhật giá thị trường'}>
            <svg className={`${refreshing ? 'animate-spin' : ''}`} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.3"/>
            </svg>
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
      <div className="grid grid-cols-4 gap-4">
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

      {/* Portfolio Table + Pie Chart */}
      <div className="grid grid-cols-3 gap-4">
        <div className="col-span-2 card p-0 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100">
            <h3 className="text-sm font-semibold text-slate-700">Danh mục đầu tư</h3>
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
                            <span className="text-base">{p.icon}</span>
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
          <div className="card">
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Phân bổ</h3>
            <AllocationPie current={{
              st_balance: byCategory['Dự Phòng']?.currentTotal || 0,
              etf_plan: byCategory['Chứng Khoán']?.currentTotal || 0,
              sniper_balance: byCategory['Bắn Tỉa']?.currentTotal || 0,
            }} />
          </div>
          <div className="card">
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Theo danh mục</h3>
            <div className="space-y-3">
              {Object.entries(byCategory).map(([cat, data]) => {
                const gain = data.currentTotal - data.total;
                const gainPct = data.total > 0 ? (gain / data.total) * 100 : 0;
                return (
                  <div key={cat}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium text-slate-700">{cat}</span>
                      <span className="text-sm font-bold text-slate-800">{formatVND(data.currentTotal)}</span>
                    </div>
                    <div className="flex items-center justify-between text-xs text-slate-400">
                      <span>Vốn: {formatVND(data.total)}</span>
                      <span className={gain >= 0 ? 'text-emerald-500' : 'text-red-400'}>{gain >= 0 ? '+' : ''}{gainPct.toFixed(1)}%</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
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
              const icons = { MONTHLY_ENTRY: '📝', BUY: '🟢', SELL: '🔴', CLEAR: '🗑️', DELETE_ENTRY: '🗑️' };
              const colors = { MONTHLY_ENTRY: 'bg-blue-50 text-blue-600', BUY: 'bg-emerald-50 text-emerald-600', SELL: 'bg-red-50 text-red-600' };
              return (
                <div key={a.id} className="flex items-center gap-3 py-2 border-b border-slate-50 last:border-0">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm ${colors[a.type] || 'bg-slate-100 text-slate-500'}`}>
                    {icons[a.type] || '📌'}
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
            <button onClick={() => navigate('/monthly')} className="btn-primary text-sm">Nhập liệu ngay</button>
            <button onClick={() => navigate('/settings')} className="btn-secondary text-sm">Import từ Excel</button>
          </div>
        </div>
      )}
    </div>
  );
}
