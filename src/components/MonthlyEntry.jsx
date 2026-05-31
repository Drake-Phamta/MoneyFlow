import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { formatVND } from '../utils/formatters';
import { apiClient } from '../utils/apiClient';
import AppIcon from '../utils/iconMap';

const CATEGORY_LABELS = {
  'Chứng Khoán': 'Đầu tư',
};

// Format number with dot separators as user types (Vietnamese convention)
function formatNumberInput(value) {
  const nums = value.replace(/\D/g, '');
  if (!nums) return '';
  return nums.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

// Parse formatted string back to number
function parseNumberInput(value) {
  return parseFloat(value.replace(/\./g, '')) || 0;
}

const STEPS = [
  { id: 1, label: 'Dòng tiền', desc: 'Thu nhập & chi tiêu' },
  { id: 2, label: 'Phân bổ', desc: 'Chia tiền vào danh mục' },
  { id: 3, label: 'Giao dịch', desc: 'Ghi lệnh mua/bán' },
  { id: 4, label: 'Hoàn tất', desc: 'Xác nhận tháng' },
];

export default function MonthlyEntry() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(true);

  // Data
  const [nextMonth, setNextMonth] = useState(null);
  const [phase, setPhase] = useState(null);
  const [phaseAllocs, setPhaseAllocs] = useState([]);
  const [categories, setCategories] = useState([]);
  const [assetTypes, setAssetTypes] = useState([]);
  const [totalMonths, setTotalMonths] = useState(120);
  const [filled, setFilled] = useState([]);

  // Edit mode
  const [editMode, setEditMode] = useState(false); // null or month_index
  const [editMonth, setEditMonth] = useState(null);

  // Form
  const [income, setIncome] = useState('');
  const [expense, setExpense] = useState('');
  const [bonus, setBonus] = useState('');
  const [note, setNote] = useState('');
  const [allocs, setAllocs] = useState([]);
  const [trades, setTrades] = useState([]);

  // Budget tracking: how much spent per allocation category
  const spentByCategory = {};
  for (const t of trades) {
    if (t.category_id && t.quantity && t.price) {
      const amt = parseFloat(t.quantity) * parseFloat(t.price);
      spentByCategory[t.category_id] = (spentByCategory[t.category_id] || 0) + (t.type === 'BUY' ? amt : -amt);
    }
  }

  // Delete confirm
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  useEffect(() => { loadAll(); }, []);

  async function loadAll() {
    try {
      const [n, p, c, a, params, f] = await Promise.all([
        apiClient.monthly.next(),
        apiClient.phases.active(),
        apiClient.categories.get(),
        apiClient.assets.get(),
        apiClient.params.get(),
        apiClient.monthly.filled(),
      ]);
      setNextMonth(n);
      setPhase(p);
      setCategories(c);
      setAssetTypes(a);
      setFilled(f);
      const paramMap = {};
      for (const param of params) paramMap[param.key] = param.value;
      setTotalMonths(paramMap.TOTAL_MONTHS || 120);
      if (p) {
        const pa = await apiClient.phases.allocations(p.id);
        setPhaseAllocs(pa || []);
      }
    } catch (err) {
      console.error('Load error:', err);
    }
    setLoading(false);
  }

  const totalInflow = Math.max(0, parseNumberInput(income) - parseNumberInput(expense) + parseNumberInput(bonus));

  useEffect(() => {
    if (totalInflow > 0 && phaseAllocs.length > 0) {
      setAllocs(phaseAllocs.map(pa => ({
        category_id: pa.category_id,
        category_name: pa.category_name,
        color: pa.color,
        icon: pa.icon,
        ratio: pa.ratio,
        planned_amount: Math.round(totalInflow * pa.ratio),
        actual_amount: 0,
      })));
    }
  }, [totalInflow, phaseAllocs]);

  // Load existing month for editing
  async function startEdit(monthIndex) {
    try {
      const entry = await apiClient.monthly.get(monthIndex);
      if (!entry) return;
      const allocData = await apiClient.allocations.get(entry.id);

      setEditMode(true);
      setEditMonth(entry);
      setIncome(entry.income ? formatNumberInput(entry.income.toString()) : '');
      setExpense(entry.expense ? formatNumberInput(entry.expense.toString()) : '');
      setBonus(entry.bonus ? formatNumberInput(entry.bonus.toString()) : '');
      setNote(entry.note || '');
      setStep(1);

      if (allocData.length > 0) {
        setAllocs(allocData.map(a => ({
          category_id: a.category_id,
          category_name: a.category_name,
          color: a.color,
          icon: a.icon,
          ratio: 0,
          planned_amount: a.planned_amount,
          actual_amount: a.actual_amount,
        })));
      }
    } catch (err) {
      console.error('Start edit error:', err);
      alert('Lỗi khi tải dữ liệu: ' + err.message);
    }
  }

  function cancelEdit() {
    setEditMode(false);
    setEditMonth(null);
    setIncome(''); setExpense(''); setBonus(''); setNote('');
    setAllocs([]); setTrades([]);
    setStep(1);
    loadAll();
  }

  async function handleDelete(monthIndex) {
    try {
      await apiClient.monthly.delete(monthIndex);
      setDeleteConfirm(null);
      loadAll();
    } catch (err) {
      console.error('Delete error:', err);
      alert('Lỗi khi xóa: ' + err.message);
    }
  }

  function updateAllocAmount(catId, rawValue) {
    const amount = parseNumberInput(rawValue);
    setAllocs(prev => prev.map(a =>
      a.category_id === catId ? { ...a, actual_amount: amount } : a
    ));
  }

  function addTrade(categoryId) {
    setTrades(prev => [...prev, {
      id: Date.now(),
      date: new Date().toISOString().split('T')[0],
      category_id: categoryId || allocs[0]?.category_id || null,
      asset_type_id: assetTypes[0]?.id || 1,
      asset_name: '',
      type: 'BUY',
      quantity: '',
      price: '',
      note: '',
    }]);
  }

  function updateTrade(id, field, value) {
    setTrades(prev => prev.map(t => t.id === id ? { ...t, [field]: value } : t));
  }

  function removeTrade(id) {
    setTrades(prev => prev.filter(t => t.id !== id));
  }

  async function handleSave() {
    const target = editMode ? editMonth : nextMonth;
    if (!target || totalInflow <= 0) return;

    try {
      await apiClient.monthly.save({
        month_index: target.month_index,
        month_label: target.month_label,
        income: parseNumberInput(income),
        expense: parseNumberInput(expense),
        bonus: parseNumberInput(bonus),
        total_inflow: totalInflow,
        note,
        phase_id: phase?.id,
        status: 'confirmed',
      });

      const entry = await apiClient.monthly.get(target.month_index);
      if (entry && allocs.length > 0) {
        await apiClient.allocations.save(entry.id, allocs.map(a => ({
          category_id: a.category_id,
          planned_amount: a.planned_amount,
          actual_amount: a.actual_amount || a.planned_amount,
        })));
      }

      for (const t of trades) {
        if (t.quantity && t.price) {
          await apiClient.transactions.add({
            date: t.date,
            asset_type_id: parseInt(t.asset_type_id),
            asset_name: t.asset_name || '',
            type: t.type,
            quantity: parseFloat(t.quantity),
            price: parseFloat(t.price),
            total_amount: parseFloat(t.quantity) * parseFloat(t.price),
            note: t.note,
            monthly_entry_id: entry?.id,
          });
        }
      }

      setStep(4);
    } catch (err) {
      console.error('Save error:', err);
      alert('Lỗi khi lưu: ' + err.message);
    }
  }

  function resetAndNew() {
    setEditMode(false);
    setEditMonth(null);
    setIncome(''); setExpense(''); setBonus(''); setNote('');
    setAllocs([]); setTrades([]);
    setStep(1);
    loadAll();
  }

  if (loading) return <div className="flex items-center justify-center h-64 text-slate-400">Đang tải...</div>;

  const activeMonth = editMode ? editMonth : nextMonth;

  return (
    <div className="max-w-3xl mx-auto animate-fade-in">
      <div className="mb-6">
        <h1 className="page-title">Nhập Liệu</h1>
        <p className="page-subtitle">
          {editMode ? `Chỉnh sửa ${editMonth?.month_label}` : nextMonth ? `${nextMonth.month_label}` : 'Tất cả đã được ghi nhận'}
        </p>
      </div>

      {/* Steps */}
      <div className="flex items-center justify-between mb-8">
        {STEPS.map((s, i) => (
          <div key={s.id} className="flex items-center flex-1">
            <div className="flex items-center gap-2">
              <div className={step > s.id ? 'step-dot-done' : step === s.id ? 'step-dot-active' : 'step-dot-pending'}>
                {step > s.id ? <Check size={14} className="text-emerald-500" /> : s.id}
              </div>
              <div className="hidden sm:block">
                <p className={`text-xs font-semibold ${step >= s.id ? 'text-slate-700' : 'text-slate-400'}`}>{s.label}</p>
              </div>
            </div>
            {i < STEPS.length - 1 && <div className={`flex-1 h-0.5 mx-3 rounded ${step > s.id ? 'bg-emerald-400' : 'bg-slate-200'}`} />}
          </div>
        ))}
      </div>

      {/* Edit mode banner */}
      {editMode && (
        <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-center justify-between">
          <span className="text-sm text-amber-700">Đang chỉnh sửa tháng {editMonth?.month_label}</span>
          <button onClick={cancelEdit} className="btn-ghost text-xs">Hủy sửa</button>
        </div>
      )}

      <div className="card">
        {/* STEP 1 */}
        {step === 1 && activeMonth && (
          <div className="space-y-5 animate-fade-in">
            <div>
              <h2 className="text-lg font-bold text-slate-800">Dòng tiền tháng {activeMonth.month_label}</h2>
              <p className="text-sm text-slate-500">Phase: <strong>{phase?.name}</strong></p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-medium text-slate-500 mb-1.5 block">Thu nhập chính (₫)</label>
                <input type="text" inputMode="numeric" value={income} onChange={e => setIncome(formatNumberInput(e.target.value))} placeholder="3.700.000" className="input input-lg" autoFocus />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-500 mb-1.5 block">Chi tiêu (₫)</label>
                <input type="text" inputMode="numeric" value={expense} onChange={e => setExpense(formatNumberInput(e.target.value))} placeholder="0" className="input input-lg" />
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-500 mb-1.5 block">Thu nhập thêm / Thưởng (₫)</label>
              <input type="text" inputMode="numeric" value={bonus} onChange={e => setBonus(formatNumberInput(e.target.value))} placeholder="0" className="input" />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-500 mb-1.5 block">Ghi chú</label>
              <input type="text" value={note} onChange={e => setNote(e.target.value)} placeholder="VD: Tháng này dư ra được 1tr850..." className="input" />
            </div>
            {totalInflow > 0 && (
              <div className="bg-primary-50 border border-primary-100 rounded-xl p-4">
                <p className="text-xs font-medium text-primary-600">Tiền nhàn rỗi</p>
                <p className="text-3xl font-bold text-primary-700">{formatVND(totalInflow)}</p>
              </div>
            )}
            <div className="flex justify-end">
              <button onClick={() => setStep(2)} disabled={totalInflow <= 0} className="btn-primary-lg">Tiếp theo →</button>
            </div>
          </div>
        )}

        {/* STEP 2 */}
        {step === 2 && (
          <div className="space-y-5 animate-fade-in">
            <h2 className="text-lg font-bold text-slate-800">Phân bổ dòng tiền</h2>
            <div className="space-y-3">
              {allocs.map(a => (
                <div key={a.category_id} className="flex items-center justify-between p-4 rounded-xl border" style={{ borderColor: a.color + '30', background: a.color + '08' }}>
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white" style={{ background: a.color }}><AppIcon emoji={a.icon} size={20} color="white" /></div>
                    <div>
                      <p className="text-sm font-semibold text-slate-800">{CATEGORY_LABELS[a.category_name] || a.category_name}</p>
                      <p className="text-xs text-slate-500">{a.ratio > 0 ? `${(a.ratio * 100).toFixed(0)}% dòng tiền` : 'Tùy chỉnh'}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-bold" style={{ color: a.color }}>{formatVND(a.planned_amount)}</p>
                    <input type="text" inputMode="numeric" value={a.actual_amount ? formatNumberInput(a.actual_amount.toString()) : ''} onChange={e => updateAllocAmount(a.category_id, e.target.value)} placeholder={formatNumberInput(a.planned_amount.toString())} className="input text-xs py-1 w-32 text-right mt-1" />
                  </div>
                </div>
              ))}
            </div>
            <div className="flex justify-between">
              <button onClick={() => setStep(1)} className="btn-ghost">← Quay lại</button>
              <button onClick={() => setStep(3)} className="btn-primary-lg">Tiếp theo →</button>
            </div>
          </div>
        )}

        {/* STEP 3 */}
        {step === 3 && (
          <div className="space-y-5 animate-fade-in">
            <div>
              <h2 className="text-lg font-bold text-slate-800">Ghi giao dịch thực tế</h2>
              <p className="text-sm text-slate-500">Ghi lại các lệnh mua/bán đã thực hiện. Mỗi giao dịch gắn với một danh mục phân bổ.</p>
            </div>

            {/* Budget overview per category */}
            <div className="space-y-2">
              {allocs.filter(a => a.category_name !== 'Dự Phòng').map(a => {
                const budget = a.actual_amount || a.planned_amount;
                const spent = spentByCategory[a.category_id] || 0;
                const remaining = budget - spent;
                const pct = budget > 0 ? Math.min((spent / budget) * 100, 100) : 0;
                const catTrades = trades.filter(t => t.category_id === a.category_id);

                return (
                  <div key={a.category_id} className="border rounded-xl overflow-hidden" style={{ borderColor: a.color + '30' }}>
                    {/* Category header */}
                    <div className="p-3 flex items-center justify-between" style={{ background: a.color + '08' }}>
                      <div className="flex items-center gap-2">
                        <span className="text-lg"><AppIcon emoji={a.icon} size={20} /></span>
                        <div>
                          <p className="text-sm font-semibold text-slate-800">{CATEGORY_LABELS[a.category_name] || a.category_name}</p>
                          <p className="text-xs text-slate-500">Budget: {formatVND(budget)}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-slate-400">Còn lại</p>
                        <p className="text-sm font-bold" style={{ color: remaining >= 0 ? a.color : '#ef4444' }}>
                          {formatVND(remaining)}
                        </p>
                      </div>
                    </div>

                    {/* Progress bar */}
                    <div className="px-3 py-1">
                      <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: a.color }} />
                      </div>
                    </div>

                    {/* Trades under this category */}
                    <div className="px-3 pb-3 space-y-2">
                      {catTrades.map(t => (
                        <div key={t.id} className="flex items-center gap-2 bg-white rounded-lg p-2 border border-slate-100">
                          <select value={t.type} onChange={e => updateTrade(t.id, 'type', e.target.value)} className="input text-xs py-1 w-16">
                            <option value="BUY">MUA</option><option value="SELL">BÁN</option>
                          </select>
                          <select value={t.asset_type_id} onChange={e => updateTrade(t.id, 'asset_type_id', e.target.value)} className="input text-xs py-1 w-28">
                            {assetTypes.filter(at => at.ticker).map(at => <option key={at.id} value={at.id}>{at.ticker} — {at.name}</option>)}
                          </select>
                          <input type="text" value={t.asset_name} onChange={e => updateTrade(t.id, 'asset_name', e.target.value)} placeholder="Tên (VD: FPT, VNM...)" className="input text-xs py-1 flex-1" />
                          <input type="number" value={t.quantity} onChange={e => updateTrade(t.id, 'quantity', e.target.value)} placeholder="KL" className="input text-xs py-1 w-16" step="any" />
                          <input type="text" inputMode="numeric" value={t.price ? formatNumberInput(t.price.toString()) : ''} onChange={e => updateTrade(t.id, 'price', e.target.value.replace(/\D/g, ''))} placeholder="Giá" className="input text-xs py-1 w-24" />
                          <span className="text-xs font-semibold text-slate-600 w-20 text-right">
                            {(parseFloat(t.quantity) || 0) * (parseFloat(t.price) || 0) > 0
                              ? formatVND((parseFloat(t.quantity) || 0) * (parseFloat(t.price) || 0))
                              : '—'}
                          </span>
                          <button onClick={() => removeTrade(t.id)} className="text-slate-400 hover:text-red-500 p-1">
                            <X size={14} />
                          </button>
                        </div>
                      ))}
                      <button onClick={() => addTrade(a.category_id)} className="text-xs text-slate-400 hover:text-primary-600 flex items-center gap-1 py-1">
                        + Thêm giao dịch {CATEGORY_LABELS[a.category_name] || a.category_name}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Trades in categories without allocation (e.g. using existing funds) */}
            {allocs.filter(a => a.category_name === 'Dự Phòng').length > 0 && (
              <div className="border border-slate-200 rounded-xl p-3">
                <p className="text-xs text-slate-400 mb-2">Giao dịch từ quỹ khác (không gắn phân bổ tháng này)</p>
                <button onClick={() => addTrade(null)} className="btn-ghost text-xs">+ Thêm giao dịch khác</button>
              </div>
            )}

            <div className="flex justify-between pt-2">
              <button onClick={() => setStep(2)} className="btn-ghost">← Quay lại</button>
              <div className="flex gap-2">
                <button onClick={handleSave} className="btn-secondary">Lưu chưa có giao dịch</button>
                <button onClick={handleSave} className="btn-primary-lg">Lưu & Hoàn tất →</button>
              </div>
            </div>
          </div>
        )}

        {/* STEP 4: Done */}
        {step === 4 && (
          <div className="text-center py-8 animate-fade-in">
            <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-4">
              <CheckCircle size={32} className="text-emerald-500" weight="bold" />
            </div>
            <h2 className="text-xl font-bold text-slate-800 mb-2">
              {editMode ? `Đã cập nhật ${editMonth?.month_label}!` : `Đã lưu ${nextMonth?.month_label}!`}
            </h2>
            <p className="text-sm text-slate-500 mb-6">Dòng tiền {formatVND(totalInflow)} đã được lưu.</p>
            <div className="flex justify-center gap-3">
              <button onClick={() => navigate('/')} className="btn-secondary">Về Dashboard</button>
              <button onClick={resetAndNew} className="btn-primary">{editMode ? 'Xong' : 'Nhập tháng tiếp'}</button>
            </div>
          </div>
        )}
      </div>

      {/* History Section */}
      {filled.length > 0 && (
        <div className="mt-8">
          <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-4">Lịch sử nhập liệu</h2>
          <div className="space-y-2">
            {filled.slice().reverse().map(m => (
              <div key={m.month_index} className="card flex items-center justify-between py-3">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-primary-50 flex items-center justify-center text-xs font-bold text-primary-600">
                    {m.month_index}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-800">{m.month_label}</p>
                    <p className="text-xs text-slate-400">{m.note || 'Không có ghi chú'}</p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <p className="text-sm font-bold text-primary-600">{formatVND(m.total_inflow)}</p>
                    <p className="text-xs text-slate-400">Thu: {formatVND(m.total_inflow)}</p>
                  </div>
                  <div className="flex gap-1">
                    <button onClick={() => startEdit(m.month_index)} className="btn-ghost text-xs px-2 py-1">Sửa</button>
                    <button onClick={() => setDeleteConfirm(m.month_index)} className="btn-ghost text-xs px-2 py-1 text-red-500">Xóa</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 animate-fade-in">
          <div className="card max-w-sm w-full mx-4">
            <h3 className="text-lg font-bold text-slate-800 mb-2">Xóa nhập liệu?</h3>
            <p className="text-sm text-slate-500 mb-4">
              Dữ liệu tháng {filled.find(m => m.month_index === deleteConfirm)?.month_label} sẽ bị xóa. Các giao dịch liên quan cũng sẽ bị xóa.
            </p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setDeleteConfirm(null)} className="btn-ghost">Hủy</button>
              <button onClick={() => handleDelete(deleteConfirm)} className="btn-danger">Xóa</button>
            </div>
          </div>
        </div>
      )}

      {/* Empty state */}
      {filled.length === 0 && !editMode && step === 1 && (
        <div className="mt-6 card bg-amber-50 border-amber-200">
          <p className="text-sm text-amber-700">Bắt đầu bằng cách nhập thu nhập tháng đầu tiên ở trên.</p>
        </div>
      )}
    </div>
  );
}
