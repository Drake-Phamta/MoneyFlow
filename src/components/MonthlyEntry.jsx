import { useState, useEffect, useRef } from 'react';
import { apiClient } from '../utils/apiClient';
import { formatVND, formatDate } from '../utils/formatters';
import { Plus, Pencil, Trash, Check, X } from '@phosphor-icons/react';
import FormattedInput from './FormattedInput';

const MONTHS = ['01','02','03','04','05','06','07','08','09','10','11','12'];

export default function MonthlyEntry({ onSaved }) {
  const [entries, setEntries] = useState([]);
  const [categories, setCategories] = useState([]);
  const [phases, setPhases] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({ month: '', year: new Date().getFullYear(), income: 0, expenses: 0, savings: 0, notes: '', phase_id: null });
  const [allocations, setAllocations] = useState([]);

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    const [e, c, p] = await Promise.all([apiClient.monthly.get(), apiClient.categories.get(), apiClient.phases.get()]);
    setEntries(e); setCategories(c); setPhases(p);
  }

  function resetForm() {
    setForm({ month: '', year: new Date().getFullYear(), income: 0, expenses: 0, savings: 0, notes: '', phase_id: null });
    setAllocations([]); setEditingId(null); setShowForm(false); setStep(1);
  }

  function startEdit(entry) {
    setForm({ ...entry });
    setEditingId(entry.id);
    setShowForm(true);
    setStep(1);
    // Load allocations
    apiClient.allocations.get(entry.id).then(allocs => {
      setAllocations(allocs.map(a => ({ category_id: a.category_id, planned_amount: a.planned_amount, actual_amount: a.actual_amount })));
    });
  }

  async function handleSave() {
    if (!form.month || !form.year) return alert('Chọn tháng/năm');
    const saved = await apiClient.monthly.save(form);
    if (allocations.length > 0) {
      await apiClient.allocations.save(saved.id, allocations);
    }
    resetForm();
    loadData();
    onSaved?.();
  }

  async function handleDelete(id) {
    if (!confirm('Xóa bản ghi này?')) return;
    await apiClient.monthly.delete(id);
    loadData();
    onSaved?.();
  }

  function updateAllocation(catId, field, value) {
    setAllocations(prev => {
      const existing = prev.find(a => a.category_id === catId);
      if (existing) {
        return prev.map(a => a.category_id === catId ? { ...a, [field]: value } : a);
      }
      return [...prev, { category_id: catId, planned_amount: 0, actual_amount: 0, [field]: value }];
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">Bảng kê dòng tiền</h3>
        {!showForm && (
          <button onClick={() => { resetForm(); setShowForm(true); }} className="btn-primary flex items-center gap-1">
            <Plus size={16} /> Thêm mới
          </button>
        )}
      </div>

      {/* Form */}
      {showForm && (
        <div className="card border-primary-200 bg-primary-50/30">
          {/* Step indicator */}
          <div className="flex items-center gap-2 mb-4">
            {[1, 2, 3].map(s => (
              <div key={s} className={`step-dot ${step >= s ? 'bg-primary-600 text-white' : 'bg-gray-200 text-gray-500'}`}>{s}</div>
            ))}
            <span className="text-sm text-gray-500 ml-2">
              {step === 1 ? 'Dòng tiền' : step === 2 ? 'Phân bổ' : 'Hoàn tất'}
            </span>
          </div>

          {step === 1 && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Tháng</label>
                <select value={form.month} onChange={e => setForm({ ...form, month: e.target.value })} className="input">
                  <option value="">Chọn tháng</option>
                  {MONTHS.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Năm</label>
                <input type="number" value={form.year} onChange={e => setForm({ ...form, year: parseInt(e.target.value) })} className="input" />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Thu nhập</label>
                <FormattedInput value={form.income} onChange={v => setForm({ ...form, income: v })} />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Chi tiêu</label>
                <FormattedInput value={form.expenses} onChange={v => setForm({ ...form, expenses: v })} />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Tiết kiệm</label>
                <FormattedInput value={form.savings} onChange={v => setForm({ ...form, savings: v })} />
              </div>
              <div className="col-span-2">
                <label className="text-xs text-gray-500 mb-1 block">Ghi chú</label>
                <input type="text" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} className="input" placeholder="Ghi chú..." />
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-3">
              <p className="text-sm text-gray-600">Phân bổ thu nhập cho các danh mục:</p>
              {categories.map(cat => {
                const alloc = allocations.find(a => a.category_id === cat.id);
                return (
                  <div key={cat.id} className="flex items-center gap-3">
                    <span className="text-sm w-28">{cat.icon} {cat.name}</span>
                    <div className="flex-1">
                      <label className="text-xs text-gray-400">Dự kiến</label>
                      <FormattedInput value={alloc?.planned_amount || 0} onChange={v => updateAllocation(cat.id, 'planned_amount', v)} />
                    </div>
                    <div className="flex-1">
                      <label className="text-xs text-gray-400">Thực tế</label>
                      <FormattedInput value={alloc?.actual_amount || 0} onChange={v => updateAllocation(cat.id, 'actual_amount', v)} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {step === 3 && (
            <div className="space-y-2 text-sm">
              <p><strong>Tháng:</strong> {form.month}/{form.year}</p>
              <p><strong>Thu nhập:</strong> {formatVND(form.income)}</p>
              <p><strong>Chi tiêu:</strong> {formatVND(form.expenses)}</p>
              <p><strong>Tiết kiệm:</strong> {formatVND(form.savings)}</p>
              <p><strong>Phân bổ:</strong> {allocations.length} danh mục</p>
            </div>
          )}

          <div className="flex gap-2 mt-4">
            {step > 1 && <button onClick={() => setStep(step - 1)} className="btn-secondary">Quay lại</button>}
            {step < 3 && <button onClick={() => setStep(step + 1)} className="btn-primary">Tiếp theo</button>}
            {step === 3 && <button onClick={handleSave} className="btn-success flex items-center gap-1"><Check size={16} /> Lưu</button>}
            <button onClick={resetForm} className="btn-ghost"><X size={16} /></button>
          </div>
        </div>
      )}

      {/* History */}
      <div className="card">
        <h4 className="text-sm font-medium text-gray-500 mb-3">Lịch sử</h4>
        {entries.length === 0 ? (
          <p className="text-gray-400 text-sm">Chưa có dữ liệu</p>
        ) : (
          <table className="table">
            <thead><tr><th>Tháng</th><th>Thu nhập</th><th>Chi tiêu</th><th>Tiết kiệm</th><th>Ròng</th><th></th></tr></thead>
            <tbody>
              {entries.map(e => (
                <tr key={e.id}>
                  <td>{e.month}/{e.year}</td>
                  <td className="text-emerald-600">{formatVND(e.income)}</td>
                  <td className="text-red-600">{formatVND(e.expenses)}</td>
                  <td className="text-violet-600">{formatVND(e.savings)}</td>
                  <td className="font-medium">{formatVND(e.income - e.expenses)}</td>
                  <td>
                    <button onClick={() => startEdit(e)} className="btn-ghost p-1"><Pencil size={14} /></button>
                    <button onClick={() => handleDelete(e.id)} className="btn-ghost p-1 text-red-500"><Trash size={14} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
