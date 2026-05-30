import { useState, useEffect } from 'react';
import { apiClient } from '../utils/apiClient';
import { formatVND, formatDate } from '../utils/formatters';
import { Plus, Pencil, Trash, ArrowDown, ArrowUp } from '@phosphor-icons/react';
import FormattedInput from './FormattedInput';

export default function SavingsSection() {
  const [accounts, setAccounts] = useState([]);
  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [depositingId, setDepositingId] = useState(null);
  const [form, setForm] = useState({ name: '', bank: '', account_type: 'term', interest_rate: 0, term_months: 6, start_date: new Date().toISOString().split('T')[0], auto_renew: false });
  const [depositForm, setDepositForm] = useState({ amount: 0, date: new Date().toISOString().split('T')[0], note: '' });

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    setAccounts(await apiClient.savings.get());
  }

  async function handleAdd() {
    if (!form.name) return alert('Nhập tên sổ');
    await apiClient.savings.add({ ...form, interest_rate: parseFloat(form.interest_rate), term_months: parseInt(form.term_months) });
    setForm({ name: '', bank: '', account_type: 'term', interest_rate: 0, term_months: 6, start_date: new Date().toISOString().split('T')[0], auto_renew: false });
    setShowAdd(false);
    loadData();
  }

  async function handleSaveEdit(id) {
    await apiClient.savings.update(id, form);
    setEditingId(null);
    loadData();
  }

  async function handleDeposit(id) {
    if (!depositForm.amount) return alert('Nhập số tiền');
    await apiClient.savings.addTransaction(id, 'deposit', depositForm.amount, depositForm.date, depositForm.note);
    setDepositingId(null);
    setDepositForm({ amount: 0, date: new Date().toISOString().split('T')[0], note: '' });
    loadData();
  }

  async function handleDelete(id) {
    if (!confirm('Xóa sổ tiết kiệm?')) return;
    await apiClient.savings.delete(id);
    loadData();
  }

  const totalPrincipal = accounts.filter(a => a.status === 'active').reduce((s, a) => s + (a.principal || 0), 0);
  const totalInterest = accounts.filter(a => a.status === 'active').reduce((s, a) => s + (a.accrued_interest || 0), 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">Tiết kiệm</h3>
        <button onClick={() => setShowAdd(!showAdd)} className="btn-primary flex items-center gap-1"><Plus size={16} /> Thêm sổ</button>
      </div>

      {/* Overview */}
      <div className="flex items-center gap-6 text-sm">
        <div><span className="text-gray-500">Tổng vốn:</span> <span className="font-semibold">{formatVND(totalPrincipal)}</span></div>
        <div><span className="text-gray-500">Lãi dự kiến:</span> <span className="font-semibold text-emerald-600">{formatVND(totalInterest)}</span></div>
        <div><span className="text-gray-500">Số sổ:</span> <span className="font-semibold">{accounts.filter(a => a.status === 'active').length}</span></div>
      </div>

      {/* Add Form */}
      {showAdd && (
        <div className="card border-emerald-200 bg-emerald-50/30">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div><label className="text-xs text-gray-500 mb-1 block">Tên sổ</label><input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="input" placeholder="VD: Tích lũy 6T" /></div>
            <div><label className="text-xs text-gray-500 mb-1 block">Ngân hàng</label><input value={form.bank} onChange={e => setForm({ ...form, bank: e.target.value })} className="input" placeholder="VD: Vietcombank" /></div>
            <div><label className="text-xs text-gray-500 mb-1 block">Loại</label>
              <select value={form.account_type} onChange={e => setForm({ ...form, account_type: e.target.value })} className="input">
                <option value="term">Có kỳ hạn</option>
                <option value="liquid">Không kỳ hạn</option>
              </select>
            </div>
            <div><label className="text-xs text-gray-500 mb-1 block">Lãi suất (%/năm)</label><input type="number" step="0.1" value={form.interest_rate} onChange={e => setForm({ ...form, interest_rate: e.target.value })} className="input" /></div>
            <div><label className="text-xs text-gray-500 mb-1 block">Kỳ hạn (tháng)</label><input type="number" value={form.term_months} onChange={e => setForm({ ...form, term_months: e.target.value })} className="input" /></div>
            <div><label className="text-xs text-gray-500 mb-1 block">Ngày bắt đầu</label><input type="date" value={form.start_date} onChange={e => setForm({ ...form, start_date: e.target.value })} className="input" /></div>
            <div className="flex items-end"><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.auto_renew} onChange={e => setForm({ ...form, auto_renew: e.target.checked })} /> Tự động gia hạn</label></div>
          </div>
          <div className="flex gap-2 mt-3">
            <button onClick={handleAdd} className="btn-success">Tạo sổ</button>
            <button onClick={() => setShowAdd(false)} className="btn-ghost">Hủy</button>
          </div>
        </div>
      )}

      {/* Accounts Table */}
      <div className="card">
        {accounts.length === 0 ? (
          <p className="text-gray-400 text-sm">Chưa có sổ tiết kiệm</p>
        ) : (
          <table className="table">
            <thead><tr><th>Tên sổ</th><th>Ngân hàng</th><th>Loại</th><th>Lãi suất</th><th>Vốn</th><th>Lãi</th><th>Ngày đáo hạn</th><th></th></tr></thead>
            <tbody>
              {accounts.map(a => (
                <tr key={a.id} className={a.status !== 'active' ? 'opacity-50' : ''}>
                  {editingId === a.id ? (
                    <>
                      <td colSpan={7}>
                        <div className="grid grid-cols-4 gap-2">
                          <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="input text-xs" />
                          <input value={form.bank} onChange={e => setForm({ ...form, bank: e.target.value })} className="input text-xs" />
                          <input type="number" step="0.1" value={form.interest_rate} onChange={e => setForm({ ...form, interest_rate: e.target.value })} className="input text-xs" />
                          <div className="flex gap-1">
                            <button onClick={() => handleSaveEdit(a.id)} className="btn-success text-xs px-2">Lưu</button>
                            <button onClick={() => setEditingId(null)} className="btn-ghost text-xs">Hủy</button>
                          </div>
                        </div>
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="font-medium">{a.name}</td>
                      <td>{a.bank}</td>
                      <td><span className="badge bg-gray-100">{a.account_type === 'term' ? `Có hạn ${a.term_months}T` : 'Không hạn'}</span></td>
                      <td>{a.interest_rate}%</td>
                      <td className="font-medium">{formatVND(a.principal)}</td>
                      <td className="text-emerald-600">{formatVND(a.accrued_interest || 0)}</td>
                      <td>{a.maturity_date ? formatDate(a.maturity_date) : '—'}</td>
                      <td>
                        <div className="flex gap-1">
                          <button onClick={() => { setDepositingId(depositingId === a.id ? null : a.id); setDepositForm({ amount: 0, date: new Date().toISOString().split('T')[0], note: '' }); }} className="btn-ghost p-1 text-emerald-600" title="Bơm vốn"><ArrowDown size={14} /></button>
                          <button onClick={() => { setEditingId(a.id); setForm({ name: a.name, bank: a.bank, account_type: a.account_type, interest_rate: a.interest_rate, term_months: a.term_months, start_date: a.start_date, auto_renew: a.auto_renew }); }} className="btn-ghost p-1" title="Sửa"><Pencil size={14} /></button>
                          <button onClick={() => handleDelete(a.id)} className="btn-ghost p-1 text-red-500" title="Xóa"><Trash size={14} /></button>
                        </div>
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* Deposit Form */}
        {depositingId && (
          <div className="mt-3 p-3 bg-emerald-50 rounded-xl border border-emerald-200">
            <p className="text-sm font-medium mb-2">Bơm vốn vào sổ</p>
            <div className="flex gap-3">
              <div className="flex-1"><label className="text-xs text-gray-500">Số tiền</label><FormattedInput value={depositForm.amount} onChange={v => setDepositForm({ ...depositForm, amount: v })} /></div>
              <div><label className="text-xs text-gray-500">Ngày</label><input type="date" value={depositForm.date} onChange={e => setDepositForm({ ...depositForm, date: e.target.value })} className="input" /></div>
              <div className="flex-1"><label className="text-xs text-gray-500">Ghi chú</label><input value={depositForm.note} onChange={e => setDepositForm({ ...depositForm, note: e.target.value })} className="input" placeholder="Ghi chú..." /></div>
              <div className="flex items-end gap-2">
                <button onClick={() => handleDeposit(depositingId)} className="btn-success">Bơm</button>
                <button onClick={() => setDepositingId(null)} className="btn-ghost">Hủy</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
