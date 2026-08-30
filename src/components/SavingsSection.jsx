import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { formatVND, todayLocal, toLocalDateStr } from '../utils/formatters';
import { formatNumberInput, parseNumberInput } from '../utils/numberFormat';
import { apiClient } from '../utils/apiClient';
import AppIcon from '../utils/iconMap';
import { Warning, ClipboardText, Lightbulb, Drop, Lock, Diamond, Bank } from '../utils/iconMap';
import { buildSavingsGuidance } from '../content/phases.js';

const SJC_FALLBACK_PRICE = 16000000; // 1 chỉ SJC (giá định mức)

export default function SavingsSection() {
  const [loading, setLoading] = useState(true);
  const [overview, setOverview] = useState(null);
  const [snap, setSnap] = useState(null);
  const [savingsSummary, setSavingsSummary] = useState(null);
  const [savingsAccounts, setSavingsAccounts] = useState([]);
  const [maturities, setMaturities] = useState([]);
  const [addingSavings, setAddingSavings] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [depositingId, setDepositingId] = useState(null);
  const [depositForm, setDepositForm] = useState({ amount: '', date: todayLocal(), note: '' });
  const [categories, setCategories] = useState([]);
  const [sjcPrice, setSjcPrice] = useState(SJC_FALLBACK_PRICE);
  const [sjcAssetId, setSjcAssetId] = useState(null);
  const [goldBought, setGoldBought] = useState(0); // total chỉ vàng SJC đã mua
  const [showGoldBuyModal, setShowGoldBuyModal] = useState(false);
  const [goldBuying, setGoldBuying] = useState(false);
  const [goldBuyDate, setGoldBuyDate] = useState(todayLocal());
  const [savingsForm, setSavingsForm] = useState({
    name: '', bank: '', type: 'term', product_type: 'savings', principal: '', interest_rate: '',
    term_months: '', start_date: todayLocal(),
    auto_renew: false, category_id: '',
  });

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    try {
      const [ov, sum, mats, cats, accounts, assets, txns, sn] = await Promise.all([
        apiClient.savings.overview().catch(() => null),
        apiClient.savings.summary().catch(() => null),
        apiClient.savings.maturities(30).catch(() => []),
        apiClient.categories.get().catch(() => []),
        apiClient.savings.get().catch(() => []),
        apiClient.assets.get().catch(() => []),
        apiClient.transactions.get().catch(() => []),
        apiClient.snapshot.get().catch(() => null),
      ]);
      setSnap(sn);
      setOverview(ov);
      setSavingsSummary(sum);
      setMaturities(mats);
      setCategories(cats);
      setSavingsAccounts(accounts);

      const sjc = assets.find(a => a.ticker === 'SJC' && a.asset_class === 'gold');
      if (sjc && sjc.current_price > 0) setSjcPrice(sjc.current_price);
      if (sjc) setSjcAssetId(sjc.id);

      // Count total chỉ vàng SJC đã mua (BUY - SELL)
      const goldTxns = txns.filter(t => {
        const name = (t.asset_type_name || t.display_name || t.asset_name || '').toLowerCase();
        return name.includes('sjc') || name.includes('vàng sjc');
      });
      const bought = goldTxns.reduce((sum, t) => sum + (t.type === 'BUY' ? t.quantity : -t.quantity), 0);
      setGoldBought(Math.max(0, bought));
    } catch (err) {
      console.error('Savings load error:', err);
    } finally {
      setLoading(false);
    }
  }

  async function handleBuyGold() {
    if (!sjcAssetId) {
      alert('Không tìm thấy tài sản Vàng SJC trong hệ thống. Vui lòng kiểm tra mục Cài đặt > Tài sản.');
      return;
    }
    setGoldBuying(true);
    try {
      await apiClient.transactions.add({
        date: goldBuyDate,
        asset_type_id: sjcAssetId,
        asset_name: 'SJC',
        type: 'BUY',
        quantity: 1,
        price: sjcPrice,
        total_amount: sjcPrice,
        note: 'Tích luỹ vàng — mua 1 chỉ SJC',
        strategy: 'DCA',
      });
      setShowGoldBuyModal(false);
      loadData(); // refresh gold count + savings
    } catch (err) {
      alert('Lỗi khi ghi nhận mua vàng: ' + err.message);
    } finally {
      setGoldBuying(false);
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
        data.maturity_date = toLocalDateStr(d);
      }
      await apiClient.savings.add(data);
      setAddingSavings(false);
      setSavingsForm({
        name: '', bank: '', type: 'term', product_type: 'savings', principal: '', interest_rate: '',
        term_months: '', start_date: todayLocal(),
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
        data.maturity_date = toLocalDateStr(d);
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

  async function handleDeleteTransaction(accountId, id) {
    if (!confirm('Bạn có chắc chắn muốn xóa giao dịch này? Số tiền gốc của sổ sẽ tự động thay đổi.')) return;
    try {
      await apiClient.savings.deleteTransaction(id);
      loadData();
      // Reload active account transactions by finding it
      const updated = await apiClient.savings.get();
      const match = updated.find(a => a.id === accountId);
      if (match) {
        // If we need to update state, it is reloaded by loadData()
      }
    } catch (err) {
      alert('Lỗi: ' + err.message);
    }
  }

  async function handleUpdateTransactionDate(id, date) {
    try {
      await apiClient.savings.updateTransactionDate(id, date);
      loadData();
    } catch (err) {
      alert('Lỗi: ' + err.message);
    }
  }

  async function handleDeposit(id) {
    const amount = parseNumberInput(depositForm.amount);
    if (!amount || amount <= 0) return;

    // Find the account to check its category
    const acc = savingsAccounts.find(a => a.id === id);
    const isDP   = acc?.category_name?.includes('Dự Phòng');
    const isTKTP = acc?.category_name?.includes('Tiết kiệm');
    const bucketAvail = isDP ? availableForDuPhong : isTKTP ? availableForTKTP : null;

    // Warn if exceeding the bucket pool — but do NOT hard-block (user may be adding fresh cash)
    if (bucketAvail !== null && amount > bucketAvail && bucketAvail > 0) {
      const ok = window.confirm(
        `Số tiền bơm (${formatVND(amount)}) vượt quá quỹ phân bổ còn lại (${formatVND(bucketAvail)}).\n` +
        `Bạn có muốn tiếp tục không? (Ví dụ: bạn đang bơm thêm tiền từ nguồn khác)`
      );
      if (!ok) return;
    }

    try {
      await apiClient.savings.addTransaction(id, 'deposit', amount, depositForm.date, depositForm.note || 'Bơm vốn');
      setDepositingId(null);
      setDepositForm({ amount: '', date: todayLocal(), note: '' });
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
    if (days <= 7) return 'text-red-600';
    if (days <= 30) return 'text-amber-600';
    return 'text-emerald-600';
  }

  function getMaturityLabel(days) {
    if (days === null) return '—';
    if (days < 0) return `Quá hạn ${Math.abs(days)} ngày`;
    if (days === 0) return 'Hôm nay';
    return `${days} ngày`;
  }

  // ── Derived data ─────────────────────────────────────────────────────────
  const totalInflow        = overview?.totalInflow        || 0;
  const totalAllocated     = overview?.totalAllocated     || 0;
  const totalInSavings     = overview?.totalInSavings     || 0;
  const totalAccrued       = overview?.totalAccrued       || 0;
  const availableForSavings = overview?.availableForSavings || 0;
  const totalUnallocated   = overview?.totalUnallocated   || 0;
  const phase              = overview?.phase;
  const phaseAllocs        = overview?.phaseAllocs        || [];

  // Sổ đã đáo hạn không còn sinh lãi và không nằm trong mọi con số tổng của
  // backend. Để chung một bảng thì chân bảng cộng một đằng, các dòng một nẻo.
  const activeAccounts  = savingsAccounts.filter(a => a.status === 'active');
  const maturedAccounts = savingsAccounts.filter(a => a.status !== 'active');
  const maturedPrincipal = maturedAccounts.reduce((s, a) => s + (a.principal || 0), 0);
  const maturedAccrued   = maturedAccounts.reduce((s, a) => s + (a.accrued_interest || 0), 0);

  // ── Bucket breakdown (from backend) ──────────────────────────────────────
  const duPhongAllocated   = overview?.duPhongAllocated   || 0;
  const duPhongInSavings   = overview?.duPhongInSavings   || 0;
  const availableForDuPhong = overview?.availableForDuPhong || 0;
  const tktpAllocated      = overview?.tktpAllocated      || 0;
  const tktpInSavings      = overview?.tktpInSavings      || 0;
  const availableForTKTP   = overview?.availableForTKTP   || 0;
  const unassignedInSavings = overview?.unassignedInSavings || 0;

  // ── Gold fund (15% Vàng allocation - amount already spent on gold) ───────
  const goldAllocated      = overview?.goldAllocated      || 0;
  const goldSpent          = overview?.goldSpent          || 0;
  const availableGoldFund  = overview?.availableGoldFund  || 0;
  const goldProgress = sjcPrice > 0 ? Math.min((availableGoldFund / sjcPrice) * 100, 100) : 0;
  const canBuyGold   = availableGoldFund >= sjcPrice;

  // ── Phase ratios ──────────────────────────────────────────────────────────
  const savingsRatio    = phaseAllocs.find(pa => pa.category_name?.includes('Dự Phòng'))?.ratio || 0;
  const tktpRatio       = phaseAllocs.find(pa => pa.category_name?.includes('Tiết kiệm'))?.ratio || 0;
  const goldRatio       = phaseAllocs.find(pa => pa.category_name?.includes('Vàng'))?.ratio || 0;
  const totalSavingsRatio = savingsRatio + tktpRatio;

  const guidance = buildSavingsGuidance(
    overview?.phase ? { sortOrder: overview.phase.sort_order, name: overview.phase.name } : null,
    phaseAllocs,
    { targetExpense: snap?.params.FI_MONTHLY_EXPENSE, goldUnitPrice: sjcPrice }
  );

  if (loading) return <div className="flex items-center justify-center h-64 text-slate-400">Đang tải...</div>;

  return (
    <div className="space-y-6">
      {/* ===== Dòng tiền Tiết kiệm — split by bucket ===== */}
      {overview && (
        <div className="card bg-gradient-to-r from-blue-50 to-violet-50 border-blue-200">
          <h3 className="text-sm font-semibold text-slate-700 mb-4">Dòng tiền Tiết kiệm</h3>

          {/* Visual flow overview (3 cards layout) */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-5">
            {/* Card 1: Tổng tiền */}
            <div className="card bg-white/70 border-blue-100 flex flex-col justify-center items-center p-4">
              <p className="text-[10px] text-slate-500 uppercase tracking-wide mb-1">Tổng tiền nhàn rỗi</p>
              <p className="text-2xl font-bold text-slate-800">{formatVND(totalInflow)}</p>
              <p className="text-[10px] text-slate-400 mt-1">Từ các tháng nhập liệu</p>
            </div>

            {/* Card 2: Dự Phòng */}
            <div className="card bg-white/70 border-blue-100 p-4">
              <div className="flex items-center justify-between mb-3 pb-2 border-b border-blue-50">
                <div className="flex items-center gap-2">
                  <AppIcon name="wallet" className="text-blue-500" size={18} />
                  <div>
                    <p className="text-sm font-semibold text-slate-700">Quỹ Dự phòng</p>
                    <p className="text-[10px] text-slate-400">Sổ không kỳ hạn</p>
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-[10px] font-medium text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">
                    Mục tiêu: {Math.round(savingsRatio * 100)}% dòng tiền
                  </span>
                </div>
              </div>
              
              <div className="space-y-2 mb-3">
                <div className="flex justify-between text-[11px]">
                  <span className="text-slate-500">Phân bổ lịch sử:</span>
                  <span className="font-semibold text-slate-700">{formatVND(duPhongAllocated)}</span>
                </div>
                <div className="flex justify-between text-[11px]">
                  <span className="text-slate-500">Đã gửi vào sổ:</span>
                  <span className="font-bold text-emerald-600">{formatVND(duPhongInSavings)}</span>
                </div>
                <div className="flex justify-between text-[11px]">
                  <span className="text-slate-500">Chưa gửi:</span>
                  <span className={`font-semibold ${availableForDuPhong > 0 ? 'text-amber-600' : 'text-slate-400'}`}>
                    {formatVND(availableForDuPhong)}
                  </span>
                </div>
              </div>

              <div className="h-1.5 bg-blue-100 rounded-full overflow-hidden">
                <div className="h-full rounded-full transition-all" style={{
                  width: `${duPhongAllocated > 0 ? Math.min((duPhongInSavings / duPhongAllocated) * 100, 100) : 0}%`,
                  background: duPhongInSavings >= duPhongAllocated ? '#10b981' : '#3b82f6',
                }} />
              </div>
              {availableForDuPhong > 0 && (
                <p className="text-[10px] text-amber-600 mt-2 flex items-center gap-1">
                  <Warning size={10} weight="fill" /> Còn {formatVND(availableForDuPhong)} chưa gửi
                </p>
              )}
            </div>

            {/* Card 3: Tiết kiệm & Trái phiếu */}
            <div className="card bg-white/70 border-violet-100 p-4">
              <div className="flex items-center justify-between mb-3 pb-2 border-b border-violet-50">
                <div className="flex items-center gap-2">
                  <AppIcon name="bank" className="text-violet-500" size={18} />
                  <div>
                    <p className="text-sm font-semibold text-slate-700">Tiết kiệm và Trái phiếu</p>
                    <p className="text-[10px] text-slate-400">Sổ kỳ hạn 3–12 tháng</p>
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-[10px] font-medium text-violet-600 bg-violet-50 px-1.5 py-0.5 rounded">
                    Mục tiêu: {Math.round(tktpRatio * 100)}% dòng tiền
                  </span>
                </div>
              </div>
              
              <div className="space-y-2 mb-3">
                <div className="flex justify-between text-[11px]">
                  <span className="text-slate-500">Phân bổ lịch sử:</span>
                  <span className="font-semibold text-slate-700">{formatVND(tktpAllocated)}</span>
                </div>
                <div className="flex justify-between text-[11px]">
                  <span className="text-slate-500">Đã gửi vào sổ:</span>
                  <span className="font-bold text-emerald-600">{formatVND(tktpInSavings)}</span>
                </div>
                <div className="flex justify-between text-[11px]">
                  <span className="text-slate-500">Chưa gửi:</span>
                  <span className={`font-semibold ${availableForTKTP > 0 ? 'text-amber-600' : 'text-slate-400'}`}>
                    {formatVND(availableForTKTP)}
                  </span>
                </div>
              </div>

              <div className="h-1.5 bg-violet-100 rounded-full overflow-hidden">
                <div className="h-full rounded-full transition-all" style={{
                  width: `${tktpAllocated > 0 ? Math.min((tktpInSavings / tktpAllocated) * 100, 100) : 0}%`,
                  background: tktpInSavings >= tktpAllocated ? '#10b981' : '#8b5cf6',
                }} />
              </div>
              {availableForTKTP > 0 && (
                <p className="text-[10px] text-amber-600 mt-2 flex items-center gap-1">
                  <Warning size={10} weight="fill" /> Còn {formatVND(availableForTKTP)} chưa gửi
                </p>
              )}
            </div>
          </div>

          {/* Unallocated warning */}
          {totalUnallocated > 0 && (
            <div className="mt-3 p-2 bg-amber-50 border border-amber-200 rounded-lg">
              <p className="text-xs text-amber-700">
                <Warning size={14} className="inline mr-1" weight="fill" /> Còn <strong>{formatVND(totalUnallocated)}</strong> chưa được phân bổ. Hãy nhập liệu tháng mới.
              </p>
            </div>
          )}
        </div>
      )}

      {/* ===== Phase Guidance ===== */}
      {guidance && guidance.buckets.length > 0 && (
        <div className="card">
          <div className="flex items-center gap-2 mb-3">
            <ClipboardText size={20} weight="regular" />
            <h3 className="text-sm font-semibold text-slate-700">Gửi thế nào — {guidance.name}</h3>
          </div>

          <div className="space-y-2">
            {guidance.buckets.map(b => (
              <div key={b.name} className={`p-2.5 rounded-lg text-xs ${
                b.kind === 'reserve' ? 'bg-blue-50 text-blue-800' :
                b.kind === 'savings' ? 'bg-violet-50 text-violet-800' :
                'bg-amber-50 text-amber-800'
              }`}>
                <p className="font-semibold mb-0.5">{b.name} — {Math.round(b.ratio * 100)}% tiền nhàn rỗi</p>
                <p className="opacity-80">{b.how}</p>
                {b.target && <p className="opacity-70 mt-0.5">{b.target}</p>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ===== Type Breakdown + Gold Tracker ===== */}
      {savingsSummary && savingsSummary.accountCount > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
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

          {/* Gold Tracker — dùng 15% Vàng allocation */}
          <div className="card bg-gradient-to-br from-amber-50 to-yellow-50 border-amber-200">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center text-amber-600"><Diamond size={18} weight="regular" /></div>
              <div className="flex-1">
                <p className="text-sm font-semibold text-amber-800">Tích lũy Vàng SJC</p>
                <p className="text-xs text-amber-600">Đã có: <strong>{goldBought} chỉ</strong> · Mục tiêu: {goldBought + 1} chỉ</p>
              </div>
            </div>
            {/* Quỹ vàng = tổng phân bổ danh mục Vàng - đã tiêu */}
            <p className="text-lg font-bold text-amber-700">{formatVND(availableGoldFund)}</p>
            <p className="text-xs text-amber-600 mt-0.5">Quỹ Vàng còn lại / {formatVND(sjcPrice)} (1 chỉ)</p>
            {goldAllocated > 0 && (
              <p className="text-[10px] text-slate-400 mt-0.5">
                Tổng phân bổ: {formatVND(goldAllocated)} · Đã mua: {formatVND(goldSpent)}
              </p>
            )}
            <div className="mt-2 h-2 bg-amber-200 rounded-full overflow-hidden">
              <div className="h-full rounded-full transition-all" style={{ width: `${goldProgress}%`, background: canBuyGold ? '#10b981' : '#f59e0b' }} />
            </div>
            <div className="flex justify-between mt-1">
              <span className="text-[10px] text-amber-600">{goldProgress.toFixed(0)}%</span>
              {canBuyGold ? (
                <span className="text-xs font-bold text-emerald-600">✓ Đủ mua 1 chỉ!</span>
              ) : (
                <span className="text-[10px] text-amber-600">Còn thiếu {formatVND(sjcPrice - availableGoldFund)}</span>
              )}
            </div>
            {canBuyGold && (
              <button
                onClick={() => setShowGoldBuyModal(true)}
                className="mt-3 w-full py-1.5 rounded-lg text-xs font-semibold bg-amber-500 hover:bg-amber-600 text-white transition-colors"
              >
                🥇 Ghi nhận mua 1 chỉ vàng SJC
              </button>
            )}
            {!canBuyGold && goldBought > 0 && (
              <p className="mt-2 text-[10px] text-amber-400 text-center">Tiếp tục tích luỹ để mua chỉ thứ {goldBought + 1}</p>
            )}
            {goldAllocated === 0 && (
              <p className="mt-2 text-[10px] text-slate-400 text-center">Chưa có dữ liệu phân bổ danh mục Vàng</p>
            )}
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

        {/* Warning: accounts with no category assigned */}
        {unassignedInSavings > 0 && (
          <div className="mb-3 p-3 bg-amber-50 border border-amber-200 rounded-xl">
            <p className="text-xs text-amber-700 flex items-start gap-1.5">
              <Warning size={14} className="shrink-0 mt-0.5" weight="fill" />
              <span>
                Có <strong>{formatVND(unassignedInSavings)}</strong> trong sổ chưa gán danh mục — 
                hệ thống không thể theo dõi đúng bucket. Hãy nhấn <strong>Sửa</strong> trên sổ đó và chọn danh mục.
              </span>
            </p>
          </div>
        )}
        {/* Quick add: per-bucket available banners */}
        {!addingSavings && (availableForDuPhong > 0 || availableForTKTP > 0) && (
          <div className="mb-4 space-y-2">
            {availableForDuPhong > 0 && (
              <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-blue-700">🛡️ Dự Phòng: <strong>{formatVND(availableForDuPhong)}</strong> chưa gửi vào sổ</p>
                  <p className="text-xs text-blue-400">Tạo sổ không kỳ hạn để giữ quỹ dự phòng</p>
                </div>
                <button onClick={() => {
                  const dpCat = categories.find(c => c.name.includes('Dự Phòng'));
                  setSavingsForm(f => ({ ...f, principal: availableForDuPhong.toString(), type: 'liquid', category_id: dpCat?.id?.toString() || '' }));
                  setAddingSavings(true);
                }} className="btn-primary text-sm shrink-0">Tạo sổ DP</button>
              </div>
            )}
            {availableForTKTP > 0 && (
              <div className="p-3 bg-violet-50 border border-violet-200 rounded-xl flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-violet-700">💰 Tiết kiệm & TP: <strong>{formatVND(availableForTKTP)}</strong> chưa gửi vào sổ</p>
                  <p className="text-xs text-violet-400">Tạo sổ kỳ hạn để sinh lời cao hơn</p>
                </div>
                <button onClick={() => {
                  const tktpCat = categories.find(c => c.name.includes('Tiết kiệm'));
                  setSavingsForm(f => ({ ...f, principal: availableForTKTP.toString(), type: 'term', category_id: tktpCat?.id?.toString() || '' }));
                  setAddingSavings(true);
                }} className="btn-primary text-sm shrink-0" style={{ background: '#8b5cf6' }}>Tạo sổ TKTP</button>
              </div>
            )}
          </div>
        )}

        {/* Add form */}
        {addingSavings && (
          <div className="mb-4 p-4 bg-slate-50 rounded-xl border border-slate-200">
            <div className="grid grid-cols-4 gap-3 mb-3">
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
                <label className="text-xs text-slate-500 mb-1 block">Sản phẩm</label>
                <select value={savingsForm.product_type || 'savings'} onChange={e => setSavingsForm({ ...savingsForm, product_type: e.target.value })} className="input text-sm">
                  <option value="savings">Sổ tiết kiệm</option>
                  <option value="bond">Trái phiếu</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-slate-500 mb-1 block">Kỳ hạn</label>
                <select value={savingsForm.type} onChange={e => setSavingsForm({ ...savingsForm, type: e.target.value })} className="input text-sm">
                  <option value="liquid">Không kỳ hạn</option>
                  <option value="term">Có kỳ hạn</option>
                </select>
              </div>
            </div>

            {/* Hint: available per bucket when category is chosen */}
            {(() => {
              const selCat = savingsForm.category_id ? categories.find(c => c.id === parseInt(savingsForm.category_id)) : null;
              const isDP   = selCat?.name?.includes('Dự Phòng');
              const isTKTP = selCat?.name?.includes('Tiết kiệm');
              const avail  = isDP ? availableForDuPhong : isTKTP ? availableForTKTP : null;
              if (avail === null || avail <= 0) return null;
              const color  = isDP ? { bg: 'bg-blue-50', border: 'border-blue-100', text: 'text-blue-700' } : { bg: 'bg-violet-50', border: 'border-violet-100', text: 'text-violet-700' };
              return (
                <div className={`mb-3 p-2.5 rounded-lg text-xs flex items-center justify-between border ${color.bg} ${color.border} ${color.text}`}>
                  <span>Còn <strong>{formatVND(avail)}</strong> có thể phân bổ vào {isDP ? 'Dự Phòng' : 'Tiết kiệm & TP'}</span>
                  <button type="button" onClick={() => setSavingsForm(f => ({ ...f, principal: avail.toString() }))} className="font-semibold underline ml-2 hover:opacity-70">Điền vào</button>
                </div>
              );
            })()}
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

        {/* Interest projection summary */}
        {activeAccounts.length > 0 && (() => {
          const totalProjected = activeAccounts.reduce((s, a) => s + (a.projected_interest || a.accrued_interest || 0), 0);
          return (
            <div className="mb-4 p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-between">
              <div>
                <p className="text-xs text-emerald-600">Dự kiến lãi khi đáo hạn tất cả sổ</p>
                <p className="text-lg font-bold text-emerald-700">+{formatVND(totalProjected)}</p>
              </div>
              <p className="text-xs text-emerald-600">Tổng: {formatVND(totalInSavings + totalProjected)}</p>
            </div>
          );
        })()}

        {/* Accounts table */}
        {activeAccounts.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full" style={{ minWidth: '1000px' }}>
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="text-left text-xs font-semibold text-slate-500 uppercase py-3 px-3" style={{ width: '180px' }}>Sổ tiết kiệm</th>
                  <th className="text-left text-xs font-semibold text-slate-500 uppercase py-3 px-3" style={{ width: '100px' }}>Ngân hàng</th>
                  <th className="text-left text-xs font-semibold text-slate-500 uppercase py-3 px-3" style={{ width: '120px' }}>Danh mục</th>
                  <th className="text-center text-xs font-semibold text-slate-500 uppercase py-3 px-3" style={{ width: '90px' }}>Kỳ hạn</th>
                  <th className="text-center text-xs font-semibold text-slate-500 uppercase py-3 px-3" style={{ width: '95px' }}>Ngày gửi</th>
                  <th className="text-right text-xs font-semibold text-slate-500 uppercase py-3 px-3" style={{ width: '75px' }}>Lãi suất</th>
                  <th className="text-right text-xs font-semibold text-slate-500 uppercase py-3 px-3" style={{ width: '120px' }}>Vốn gốc</th>
                  <th className="text-right text-xs font-semibold text-slate-500 uppercase py-3 px-3" style={{ width: '100px' }}>Lãi</th>
                  <th className="text-right text-xs font-semibold text-slate-500 uppercase py-3 px-3" style={{ width: '120px' }}>Tổng</th>
                  <th className="text-center text-xs font-semibold text-slate-500 uppercase py-3 px-3" style={{ width: '100px' }}>Đáo hạn</th>
                  <th className="text-center text-xs font-semibold text-slate-500 uppercase py-3 px-3" style={{ width: '140px' }}></th>
                </tr>
              </thead>
              <tbody>
                {activeAccounts.map(a => {
                  const days = getDaysUntilMaturity(a.maturity_date);
                  const accrued = a.accrued_interest || 0;
                  const isEditing = editingId === a.id;
                  const isDepositing = depositingId === a.id;

                  if (isEditing) {
                    return (
                      <tr key={a.id} className="bg-amber-50">
                        <td colSpan={11}>
                          <div className="p-3 space-y-3">
                            <div className="grid grid-cols-4 gap-3">
                              <div>
                                <label className="text-xs text-slate-500 mb-1 block">Tên sổ</label>
                                <input type="text" value={editForm.name} onChange={e => setEditForm({ ...editForm, name: e.target.value })} className="input text-sm" />
                              </div>
                              <div>
                                <label className="text-xs text-slate-500 mb-1 block">Ngân hàng</label>
                                <input type="text" value={editForm.bank} onChange={e => setEditForm({ ...editForm, bank: e.target.value })} className="input text-sm" />
                              </div>
                              <div>
                                <label className="text-xs text-slate-500 mb-1 block">Loại</label>
                                <select value={editForm.type} onChange={e => setEditForm({ ...editForm, type: e.target.value })} className="input text-sm">
                                  <option value="liquid">Không kỳ hạn</option>
                                  <option value="term">Có kỳ hạn</option>
                                </select>
                              </div>
                              <div>
                                <label className="text-xs text-slate-500 mb-1 block">Lãi suất (%/năm)</label>
                                <input type="number" step="0.1" value={editForm.interest_rate} onChange={e => setEditForm({ ...editForm, interest_rate: e.target.value })} className="input text-sm" />
                              </div>
                            </div>
                            <div className="grid grid-cols-4 gap-3">
                              <div>
                                <label className="text-xs text-slate-500 mb-1 block">Kỳ hạn (tháng)</label>
                                <input type="number" value={editForm.term_months} onChange={e => setEditForm({ ...editForm, term_months: e.target.value })} className="input text-sm" disabled={editForm.type === 'liquid'} />
                              </div>
                              <div>
                                <label className="text-xs text-slate-500 mb-1 block">Ngày gửi</label>
                                <input type="date" value={editForm.start_date} onChange={e => setEditForm({ ...editForm, start_date: e.target.value })} className="input text-sm" />
                              </div>
                              <div>
                                <label className="text-xs text-slate-500 mb-1 block">Danh mục</label>
                                <select value={editForm.category_id} onChange={e => setEditForm({ ...editForm, category_id: e.target.value })} className="input text-sm">
                                  <option value="">— Chọn —</option>
                                  {categories.filter(c => c.name.includes('Dự Phòng') || c.name.includes('Tiết kiệm')).map(c => (
                                    <option key={c.id} value={c.id}>{c.name}</option>
                                  ))}
                                </select>
                              </div>
                              <div className="flex items-end">
                                <label className="flex items-center gap-2 text-sm">
                                  <input type="checkbox" checked={editForm.auto_renew} onChange={e => setEditForm({ ...editForm, auto_renew: e.target.checked })} />
                                  Tự động tái tục
                                </label>
                              </div>
                            </div>
                            {a.transactions && a.transactions.length > 0 && (
                              <div className="mt-3 border-t border-slate-200 pt-3">
                                <p className="text-xs font-semibold text-slate-600 mb-2">Lịch sử giao dịch sổ (Tính lãi theo từng ngày)</p>
                                <div className="max-h-40 overflow-y-auto space-y-1.5 pr-1">
                                  {[...a.transactions]
                                    .sort((x, y) => new Date(x.date) - new Date(y.date) || x.id - y.id)
                                    .map(t => (
                                    <div key={t.id} className="flex justify-between items-center bg-white p-2 rounded border border-slate-100 text-xs">
                                      <div className="flex items-center gap-2">
                                        <span className="font-semibold text-slate-700">{t.type === 'deposit' ? 'Gửi tiền' : t.type === 'withdraw' ? 'Rút tiền' : 'Lãi'}</span>
                                        <span className="text-slate-400">|</span>
                                        <span className="text-slate-500">{t.note || 'Giao dịch'}</span>
                                        <span className="text-slate-400">|</span>
                                        <div className="flex items-center gap-1">
                                          <span className="text-slate-400">Ngày:</span>
                                          <input type="date" value={t.date} onChange={e => handleUpdateTransactionDate(t.id, e.target.value)} className="border border-slate-200 rounded px-1 text-[11px] focus:outline-none focus:ring-1 focus:ring-primary-500" style={{ padding: '2px 4px' }} />
                                        </div>
                                      </div>
                                      <div className="flex items-center gap-2 flex-shrink-0">
                                        <span className={t.type === 'deposit' ? 'text-emerald-600 font-bold' : t.type === 'withdraw' ? 'text-rose-600 font-bold' : 'text-blue-600 font-bold'}>
                                          {t.type === 'deposit' ? '+' : t.type === 'withdraw' ? '-' : ''}{formatVND(t.amount)}
                                        </span>
                                        {a.transactions.length > 1 && (
                                          <button onClick={() => handleDeleteTransaction(a.id, t.id)} className="text-rose-500 hover:text-rose-700 font-medium ml-2">Xóa</button>
                                        )}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                            <div className="flex gap-2">
                              <button onClick={() => handleSaveEdit(a.id)} className="btn-primary text-sm">Lưu</button>
                              <button onClick={() => setEditingId(null)} className="btn-ghost text-sm">Hủy</button>
                            </div>
                          </div>
                        </td>
                      </tr>
                    );
                  }

                  if (isDepositing) {
                    return (
                      <tr key={a.id} className="bg-blue-50">
                        <td colSpan={11}>
                          <div className="p-3">
                            <p className="text-sm font-medium text-slate-700 mb-2">Bơm vốn vào "{a.name}"</p>
                            {/* Show correct available amount based on account category */}
                            {(() => {
                              const isDP   = a.category_name?.includes('Dự Phòng');
                              const isTKTP = a.category_name?.includes('Tiết kiệm');
                              const avail  = isDP ? availableForDuPhong : isTKTP ? availableForTKTP : availableForSavings;
                              const label  = isDP ? 'Dự Phòng' : isTKTP ? 'Tiết kiệm & TP' : 'phân bổ chung';
                              const cls    = avail > 0
                                ? (isDP ? 'bg-blue-50 text-blue-700' : isTKTP ? 'bg-violet-50 text-violet-700' : 'bg-slate-50 text-slate-600')
                                : 'bg-amber-50 text-amber-600';
                              return (
                                <div className={`text-xs mb-3 p-2 rounded-lg ${cls}`}>
                                  {avail > 0
                                    ? <>Quỹ {label}: còn <strong>{formatVND(avail)}</strong> có thể bơm vào sổ này</>
                                    : 'Đã phân bổ hết — có thể bơm thêm từ nguồn khác'}
                                </div>
                              );
                            })()}
                            <div className="grid grid-cols-3 gap-3">
                              <div>
                                <label className="text-xs text-slate-500 mb-1 block">Số tiền bơm</label>
                                {(() => {
                                  const isDP   = a.category_name?.includes('Dự Phòng');
                                  const isTKTP = a.category_name?.includes('Tiết kiệm');
                                  const avail  = isDP ? availableForDuPhong : isTKTP ? availableForTKTP : availableForSavings;
                                  return (
                                    <input type="text" inputMode="numeric"
                                      value={depositForm.amount ? formatNumberInput(depositForm.amount) : ''}
                                      onChange={e => setDepositForm({ ...depositForm, amount: e.target.value.replace(/\D/g, '') })}
                                      placeholder={avail > 0 ? formatVND(avail) : 'Nhập số tiền'}
                                      className="input text-sm" />
                                  );
                                })()}
                              </div>
                              <div>
                                <label className="text-xs text-slate-500 mb-1 block">Ngày bơm</label>
                                <input type="date" value={depositForm.date} onChange={e => setDepositForm({ ...depositForm, date: e.target.value })} className="input text-sm" />
                              </div>
                              <div>
                                <label className="text-xs text-slate-500 mb-1 block">Ghi chú</label>
                                <input type="text" value={depositForm.note} onChange={e => setDepositForm({ ...depositForm, note: e.target.value })} placeholder="Bơm vốn" className="input text-sm" />
                              </div>
                            </div>
                            <div className="flex gap-2 mt-3">
                              <button onClick={() => handleDeposit(a.id)} className="btn-primary text-sm" disabled={!depositForm.amount}>Xác nhận bơm</button>
                              <button onClick={() => { setDepositingId(null); setDepositForm({ amount: '', date: todayLocal(), note: '' }); }} className="btn-ghost text-sm">Hủy</button>
                            </div>
                          </div>
                        </td>
                      </tr>
                    );
                  }

                  return (
                    <tr key={a.id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                      <td className="py-3 px-3">
                        <div className="flex items-center gap-2">
                          <span className="shrink-0">{a.type === 'liquid' ? <Drop size={16} className="text-blue-400" weight="regular" /> : <Lock size={16} className="text-emerald-400" weight="regular" />}</span>
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-slate-700 truncate">{a.name}</p>
                            <p className="text-[10px] text-slate-400">{a.product_type === 'bond' ? 'Trái phiếu' : 'Tiết kiệm'}</p>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-3 text-sm text-slate-500">{a.bank}</td>
                      <td className="py-3 px-3">
                        {a.category_name ? (
                          <span className="text-xs text-slate-500">{a.category_name}</span>
                        ) : <span className="text-xs text-slate-400">—</span>}
                      </td>
                      <td className="py-3 px-3 text-center">
                        <span className={`text-xs ${a.type === 'liquid' ? 'text-blue-500' : 'text-slate-500'}`}>
                          {a.type === 'liquid' ? 'Không kỳ hạn' : `${a.term_months} tháng`}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-center text-xs text-slate-400">{a.start_date || '—'}</td>
                      <td className="py-3 px-3 text-right text-sm text-slate-500">{a.interest_rate}%</td>
                      <td className="py-3 px-3 text-right text-sm font-medium text-slate-700">{formatVND(a.principal)}</td>
                      <td className="py-3 px-3 text-right text-sm text-emerald-600">+{formatVND(accrued)}</td>
                      <td className="py-3 px-3 text-right text-sm font-semibold text-slate-800">{formatVND(a.principal + accrued)}</td>
                      <td className="py-3 px-3 text-center">
                        {a.maturity_date ? (
                          <div>
                            <p className="text-xs text-slate-400">{a.maturity_date}</p>
                            <p className={`text-xs font-medium ${getMaturityColor(days)}`}>{getMaturityLabel(days)}</p>
                          </div>
                        ) : <span className="text-xs text-slate-400">—</span>}
                      </td>
                      <td className="py-3 px-3">
                        <div className="flex items-center justify-center gap-1">
                          <button onClick={() => startEdit(a)} className="text-xs px-2 py-1 rounded text-slate-400 hover:text-primary-600 hover:bg-primary-50 transition">Sửa</button>
                          <button onClick={() => { setDepositingId(a.id); setEditingId(null); }} className="text-xs px-2 py-1 rounded text-blue-500 hover:text-blue-700 hover:bg-blue-50 transition font-medium">Bơm vốn</button>
                          <button onClick={() => handleDeleteSavings(a.id)} className="text-xs px-2 py-1 rounded text-slate-400 hover:text-red-600 hover:bg-red-50 transition">Xóa</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="bg-slate-50 border-t border-slate-200">
                  <td colSpan={6} className="py-3 px-3 text-sm font-medium text-slate-600 text-left">Tổng ({activeAccounts.length} sổ)</td>
                  <td className="py-3 px-3 text-right text-sm font-medium text-slate-700">{formatVND(totalInSavings)}</td>
                  <td className="py-3 px-3 text-right text-sm text-emerald-600">+{formatVND(totalAccrued)}</td>
                  <td className="py-3 px-3 text-right text-sm font-bold text-slate-800">{formatVND(totalInSavings + totalAccrued)}</td>
                  <td colSpan={2}></td>
                </tr>
              </tfoot>
            </table>
          </div>
        ) : !addingSavings ? (
          <div className="text-center py-12 text-slate-400">
            <p className="text-sm">Chưa có sổ tiết kiệm nào</p>
            <p className="text-xs mt-1">Thêm sổ để theo dõi lãi suất và đáo hạn</p>
          </div>
        ) : null}

        {maturedAccounts.length > 0 && (
          <div className="mt-6 pt-5 border-t border-slate-200">
            <p className="text-sm font-semibold text-slate-600 mb-1">
              Đã đáo hạn ({maturedAccounts.length} sổ)
            </p>
            <p className="text-xs text-slate-400 mb-3">
              Tiền đã rút về. Không sinh lãi nữa và không tính vào các con số phía trên.
            </p>
            <div className="space-y-2">
              {maturedAccounts.map(a => (
                <div key={a.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl">
                  <div>
                    <p className="text-sm font-medium text-slate-600">{a.name}</p>
                    <p className="text-xs text-slate-400">
                      {a.bank || '—'} · đáo hạn {a.maturity_date || '—'}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-slate-600">{formatVND(a.principal || 0)}</p>
                    <p className="text-xs text-slate-400">lãi đã nhận +{formatVND(a.accrued_interest || 0)}</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-200">
              <span className="text-sm font-medium text-slate-500">Tổng đã rút về</span>
              <span className="text-sm font-bold text-slate-700">
                {formatVND(maturedPrincipal + maturedAccrued)}
              </span>
            </div>
          </div>
        )}
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
                  <p className="text-xs text-emerald-600">+{formatVND(data.accrued)} lãi</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ===== Gold Buy Confirmation Modal ===== */}
      {showGoldBuyModal && createPortal(
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6 animate-fade-in">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-xl bg-amber-100 flex items-center justify-center text-2xl">🥇</div>
              <div>
                <h3 className="text-base font-bold text-slate-800">Ghi nhận mua vàng SJC</h3>
                <p className="text-xs text-slate-400">Giao dịch sẽ lưu vào Danh mục đầu tư</p>
              </div>
            </div>

            <div className="space-y-3 mb-5">
              <div className="flex justify-between items-center p-3 bg-amber-50 rounded-xl">
                <span className="text-sm text-slate-600">Tài sản</span>
                <span className="text-sm font-semibold text-amber-800">Vàng SJC</span>
              </div>
              <div className="flex justify-between items-center p-3 bg-amber-50 rounded-xl">
                <span className="text-sm text-slate-600">Khối lượng</span>
                <span className="text-sm font-semibold text-amber-800">1 chỉ</span>
              </div>
              <div className="flex justify-between items-center p-3 bg-amber-50 rounded-xl">
                <span className="text-sm text-slate-600">Giá mua</span>
                <span className="text-sm font-bold text-amber-800">{formatVND(sjcPrice)}</span>
              </div>
              <div>
                <label className="text-xs text-slate-500 mb-1 block">Ngày mua</label>
                <input
                  type="date"
                  value={goldBuyDate}
                  onChange={e => setGoldBuyDate(e.target.value)}
                  className="input w-full"
                />
              </div>
              {goldBought > 0 && (
                <div className="flex justify-between items-center p-3 bg-emerald-50 rounded-xl">
                  <span className="text-sm text-slate-600">Tổng sau khi mua</span>
                  <span className="text-sm font-bold text-emerald-700">{goldBought + 1} chỉ vàng SJC</span>
                </div>
              )}
            </div>

            <p className="text-xs text-slate-400 mb-4">
              💡 Lãi/lỗ sẽ tự động tính khi giá SJC thay đổi. Xem tại mục <strong>Đầu tư &gt; Danh mục</strong>.
            </p>

            <div className="flex gap-2">
              <button
                onClick={() => setShowGoldBuyModal(false)}
                className="flex-1 py-2 rounded-xl text-sm font-medium border border-slate-200 text-slate-600 hover:bg-slate-50 transition"
              >
                Hủy
              </button>
              <button
                onClick={handleBuyGold}
                disabled={goldBuying}
                className="flex-1 py-2 rounded-xl text-sm font-bold bg-amber-500 hover:bg-amber-600 text-white transition disabled:opacity-60"
              >
                {goldBuying ? 'Đang lưu...' : '✓ Xác nhận mua'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
