import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { formatVND } from '../utils/formatters';
import { apiClient } from '../utils/apiClient';
import AppIcon, { Check, CheckCircle, Warning } from '../utils/iconMap';
import { formatNumberInput, parseNumberInput } from '../utils/numberFormat';

// ── Per-category metadata ──────────────────────────────────────────────────
// Returns short action hint shown in Step 2
function getCategoryHint(name = '') {
  if (name.includes('Dự Phòng'))       return 'Gửi vào sổ không kỳ hạn — rút được bất cứ lúc';
  if (name.includes('Tiết kiệm'))     return 'Gửi vào sổ kỳ hạn 3–6 tháng — lãi cao hơn';
  if (name.includes('Vàng'))            return 'Tích lũy. Khi đủ 1 chỉ SJC → ghi nhận mua vào Danh mục';
  if (name.includes('Chứng Khoán') || name.includes('Chứng khoán'))
                                        return 'Mua ETF / cổ phiếu đều đặn trong tháng';
  if (name.includes('Bắn Tỉa') || name.includes('Bắn Tiêd'))
                                        return 'Giữ tiền mặt. Chỉ triển khai khi thị trường sụt >15%';
  return 'Thực hiện theo kế hoạch';
}

// Returns navigation link for action in Step 3
function getCategoryLink(name = '') {
  if (name.includes('Dự Phòng') || name.includes('Tiết kiệm'))
    return '/investments?tab=savings';
  if (name.includes('Vàng'))
    return '/investments?tab=savings'; // Gold tracker is in savings
  return '/investments?tab=portfolio'; // Chứng Khoán, Bắn Tẩa
}

const STEPS = [
  { id: 1, label: 'Dòng tiền', desc: 'Thu nhập & chi tiêu' },
  { id: 2, label: 'Phân bổ', desc: 'Chia tiền vào danh mục' },
  { id: 3, label: 'Hoàn tất', desc: 'Xác nhận tháng' },
];

