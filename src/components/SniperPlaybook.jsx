import { useState, useEffect } from 'react';
import { apiClient } from '../utils/apiClient';
import { formatVND, formatPercent } from '../utils/formatters';
import { Crosshair, Eye, Plus, ArrowUp } from '@phosphor-icons/react';

const LEVELS = [
  { name: 'Giữ nguyên', color: 'bg-emerald-100 text-emerald-700', range: '<15%' },
  { name: 'Cấp 1', color: 'bg-yellow-100 text-yellow-700', range: '15-24%' },
  { name: 'Cấp 2', color: 'bg-orange-100 text-orange-700', range: '25-34%' },
  { name: 'Cấp 3', color: 'bg-red-100 text-red-700', range: '≥35%' },
];

export default function SniperPlaybook() {
  const [watchlist, setWatchlist] = useState([]);
  const [assets, setAssets] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ asset_type_id: '', target_price: 0, stop_loss: 0, notes: '' });

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    const [w, a, al] = await Promise.all([apiClient.watchlist.get(), apiClient.assets.get(), apiClient.alerts.get(true)]);
    setWatchlist(w); setAssets(a); setAlerts(al);
  }

  async function handleAdd() {
    if (!form.asset_type_id) return alert('Chọn tài sản');
    await apiClient.watchlist.add({ ...form, asset_type_id: parseInt(form.asset_type_id), target_price: parseFloat(form.target_price), stop_loss: parseFloat(form.stop_loss) });
    setForm({ asset_type_id: '', target_price: 0, stop_loss: 0, notes: '' });
    setShowAdd(false);
    loadData();
  }

  function getDrawdown(current, target) {
    if (!target || !current) return 0;
    return ((target - current) / target) * 100;
  }

  function getLevel(drawdown) {
    if (drawdown >= 35) return LEVELS[3];
    if (drawdown >= 25) return LEVELS[2];
    if (drawdown >= 15) return LEVELS[1];
    return LEVELS[0];
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold flex items-center gap-2"><Crosshair size={20} /> Bắn Tỉa</h3>
        <button onClick={() => setShowAdd(!showAdd)} className="btn-primary flex items-center gap-1"><Plus size={16} /> Theo dõi</button>
      </div>

      {/* Alerts */}
      {alerts.length > 0 && (
        <div className="card border-orange-200 bg-orange-50/30">
          <h4 className="text-sm font-medium mb-2">Cảnh báo</h4>
          {alerts.map(a => (
            <div key={a.id} className="flex items-center gap-2 text-sm py-1">
              <span className="text-orange-500">⚠</span>
              <span>{a.icon} {a.asset_name}: {a.message}</span>
              <span className="text-gray-400 text-xs ml-auto">{a.created_at?.split('T')[0]}</span>
            </div>
          ))}
        </div>
      )}

      {/* Add Form */}
      {showAdd && (
        <div className="card border-primary-200">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div><label className="text-xs text-gray-500">Tài sản</label>
              <select value={form.asset_type_id} onChange={e => setForm({ ...form, asset_type_id: e.target.value })} className="input">
                <option value="">Chọn</option>
                {assets.map(a => <option key={a.id} value={a.id}>{a.icon} {a.name}</option>)}
              </select>
            </div>
            <div><label className="text-xs text-gray-500">Giá mục tiêu</label><input type="number" value={form.target_price} onChange={e => setForm({ ...form, target_price: e.target.value })} className="input" /></div>
            <div><label className="text-xs text-gray-500">Cắt lỗ</label><input type="number" value={form.stop_loss} onChange={e => setForm({ ...form, stop_loss: e.target.value })} className="input" /></div>
            <div><label className="text-xs text-gray-500">Ghi chú</label><input value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} className="input" /></div>
          </div>
          <div className="flex gap-2 mt-3">
            <button onClick={handleAdd} className="btn-success">Thêm</button>
            <button onClick={() => setShowAdd(false)} className="btn-ghost">Hủy</button>
          </div>
        </div>
      )}

      {/* Deploy Rules */}
      <div className="card">
        <h4 className="text-sm font-medium mb-3">Quy tắc triển khai</h4>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {LEVELS.map((l, i) => (
            <div key={i} className={`p-3 rounded-xl ${l.color}`}>
              <div className="font-medium text-sm">{l.name}</div>
              <div className="text-xs opacity-75">Drawdown {l.range}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Watchlist Table */}
      <div className="card">
        <h4 className="text-sm font-medium mb-3">Danh sách theo dõi</h4>
        {watchlist.length === 0 ? (
          <p className="text-gray-400 text-sm">Chưa có tài sản nào</p>
        ) : (
          <table className="table">
            <thead><tr><th>Tài sản</th><th>Giá hiện tại</th><th>Mục tiêu</th><th>Drawdown</th><th>Cấp</th><th>Cắt lỗ</th></tr></thead>
            <tbody>
              {watchlist.map(w => {
                const dd = getDrawdown(w.current_price, w.target_price);
                const level = getLevel(dd);
                return (
                  <tr key={w.id}>
                    <td>{w.icon} {w.ticker}</td>
                    <td>{formatVND(w.current_price)}</td>
                    <td>{formatVND(w.target_price)}</td>
                    <td className={dd >= 25 ? 'text-red-600' : dd >= 15 ? 'text-orange-600' : 'text-gray-600'}>
                      {formatPercent(dd)}
                    </td>
                    <td><span className={`badge ${level.color}`}>{level.name}</span></td>
                    <td>{w.stop_loss ? formatVND(w.stop_loss) : '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
