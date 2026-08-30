import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { actionFor, linkFor } from '../utils/categoryMeta.js';
import { formatVND } from '../utils/formatters';
import { apiClient } from '../utils/apiClient';
import AppIcon, { Check, CheckCircle, Warning, ArrowClockwise } from '../utils/iconMap';
import { Faders } from '@phosphor-icons/react';
import { formatNumberInput, parseNumberInput } from '../utils/numberFormat';
import { useConfirm } from './ui/index.jsx';

// ── Adjustment reasons ─────────────────────────────────────────────────────
const ADJUST_REASONS = [
  { key: 'market_dip', icon: '📈', label: 'Thị trường giảm, tăng mua CK' },
  { key: 'emergency', icon: '🛡️', label: 'Chi phí đột xuất, tăng dự phòng' },
  { key: 'gold_buy', icon: '🥇', label: 'Mua vàng đợt giảm giá' },
  { key: 'sniper', icon: '🎯', label: 'Triển khai Bắn Tỉa' },
  { key: 'bonus', icon: '💰', label: 'Thưởng/bonus lớn, phân bổ khác' },
  { key: 'other', icon: '✏️', label: 'Lý do khác' },
];

// ── Per-category metadata ──────────────────────────────────────────────────
// Returns short action hint shown in Step 2
const STEPS = [
  { id: 1, label: 'Dòng tiền', desc: 'Thu nhập & chi tiêu' },
  { id: 2, label: 'Phân bổ', desc: 'Chia tiền vào danh mục' },
  { id: 3, label: 'Hoàn tất', desc: 'Xác nhận tháng' },
];