export default function MonthlyEntry() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(true);

  // Data
  const [nextMonth, setNextMonth] = useState(null);
  const [phase, setPhase] = useState(null);
  const [phaseAllocs, setPhaseAllocs] = useState([]);
  const [totalMonths, setTotalMonths] = useState(120);
  const [filled, setFilled] = useState([]);

  // Edit mode
  const [editMode, setEditMode] = useState(false);
  const [editMonth, setEditMonth] = useState(null);

  // Form
  const [income, setIncome] = useState('');
  const [expense, setExpense] = useState('');
  const [bonus, setBonus] = useState('');
  const [note, setNote] = useState('');
  const [allocs, setAllocs] = useState([]);

  // Delete confirm
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  // Expand history row to show allocation breakdown
  const [expandedMonth, setExpandedMonth] = useState(null);
  const [expandedAllocs, setExpandedAllocs] = useState([]);
  const [loadingExpand, setLoadingExpand] = useState(false);

  useEffect(() => { loadAll(); }, []);

  async function loadAll() {
    try {
      const [n, p, params, f] = await Promise.all([
        apiClient.monthly.next(),
        apiClient.phases.active(),
        apiClient.params.get(),
        apiClient.monthly.filled(),
      ]);
      setNextMonth(n);
      setPhase(p);
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
  const allocsInitialized = useRef(false);

  useEffect(() => {
    if (totalInflow > 0 && phaseAllocs.length > 0) {
      setAllocs(prev => {
        if (prev.length === 0) {
          allocsInitialized.current = true;
          return phaseAllocs.map(pa => ({
            category_id: pa.category_id,
            category_name: pa.category_name,
            color: pa.color,
            icon: pa.icon,
            ratio: pa.ratio,
            planned_amount: Math.round(totalInflow * pa.ratio),
          }));
        }
        return prev.map(a => ({
          ...a,
          planned_amount: Math.round(totalInflow * (a.ratio || 0)),
        }));
      });
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
        allocsInitialized.current = true;
        setAllocs(allocData.map(a => ({
          category_id: a.category_id,
          category_name: a.category_name,
          color: a.color,
          icon: a.icon,
          ratio: phaseAllocs.find(pa => pa.category_id === a.category_id)?.ratio || 0,
          planned_amount: a.planned_amount,
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
    setAllocs([]);
    allocsInitialized.current = false;
    setStep(1);
    loadAll();
  }

  async function handleDelete(monthIndex) {
    try {
      await apiClient.monthly.delete(monthIndex);
      setDeleteConfirm(null);
      if (expandedMonth === monthIndex) setExpandedMonth(null);
      loadAll();
    } catch (err) {
      console.error('Delete error:', err);
      alert('Lỗi khi xóa: ' + err.message);
    }
  }

  async function toggleExpand(monthIndex) {
    if (expandedMonth === monthIndex) { setExpandedMonth(null); return; }
    setExpandedMonth(monthIndex);
    setExpandedAllocs([]);
    setLoadingExpand(true);
    try {
      const entry = await apiClient.monthly.get(monthIndex);
      if (entry) {
        const allocData = await apiClient.allocations.get(entry.id);
        setExpandedAllocs(allocData || []);
      }
    } catch { setExpandedAllocs([]); } finally { setLoadingExpand(false); }
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
          actual_amount: a.planned_amount,
        })));
      }

      setStep(3);
    } catch (err) {
      console.error('Save error:', err);
      alert('Lỗi khi lưu: ' + err.message);
    }
  }

  function resetAndNew() {
    setEditMode(false);
    setEditMonth(null);
    setIncome(''); setExpense(''); setBonus(''); setNote('');
    setAllocs([]);
    allocsInitialized.current = false;
    setStep(1);
    loadAll();
  }

  if (loading) return <div className="flex items-center justify-center h-64 text-slate-400">Đang tải...</div>;

  const activeMonth = editMode ? editMonth : nextMonth;

  return (
    <div className="max-w-3xl mx-auto animate-fade-in">
      <div className="mb-6">
        <h1 className="page-title">Nhập liệu</h1>
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
        {/* STEP 1: Cash Flow */}
        {step === 1 && activeMonth && (
          <div className="space-y-5 animate-fade-in">
            <div>
              <h2 className="text-lg font-bold text-slate-800">Dòng tiền tháng {activeMonth.month_label}</h2>
              <p className="text-sm text-slate-500">Giai đoạn: <strong>{phase?.name}</strong></p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-medium text-slate-500 mb-1.5 block">Thu nhập chính (₫)</label>
                <input type="text" inputMode="numeric" value={income} onChange={e => setIncome(formatNumberInput(e.target.value))} placeholder="15.000.000" className="input input-lg" autoFocus />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-500 mb-1.5 block">Chi tiêu (₫)</label>
                <input type="text" inputMode="numeric" value={expense} onChange={e => setExpense(formatNumberInput(e.target.value))} placeholder="8.000.000" className="input input-lg" />
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

        {/* STEP 2: Allocation — editable with hints */}
        {step === 2 && (() => {
          const totalAlloced = allocs.reduce((s, a) => s + (a.planned_amount || 0), 0);
          const diff = totalAlloced - totalInflow;
          const hasDiff = Math.abs(diff) > 1;
          return (
            <div className="space-y-5 animate-fade-in">
              <div>
                <h2 className="text-lg font-bold text-slate-800">Phân bổ dòng tiền</h2>
                <p className="text-sm text-slate-500">
                  Tiền nhàn rỗi <strong>{formatVND(totalInflow)}</strong> theo <strong>{phase?.name}</strong>
                </p>
              </div>

              <div className="space-y-3">
                {allocs.map(a => (
                  <div
                    key={a.category_id}
                    className="p-3.5 rounded-xl border"
                    style={{ borderColor: a.color + '30', background: a.color + '08' }}
                  >
                    <div className="flex items-center justify-between gap-3">
                      {/* Left: icon + name + hint */}
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <div
                          className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
                          style={{ background: a.color }}
                        >
                          <AppIcon emoji={a.icon} size={18} color="white" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-slate-800 truncate">{a.category_name}</p>
                          <p className="text-[10px] text-slate-400 truncate">
                            {(a.ratio * 100).toFixed(0)}% · {getCategoryHint(a.category_name)}
                          </p>
                        </div>
                      </div>
                      {/* Right: editable amount */}
                      <input
                        type="text"
                        inputMode="numeric"
                        value={formatNumberInput(a.planned_amount?.toString() || '0')}
                        onChange={e => {
                          const val = parseNumberInput(e.target.value) || 0;
                          setAllocs(prev => prev.map(x =>
                            x.category_id === a.category_id ? { ...x, planned_amount: val } : x
                          ));
                        }}
                        className="input text-right font-bold w-36 shrink-0"
                        style={{ color: a.color }}
                      />
                    </div>
                  </div>
                ))}
              </div>

              {/* Total vs inflow */}
              <div className={`p-3 rounded-xl flex items-center justify-between ${
                hasDiff ? 'bg-amber-50 border border-amber-200' : 'bg-slate-50'
              }`}>
                <div>
                  <span className="text-sm text-slate-600">Tổng phân bổ</span>
                  {hasDiff && (
                    <p className="text-xs text-amber-600 flex items-center gap-1 mt-0.5">
                      <Warning size={12} weight="fill" />
                      {diff > 0 ? `Vượt ${formatVND(diff)} so với tiền nhàn rỗi` : `Thiếu ${formatVND(-diff)} so với tiền nhàn rỗi`}
                    </p>
                  )}
                </div>
                <div className="text-right">
                  <span className={`text-sm font-bold ${ hasDiff ? 'text-amber-600' : 'text-slate-800' }`}>
                    {formatVND(totalAlloced)}
                  </span>
                  {!hasDiff && <p className="text-[10px] text-emerald-500">✓ Khớp với tiền nhàn rỗi</p>}
                </div>
              </div>

              <div className="flex justify-between">
                <div className="flex gap-2">
                  <button onClick={() => setStep(1)} className="btn-ghost">← Quày lại</button>
                  <button
                    onClick={() => setAllocs(prev => prev.map(a => ({
                      ...a,
                      planned_amount: Math.round(totalInflow * (a.ratio || 0)),
                    })))}
                    className="btn-ghost text-xs"
                  >
                    🔄 Reset tỷ lệ
                  </button>
                </div>
                <button onClick={handleSave} className="btn-primary-lg">Lưu & Hoàn tất →</button>
              </div>
            </div>
          );
        })()}

        {/* STEP 3: Done + action checklist */}
        {step === 3 && (
          <div className="animate-fade-in">
            {/* Success header */}
            <div className="text-center py-6">
              <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-4">
                <CheckCircle size={32} className="text-emerald-500" weight="bold" />
              </div>
              <h2 className="text-xl font-bold text-slate-800 mb-1">
                {editMode ? `Đã cập nhật ${editMonth?.month_label}!` : `Đã lưu ${nextMonth?.month_label}!`}
              </h2>
              <p className="text-sm text-slate-500">
                Dòng tiền <strong>{formatVND(totalInflow)}</strong> đã phân bổ vào {allocs.length} danh mục.
              </p>
            </div>

            {/* Action checklist */}
            {allocs.length > 0 && (
              <div className="mb-6">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">
                  ✅ Việc cần thực hiện tiếp theo
                </p>
                <div className="space-y-2">
                  {allocs.map(a => (
                    <div
                      key={a.category_id}
                      className="flex items-center justify-between p-3 rounded-xl border group hover:shadow-sm transition-all"
                      style={{ borderColor: a.color + '25', background: a.color + '06' }}
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                          style={{ background: a.color + '20' }}
                        >
                          <AppIcon emoji={a.icon} size={16} color={a.color} />
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-slate-800">
                            {a.category_name} <span className="font-bold" style={{ color: a.color }}>{formatVND(a.planned_amount)}</span>
                          </p>
                          <p className="text-[11px] text-slate-400">{getCategoryHint(a.category_name)}</p>
                        </div>
                      </div>
                      <button
                        onClick={() => navigate(getCategoryLink(a.category_name))}
                        className="text-xs text-slate-400 hover:text-slate-700 shrink-0 ml-2 group-hover:text-primary-600 transition-colors"
                      >
                        Thực hiện →
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex justify-center gap-3">
              <button onClick={() => navigate('/')} className="btn-secondary">Về Dashboard</button>
              <button onClick={resetAndNew} className="btn-primary">{editMode ? 'Xong' : 'Nhập tháng tiếp'}</button>
            </div>
          </div>
        )}
      </div>

      {/* History Section — expandable */}
      {filled.length > 0 && (
        <div className="mt-8">
          <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-4">Lịch sử nhập liệu</h2>
          <div className="space-y-2">
            {filled.slice().reverse().map(m => {
              const isExpanded = expandedMonth === m.month_index;
              return (
                <div key={m.month_index} className="card py-0 overflow-hidden">
                  {/* Row header */}
                  <div className="flex items-center justify-between py-3">
                    <button
                      onClick={() => toggleExpand(m.month_index)}
                      className="flex items-center gap-3 flex-1 text-left hover:opacity-80 transition"
                    >
                      <div className="w-8 h-8 rounded-lg bg-primary-50 flex items-center justify-center text-xs font-bold text-primary-600 shrink-0">
                        {m.month_index}
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-slate-800">{m.month_label}</p>
                        <p className="text-xs text-slate-400">{m.note || 'Không có ghi chú'}</p>
                      </div>
                      <span className="text-slate-300 text-xs ml-1">{isExpanded ? '▲' : '▼'}</span>
                    </button>
                    <div className="flex items-center gap-4 shrink-0">
                      <div className="text-right">
                        <p className="text-sm font-bold text-primary-600">{formatVND(m.total_inflow)}</p>
                        <p className="text-xs text-slate-400">Thu: {formatVND((m.income || 0) + (m.bonus || 0))} · Chi: {formatVND(m.expense || 0)}</p>
                      </div>
                      <div className="flex gap-1">
                        <button onClick={() => startEdit(m.month_index)} className="btn-ghost text-xs px-2 py-1">Sửa</button>
                        <button onClick={() => setDeleteConfirm(m.month_index)} className="btn-ghost text-xs px-2 py-1 text-red-500">Xóa</button>
                      </div>
                    </div>
                  </div>

                  {/* Expanded allocation breakdown */}
                  {isExpanded && (
                    <div className="border-t border-slate-100 px-4 py-3 bg-slate-50">
                      {loadingExpand ? (
                        <p className="text-xs text-slate-400">Đang tải...</p>
                      ) : expandedAllocs.length > 0 ? (
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                          {expandedAllocs.map(a => (
                            <div
                              key={a.category_id || a.id}
                              className="flex items-center gap-2 p-2 rounded-lg"
                              style={{ background: (a.color || '#64748b') + '12' }}
                            >
                              <div
                                className="w-5 h-5 rounded flex items-center justify-center shrink-0"
                                style={{ background: a.color || '#64748b' }}
                              >
                                <AppIcon emoji={a.icon} size={12} color="white" />
                              </div>
                              <div className="min-w-0">
                                <p className="text-[10px] text-slate-500 truncate">{a.category_name}</p>
                                <p className="text-xs font-bold" style={{ color: a.color || '#64748b' }}>
                                  {formatVND(a.actual_amount || a.planned_amount || 0)}
                                </p>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-slate-400">Không có dữ liệu phân bổ.</p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirm && createPortal(
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 animate-fade-in">
          <div className="card max-w-sm w-full mx-4">
            <h3 className="text-lg font-bold text-slate-800 mb-2">Xóa nhập liệu?</h3>
            <p className="text-sm text-slate-500 mb-4">
              Dữ liệu tháng {filled.find(m => m.month_index === deleteConfirm)?.month_label} sẽ bị xóa.
            </p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setDeleteConfirm(null)} className="btn-ghost">Hủy</button>
              <button onClick={() => handleDelete(deleteConfirm)} className="btn-danger">Xóa</button>
            </div>
          </div>
        </div>,
        document.body
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
