import { useState, useEffect } from 'react';
import { formatVND, formatDate } from '../utils/formatters';
import { formatNumberInput, parseNumberInput } from '../utils/numberFormat';
import { apiClient } from '../utils/apiClient';
import AppIcon, { Warning, CheckCircle, MagnifyingGlass, Trash } from '../utils/iconMap';
import FormattedInput from './FormattedInput';

export default function ExecutionLog({ embedded }) {
  const [loading, setLoading] = useState(true);
  const [transactions, setTransactions] = useState([]);
  const [assetTypes, setAssetTypes] = useState([]);
  const [parentAssets, setParentAssets] = useState([]);
  const [catalogItems, setCatalogItems] = useState([]);
  const [selectedParent, setSelectedParent] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [investmentAllocated, setInvestmentAllocated] = useState(0);
  const [discrepancyConfirmed, setDiscrepancyConfirmed] = useState(null); // { amount, reason, date }
  const [showDiscrepancyInput, setShowDiscrepancyInput] = useState(false);
  const [discrepancyReason, setDiscrepancyReason] = useState('');
  const [form, setForm] = useState({
    date: new Date().toISOString().split('T')[0],
    asset_type_id: '',
    asset_name: '',
    type: 'BUY',
    quantity: '',
    price: '',
    note: '',
    strategy: '',
  });

  useEffect(() => {
    (async () => {
      try {
        const [t, a, catalog, filled] = await Promise.all([
          apiClient.transactions.get(),
          apiClient.assets.get(),
          apiClient.catalog.get(),
          apiClient.monthly.filled().catch(() => []),
        ]);
        setTransactions(t);
        setAssetTypes(a);
        setCatalogItems(catalog);

        // Calculate total allocated to investment categories
        if (filled.length > 0) {
          const allAllocs = await Promise.all(
            filled.map(m => apiClient.allocations.get(m.id).catch(() => []))
          );
          let invested = 0;
          for (const monthAllocs of allAllocs) {
            for (const alloc of monthAllocs) {
              const name = alloc.category_name || '';
              if (!name.includes('Dự Phòng') && !name.includes('Tiết kiệm')) {
                invested += alloc.actual_amount || alloc.planned_amount || 0;
              }
            }
          }
          setInvestmentAllocated(invested);

          // Check for previously confirmed discrepancy
          const monthKey = new Date().toISOString().slice(0, 7); // YYYY-MM
          const saved = localStorage.getItem(`discrepancy_${monthKey}`);
          if (saved) {
            try { setDiscrepancyConfirmed(JSON.parse(saved)); } catch {}
          }
        }

        // Parent assets = rows with ticker IS NULL (broad categories)
        // Exclude savings & bond — those are managed in SavingsSection
        const parents = a.filter(x => !x.ticker && !['savings', 'bond'].includes(x.asset_class));
        setParentAssets(parents);
        if (parents.length > 0) {
          setSelectedParent(parents[0].id.toString());
          // Auto-select first specific asset if available
          const firstSpecific = catalog.find(c => c.asset_class === parents[0].asset_class);
          if (firstSpecific) {
            setForm(f => ({ ...f, asset_type_id: firstSpecific.id.toString() }));
          } else {
            setForm(f => ({ ...f, asset_type_id: parents[0].id.toString() }));
          }
        }
      } catch (err) {
        console.error('ExecutionLog load error:', err);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Filter specific assets by selected parent's asset_class
  const parentAsset = parentAssets.find(a => a.id === parseInt(selectedParent));
  const specificAssets = parentAsset
    ? catalogItems.filter(c => c.asset_class === parentAsset.asset_class)
    : [];

  const selectedAsset = assetTypes.find(a => a.id === parseInt(form.asset_type_id));
  const totalAmount = (Number(form.quantity) || 0) * (Number(form.price) || 0);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.asset_type_id) return;

    const qty = Number(form.quantity) || 0;
    const price = Number(form.price) || 0;
    const total = qty * price;

    if (!qty || !price) return;

    try {
      await apiClient.transactions.add({
        date: form.date,
        asset_type_id: parseInt(form.asset_type_id),
        asset_name: selectedAsset?.ticker || form.asset_name || selectedAsset?.name || '',
        type: form.type,
        quantity: qty,
        price: price,
        total_amount: total,
        note: form.note,
        strategy: form.strategy || '',
      });
      const firstSpecific = catalogItems.find(c => c.asset_class === parentAsset?.asset_class);
      setForm({ date: new Date().toISOString().split('T')[0], asset_type_id: firstSpecific?.id?.toString() || parentAssets[0]?.id?.toString() || '', asset_name: '', type: 'BUY', quantity: '', price: '', note: '', strategy: '' });
      setShowForm(false);
      setTransactions(await apiClient.transactions.get());
    } catch (err) {
      console.error('Add transaction error:', err);
      alert('Lỗi khi thêm giao dịch: ' + err.message);
    }
  }

  async function handleDelete(id) {
    try {
      await apiClient.transactions.delete(id);
      setTransactions(await apiClient.transactions.get());
    } catch (err) {
      console.error('Delete transaction error:', err);
      alert('Lỗi khi xóa: ' + err.message);
    }
  }

  // Discrepancy handlers
  async function handleConfirmDiscrepancy() {
    try {
      // Update allocation in database to match actual invested amount
      await apiClient.allocations.adjust(discrepancy);
      // Refresh allocated amount
      setInvestmentAllocated(prev => prev + discrepancy);
    } catch (err) {
      console.error('Adjust allocation error:', err);
    }
    const monthKey = new Date().toISOString().slice(0, 7);
    const record = {
      amount: discrepancy,
      reason: discrepancyReason || 'Không có lý do cụ thể',
      date: new Date().toISOString(),
    };
    localStorage.setItem(`discrepancy_${monthKey}`, JSON.stringify(record));
    setDiscrepancyConfirmed(record);
    setShowDiscrepancyInput(false);
    setDiscrepancyReason('');
  }

  function handleRevokeConfirmation() {
    const monthKey = new Date().toISOString().slice(0, 7);
    localStorage.removeItem(`discrepancy_${monthKey}`);
    setDiscrepancyConfirmed(null);
  }

  // Stats
  const buyCount = transactions.filter(t => t.type === 'BUY').length;
  const sellCount = transactions.filter(t => t.type === 'SELL').length;
  const totalInvested = transactions.reduce((s, t) => s + (t.type === 'BUY' ? t.total_amount : -t.total_amount), 0);
  const availableToInvest = Math.max(0, investmentAllocated - totalInvested);
  const discrepancy = totalInvested - investmentAllocated; // positive = over-invested, negative = under-invested
  const hasDiscrepancy = investmentAllocated > 0 && Math.abs(discrepancy) > 1000; // ignore tiny rounding
  const isConfirmed = discrepancyConfirmed && Math.abs(discrepancyConfirmed.amount - discrepancy) < 1000;

  if (loading) return <div className="flex items-center justify-center h-64 text-slate-400">Đang tải...</div>;

  return (
    <div className="space-y-6 animate-fade-in">
      {!embedded && (
        <div className="flex items-center justify-between">
          <div>
            <h1 className="page-title">Giao Dịch</h1>
            <p className="page-subtitle">Nhật ký mua/bán mọi loại tài sản</p>
          </div>
          <button onClick={() => setShowForm(!showForm)} className="btn-primary">+ Thêm lệnh</button>
        </div>
      )}
      {embedded && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-slate-500">{transactions.length} giao dịch · Tổng vốn: {formatVND(totalInvested)}</p>
          <button onClick={() => setShowForm(!showForm)} className="btn-primary text-sm">+ Thêm lệnh</button>
        </div>
      )}

      {/* Available to invest banner */}
      {investmentAllocated > 0 && (
        <div className="card">
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="text-xs text-slate-400 uppercase tracking-wider">Tiền sẵn sàng đầu tư</p>
              <p className="text-2xl font-bold text-slate-800 mt-1">{formatVND(availableToInvest)}</p>
            </div>
            {availableToInvest > 0 && (
              <button onClick={() => setShowForm(true)} className="btn-primary text-sm">+ Mua ngay</button>
            )}
          </div>
          <div className="flex items-center gap-4 text-xs text-slate-400 mb-3">
            <span>Phân bổ: <strong className="text-slate-600">{formatVND(investmentAllocated)}</strong></span>
            <span className="text-slate-200">|</span>
            <span>Đã đầu tư: <strong className="text-slate-600">{formatVND(totalInvested)}</strong></span>
          </div>
          <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${Math.min((totalInvested / investmentAllocated) * 100, 100)}%`,
                background: totalInvested >= investmentAllocated ? '#10b981' : '#3b82f6',
              }}
            />
          </div>
          <p className="text-[10px] text-slate-400 mt-1.5">
            Đã dùng {investmentAllocated > 0 ? ((totalInvested / investmentAllocated) * 100).toFixed(0) : 0}% phân bổ
          </p>
        </div>
      )}

      {/* Discrepancy Warning */}
      {hasDiscrepancy && !isConfirmed && (
        <div className={`card animate-fade-in ${discrepancy > 0 ? 'border-amber-200 bg-amber-50/50' : 'border-blue-200 bg-blue-50/50'}`}>
          <div className="flex items-start gap-3">
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${discrepancy > 0 ? 'bg-amber-100' : 'bg-blue-100'}`}>
              <Warning size={16} className={discrepancy > 0 ? 'text-amber-500' : 'text-blue-500'} weight="fill" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-slate-700">
                {discrepancy > 0 ? 'Đã đầu tư vượt phân bổ' : 'Chưa đầu tư hết phân bổ'}
              </p>
              <div className="flex items-center gap-3 mt-2 text-xs text-slate-500">
                <span>Phân bổ: <strong className="text-slate-700">{formatVND(investmentAllocated)}</strong></span>
                <span>Đã đầu tư: <strong className="text-slate-700">{formatVND(totalInvested)}</strong></span>
                <span className={discrepancy > 0 ? 'text-amber-600' : 'text-blue-500'}>
                  Còn lại: <strong>{formatVND(Math.abs(discrepancy))}</strong>
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-1">
                {discrepancy > 0
                  ? 'Có thể do bổ sung vốn từ nguồn khác hoặc cần rà soát lại dữ liệu'
                  : 'Số tiền còn lại vẫn có thể đầu tư trong các tháng tiếp theo'}
              </p>

              {/* Over-investment: confirm or review */}
              {discrepancy > 0 && (
                <>
                  {!showDiscrepancyInput ? (
                    <div className="flex gap-2 mt-3">
                      <button onClick={() => setShowDiscrepancyInput(true)} className="text-xs px-3 py-1.5 rounded-lg bg-amber-100 text-amber-700 hover:bg-amber-200 transition font-medium">
                        ✓ Xác nhận đúng
                      </button>
                      <button onClick={() => { document.getElementById('transaction-table')?.scrollIntoView({ behavior: 'smooth' }); }} className="text-xs px-3 py-1.5 rounded-lg text-slate-500 hover:bg-slate-100 transition">
                        <MagnifyingGlass size={12} className="inline mr-1" /> Rà soát thủ công
                      </button>
                    </div>
                  ) : (
                    <div className="mt-3 space-y-2">
                      <input
                        type="text"
                        value={discrepancyReason}
                        onChange={e => setDiscrepancyReason(e.target.value)}
                        placeholder="Lý do chênh lệch (VD: dùng tiền chi tiêu thừa để mua thêm)..."
                        className="input text-xs w-full"
                      />
                      <div className="flex gap-2">
                        <button onClick={handleConfirmDiscrepancy} className="text-xs px-3 py-1.5 rounded-lg bg-amber-100 text-amber-700 hover:bg-amber-200 transition font-medium">Lưu xác nhận</button>
                        <button onClick={() => { setShowDiscrepancyInput(false); setDiscrepancyReason(''); }} className="text-xs px-3 py-1.5 rounded-lg text-slate-500 hover:bg-slate-100 transition">Hủy</button>
                      </div>
                    </div>
                  )}
                </>
              )}

              {/* Under-investment: just show CTA */}
              {discrepancy < 0 && (
                <div className="mt-3">
                  <button onClick={() => setShowForm(true)} className="text-xs px-3 py-1.5 rounded-lg bg-blue-100 text-blue-700 hover:bg-blue-200 transition font-medium">
                    + Đầu tư ngay
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Confirmed discrepancy display */}
      {hasDiscrepancy && isConfirmed && (
        <div className="card border-emerald-200 bg-emerald-50/50">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center">
                <CheckCircle size={16} className="text-emerald-500" weight="fill" />
              </div>
              <div>
                <p className="text-xs font-medium text-slate-600">Chênh lệch đã xác nhận</p>
                <p className="text-xs text-slate-400 mt-0.5">
                  {formatVND(discrepancyConfirmed.amount)} — {discrepancyConfirmed.reason}
                </p>
              </div>
            </div>
            <button onClick={handleRevokeConfirmation} className="text-[10px] text-slate-400 hover:text-red-500 px-2 py-1 rounded transition">
              Hủy xác nhận
            </button>
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        <div className="kpi"><span className="kpi-label">Tổng giao dịch</span><p className="kpi-value">{transactions.length}</p></div>
        <div className="kpi"><span className="kpi-label">Mua</span><p className="kpi-value text-emerald-600">{buyCount}</p></div>
        <div className="kpi"><span className="kpi-label">Bán</span><p className="kpi-value text-red-500">{sellCount}</p></div>
        <div className="kpi"><span className="kpi-label">Tổng vốn</span><p className="kpi-value text-primary-600">{formatVND(totalInvested)}</p></div>
      </div>

      {/* Form */}
      {showForm && (
        <div className="card animate-fade-in">
          <h3 className="text-sm font-semibold text-slate-700 mb-4">Thêm giao dịch mới</h3>
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Row 1: Ngày, Loại tài sản, Mã cụ thể, Loại giao dịch */}
            <div className="grid grid-cols-4 gap-3">
              <div>
                <label className="text-xs text-slate-500 mb-1 block">Ngày</label>
                <input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} className="input" />
              </div>
              <div>
                <label className="text-xs text-slate-500 mb-1 block">Loại tài sản</label>
                <select value={selectedParent} onChange={e => {
                  setSelectedParent(e.target.value);
                  const parent = parentAssets.find(a => a.id === parseInt(e.target.value));
                  const first = catalogItems.find(c => c.asset_class === parent?.asset_class);
                  setForm(f => ({ ...f, asset_type_id: first ? first.id.toString() : e.target.value, asset_name: '' }));
                }} className="input">
                  {parentAssets.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-slate-500 mb-1 block">Mã cụ thể</label>
                {specificAssets.length > 0 ? (
                  <select value={form.asset_type_id} onChange={e => setForm({ ...form, asset_type_id: e.target.value })} className="input">
                    {specificAssets.map(a => <option key={a.id} value={a.id}>{a.ticker} — {a.name}</option>)}
                  </select>
                ) : (
                  <input type="text" value={form.asset_name} onChange={e => setForm({ ...form, asset_name: e.target.value })}
                    placeholder="Tên tài sản..." className="input" />
                )}
              </div>
              <div>
                <label className="text-xs text-slate-500 mb-1 block">Loại giao dịch</label>
                <select value={form.type} onChange={e => setForm({ ...form, type: e.target.value })} className="input">
                  <option value="BUY">MUA</option>
                  <option value="SELL">BÁN</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-slate-500 mb-1 block">Chiến lược</label>
                <select value={form.strategy} onChange={e => setForm({ ...form, strategy: e.target.value })} className="input">
                  <option value="">Thường</option>
                  <option value="DCA">DCA (Trung bình giá)</option>
                  <option value="Sniper">Bắn tỉa (Sniper)</option>
                </select>
              </div>
            </div>

            {/* Row 2: Số lượng + Giá */}
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-xs text-slate-500 mb-1 block">Số lượng</label>
                <FormattedInput
                  value={form.quantity}
                  onChange={val => setForm({ ...form, quantity: val })}
                  placeholder="VD: 100"
                  className="input"
                />
              </div>
              <div>
                <label className="text-xs text-slate-500 mb-1 block">Giá (₫)</label>
                <FormattedInput
                  value={form.price}
                  onChange={val => setForm({ ...form, price: val })}
                  placeholder="VD: 36.000"
                  className="input"
                />
              </div>
            </div>
            {totalAmount > 0 && (
              <div className="bg-primary-50 rounded-xl px-4 py-2 flex justify-between">
                <span className="text-sm text-primary-600">Thành tiền</span>
                <span className="font-bold text-primary-700">{formatVND(totalAmount)}</span>
              </div>
            )}
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setShowForm(false)} className="btn-ghost">Hủy</button>
              <button type="submit" className="btn-primary">Lưu</button>
            </div>
          </form>
        </div>
      )}

      {/* Table */}
      <div id="transaction-table" className="card p-0 overflow-hidden">
        {transactions.length === 0 ? (
          <div className="text-center py-16 text-slate-400">
            <p className="text-sm">Chưa có giao dịch</p>
            <button onClick={() => setShowForm(true)} className="btn-primary mt-3 text-sm">Thêm giao dịch đầu tiên</button>
          </div>
        ) : (
          <div className="table-wrap border-0 rounded-none">
            <table className="w-full" style={{ tableLayout: 'fixed' }}>
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase whitespace-nowrap" style={{ width: '40px' }}>#</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase whitespace-nowrap" style={{ width: '100px' }}>Ngày</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase whitespace-nowrap">Tài sản</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-slate-500 uppercase whitespace-nowrap" style={{ width: '70px' }}>Loại</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-slate-500 uppercase whitespace-nowrap" style={{ width: '80px' }}>Chiến lược</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase whitespace-nowrap" style={{ width: '80px' }}>KL</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase whitespace-nowrap" style={{ width: '120px' }}>Giá</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase whitespace-nowrap" style={{ width: '130px' }}>Thành tiền</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-slate-500 uppercase whitespace-nowrap" style={{ width: '50px' }}></th>
                </tr>
              </thead>
              <tbody>
                {transactions.map((t, i) => (
                  <tr key={t.id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 text-slate-400 text-sm">{i + 1}</td>
                    <td className="px-4 py-3 text-sm text-slate-600">{formatDate(t.date)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2 min-w-0">
                        <AppIcon name={t.icon} size={18} />
                        <span className="text-sm font-medium text-slate-700 truncate">{t.display_name || t.asset_type_name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`text-xs px-2 py-1 rounded-full font-medium ${t.type === 'BUY' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
                        {t.type === 'BUY' ? 'MUA' : 'BÁN'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      {t.strategy ? (
                        <span className={`text-xs px-2 py-1 rounded-full font-medium ${t.strategy === 'Sniper' ? 'bg-amber-50 text-amber-700' : 'bg-blue-50 text-blue-700'}`}>
                          {t.strategy}
                        </span>
                      ) : <span className="text-xs text-slate-300">—</span>}
                    </td>
                    <td className="px-4 py-3 text-right text-sm text-slate-600 font-mono">{t.quantity}</td>
                    <td className="px-4 py-3 text-right text-sm text-slate-600 font-mono">{formatVND(t.price)}</td>
                    <td className="px-4 py-3 text-right text-sm font-semibold text-slate-800">{formatVND(t.total_amount)}</td>
                    <td className="px-4 py-3 text-center">
                      <button onClick={() => handleDelete(t.id)} className="text-slate-400 hover:text-red-500 p-1 rounded-lg hover:bg-red-50 transition" title="Xóa">
                        <Trash size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
