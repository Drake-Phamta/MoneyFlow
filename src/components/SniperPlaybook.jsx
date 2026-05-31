import { useState, useEffect } from 'react';
import { formatVND, formatDate } from '../utils/formatters';
import { formatNumberInput, parseNumberInput } from '../utils/numberFormat';
import { apiClient } from '../utils/apiClient';
import AppIcon from '../utils/iconMap';

export default function SniperPlaybook({ embedded }) {
  const [phase, setPhase] = useState(null);
  const [sniperAllocated, setSniperAllocated] = useState(0);
  const [sniperDeployed, setSniperDeployed] = useState(0);
  const [deployHistory, setDeployHistory] = useState([]);
  const [showDeploy, setShowDeploy] = useState(false);
  const [watchlist, setWatchlist] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [showAlerts, setShowAlerts] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Catalog state
  const [showCatalog, setShowCatalog] = useState(false);
  const [catalogItems, setCatalogItems] = useState([]);
  const [catalogFilter, setCatalogFilter] = useState('');
  const [catalogSearch, setCatalogSearch] = useState('');

  const [deployForm, setDeployForm] = useState({
    date: new Date().toISOString().split('T')[0],
    asset_type_id: '',
    quantity: '',
    price: '',
    note: '',
  });

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    try {
      const [txns, p, wl, al] = await Promise.all([
        apiClient.transactions.get(),
        apiClient.phases.active(),
        apiClient.watchlist.get(),
        apiClient.alerts.get(),
      ]);
      setPhase(p);
      setWatchlist(wl);
      setAlerts(al);

      const filled = await apiClient.monthly.filled();
      let totalAlloc = 0;
      for (const entry of filled) {
        const allocs = await apiClient.allocations.get(entry.id);
        const sniper = allocs.find(a => a.category_name?.includes('Bắn Tỉa'));
        if (sniper) totalAlloc += sniper.actual_amount || sniper.planned_amount;
      }
      setSniperAllocated(totalAlloc);

      const sniperTxns = txns.filter(t =>
        t.note?.toLowerCase().includes('bắn tỉa') ||
        t.note?.toLowerCase().includes('sniper') ||
        t.note?.toLowerCase().includes('[deploy]')
      );
      const totalDeployed = sniperTxns.reduce((s, t) => s + (t.type === 'BUY' ? t.total_amount : -t.total_amount), 0);
      setSniperDeployed(totalDeployed);
      setDeployHistory(sniperTxns);

      // Set default deploy asset to best tracked asset
      if (wl.length > 0 && !deployForm.asset_type_id) {
        setDeployForm(f => ({ ...f, asset_type_id: wl[0].id.toString() }));
      }
    } catch (err) {
      console.error('Sniper load error:', err);
    }
  }

  async function loadCatalog() {
    try {
      const items = await apiClient.catalog.get(catalogFilter || null, catalogSearch || null);
      setCatalogItems(items);
    } catch (err) {
      console.error('Catalog load error:', err);
    }
  }

  useEffect(() => { if (showCatalog) loadCatalog(); }, [showCatalog, catalogFilter, catalogSearch]);

  // Sniper levels
  const levels = [
    { label: 'Giữ nguyên', condition: 'Drawdown < 15%', pct: 0, color: 'emerald', bg: 'bg-emerald-50 border-emerald-200', text: 'text-emerald-700', ring: 'ring-emerald-300' },
    { label: 'Cấp 1', condition: 'Drawdown 15-24%', pct: 30, color: 'amber', bg: 'bg-amber-50 border-amber-200', text: 'text-amber-700', ring: 'ring-amber-300' },
    { label: 'Cấp 2', condition: 'Drawdown 25-34%', pct: 30, color: 'orange', bg: 'bg-orange-50 border-orange-200', text: 'text-orange-700', ring: 'ring-orange-300' },
    { label: 'Cấp 3', condition: 'Drawdown ≥ 35%', pct: 40, color: 'red', bg: 'bg-red-50 border-red-200', text: 'text-red-700', ring: 'ring-red-300' },
  ];

  function getLevel(dd) {
    if (dd >= 0.35) return 3;
    if (dd >= 0.25) return 2;
    if (dd >= 0.15) return 1;
    return 0;
  }

  const available = sniperAllocated - sniperDeployed;

  const opportunities = watchlist.map(w => {
    const dd = w.peak_price > 0 ? (w.peak_price - w.current_price) / w.peak_price : 0;
    const levelIdx = getLevel(dd);
    return { ...w, drawdown: dd, levelIdx, level: levels[levelIdx] };
  }).filter(o => o.drawdown >= 0.15).sort((a, b) => b.drawdown - a.drawdown);

  const bestOpp = opportunities[0] || null;
  const suggested = bestOpp ? Math.round(available * (bestOpp.level.pct / 100)) : 0;
  const unreadAlerts = alerts.filter(a => !a.read);

  async function handleRefreshPrices() {
    setRefreshing(true);
    try {
      await apiClient.prices.refresh();
      await loadData();
    } catch (err) {
      console.error('Price refresh error:', err);
    }
    setRefreshing(false);
  }

  async function toggleTrack(item) {
    try {
      if (item.is_tracked) {
        await apiClient.assets.setTracked(item.id, false);
      } else {
        await apiClient.assets.setTracked(item.id, true);
      }
      loadData();
      if (showCatalog) loadCatalog();
    } catch (err) {
      console.error('Toggle track error:', err);
    }
  }

  async function updateWatch(id, field, value) {
    const numVal = typeof value === 'string' ? parseNumberInput(value) : (parseFloat(value) || 0);
    setWatchlist(prev => prev.map(w => w.id === id ? { ...w, [field]: numVal } : w));
    try {
      await apiClient.watchlist.update(id, { [field]: numVal });
    } catch (err) {
      console.error('Update watchlist error:', err);
    }
  }

  async function markAlertRead(id) {
    try {
      await apiClient.alerts.markRead(id);
      setAlerts(prev => prev.map(a => a.id === id ? { ...a, read: 1 } : a));
    } catch (err) {
      console.error('Mark alert read error:', err);
    }
  }

  async function handleDeploy() {
    if (!deployForm.quantity || !deployForm.price || !deployForm.asset_type_id) return;
    const price = parseNumberInput(deployForm.price);
    const total = parseFloat(deployForm.quantity) * price;
    if (total > available) { alert('Vượt quá số tiền khả dụng!'); return; }

    const opp = bestOpp;
    const note = `[Bắn Tỉa] ${deployForm.note || ''} | ${opp?.ticker || opp?.name || ''} sụt giảm: ${((opp?.drawdown || 0) * 100).toFixed(1)}% | Cấp: ${opp?.level.label || ''}`;

    await apiClient.transactions.add({
      date: deployForm.date,
      asset_type_id: parseInt(deployForm.asset_type_id),
      asset_name: '',
      type: 'BUY',
      quantity: parseFloat(deployForm.quantity),
      price,
      total_amount: total,
      note,
    });

    setDeployForm({ date: new Date().toISOString().split('T')[0], asset_type_id: watchlist[0]?.id?.toString() || '', quantity: '', price: '', note: '' });
    setShowDeploy(false);
    loadData();
  }

  const alertTypeLabel = { price_drop: 'Sụt giảm', price_recovery: 'Phục hồi', take_profit: 'Chốt lời', stop_loss: 'Cắt lỗ' };
  const alertTypeColor = { price_drop: 'text-red-600 bg-red-50', price_recovery: 'text-emerald-600 bg-emerald-50', take_profit: 'text-blue-600 bg-blue-50', stop_loss: 'text-orange-600 bg-orange-50' };

  const catalogTabs = [
    { value: '', label: 'Tất cả' },
    { value: 'stock', label: 'Cổ phiếu' },
    { value: 'etf', label: 'ETF' },
    { value: 'gold', label: 'Vàng' },
    { value: 'crypto', label: 'Crypto' },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        {!embedded ? (
          <div>
            <h1 className="page-title">Sniper Playbook</h1>
            <p className="page-subtitle">Theo dõi tài sản — bắn tỉa khi có cơ hội</p>
          </div>
        ) : (
          <p className="text-sm text-slate-500">Theo dõi tài sản — bắn tỉa khi có cơ hội</p>
        )}
        <div className="flex items-center gap-2">
          {unreadAlerts.length > 0 && (
            <button onClick={() => setShowAlerts(!showAlerts)} className="relative btn-ghost text-sm">
              <Bell size={18} />
              <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] rounded-full w-4 h-4 flex items-center justify-center">{unreadAlerts.length}</span>
            </button>
          )}
          <button onClick={handleRefreshPrices} disabled={refreshing} className="btn-ghost text-sm">
            {refreshing ? 'Đang tải...' : 'Làm mới giá'}
          </button>
        </div>
      </div>

      {/* Alerts */}
      {showAlerts && alerts.length > 0 && (
        <div className="card border-amber-200 bg-amber-50">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-semibold text-amber-700 uppercase tracking-wider">Cảnh báo ({unreadAlerts.length} mới)</h3>
            <button onClick={async () => { await apiClient.alerts.markAllRead(); setAlerts(prev => prev.map(a => ({ ...a, read: 1 }))); }} className="text-xs text-amber-600 hover:underline">Đánh dấu đã đọc</button>
          </div>
          <div className="space-y-2 max-h-60 overflow-y-auto">
            {alerts.map(a => (
              <div key={a.id} className={`flex items-start gap-3 p-2 rounded-lg ${a.read ? 'opacity-50' : ''}`}>
                <span className={`badge text-[10px] ${alertTypeColor[a.type] || 'text-slate-600 bg-slate-50'}`}>
                  {alertTypeLabel[a.type] || a.type}
                </span>
                <p className="text-xs text-slate-700 flex-1">{a.message}</p>
                <span className="text-[10px] text-slate-400 whitespace-nowrap">{a.created_at?.split(' ')[0]}</span>
                {!a.read && (
                  <button onClick={() => markAlertRead(a.id)} className="text-[10px] text-amber-600 hover:underline">OK</button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Kho đạn */}
      <div className="grid grid-cols-3 gap-4">
        <div className="card">
          <p className="text-xs text-slate-400 mb-1">Tổng phân bổ</p>
          <p className="text-2xl font-bold text-slate-800">{formatVND(sniperAllocated)}</p>
          <p className="text-[10px] text-slate-400 mt-1">Từ phân bổ hàng tháng → Bắn Tỉa</p>
        </div>
        <div className="card">
          <p className="text-xs text-slate-400 mb-1">Đã triển khai</p>
          <p className="text-2xl font-bold text-amber-600">{formatVND(sniperDeployed)}</p>
          <p className="text-[10px] text-slate-400 mt-1">Đã mua tài sản bằng tiền bắn tỉa</p>
        </div>
        <div className="card bg-primary-50 border-primary-200">
          <p className="text-xs text-primary-600 mb-1">Khả dụng</p>
          <p className="text-2xl font-bold text-primary-700">{formatVND(available)}</p>
          <p className="text-[10px] text-primary-400 mt-1">Sẵn sàng bắn tỉa</p>
        </div>
      </div>

      {/* Radar */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Radar theo dõi ({watchlist.length})</h3>
          <button onClick={() => setShowCatalog(!showCatalog)} className="btn-ghost text-xs">
            {showCatalog ? 'Đóng danh mục' : '+ Thêm tài sản'}
          </button>
        </div>

        {watchlist.length === 0 && !showCatalog && (
          <div className="text-center py-6">
            <p className="text-sm text-slate-400 mb-2">Chưa theo dõi tài sản nào</p>
            <button onClick={() => setShowCatalog(true)} className="btn-primary text-sm">Chọn tài sản để theo dõi</button>
          </div>
        )}

        {watchlist.length > 0 && (
          <div className="space-y-2">
            {watchlist.map(w => {
              const dd = w.peak_price > 0 ? (w.peak_price - w.current_price) / w.peak_price : 0;
              const levelIdx = getLevel(dd);
              const level = levels[levelIdx];
              const isHot = dd >= 0.15;

              return (
                <div key={w.id} className={`flex items-center gap-4 p-3 rounded-xl border ${isHot ? level.bg + ' ring-1 ' + level.ring : 'border-slate-200 bg-white'}`}>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-semibold text-slate-800">{w.ticker || w.name}</span>
                      {w.ticker && <span className="text-[10px] text-slate-400">{w.name}</span>}
                      {isHot && <span className={`badge text-[10px] ${level.bg} ${level.text}`}>{level.label}</span>}
                    </div>
                    <div className="flex items-center gap-4 text-xs text-slate-500">
                      <span>Giá: <strong>{(w.current_price || 0).toLocaleString('vi-VN')} {w.unit}</strong></span>
                      <span>Đỉnh: <strong>{(w.peak_price || 0).toLocaleString('vi-VN')}</strong></span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <div>
                      <label className="text-[10px] text-slate-400 block">Giá</label>
                      <input type="text" inputMode="numeric" value={w.current_price ? formatNumberInput(String(w.current_price)) : ''} onChange={e => updateWatch(w.id, 'current_price', e.target.value)} className="input text-xs py-1 w-28" />
                    </div>
                    <div>
                      <label className="text-[10px] text-slate-400 block">Đỉnh</label>
                      <input type="text" inputMode="numeric" value={w.peak_price ? formatNumberInput(String(w.peak_price)) : ''} onChange={e => updateWatch(w.id, 'peak_price', e.target.value)} className="input text-xs py-1 w-28" />
                    </div>
                  </div>

                  <div className="text-right w-20">
                    <p className={`text-lg font-bold ${isHot ? 'text-red-500' : 'text-slate-400'}`}>
                      {(dd * 100).toFixed(1)}%
                    </p>
                    <p className="text-[10px] text-slate-400">sụt giảm</p>
                  </div>

                  <button onClick={() => toggleTrack(w)} className="text-slate-300 hover:text-red-500 p-1" title="Ngừng theo dõi">
                    <X size={14} />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Asset Catalog */}
      {showCatalog && (
        <div className="card border-primary-200 bg-primary-50/30">
          <h3 className="text-xs font-semibold text-primary-700 uppercase tracking-wider mb-3">Danh mục tài sản</h3>
          <p className="text-xs text-slate-500 mb-3">Chọn tài sản để theo dõi giá tự động. Dữ liệu từ VNDIRECT.</p>

          <div className="flex items-center gap-3 mb-3">
            <input
              type="text"
              value={catalogSearch}
              onChange={e => setCatalogSearch(e.target.value)}
              placeholder="Tìm FPT, VNM, VN30..."
              className="input text-sm flex-1"
            />
          </div>

          <div className="flex gap-2 mb-3">
            {catalogTabs.map(tab => (
              <button
                key={tab.value}
                onClick={() => setCatalogFilter(tab.value)}
                className={`text-xs px-3 py-1.5 rounded-lg transition ${catalogFilter === tab.value ? 'bg-primary-600 text-white' : 'bg-white text-slate-600 border border-slate-200 hover:border-primary-300'}`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="max-h-80 overflow-y-auto space-y-1">
            {catalogItems.length === 0 && (
              <p className="text-sm text-slate-400 text-center py-4">Không tìm thấy</p>
            )}
            {catalogItems.map(item => (
              <div key={item.id} className="flex items-center justify-between p-2.5 rounded-lg hover:bg-white/80 transition">
                <div className="flex items-center gap-3">
                  <span className="text-base"><AppIcon emoji={item.icon} size={18} /></span>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-slate-800">{item.ticker}</span>
                      <span className="text-xs text-slate-400">{item.name}</span>
                    </div>
                    <span className="text-[10px] text-slate-400">{item.unit} · {item.asset_class === 'stock' ? 'Cổ phiếu' : item.asset_class === 'etf' ? 'ETF' : item.asset_class === 'gold' ? 'Vàng' : 'Khác'}</span>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {item.current_price > 0 && (
                    <span className="text-sm text-slate-600 font-mono">{item.current_price.toLocaleString('vi-VN')}</span>
                  )}
                  <button
                    onClick={() => toggleTrack(item)}
                    className={`text-xs px-3 py-1.5 rounded-lg transition ${item.is_tracked ? 'bg-emerald-100 text-emerald-700 border border-emerald-200' : 'bg-white text-primary-600 border border-primary-200 hover:bg-primary-50'}`}
                  >
                    {item.is_tracked ? '✓ Đang theo dõi' : '+ Theo dõi'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Cơ hội bắn tỉa */}
      {bestOpp && (
        <div className={`card ${bestOpp.level.bg} border-2`}>
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="text-sm font-bold text-amber-800">Cơ hội bắn tỉa!</h3>
              <p className="text-xs text-amber-600">
                {bestOpp.ticker || bestOpp.name} giảm {(bestOpp.drawdown * 100).toFixed(1)}% — {bestOpp.level.label} — nên triển khai {formatVND(suggested)}
              </p>
            </div>
            <button onClick={() => setShowDeploy(!showDeploy)} className="btn-primary text-sm">
              {showDeploy ? 'Đóng' : 'Triển khai ngay'}
            </button>
          </div>

          {opportunities.length > 1 && (
            <div className="mb-3 flex gap-2 flex-wrap">
              {opportunities.map(o => (
                <span key={o.id} className={`badge text-[10px] ${o.level.bg} ${o.level.text}`}>
                  {o.ticker || o.name}: -{(o.drawdown * 100).toFixed(1)}%
                </span>
              ))}
            </div>
          )}

          {showDeploy && (
            <div className="space-y-3 pt-3 border-t border-amber-200">
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-xs text-slate-500 mb-1 block">Tài sản</label>
                  <select value={deployForm.asset_type_id} onChange={e => setDeployForm({ ...deployForm, asset_type_id: e.target.value })} className="input text-sm">
                    {watchlist.filter(a => a.asset_class !== 'savings').map(a => (
                      <option key={a.id} value={a.id}>{a.ticker || a.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-slate-500 mb-1 block">Ngày</label>
                  <input type="date" value={deployForm.date} onChange={e => setDeployForm({ ...deployForm, date: e.target.value })} className="input text-sm" />
                </div>
                <div>
                  <label className="text-xs text-slate-500 mb-1 block">Ghi chú</label>
                  <input type="text" value={deployForm.note} onChange={e => setDeployForm({ ...deployForm, note: e.target.value })} className="input text-sm" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-500 mb-1 block">Số lượng</label>
                  <input type="number" value={deployForm.quantity} onChange={e => setDeployForm({ ...deployForm, quantity: e.target.value })} className="input text-sm" />
                </div>
                <div>
                  <label className="text-xs text-slate-500 mb-1 block">Giá (₫)</label>
                  <input type="text" inputMode="numeric" value={deployForm.price ? formatNumberInput(deployForm.price) : ''} onChange={e => setDeployForm({ ...deployForm, price: e.target.value.replace(/\D/g, '') })} className="input text-sm" />
                </div>
              </div>
              {parseFloat(deployForm.quantity) > 0 && parseNumberInput(deployForm.price) > 0 && (
                <div className="flex items-center justify-between p-3 bg-white rounded-xl">
                  <span className="text-sm text-slate-600">Thành tiền</span>
                  <span className="text-lg font-bold text-amber-700">{formatVND(parseFloat(deployForm.quantity) * parseNumberInput(deployForm.price))}</span>
                </div>
              )}
              <div className="flex justify-end gap-2">
                <button onClick={() => setShowDeploy(false)} className="btn-ghost text-sm">Hủy</button>
                <button onClick={handleDeploy} className="btn-primary" disabled={!deployForm.quantity || !deployForm.price}>Xác nhận</button>
              </div>
            </div>
          )}
        </div>
      )}

      {!bestOpp && watchlist.length > 0 && (
        <div className="card bg-emerald-50 border-emerald-200">
          <p className="text-sm text-emerald-700">Chưa có tài sản nào giảm ≥15%. Tiếp tục tích lũy kho đạn.</p>
        </div>
      )}

      {/* Bộ quy tắc */}
      <div className="card">
        <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Bộ quy tắc</h3>
        <div className="space-y-1.5">
          {levels.map((l, i) => (
            <div key={i} className={`flex items-center justify-between px-3 py-2 rounded-lg border text-xs ${l.bg}`}>
              <div className="flex items-center gap-2">
                <span className={`font-bold ${l.text}`}>{l.label}</span>
                <span className="text-slate-500">{l.condition}</span>
              </div>
              <span className="font-medium text-slate-600">{l.pct}% kho đạn</span>
            </div>
          ))}
        </div>
      </div>

      {/* Lịch sử */}
      <div className="card">
        <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-4">Lịch sử triển khai</h3>
        {deployHistory.length === 0 ? (
          <div className="text-center py-8 text-slate-400 text-sm">Chưa có lệnh bắn tỉa</div>
        ) : (
          <div className="table-wrap border-0 rounded-none">
            <table className="table">
              <thead>
                <tr><th>Ngày</th><th>Tài sản</th><th>Loại</th><th className="text-right">Khối lượng</th><th className="text-right">Giá</th><th className="text-right">Thành tiền</th><th>Ghi chú</th></tr>
              </thead>
              <tbody>
                {deployHistory.map(t => (
                  <tr key={t.id}>
                    <td className="font-medium">{formatDate(t.date)}</td>
                    <td className="flex items-center gap-1.5"><AppIcon emoji={t.icon} size={16} /> {t.display_name || t.asset_type_name}</td>
                    <td><span className={t.type === 'BUY' ? 'badge-success' : 'badge-danger'}>{t.type === 'BUY' ? 'MUA' : 'BÁN'}</span></td>
                    <td className="text-right">{t.quantity} {t.unit}</td>
                    <td className="text-right">{formatVND(t.price)}</td>
                    <td className="text-right font-semibold">{formatVND(t.total_amount)}</td>
                    <td className="text-xs text-slate-400 max-w-[200px] truncate">{t.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Phase guidance */}
      {phase?.guidance && (
        <div className="card">
          <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Hướng dẫn từ {phase.name}</h3>
          <div className="text-sm text-slate-600 whitespace-pre-line leading-relaxed">{phase.guidance}</div>
        </div>
      )}
    </div>
  );
}
