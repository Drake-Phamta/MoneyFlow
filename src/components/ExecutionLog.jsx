import { useState, useEffect } from 'react';
import { apiClient } from '../utils/apiClient';
import { formatVND, formatDate } from '../utils/formatters';
import { Plus, ArrowUp, ArrowDown } from '@phosphor-icons/react';
import FormattedInput from './FormattedInput';

export default function ExecutionLog() {
  const [transactions, setTransactions] = useState([]);
  const [assets, setAssets] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ asset_type_id: '', type: 'buy', quantity: 0, price: 0, fee: 0, date: new Date().toISOString().split('T')[0], notes: '' });

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    const [t, a] = await Promise.all([apiClient.transactions.get(50), apiClient.assets.get()]);
    setTransactions(t); setAssets(a);
  }

  async function handleSave() {
    if (!form.asset_type_id || !form.quantity || !form.price) return alert('Điền đủ thông tin');
    const asset = assets.find(a => a.id === parseInt(form.asset_type_id));
    await apiClient.transactions.add({
      ...form,
      asset_type_id: parseInt(form.asset_type_id),
      total_amount: form.quantity * form.price + form.fee,
      asset_name: asset?.name,
    });
    setForm({ asset_type_id: '', type: 'buy', quantity: 0, price: 0, fee: 0, date: new Date().toISOString().split('T')[0], notes: '' });
    setShowForm(false);
    loadData();
  }

  const totalInvested = transactions.filter(t => t.type === 'buy').reduce((s, t) => s + t.total_amount, 0);
  const buyCount = transactions.filter(t => t.type === 'buy').length;
  const sellCount = transactions.filter(t => t.type === 'sell').length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">Nhật ký giao dịch</h3>
        <button onClick={() => setShowForm(!showForm)} className="btn-primary flex items-center gap-1">
          <Plus size={16} /> Thêm giao dịch
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="kpi"><span className="text-xs text-gray-500">Tổng đầu tư</span><span className="font-semibold">{formatVND(totalInvested)}</span></div>
        <div className="kpi"><span className="text-xs text-gray-500">Lần mua</span><span className="font-semibold text-emerald-600">{buyCount}</span></div>
        <div className="kpi"><span className="text-xs text-gray-500">Lần bán</span><span className="font-semibold text-red-600">{sellCount}</span></div>
      </div>

      {/* Form */}
      {showForm && (
        <div className="card border-primary-200 bg-primary-50/30">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Tài sản</label>
              <select value={form.asset_type_id} onChange={e => setForm({ ...form, asset_type_id: e.target.value })} className="input">
                <option value="">Chọn tài sản</option>
                {assets.map(a => <option key={a.id} value={a.id}>{a.icon} {a.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Loại</label>
              <select value={form.type} onChange={e => setForm({ ...form, type: e.target.value })} className="input">
                <option value="buy">Mua</option>
                <option value="sell">Bán</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Số lượng</label>
              <FormattedInput value={form.quantity} onChange={v => setForm({ ...form, quantity: v })} />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Giá</label>
              <FormattedInput value={form.price} onChange={v => setForm({ ...form, price: v })} />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Phí</label>
              <FormattedInput value={form.fee} onChange={v => setForm({ ...form, fee: v })} />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Ngày</label>
              <input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} className="input" />
            </div>
            <div className="col-span-2">
              <label className="text-xs text-gray-500 mb-1 block">Ghi chú</label>
              <input type="text" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} className="input" placeholder="Ghi chú..." />
            </div>
          </div>
          <div className="flex gap-2 mt-3">
            <button onClick={handleSave} className="btn-success">Lưu</button>
            <button onClick={() => setShowForm(false)} className="btn-ghost">Hủy</button>
          </div>
        </div>
      )}

      {/* Transaction List */}
      <div className="card">
        {transactions.length === 0 ? (
          <p className="text-gray-400 text-sm">Chưa có giao dịch</p>
        ) : (
          <table className="table">
            <thead><tr><th>Ngày</th><th>Tài sản</th><th>Loại</th><th>KL</th><th>Giá</th><th>Tổng</th></tr></thead>
            <tbody>
              {transactions.map(t => (
                <tr key={t.id}>
                  <td>{formatDate(t.date)}</td>
                  <td>{t.icon} {t.ticker || t.asset_name}</td>
                  <td>
                    <span className={`badge ${t.type === 'buy' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                      {t.type === 'buy' ? <ArrowUp size={12} /> : <ArrowDown size={12} />}
                      {t.type === 'buy' ? 'Mua' : 'Bán'}
                    </span>
                  </td>
                  <td>{t.quantity}</td>
                  <td>{formatVND(t.price)}</td>
                  <td className="font-medium">{formatVND(t.total_amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