export default function MonthlyEntry({ onSaved, onComplete }) {
  const { confirm, notify } = useConfirm();
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(true);

  // Data
  const [nextMonth, setNextMonth] = useState(null);
  const [phase, setPhase] = useState(null);
  const [snap, setSnap] = useState(null);
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

  // Adjustment mode for Step 2
  const [adjustMode, setAdjustMode] = useState(false);
  const [adjustReason, setAdjustReason] = useState('');
  const [customReason, setCustomReason] = useState('');

  // Delete confirm
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  // Expand history row to show allocation breakdown
  const [expandedMonth, setExpandedMonth] = useState(null);
  const [expandedAllocs, setExpandedAllocs] = useState([]);
  const [loadingExpand, setLoadingExpand] = useState(false);

  useEffect(() => { loadAll(); }, []);

  async function loadAll() {
    try {
      const [sn, n, f] = await Promise.all([
        apiClient.snapshot.get(),
        apiClient.monthly.next(),
        apiClient.monthly.filled(),
      ]);
      setSnap(sn);
      setNextMonth(n);
      setPhase(sn.phase);
      setFilled(f);
      setTotalMonths(sn.params.TOTAL_MONTHS || 120);
      setPhaseAllocs(sn.phaseAllocations?.[sn.phase?.sortOrder] || []);
    } catch (err) {
      console.error('Load error:', err);
    }
    setLoading(false);
  }

  const totalInflow = Math.max(0, parseNumberInput(income) - parseNumberInput(expense) + parseNumberInput(bonus));
  const allocsInitialized = useRef(false);

  // Số tiền nhàn rỗi mà mảng allocs hiện tại đang tương ứng.
  // Effect bên dưới chỉ chia lại khi con số này THỰC SỰ đổi. Nếu không có mốc
  // so sánh, effect sẽ chạy ngay sau startEdit() (lúc state income/expense vừa
  // được nạp) và ghi đè toàn bộ phân bổ đã lưu bằng tỷ lệ mặc định của giai
  // đoạn — nghĩa là chỉ cần bấm "Sửa" để đổi một dấu chấm trong ghi chú là mất
  // sạch khoản "Điều chỉnh tạm" đã ghi nhận trước đó.
  const allocsForInflow = useRef(null);

  useEffect(() => {
    if (totalInflow <= 0 || phaseAllocs.length === 0) return;

    // Phân bổ đã khớp với số tiền hiện tại → không đụng vào.
    // Giữ nguyên mọi điều chỉnh thủ công người dùng đã làm.
    if (allocsInitialized.current && allocsForInflow.current === totalInflow) return;

    setAllocs(prev => {
      if (prev.length === 0) {
        allocsInitialized.current = true;
        allocsForInflow.current = totalInflow;
        return phaseAllocs.map(pa => ({
          category_id: pa.category_id,
          category_name: pa.category_name,
          color: pa.color,
          icon: pa.icon,
          ratio: pa.ratio,
          planned_amount: Math.round(totalInflow * pa.ratio),
        }));
      }
      // Tiền nhàn rỗi đổi thật (người dùng sửa thu/chi/thưởng) → chia lại theo
      // tỷ trọng HIỆN TẠI của từng mục, không quay về tỷ lệ mặc định, để phần
      // điều chỉnh thủ công vẫn được giữ tương đối.
      const prevTotal = prev.reduce((s, a) => s + (a.planned_amount || 0), 0);
      allocsForInflow.current = totalInflow;
      if (prevTotal > 0) {
        return prev.map(a => ({
          ...a,
          planned_amount: Math.round(totalInflow * ((a.planned_amount || 0) / prevTotal)),
        }));
      }
      return prev.map(a => ({
        ...a,
        planned_amount: Math.round(totalInflow * (a.ratio || 0)),
      }));
    });
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
        // Ghim mốc: phân bổ vừa nạp tương ứng với tiền nhàn rỗi của chính tháng
        // này, nên effect chia lại sẽ bỏ qua và không ghi đè.
        allocsForInflow.current = entry.total_inflow;
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
      await notify({ message: 'Lỗi khi tải dữ liệu: ' + err.message });
    }
  }

  function cancelEdit() {
    setEditMode(false);
    setEditMonth(null);
    setIncome(''); setExpense(''); setBonus(''); setNote('');
    setAllocs([]);
    setAdjustMode(false); setAdjustReason(''); setCustomReason('');
    allocsInitialized.current = false;
    allocsForInflow.current = null;
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
      await notify({ message: 'Lỗi khi xóa: ' + err.message });
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

  // Build final note with adjustment reason appended
  function buildFinalNote() {
    let finalNote = note || '';
    if (adjustMode && adjustReason) {
      const reason = ADJUST_REASONS.find(r => r.key === adjustReason);
      const reasonText = adjustReason === 'other' && customReason
        ? customReason
        : reason?.label || '';
      if (reasonText) {
        const tag = `[Điều chỉnh: ${reasonText}]`;
        finalNote = finalNote ? `${finalNote} ${tag}` : tag;
      }
    }
    return finalNote;
  }

  // Auto-balance: when one alloc changes, redistribute remainder proportionally
  function adjustAlloc(targetCatId, newAmount) {
    setAllocs(prev => {
      const target = prev.find(a => a.category_id === targetCatId);
      if (!target) return prev;
      const clamped = Math.max(0, Math.min(newAmount, totalInflow));
      const oldOthersTotal = prev
        .filter(a => a.category_id !== targetCatId)
        .reduce((s, a) => s + (a.planned_amount || 0), 0);
      const newOthersTotal = totalInflow - clamped;
      return prev.map(a => {
        if (a.category_id === targetCatId) return { ...a, planned_amount: clamped };
        if (oldOthersTotal > 0) {
          return { ...a, planned_amount: Math.round((a.planned_amount / oldOthersTotal) * newOthersTotal) };
        }
        // Edge: all others were 0 — split equally
        const othersCount = prev.length - 1;
        return { ...a, planned_amount: othersCount > 0 ? Math.round(newOthersTotal / othersCount) : 0 };
      });
    });
  }

  // Step +/- by 5% of totalInflow
  function stepAdjust(catId, direction) {
    const stepAmount = Math.round(totalInflow * 0.05);
    const current = allocs.find(a => a.category_id === catId)?.planned_amount || 0;
    adjustAlloc(catId, current + direction * stepAmount);
  }

  async function handleSave() {
    const target = editMode ? editMonth : nextMonth;
    if (!target || totalInflow <= 0) return;

    try {
      const finalNote = buildFinalNote();
      await apiClient.monthly.save({
        month_index: target.month_index,
        month_label: target.month_label,
        income: parseNumberInput(income),
        expense: parseNumberInput(expense),
        bonus: parseNumberInput(bonus),
        total_inflow: totalInflow,
        note: finalNote,
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
      // Báo cho trang cha nạp lại biểu đồ và KPI, nhưng KHÔNG đóng wizard —
      // người dùng cần xem hết bước 3 (danh sách việc cần làm với từng danh mục).
      // Trước đây component không nhận prop nào cả nên callback của
      // CashFlowPage.jsx:124 không bao giờ chạy: lưu xong, số liệu phía sau vẫn
      // là số cũ cho tới khi rời trang rồi quay lại.
      if (typeof onSaved === 'function') onSaved();
    } catch (err) {
      console.error('Save error:', err);
      await notify({ message: 'Lỗi khi lưu: ' + err.message });
    }
  }

  function resetAndNew() {
    setEditMode(false);
    setEditMonth(null);
    setIncome(''); setExpense(''); setBonus(''); setNote('');
    setAllocs([]);
    setAdjustMode(false); setAdjustReason(''); setCustomReason('');
    allocsInitialized.current = false;
    allocsForInflow.current = null;
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
              <div className={(step > s.id || (step === 3 && s.id === 3)) ? 'step-dot-done' : step === s.id ? 'step-dot-active' : 'step-dot-pending'}>
                {(step > s.id || (step === 3 && s.id === 3)) ? <Check size={14} className="text-emerald-600" /> : s.id}
              </div>
              <div className="hidden sm:block">
                <p className={`text-xs font-semibold ${(step >= s.id) ? 'text-slate-700' : 'text-slate-400'}`}>{s.label}</p>
              </div>
            </div>
            {i < STEPS.length - 1 && <div className={`flex-1 h-0.5 mx-3 rounded ${(step > s.id || (step === 3 && s.id === 3 && i < 2)) ? 'bg-emerald-400' : 'bg-slate-200'}`} />}
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

        {/* STEP 2: Allocation — Smart Adjustment */}
        {step === 2 && (() => {
          const totalAlloced = allocs.reduce((s, a) => s + (a.planned_amount || 0), 0);
          const diff = totalAlloced - totalInflow;
          const hasDiff = Math.abs(diff) > 1;
          const isAdjusted = allocs.some(a => {
            const expected = Math.round(totalInflow * (a.ratio || 0));
            return Math.abs((a.planned_amount || 0) - expected) > 1;
          });
          return (
            <div className="space-y-4 animate-fade-in">
              <div>
                <h2 className="text-lg font-bold text-slate-800">Phân bổ dòng tiền</h2>
                <p className="text-sm text-slate-500">
                  Tiền nhàn rỗi <strong>{formatVND(totalInflow)}</strong> theo <strong>{phase?.name}</strong>
                </p>
              </div>

              {/* Adjustment mode banner */}
              {adjustMode && (
                <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 animate-fade-in">
                  <div className="flex items-center gap-2 mb-2">
                    <Faders size={16} weight="bold" className="text-amber-600" />
                    <span className="text-sm font-semibold text-amber-800">Điều chỉnh tạm tháng này</span>
                  </div>
                  <p className="text-[11px] text-amber-600 mb-3">Tỷ lệ gốc sẽ được giữ nguyên cho các tháng sau.</p>
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-amber-700">Lý do điều chỉnh</label>
                    <div className="grid grid-cols-2 gap-1.5">
                      {ADJUST_REASONS.map(r => (
                        <button
                          key={r.key}
                          onClick={() => { setAdjustReason(r.key); if (r.key !== 'other') setCustomReason(''); }}
                          className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-all text-left ${
                            adjustReason === r.key
                              ? 'bg-amber-200/60 text-amber-900 ring-1 ring-amber-400'
                              : 'bg-white/80 text-slate-600 hover:bg-amber-100/50'
                          }`}
                        >
                          <span>{r.icon}</span>
                          <span className="truncate">{r.label}</span>
                        </button>
                      ))}
                    </div>
                    {adjustReason === 'other' && (
                      <input
                        type="text"
                        value={customReason}
                        onChange={e => setCustomReason(e.target.value)}
                        placeholder="Nhập lý do..."
                        className="input text-xs mt-1"
                        autoFocus
                      />
                    )}
                  </div>
                </div>
              )}

              {/* Allocation rows */}
              <div className="rounded-xl border border-slate-200 overflow-hidden divide-y divide-slate-100">
                {allocs.map(a => {
                  const pct = totalInflow > 0 ? Math.min((a.planned_amount || 0) / totalInflow * 100, 100) : 0;
                  const originalAmount = Math.round(totalInflow * (a.ratio || 0));
                  const isChanged = Math.abs((a.planned_amount || 0) - originalAmount) > 1;
                  return (
                    <div
                      key={a.category_id}
                      className="relative group transition-colors duration-150 hover:bg-slate-50/80"
                    >
                      {/* Color accent strip */}
                      <div
                        className="absolute left-0 top-0 bottom-0 w-1 rounded-r"
                        style={{ background: a.color }}
                      />
                      <div className="flex items-center gap-3 pl-4 pr-3 py-3">
                        {/* Icon */}
                        <div
                          className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                          style={{ background: a.color + '18' }}
                        >
                          <AppIcon emoji={a.icon} size={16} color={a.color} />
                        </div>
                        {/* Name + ratio badge */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-semibold text-slate-700 truncate">{a.category_name}</p>
                            <span
                              className="text-fs-3 font-bold px-1.5 py-0.5 rounded-full shrink-0"
                              style={{ background: a.color + '15', color: a.color }}
                            >
                              {(a.ratio * 100).toFixed(0)}%
                            </span>
                            {adjustMode && isChanged && (
                              <span className="text-fs-3 font-medium px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 shrink-0">
                                → {pct.toFixed(0)}%
                              </span>
                            )}
                          </div>
                          {/* Mini progress bar */}
                          <div className="h-1 bg-slate-100 rounded-full mt-1.5 overflow-hidden" style={{ maxWidth: '140px' }}>
                            <div
                              className="h-full rounded-full transition-all duration-300"
                              style={{ width: `${pct}%`, background: a.color }}
                            />
                          </div>
                        </div>
                        {/* Amount display or edit controls */}
                        {adjustMode ? (
                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              onClick={() => stepAdjust(a.category_id, -1)}
                              className="w-7 h-7 rounded-lg bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500 text-sm font-bold transition-colors"
                              disabled={(a.planned_amount || 0) <= 0}
                            >−</button>
                            <input
                              type="text"
                              inputMode="numeric"
                              value={formatNumberInput(a.planned_amount?.toString() || '0')}
                              onChange={e => {
                                const val = parseNumberInput(e.target.value) || 0;
                                adjustAlloc(a.category_id, val);
                              }}
                              className="w-24 text-right font-bold text-sm bg-transparent border-0 outline-none py-1 px-1 rounded-lg transition-colors focus:bg-white focus:ring-2 focus:ring-offset-0"
                              style={{ color: a.color, '--tw-ring-color': a.color + '30' }}
                            />
                            <button
                              onClick={() => stepAdjust(a.category_id, 1)}
                              className="w-7 h-7 rounded-lg bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500 text-sm font-bold transition-colors"
                              disabled={(a.planned_amount || 0) >= totalInflow}
                            >+</button>
                          </div>
                        ) : (
                          <span className="text-sm font-bold shrink-0 tabular-nums" style={{ color: a.color }}>
                            {formatVND(a.planned_amount || 0)}
                          </span>
                        )}
                      </div>
                      {/* Hover hint tooltip */}
                      <div className="hidden group-hover:block absolute left-10 -bottom-1 translate-y-full z-10 px-3 py-1.5 bg-slate-800 text-oncolor text-[11px] rounded-lg shadow-lg whitespace-nowrap max-w-[280px] truncate pointer-events-none">
                        {actionFor(a.category_name, { goldUnitPrice: snap?.prices?.goldUnit })}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Total row */}
              <div className={`p-3 rounded-xl flex items-center justify-between ${
                hasDiff ? 'bg-amber-50 border border-amber-200' : 'bg-slate-50 border border-slate-100'
              }`}>
                <div>
                  <span className="text-sm text-slate-600 font-medium">Tổng phân bổ</span>
                  {hasDiff && (
                    <p className="text-xs text-amber-600 flex items-center gap-1 mt-0.5">
                      <Warning size={12} weight="fill" />
                      {diff > 0 ? `Vượt ${formatVND(diff)}` : `Thiếu ${formatVND(-diff)}`}
                    </p>
                  )}
                </div>
                <div className="text-right">
                  <span className={`text-base font-bold ${ hasDiff ? 'text-amber-600' : 'text-slate-800' }`}>
                    {formatVND(totalAlloced)}
                  </span>
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center justify-between pt-1">
                <div className="flex gap-2">
                  <button onClick={() => setStep(1)} className="btn-ghost text-sm">← Quay lại</button>
                  {adjustMode ? (
                    <button
                      onClick={() => {
                        setAdjustMode(false);
                        setAdjustReason('');
                        setCustomReason('');
                        setAllocs(prev => prev.map(a => ({
                          ...a,
                          planned_amount: Math.round(totalInflow * (a.ratio || 0)),
                        })));
                      }}
                      className="btn-ghost text-xs flex items-center gap-1.5"
                    >
                      <ArrowClockwise size={14} weight="bold" />
                      Hủy điều chỉnh
                    </button>
                  ) : (
                    <button
                      onClick={() => setAdjustMode(true)}
                      className="btn-ghost text-xs flex items-center gap-1.5"
                    >
                      <Faders size={14} weight="bold" />
                      Điều chỉnh tạm
                    </button>
                  )}
                </div>
                <button
                  onClick={handleSave}
                  disabled={adjustMode && !adjustReason}
                  className="btn-primary-lg"
                  title={adjustMode && !adjustReason ? 'Chọn lý do điều chỉnh trước' : ''}
                >
                  Lưu & Hoàn tất →
                </button>
              </div>
              {adjustMode && !adjustReason && (
                <p className="text-[11px] text-amber-600 text-right -mt-2">Vui lòng chọn lý do điều chỉnh phía trên</p>
              )}
            </div>
          );
        })()}

        {/* STEP 3: Done + action checklist */}
        {step === 3 && (
          <div className="animate-fade-in">
            {/* Success header */}
            <div className="text-center py-6">
              <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-4">
                <CheckCircle size={32} className="text-emerald-600" weight="bold" />
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
                          <p className="text-[11px] text-slate-400">{actionFor(a.category_name, { goldUnitPrice: snap?.prices?.goldUnit })}</p>
                        </div>
                      </div>
                      <button
                        onClick={() => navigate(linkFor(a.category_name))}
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
              <button
                onClick={() => {
                  // "Xong" khi đang sửa = đóng wizard; "Nhập tháng tiếp" = ở lại.
                  if (editMode && typeof onComplete === 'function') onComplete();
                  else resetAndNew();
                }}
                className="btn-primary"
              >
                {editMode ? 'Xong' : 'Nhập tháng tiếp'}
              </button>
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
                      <span className="text-slate-400 text-xs ml-1">{isExpanded ? '▲' : '▼'}</span>
                    </button>
                    <div className="flex items-center gap-4 shrink-0">
                      <div className="text-right">
                        <p className="text-sm font-bold text-primary-600">{formatVND(m.total_inflow)}</p>
                        <p className="text-xs text-slate-400">Thu: {formatVND((m.income || 0) + (m.bonus || 0))} · Chi: {formatVND(m.expense || 0)}</p>
                      </div>
                      <div className="flex gap-1">
                        <button onClick={() => startEdit(m.month_index)} className="btn-ghost text-xs px-2 py-1">Sửa</button>
                        <button onClick={() => setDeleteConfirm(m.month_index)} className="btn-ghost text-xs px-2 py-1 text-red-600">Xóa</button>
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
                                <p className="text-fs-2 text-slate-500 truncate">{a.category_name}</p>
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
