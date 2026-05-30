import { useState, useEffect } from 'react';
import { formatVND } from '../utils/formatters';
import { formatNumberInput, parseNumberInput } from '../utils/numberFormat';
import { apiClient } from '../utils/apiClient';
import AppIcon from '../utils/iconMap';
import { Warning, ClipboardText, Lightbulb, Drop, Lock, Diamond, Bank } from '@phosphor-icons/react';

const SJC_FALLBACK_PRICE = 17000000;

const CATEGORY_LABELS = {
  'Chứng Khoán': 'Đầu tư',
};

export default function SavingsSection() {
  const [overview, setOverview] = useState(null);
  const [savingsSummary, setSavingsSummary] = useState(null);
  const [savingsAccounts, setSavingsAccounts] = useState([]);
  const [maturities, setMaturities] = useState([]);
  const [addingSavings, setAddingSavings] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [depositingId, setDepositingId] = useState(null);
  const [depositForm, setDepositForm] = useState({ amount: '', date: new Date().toISOString().split('T')[0], note: '' });
  const [categories, setCategories] = useState([]);
  const [sjcPrice, setSjcPrice] = useState(SJC_FALLBACK_PRICE);
  const [savingsForm, setSavingsForm] = useState({
    name: '', bank: '', type: 'term', principal: '', interest_rate: '',
    term_months: '', start_date: new Date().toISOString().split('T')[0],
    auto_renew: false, category_id: '',
  });

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    try {
      const [ov, sum, mats, cats, accounts, assets] = await Promise.all([
        apiClient.savings.overview().catch(() => null),
        apiClient.savings.summary().catch(() => null),
        apiClient.savings.maturities(30).catch(() => []),
        apiClient.categories.get().catch(() => []),
        apiClient.savings.get().catch(() => []),
        apiClient.assets.get().catch(() => []),
      ]);
      setOverview(ov);
      setSavingsSummary(sum);
      setMaturities(mats);
      setCategories(cats);
      setSavingsAccounts(accounts);

      const sjc = assets.find(a => a.ticker === 'SJC');
      if (sjc && sjc.current_price > 0) setSjcPrice(sjc.current_price);
    } catch (err) {
      console.error('Savings load error:', err);
    }
  }

  async function handleAddSavings() {
    try {
      const data = {
        ...savingsForm,
        principal: parseNumberInput(savingsForm.principal),
        interest_rate: parseFloat(savingsForm.interest_rate) || 0,
        term_months: parseInt(savingsForm.term_months) || 0,
        category_id: savingsForm.category_id ? parseInt(savingsForm.category_id) : null,
      };
      if (data.type === 'term' && data.term_months > 0) {
        const d = new Date(data.start_date);
        d.setMonth(d.getMonth() + data.term_months);
        data.maturity_date = d.toISOString().split('T')[0];
      }
      await apiClient.savings.add(data);
      setAddingSavings(false);
      setSavingsForm({
        name: '', bank: '', type: 'term', principal: '', interest_rate: '',
        term_months: '', start_date: new Date().toISOString().split('T')[0],
        auto_renew: false, category_id: '',
      });
      loadData();
    } catch (err) {
      alert('Lỗi: ' + err.message);
    }
  }

  async function handleDeleteSavings(id) {
    if (!confirm('Xóa sổ tiết kiệm này?')) return;
    try {
      await apiClient.savings.delete(id);
      loadData();
    } catch (err) {
      alert('Lỗi: ' + err.message);
    }
  }

  function startEdit(account) {
    setEditingId(account.id);
    setDepositingId(null);
    setEditForm({
      name: account.name,
      bank: account.bank,
      type: account.type,
      interest_rate: account.interest_rate?.toString() || '',
      term_months: account.term_months?.toString() || '',
      start_date: account.start_date,
      auto_renew: !!account.auto_renew,
      category_id: account.category_id?.toString() || '',
    });
  }

  async function handleSaveEdit(id) {
    try {
      const data = {
        ...editForm,
        interest_rate: parseFloat(editForm.interest_rate) || 0,
        term_months: parseInt(editForm.term_months) || 0,
        category_id: editForm.category_id ? parseInt(editForm.category_id) : null,
      };
      if (data.type === 'term' && data.term_months > 0) {
        const d = new Date(data.start_date);
        d.setMonth(d.getMonth() + data.term_months);
        data.maturity_date = d.toISOString().split('T')[0];
      } else if (data.type === 'liquid') {
        data.maturity_date = null;
        data.term_months = 0;
      }
      await apiClient.savings.update(id, data);
      setEditingId(null);
      loadData();
    } catch (err) {
      alert('Lỗi: ' + err.message);
    }
  }

  async function handleDeposit(id) {
    const amount = parseNumberInput(depositForm.amount);
    if (!amount || amount <= 0) return;
    if (amount > availableForSavings) {
      alert(`Số tiền bơm (${formatVND(amount)}) vượt quá số tiền sẵn sàng (${formatVND(availableForSavings)}). Rút tiền hoặc nhập thêm phân bổ trước.`);
      return;
    }
    try {
      await apiClient.savings.addTransaction(id, 'deposit', amount, depositForm.date, depositForm.note || 'Bơm vốn');
      setDepositingId(null);
      setDepositForm({ amount: '', date: new Date().toISOString().split('T')[0], note: '' });
      loadData();
    } catch (err) {
      alert('Lỗi: ' + err.message);
    }
  }

  function getDaysUntilMaturity(maturityDate) {
    if (!maturityDate) return null;
    const now = new Date();
    const mat = new Date(maturityDate);
    return Math.ceil((mat - now) / (1000 * 60 * 60 * 24));
  }

  function getMaturityColor(days) {
    if (days === null) return 'text-slate-400';
    if (days < 0) return 'text-red-600';
    if (days <= 7) return 'text-red-500';
    if (days <= 30) return 'text-amber-500';
    return 'text-emerald-500';
  }

  function getMaturityLabel(days) {
    if (days === null) return '—';
    if (days < 0) return `Quá hạn ${Math.abs(days)} ngày`;
    if (days === 0) return 'Hôm nay';
    return `${days} ngày`;
  }

  // Derived data
  const totalInflow = overview?.totalInflow || 0;
  const totalAllocated = overview?.totalAllocated || 0;
  const totalInSavings = overview?.totalInSavings || 0;
  const totalAccrued = overview?.totalAccrued || 0;
  const availableForSavings = overview?.availableForSavings || 0;
  const totalUnallocated = overview?.totalUnallocated || 0;
  const phase = overview?.phase;
  const phaseAllocs = overview?.phaseAllocs || [];

  // Phase-based savings ratio
  const savingsRatio = phaseAllocs.find(pa => pa.category_name?.includes('Dự Phòng'))?.ratio || 0;
  const tktpRatio = phaseAllocs.find(pa => pa.category_name?.includes('Tiết kiệm'))?.ratio || 0;
  const totalSavingsRatio = savingsRatio + tktpRatio;

  // Gold accumulation
  const liquidBalance = savingsSummary?.byType?.liquid?.principal || 0;
  const goldProgress = sjcPrice > 0 ? Math.min((liquidBalance / sjcPrice) * 100, 100) : 0;
  const canBuyGold = liquidBalance >= sjcPrice;

  // Guidance text based on phase
  function getSavingsGuidance() {
    if (!phase) return null;
    const ratio = Math.round(totalSavingsRatio * 100);
    if (phase.sort_order === 1) {
      return {
        title: 'Giai đoạn Nền tảng',
        text: `Gửi ${ratio}% tiền nhàn rỗi vào 1 sổ tiết kiệm không kỳ hạn hoặc ngắn hạn (1-3 tháng). Mục tiêu: xây quỹ dự phòng ≥ 3× chi tiêu.`,
        tip: 'Ưu tiên thanh khoan — gửi không kỳ hạn hoặc 1 tháng để rút bất cứ lúc nào.',
      };
    }
    if (phase.sort_order === 2) {
      return {
        title: 'Giai đoạn Đa dạng',
        text: `Gửi ${ratio}% tiền nhàn rỗi. Tách thành 2-3 sổ: 1 sổ không kỳ hạn (dự phòng), 1-2 sổ kỳ hạn 3-6 tháng (lãi cao hơn).`,
        tip: 'Khi sổ đáo hạn → gửi lại kỳ hạn dài hơn để lãi suất cao hơn.',
      };
    }
    if (phase.sort_order === 3) {
      return {
        title: 'Giai đoạn Tăng trưởng',
        text: `Gửi ${ratio}% tiền nhàn rỗi. Áp dụng chiến lược "Thang bậc": chia thành nhiều sổ kỳ hạn khác nhau (3, 6, 12 tháng).`,
        tip: 'Sổ ngắn hạn đáo hạn → chuyển sang dài hạn. Luôn có tiền đáo hạn mỗi quý.',
      };
    }
    return {
      title: 'Giai đoạn Tự do',
      text: `Gửi ${ratio}% tiền nhàn rỗi. Ưu tiên trái phiếu chính phủ hoặc tiết kiệm kỳ hạn dài (12+ tháng) để lãi suất tối đa.`,
      tip: 'Rebalance mỗi quý. Duy trì 6× chi tiêu trong dự phòng.',
    };
  }

  const guidance = getSavingsGuidance();

  return (
    <div className="space-y-6">
      {/* ===== Money_Flow Overview ===== */}
      {overview && (
        <div className="card bg-gradient-to-r from-blue-50 to-violet-50 border-blue-200">
          <h3 className="text-sm font-semibold text-slate-700 mb-4">Dòng tiền Tiết kiệm</h3>

          {/* Visual flow */}
          <div className="grid grid-cols-4 gap-4 mb-4">
            <div className="text-center">
              <p className="text-[10px] text-slate-400 uppercase">Tổng tiền nhàn rỗi</p>
              <p className="text-lg font-bold text-slate-800">{formatVND(totalInflow)}</p>
              <p className="text-xs text-slate-400">Từ {overview.allocByCategory?.length || 0} tháng nhập liệu</p>
            </div>
            <div className="text-center">
              <p className="text-[10px] text-slate-400 uppercase">Phân bổ Dự phòng & TK</p>
              <p className="text-lg font-bold text-blue-600">{formatVND(totalAllocated)}</p>
              <p className="text-xs text-slate-400">{totalSavingsRatio > 0 ? `${Math.round(totalSavingsRatio * 100)}% theo phase` : 'Chưa phân bổ'}</p>
            </div>
            <div className="text-center">
              <p className="text-[10px] text-slate-400 uppercase">Đã vào sổ tiết kiệm</p>
              <p className="text-lg font-bold text-emerald-600">{formatVND(totalInSavings)}</p>
              <p className="text-xs text-slate-400">{savingsSummary?.accountCount || 0} sổ</p>
            </div>
            <div className="text-center">
              <p className="text-[10px] text-slate-400 uppercase">Chưa chuyển vào sổ</p>
              <p className={`text-lg font-bold ${availableForSavings > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
                {formatVND(availableForSavings)}
              </p>
              <p className="text-xs text-slate-400">{availableForSavings > 0 ? 'Nên tạo sổ mới' : 'Đã vào sổ hết'}</p>
            </div>
          </div>

          {/* Progress bar: allocated vs in-savings */}
          {totalAllocated > 0 && (
            <div>
              <div className="flex justify-between text-xs text-slate-500 mb-1">
                <span>Đã vào sổ: {formatVND(totalInSavings)}</span>
                <span>Tổng phân bổ: {formatVND(totalAllocated)}</span>
              </div>
              <div className="h-3 bg-slate-200 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-1000"
                  style={{
                    width: `${Math.min((totalInSavings / totalAllocated) * 100, 100)}%`,
                    background: totalInSavings >= totalAllocated ? '#10b981' : '#3b82f6',
                  }}
                />
              </div>
              <p className="text-[10px] text-slate-400 mt-1">
                {((totalInSavings / totalAllocated) * 100).toFixed(0)}% đã chuyển vào sổ tiết kiệm
              </p>
            </div>
          )}

          {/* Unallocated warning */}
          {totalUnallocated > 0 && (
            <div className="mt-3 p-2 bg-amber-50 border border-amber-200 rounded-lg">
              <p className="text-xs text-amber-700">
                <Warning size={14} className="inline mr-1" weight="fill" /> Còn <strong>{formatVND(totalUnallocated)}</strong> chưa được phân bổ. Hãy nhập liệu tháng mới để phân bổ tiền nhàn rỗi.
              </p>
            </div>
          )}
        </div>
      )}

      {/* ===== Phase Guidance ===== */}
      {guidance && (
        <div className="card">
          <div className="flex items-center gap-2 mb-3">
            <ClipboardText size={20} weight="regular" />
            <h3 className="text-sm font-semibold text-slate-700">Hướng dẫn — {guidance.title}</h3>
          </div>
          <p className="text-sm text-slate-600 mb-2">{guidance.text}</p>
          <p className="text-xs text-blue-600 bg-blue-50 p-2 rounded-lg flex items-start gap-1.5"><Lightbulb size={14} className="shrink-0 mt-0.5" weight="regular" /> {guidance.tip}</p>

          {/* Phase allocation breakdown */}
          {phaseAllocs.length > 0 && (
            <div className="mt-3 flex gap-2">
              {phaseAllocs.map(pa => (
                <div key={pa.category_name} className="flex-1 p-2 rounded-lg border border-slate-200 text-center">
                  <p className="text-xs text-slate-500 flex items-center justify-center gap-1"><AppIcon emoji={pa.icon} size={14} /> {CATEGORY_LABELS[pa.category_name] || pa.category_name}</p>
                  <p className="text-sm font-bold" style={{ color: pa.color }}>{(pa.ratio * 100).toFixed(0)}%</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ===== Type Breakdown + Gold Tracker ===== */}
      {savingsSummary && savingsSummary.accountCount > 0 && (
        <div className="grid grid-cols-3 gap-4">
          <div className="card">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center text-blue-600"><Drop size={18} weight="regular" /></div>
              <div>
                <p className="text-sm font-semibold text-slate-700">Không kỳ hạn</p>
                <p className="text-xs text-slate-400">{savingsSummary.byType.liquid.count} sổ</p>
              </div>
            </div>
            <p className="text-lg font-bold text-blue-600">{formatVND(savingsSummary.byType.liquid.principal)}</p>
            <p className="text-xs text-slate-400 mt-1">Rút bất cứ lúc nào</p>
          </div>

          <div className="card">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center text-emerald-600"><Lock size={18} weight="regular" /></div>
              <div>
                <p className="text-sm font-semibold text-slate-700">Có kỳ hạn</p>
                <p className="text-xs text-slate-400">{savingsSummary.byType.term.count} sổ</p>
              </div>
            </div>
            <p className="text-lg font-bold text-emerald-600">{formatVND(savingsSummary.byType.term.principal)}</p>
            <p className="text-xs text-slate-400 mt-1">Lãi suất cao hơn</p>
          </div>

          {/* Gold Tracker */}
          <div className="card bg-gradient-to-br from-amber-50 to-yellow-50 border-amber-200">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center text-amber-600"><Diamond size={18} weight="regular" /></div>
              <div>
                <p className="text-sm font-semibold text-amber-800">Tích lũy Vàng</p>
                <p className="text-xs text-amber-600">Mục tiêu: 1 lượng SJC</p>
              </div>
            </div>
            <p className="text-lg font-bold text-amber-700">{formatVND(liquidBalance)}</p>
            <p className="text-xs text-amber-600 mt-1">Tiền khả dụng / {formatVND(sjcPrice)}</p>
            <div className="mt-2 h-2 bg-amber-200 rounded-full overflow-hidden">
              <div className="h-full rounded-full transition-all" style={{ width: `${goldProgress}%`, background: canBuyGold ? '#10b981' : '#f59e0b' }} />
            </div>
            <div className="flex justify-between mt-1">
              <span className="text-[10px] text-amber-500">{goldProgress.toFixed(0)}%</span>
              {canBuyGold ? (
                <span className="text-xs font-bold text-emerald-600">Đủ mua 1 lượng SJC!</span>
              ) : (
                <span className="text-[10px] text-amber-500">Còn {formatVND(sjcPrice - liquidBalance)}</span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ===== Maturities ===== */}
      {maturities.length > 0 && (
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl">
          <p className="text-sm font-semibold text-amber-700 mb-2">Sắp đáo hạn (30 ngày tới):</p>
          {maturities.map(m => {
            const days = getDaysUntilMaturity(m.maturity_date);
            return (
              <div key={m.id} className="flex items-center justify-between text-sm py-1">
                <span className="text-amber-800">{m.name} — {m.bank}</span>
                <div className="flex items-center gap-3">
                  <span className="font-medium text-amber-700">{m.maturity_date}</span>
                  <span className={`text-xs font-medium ${getMaturityColor(days)}`}>{getMaturityLabel(days)}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ===== Savings Accounts Table ===== */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-slate-700">Sổ tiết kiệm</h3>
          <button onClick={() => setAddingSavings(!addingSavings)} className="btn-primary text-sm">
            {addingSavings ? 'Đóng' : '+ Thêm sổ'}
          </button>
        </div>

        {/* Quick add: show available amount */}
        {availableForSavings > 0 && !addingSavings && (
          <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-xl flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-blue-700">Có {formatVND(availableForSavings)} chưa chuyển vào sổ</p>
              <p className="text-xs text-blue-500">Tạo sổ tiết kiệm để bắt đầu sinh lời</p>
            </div>
            <button onClick={() => {
              setSavingsForm(f => ({ ...f, principal: availableForSavings.toString() }));
              setAddingSavings(true);
            }} className="btn-primary text-sm">Tạo sổ</button>
          </div>
        )}

        {/* Add form */}
        {addingSavings && (
          <div className="mb-4 p-4 bg-slate-50 rounded-xl border border-slate-200">
            <div className="grid grid-cols-3 gap-3 mb-3">
              <div>
                <label className="text-xs text-slate-500 mb-1 block">Tên sổ</label>
                <input type="text" value={savingsForm.name} onChange={e => setSavingsForm({ ...savingsForm, name: e.target.value })}
                  placeholder="VD: MBBank dự phòng" className="input text-sm" />
              </div>
              <div>
                <label className="text-xs text-slate-500 mb-1 block">Ngân hàng</label>
                <input type="text" value={savingsForm.bank} onChange={e => setSavingsForm({ ...savingsForm, bank: e.target.value })}
                  placeholder="VD: MBBank" className="input text-sm" />
              </div>
              <div>
                <label className="text-xs text-slate-500 mb-1 block">Loại</label>
                <select value={savingsForm.type} onChange={e => setSavingsForm({ ...savingsForm, type: e.target.value })} className="input text-sm">
                  <option value="liquid">Không kỳ hạn</option>
                  <option value="term">Có kỳ hạn</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-4 gap-3 mb-3">
              <div>
                <label className="text-xs text-slate-500 mb-1 block">Số tiền gốc</label>
                <input type="text" inputMode="numeric" value={savingsForm.principal ? formatNumberInput(savingsForm.principal) : ''} onChange={e => setSavingsForm({ ...savingsForm, principal: e.target.value.replace(/\D/g, '') })}
                  placeholder="10.000.000" className="input text-sm" />
              </div>
              <div>
                <label className="text-xs text-slate-500 mb-1 block">Lãi suất (%/năm)</label>
                <input type="number" step="0.1" value={savingsForm.interest_rate} onChange={e => setSavingsForm({ ...savingsForm, interest_rate: e.target.value })}
                  placeholder="3.5" className="input text-sm" />
              </div>
              <div>
                <label className="text-xs text-slate-500 mb-1 block">Kỳ hạn (tháng)</label>
                <input type="number" value={savingsForm.term_months} onChange={e => setSavingsForm({ ...savingsForm, term_months: e.target.value })}
                  placeholder="3" className="input text-sm" disabled={savingsForm.type === 'liquid'} />
              </div>
              <div>
                <label className="text-xs text-slate-500 mb-1 block">Ngày gửi</label>
                <input type="date" value={savingsForm.start_date} onChange={e => setSavingsForm({ ...savingsForm, start_date: e.target.value })}
                  className="input text-sm" />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3 mb-3">
              <div>
                <label className="text-xs text-slate-500 mb-1 block">Danh mục</label>
                <select value={savingsForm.category_id} onChange={e => setSavingsForm({ ...savingsForm, category_id: e.target.value })} className="input text-sm">
                  <option value="">— Chọn —</option>
                  {categories.filter(c => c.name.includes('Dự Phòng') || c.name.includes('Tiết kiệm')).map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
              <div className="flex items-end">
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={savingsForm.auto_renew} onChange={e => setSavingsForm({ ...savingsForm, auto_renew: e.target.checked })} />
                  Tự động tái tục
                </label>
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={handleAddSavings} className="btn-primary text-sm" disabled={!savingsForm.name || !savingsForm.bank}>Lưu</button>
              <button onClick={() => setAddingSavings(false)} className="btn-ghost text-sm">Hủy</button>
            </div>
          </div>
        )}

        {/* Accounts table */}
        {savingsAccounts.length > 0 ? (
          <div className="overflow-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>Sổ tiết kiệm</th><th>Loại</th>
                  <th className="text-right">Lãi suất</th><th className="text-right">Vốn gốc</th>
                  <th className="text-right">Lãi / Tổng</th>
                  <th>Đáo hạn</th><th></th>
                </tr>
              </thead>
              <tbody>
                {savingsAccounts.map(a => {
                  const days = getDaysUntilMaturity(a.maturity_date);
                  const accrued = a.accrued_interest || 0;
                  return (
                    <tr key={a.id}>
                      <td>
                        <div className="flex items-center gap-2">
                          <span>{a.type === 'liquid' ? <Drop size={16} className="text-blue-500" weight="regular" /> : <Lock size={16} className="text-emerald-500" weight="regular" />}</span>
                          <div>
                            <p className="text-sm font-medium text-slate-800">{a.name}</p>
                            {a.auto_renew ? <p className="text-[10px] text-blue-500">Tự tái tục</p> : null}
                          </div>
                        </div>
                      </td>
                      <td className="text-sm text-slate-600">{a.bank}</td>
                      <td>
                        <span className={a.type === 'liquid' ? 'badge bg-blue-100 text-blue-700' : 'badge bg-emerald-100 text-emerald-700'}>
                          {a.type === 'liquid' ? 'Không kỳ hạn' : `${a.term_months} tháng`}
                        </span>
                      </td>
                      <td className="text-right text-sm">{a.interest_rate}%</td>
                      <td className="text-right font-semibold text-sm">{formatVND(a.principal)}</td>
                      <td className="text-right text-sm text-emerald-600">+{formatVND(accrued)}</td>
                      <td className="text-right font-bold text-sm">{formatVND(a.principal + accrued)}</td>
                      <td>
                        {a.maturity_date ? (
                          <div>
                            <p className="text-xs text-slate-500">{a.maturity_date}</p>
                            <p className={`text-xs font-medium ${getMaturityColor(days)}`}>{getMaturityLabel(days)}</p>
                          </div>
                        ) : <span className="text-xs text-slate-300">—</span>}
                      </td>
                      <td>
                        <button onClick={() => handleDeleteSavings(a.id)} className="btn-ghost text-xs text-red-500 px-2 py-1">Xóa</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="bg-slate-50 font-semibold">
                  <td colSpan={3}>Tổng ({savingsAccounts.length} sổ)</td>
                  <td className="text-right text-sm font-semibold">{formatVND(totalInSavings)}</td>
                  <td className="text-right text-sm">
                    <span className="text-emerald-600">+{formatVND(totalAccrued)}</span>
                    <p className="text-xs font-bold">{formatVND(totalInSavings + totalAccrued)}</p>
                  </td>
                  <td colSpan={2}></td>
                </tr>
              </tfoot>
            </table>
          </div>
        ) : !addingSavings ? (
          <div className="text-center py-8 text-slate-400">
            <p className="text-sm">Chưa có sổ tiết kiệm nào</p>
            <p className="text-xs mt-1">Thêm sổ để theo dõi lãi suất và đáo hạn</p>
          </div>
        ) : null}
      </div>

      {/* ===== By Bank ===== */}
      {savingsSummary && Object.keys(savingsSummary.byBank || {}).length > 0 && (
        <div className="card">
          <h3 className="text-sm font-semibold text-slate-700 mb-4">Theo ngân hàng</h3>
          <div className="space-y-3">
            {Object.entries(savingsSummary.byBank).map(([bank, data]) => (
              <div key={bank} className="flex items-center justify-between p-4 bg-slate-50 rounded-xl">
                <div>
                  <p className="text-sm font-medium text-slate-700 flex items-center gap-1.5"><Bank size={16} weight="regular" /> {bank}</p>
                  <p className="text-xs text-slate-400">{data.count} sổ</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold text-slate-800">{formatVND(data.principal)}</p>
                  <p className="text-xs text-emerald-500">+{formatVND(data.accrued)} lãi</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
