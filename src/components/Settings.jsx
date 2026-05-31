import { useState, useEffect, useRef } from 'react';
import { formatVND, formatPercent } from '../utils/formatters';
import { apiClient, isElectron } from '../utils/apiClient';
import FormattedInput from './FormattedInput';
import AppIcon, { Spinner, DownloadSimple, UploadSimple, CheckCircle, XCircle, Trash, Eye, EyeSlash, PencilSimple } from '../utils/iconMap';

export default function Settings() {
  const [phases, setPhases] = useState([]);
  const [categories, setCategories] = useState([]);
  const [assetTypes, setAssetTypes] = useState([]);
  const [params, setParams] = useState({});
  const [importStatus, setImportStatus] = useState(null);
  const [showAddAsset, setShowAddAsset] = useState(false);
  const [editingAsset, setEditingAsset] = useState(null);
  const [editAssetForm, setEditAssetForm] = useState({});
  const [newAsset, setNewAsset] = useState({ name: '', category: 'Cổ phiếu', ticker: '', unit: 'CP', asset_class: 'stock' });
  const [assetSearch, setAssetSearch] = useState('');
  const [assetFilter, setAssetFilter] = useState('all');
  const [selectedAssets, setSelectedAssets] = useState(new Set());
  const [parentAssets, setParentAssets] = useState([]);
  const [childAssets, setChildAssets] = useState([]);

  // Timeline form
  const [totalMonths, setTotalMonths] = useState(120);
  const [startMonth, setStartMonth] = useState(5);
  const [startYear, setStartYear] = useState(2026);
  const [timelineSaved, setTimelineSaved] = useState(false);

  // Data management
  const [stats, setStats] = useState(null);
  const [confirmClear, setConfirmClear] = useState(null); // 'transactions' | 'monthly' | 'all'
  const [avgExpense, setAvgExpense] = useState(4000000);

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    const [ph, c, a, p] = await Promise.all([
      apiClient.phases.get(),
      apiClient.categories.get(),
      apiClient.assets.get(),
      apiClient.params.get(),
    ]);
    setPhases(ph);
    setCategories(c);
    setAssetTypes(a);
    setParentAssets(a.filter(x => !x.ticker));
    setChildAssets(a.filter(x => x.ticker));

    try {
      const [s, avg] = await Promise.all([
        apiClient.data.stats(),
        apiClient.params.avgExpense(),
      ]);
      setStats(s);
      setAvgExpense(avg);
    } catch (e) {}
    const paramMap = {};
    for (const param of p) paramMap[param.key] = param.value;
    setParams(paramMap);
    setTotalMonths(paramMap.TOTAL_MONTHS || 120);
    setStartMonth(paramMap.START_MONTH || 5);
    setStartYear(paramMap.START_YEAR || 2026);
  }

  async function handleSaveTimeline() {
    try {
      await apiClient.timeline.regenerate(totalMonths, startMonth, startYear);
      setTimelineSaved(true);
      setTimeout(() => setTimelineSaved(false), 3000);
      loadData();
    } catch (err) {
      console.error('Timeline save error:', err);
      alert('Lỗi khi lưu timeline: ' + err.message);
    }
  }

  // End date calculation
  const endMonth = ((startMonth - 1 + totalMonths - 1) % 12) + 1;
  const endYear = startYear + Math.floor((startMonth - 1 + totalMonths - 1) / 12);
  const years = (totalMonths / 12).toFixed(1);

  // Presets
  const presets = [
    { label: '1 năm', months: 12 },
    { label: '3 năm', months: 36 },
    { label: '5 năm', months: 60 },
    { label: '10 năm', months: 120 },
    { label: '20 năm', months: 240 },
    { label: 'Cả đời', months: 600 },
  ];

  const fileInputRef = useRef(null);

  async function handleImport() {
    if (isElectron) {
      setImportStatus('importing');
      try {
        const filePath = await window.api.openFile();
        if (!filePath) { setImportStatus(null); return; }
        const result = await window.api.importExcel(filePath);
        setImportStatus({ type: 'success', data: result });
        loadData();
      } catch (err) {
        setImportStatus({ type: 'error', message: err.message });
      }
    } else {
      fileInputRef.current?.click();
    }
  }

  async function handleFileSelect(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportStatus('importing');
    try {
      const result = await apiClient.importExcel(file);
      setImportStatus({ type: 'success', data: result });
      loadData();
    } catch (err) {
      setImportStatus({ type: 'error', message: err.message });
    }
    e.target.value = '';
  }

  const [exportStatus, setExportStatus] = useState(null);

  async function handleExport() {
    setExportStatus('exporting');
    try {
      if (isElectron) {
        const filePath = await window.api.saveFile();
        if (!filePath) { setExportStatus(null); return; }
        await window.api.exportExcel(filePath);
        setExportStatus({ type: 'success', path: filePath });
      } else {
        await apiClient.exportExcel();
        setExportStatus({ type: 'success', path: 'MoneyFlow_Data.xlsx' });
      }
      setTimeout(() => setExportStatus(null), 3000);
    } catch (err) {
      setExportStatus({ type: 'error', message: err.message });
    }
  }

  const CATEGORY_TO_CLASS = {
    'Cổ phiếu': 'stock', 'Quỹ đầu tư': 'etf', 'Vàng': 'gold',
    'Tiết kiệm': 'savings', 'Trái phiếu': 'bond', 'Khác': 'other',
  };

  const ASSET_CLASS_TABS = [
    { value: 'all', label: 'Tất cả' },
    { value: 'stock', label: 'Cổ phiếu' },
    { value: 'etf', label: 'ETF' },
    { value: 'gold', label: 'Vàng' },
    { value: 'crypto', label: 'Crypto' },
    { value: 'savings', label: 'Tiết kiệm' },
    { value: 'bond', label: 'Trái phiếu' },
    { value: 'other', label: 'Khác' },
  ];

  const filteredAssets = childAssets.filter(a => {
    if (assetFilter !== 'all' && a.asset_class !== assetFilter) return false;
    if (assetSearch) {
      const q = assetSearch.toLowerCase();
      return a.name.toLowerCase().includes(q) || (a.ticker || '').toLowerCase().includes(q);
    }
    return true;
  });

  async function handleAddAsset() {
    if (!newAsset.name) return;
    try {
      const data = { ...newAsset, asset_class: CATEGORY_TO_CLASS[newAsset.category] || 'other' };
      await apiClient.assets.add(data);
      setNewAsset({ name: '', category: 'Cổ phiếu', ticker: '', unit: 'CP', asset_class: 'stock' });
      setShowAddAsset(false);
      loadData();
    } catch (err) {
      console.error('Add asset error:', err);
      alert('Lỗi khi thêm tài sản: ' + err.message);
    }
  }

  function startEditAsset(asset) {
    setEditingAsset(asset.id);
    setEditAssetForm({ name: asset.name, category: asset.category, ticker: asset.ticker || '', unit: asset.unit });
  }

  async function handleSaveEditAsset() {
    if (!editAssetForm.name) return;
    try {
      await apiClient.assets.update(editingAsset, { ...editAssetForm, asset_class: CATEGORY_TO_CLASS[editAssetForm.category] || 'other' });
      setEditingAsset(null);
      setEditAssetForm({});
      loadData();
    } catch (err) {
      console.error('Edit asset error:', err);
      alert('Lỗi khi sửa tài sản: ' + err.message);
    }
  }

  async function handleDeleteAsset(id) {
    if (!confirm('Xóa loại tài sản này? Các giao dịch liên quan sẽ được giữ nguyên.')) return;
    try {
      await apiClient.assets.delete(id);
      loadData();
    } catch (err) {
      console.error('Delete asset error:', err);
      alert('Lỗi khi xóa tài sản: ' + err.message);
    }
  }

  async function handleToggleTrack(id, currentTracked) {
    try {
      await apiClient.assets.setTracked(id, !currentTracked);
      loadData();
    } catch (err) {
      console.error('Toggle track error:', err);
    }
  }

  function toggleSelectAsset(id) {
    setSelectedAssets(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function selectAllFiltered() {
    const allSelected = filteredAssets.every(a => selectedAssets.has(a.id));
    setSelectedAssets(allSelected ? new Set() : new Set(filteredAssets.map(a => a.id)));
  }

  async function handleDeleteSelected() {
    if (selectedAssets.size === 0) return;
    if (!confirm(`Xóa ${selectedAssets.size} tài sản đã chọn?`)) return;
    try {
      await Promise.all([...selectedAssets].map(id => apiClient.assets.delete(id)));
      setSelectedAssets(new Set());
      loadData();
    } catch (err) {
      console.error('Bulk delete error:', err);
    }
  }

  async function handleClear(type) {
    try {
      if (type === 'transactions') await apiClient.data.clearTransactions();
      else if (type === 'monthly') await apiClient.data.clearMonthly();
      else if (type === 'all') await apiClient.data.clearAll();
      else if (type === 'savings') await apiClient.data.clearSavings();
      setConfirmClear(null);
      loadData();
    } catch (err) {
      console.error('Clear error:', err);
      alert('Lỗi khi xóa dữ liệu: ' + err.message);
    }
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="page-title">Cài đặt</h1>
        <p className="page-subtitle">Quản lý phases, tài sản, và import dữ liệu</p>
      </div>

      {/* Chi tiêu */}
      <div className="card">
        <h3 className="text-sm font-semibold text-slate-700 mb-1">Chi tiêu hàng tháng</h3>
        <p className="text-xs text-slate-500 mb-4">
          <strong>Kỳ vọng</strong> = mức bạn muốn/target (dùng cho phase detection & mục tiêu).{' '}
          <strong>Thực tế</strong> = trung bình từ dữ liệu nhập hàng tháng (tham khảo).
        </p>
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Chi tiêu kỳ vọng (₫)</label>
            <FormattedInput
              value={params.FI_MONTHLY_EXPENSE || 4000000}
              onChange={val => setParams(p => ({ ...p, FI_MONTHLY_EXPENSE: val }))}
              onBlur={async val => {
                await apiClient.params.update('FI_MONTHLY_EXPENSE', val || 4000000);
                loadData();
              }}
              className="input input-lg"
              placeholder="4,000,000"
            />
            <p className="text-[10px] text-slate-400 mt-1">Dùng để đặt mục tiêu tham chiếu</p>
          </div>
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Chi tiêu thực tế trung bình (₫)</label>
            <div className="input input-lg bg-slate-50 text-slate-700 cursor-not-allowed">
              {formatVND(avgExpense)}
            </div>
            <p className="text-[10px] text-slate-400 mt-1">Tự tính từ dữ liệu nhập hàng tháng</p>
          </div>
        </div>
        <div className="grid grid-cols-4 gap-3">
          <div className="p-3 bg-slate-50 rounded-xl text-center">
            <p className="text-[10px] text-slate-400">Dự phòng (3×)</p>
            <p className="text-sm font-bold text-primary-600">{formatVND(avgExpense * 3)}</p>
            <p className="text-[10px] text-slate-300">thực tế</p>
          </div>
          <div className="p-3 bg-slate-50 rounded-xl text-center">
            <p className="text-[10px] text-slate-400">Tăng tốc (6×)</p>
            <p className="text-sm font-bold text-blue-600">{formatVND(avgExpense * 6)}</p>
            <p className="text-[10px] text-slate-300">thực tế</p>
          </div>
          <div className="p-3 bg-slate-50 rounded-xl text-center">
            <p className="text-[10px] text-slate-400">Tích lũy (24×)</p>
            <p className="text-sm font-bold text-violet-600">{formatVND(avgExpense * 24)}</p>
            <p className="text-[10px] text-slate-300">thực tế</p>
          </div>
          <div className="p-3 bg-emerald-50 rounded-xl text-center">
            <p className="text-[10px] text-emerald-600">Tự do tài chính (quy tắc 4%)</p>
            <p className="text-sm font-bold text-emerald-700">{formatVND(avgExpense * 12 / 0.04)}</p>
            <p className="text-[10px] text-emerald-400">thực tế</p>
          </div>
        </div>
      </div>

      {/* Import/Export */}
      <div className="card">
        <input ref={fileInputRef} type="file" accept=".xlsx,.xls" onChange={handleFileSelect} className="hidden" />
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-700">Import / Export Excel</h3>
            <p className="text-xs text-slate-500">Nhập và xuất dữ liệu cùng định dạng</p>
          </div>
          <div className="flex gap-2">
            <button onClick={handleImport} className="btn-secondary" disabled={importStatus === 'importing'}>
              {importStatus === 'importing' ? <><Spinner size={14} className="animate-spin inline mr-1" /> Đang import...</> : <><DownloadSimple size={14} className="inline mr-1" /> Import</>}
            </button>
            <button onClick={handleExport} className="btn-secondary">
              <UploadSimple size={14} className="inline mr-1" /> Export
            </button>
          </div>
        </div>
        {importStatus?.type === 'success' && (
          <div className="mt-3 p-3 bg-emerald-50 border border-emerald-100 rounded-xl text-sm text-emerald-700">
            <CheckCircle size={14} className="inline mr-1 text-emerald-500" weight="regular" /> Import: {importStatus.data.parameters} tham số, {importStatus.data.ledger} tháng, {importStatus.data.transactions} giao dịch
          </div>
        )}
        {importStatus?.type === 'error' && (
          <div className="mt-3 p-3 bg-red-50 border border-red-100 rounded-xl text-sm text-red-700 flex items-center gap-1.5"><XCircle size={14} weight="regular" /> {importStatus.message}</div>
        )}
        {exportStatus?.type === 'success' && (
          <div className="mt-3 p-3 bg-emerald-50 border border-emerald-100 rounded-xl text-sm text-emerald-700">
            <CheckCircle size={14} className="inline mr-1 text-emerald-500" weight="regular" /> Đã xuất dữ liệu ra: {exportStatus.path}
          </div>
        )}
        {exportStatus?.type === 'error' && (
          <div className="mt-3 p-3 bg-red-50 border border-red-100 rounded-xl text-sm text-red-700 flex items-center gap-1.5"><XCircle size={14} weight="regular" /> {exportStatus.message}</div>
        )}
      </div>

      {/* Timeline */}
      <div className="card">
        <h3 className="text-sm font-semibold text-slate-700 mb-1">Thời gian hành trình</h3>
        <p className="text-xs text-slate-500 mb-4">Tùy chỉnh thời gian và mốc bắt đầu kế hoạch tài chính</p>

        {/* Presets */}
        <div className="flex gap-2 mb-4">
          {presets.map(p => (
            <button
              key={p.months}
              onClick={() => setTotalMonths(p.months)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                totalMonths === p.months
                  ? 'bg-primary-600 text-white shadow-sm'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="text-xs font-medium text-slate-500 mb-1.5 block">Tổng số tháng</label>
            <input
              type="number"
              value={totalMonths}
              onChange={e => setTotalMonths(Math.max(1, parseInt(e.target.value) || 1))}
              className="input input-lg"
              min="1"
            />
            <p className="text-[11px] text-slate-400 mt-1">≈ {years} năm</p>
          </div>
          <div>
            <label className="text-xs font-medium text-slate-500 mb-1.5 block">Tháng bắt đầu</label>
            <select value={startMonth} onChange={e => setStartMonth(parseInt(e.target.value))} className="input input-lg">
              {Array.from({ length: 12 }, (_, i) => (
                <option key={i + 1} value={i + 1}>Tháng {i + 1}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-slate-500 mb-1.5 block">Năm bắt đầu</label>
            <input
              type="number"
              value={startYear}
              onChange={e => setStartYear(parseInt(e.target.value) || 2026)}
              className="input input-lg"
            />
          </div>
        </div>

        <div className="mt-4 p-3 bg-slate-50 rounded-xl flex items-center justify-between">
          <div className="text-sm text-slate-600">
            <span className="font-medium">Thời gian:</span> {totalMonths} tháng (~{years} năm)
          </div>
          <div className="flex items-center gap-2">
            {timelineSaved && <span className="text-xs text-emerald-600 font-medium">Đã lưu!</span>}
            <button onClick={handleSaveTimeline} className="btn-primary text-sm">Áp dụng</button>
          </div>
        </div>
      </div>

      {/* Phases — Auto-detected */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-slate-700">Giai đoạn</h3>
          <span className="text-xs text-slate-400">Tự động dựa trên dữ liệu</span>
        </div>
        <div className="space-y-3">
          {phases.map(p => {
            const goalDisplay = Number(p.goal_amount) > 0 ? formatVND(Number(p.goal_amount)) : 'Tự do tài chính';
            const multDisplay = Number(p.goal_multiplier) > 0 ? `(${p.goal_multiplier}× chi tiêu)` : '';
            return (
              <div key={p.id} className={`p-4 rounded-xl border ${p.is_active ? 'border-primary-300 bg-primary-50' : 'border-slate-200'}`}>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className={`badge ${p.is_active ? 'bg-primary-600 text-white' : 'bg-slate-100 text-slate-600'}`}>{p.sort_order}</span>
                    <h4 className="text-sm font-bold text-slate-800">{p.name}</h4>
                    {p.is_active === 1 && <span className="badge-success">Hiện tại</span>}
                  </div>
                  <div className="text-right">
                    <span className="text-xs font-bold text-primary-600">{goalDisplay}</span>
                    {multDisplay && <span className="text-[10px] text-slate-400 ml-1">{multDisplay}</span>}
                  </div>
                </div>
                <p className="text-xs text-slate-500 mb-1">{p.goal_description}</p>
                <p className="text-xs text-slate-400">Điều kiện vào: {p.entry_condition}</p>
                <details className="mt-2">
                  <summary className="text-xs text-primary-600 cursor-pointer hover:underline">Xem hướng dẫn</summary>
                  <div className="mt-2 text-xs text-slate-600 whitespace-pre-line bg-white rounded-lg p-3 border border-slate-100">{p.guidance}</div>
                </details>
              </div>
            );
          })}
        </div>
      </div>

      {/* Categories */}
      <div className="card">
        <h3 className="text-sm font-semibold text-slate-700 mb-4">Danh mục phân bổ</h3>
        <div className="grid grid-cols-2 gap-3">
          {categories.map(c => (
            <div key={c.id} className="flex items-center gap-3 p-3 rounded-xl border border-slate-200">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white" style={{ background: c.color }}>
                <AppIcon emoji={c.icon} size={20} color="white" />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-800">{c.name}</p>
                <p className="text-xs text-slate-500">{c.description}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Danh mục phân loại (Parent Assets) */}
      <div className="card">
        <h3 className="text-sm font-semibold text-slate-700 mb-3">Danh mục phân loại</h3>
        <p className="text-[10px] text-slate-400 mb-3">Các nhóm tài sản lớn. Tài sản cụ thể thuộc về một trong các danh mục này.</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
          {parentAssets.map(a => (
            <div key={a.id} className="flex items-center gap-2 p-2 rounded-lg border border-slate-100 bg-slate-50">
              <AppIcon name={a.icon} size={16} />
              <div>
                <p className="text-xs font-medium text-slate-700">{a.name}</p>
                <p className="text-[10px] text-slate-400">{a.unit}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Tài sản cụ thể (Child Assets) */}
      <div className="card">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-700">Tài sản cụ thể</h3>
            <p className="text-[10px] text-slate-400">{childAssets.length} tài sản · {selectedAssets.size} đã chọn</p>
          </div>
          <div className="flex gap-2">
            {selectedAssets.size > 0 && (
              <button onClick={handleDeleteSelected} className="btn-danger text-xs">
                <Trash size={14} className="inline mr-1" /> Xóa {selectedAssets.size} mục
              </button>
            )}
            <button onClick={() => { setShowAddAsset(!showAddAsset); setEditingAsset(null); }} className="btn-primary text-xs">+ Thêm tài sản</button>
          </div>
        </div>

        {/* Search + Filter */}
        <div className="flex items-center gap-3 mb-3">
          <input value={assetSearch} onChange={e => setAssetSearch(e.target.value)} placeholder="Tìm theo tên hoặc mã..." className="input text-sm flex-1" />
        </div>
        <div className="flex gap-1 mb-3 flex-wrap">
          {ASSET_CLASS_TABS.map(tab => {
            const count = tab.value === 'all' ? childAssets.length : childAssets.filter(a => a.asset_class === tab.value).length;
            return (
              <button key={tab.value} onClick={() => { setAssetFilter(tab.value); setSelectedAssets(new Set()); }}
                className={`px-3 py-1 rounded-lg text-xs font-medium transition ${assetFilter === tab.value ? 'bg-primary-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
                {tab.label} ({count})
              </button>
            );
          })}
        </div>

        {/* Add Form */}
        {showAddAsset && (
          <div className="mb-3 p-4 bg-slate-50 rounded-xl space-y-3">
            <div className="grid grid-cols-4 gap-3">
              <input value={newAsset.name} onChange={e => setNewAsset({ ...newAsset, name: e.target.value })} placeholder="Tên tài sản" className="input text-sm" />
              <select value={newAsset.category} onChange={e => setNewAsset({ ...newAsset, category: e.target.value })} className="input text-sm">
                <option>Cổ phiếu</option><option>Quỹ đầu tư</option><option>Vàng</option><option>Tiết kiệm</option><option>Trái phiếu</option><option>Khác</option>
              </select>
              <input value={newAsset.ticker} onChange={e => setNewAsset({ ...newAsset, ticker: e.target.value })} placeholder="Mã (VD: FPT)" className="input text-sm" />
              <input value={newAsset.unit} onChange={e => setNewAsset({ ...newAsset, unit: e.target.value })} placeholder="Đơn vị (VD: CP)" className="input text-sm" />
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowAddAsset(false)} className="btn-ghost text-sm">Hủy</button>
              <button onClick={handleAddAsset} className="btn-primary text-sm">Thêm</button>
            </div>
          </div>
        )}

        {/* Edit Form */}
        {editingAsset && (
          <div className="mb-3 p-4 bg-blue-50 rounded-xl border border-blue-200 space-y-3">
            <h4 className="text-sm font-medium text-blue-700">Chỉnh sửa tài sản</h4>
            <div className="grid grid-cols-4 gap-3">
              <input value={editAssetForm.name || ''} onChange={e => setEditAssetForm({ ...editAssetForm, name: e.target.value })} placeholder="Tên" className="input text-sm" />
              <select value={editAssetForm.category || 'Cổ phiếu'} onChange={e => setEditAssetForm({ ...editAssetForm, category: e.target.value })} className="input text-sm">
                <option>Cổ phiếu</option><option>Quỹ đầu tư</option><option>Vàng</option><option>Tiết kiệm</option><option>Trái phiếu</option><option>Khác</option>
              </select>
              <input value={editAssetForm.ticker || ''} onChange={e => setEditAssetForm({ ...editAssetForm, ticker: e.target.value })} placeholder="Mã" className="input text-sm" />
              <input value={editAssetForm.unit || ''} onChange={e => setEditAssetForm({ ...editAssetForm, unit: e.target.value })} placeholder="Đơn vị" className="input text-sm" />
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setEditingAsset(null)} className="btn-ghost text-sm">Hủy</button>
              <button onClick={handleSaveEditAsset} className="btn-primary text-sm">Lưu</button>
            </div>
          </div>
        )}

        {/* Asset Table */}
        <div className="overflow-auto max-h-[400px] rounded-xl border border-slate-200">
          <table className="w-full text-sm" style={{ tableLayout: 'fixed' }}>
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="px-3 py-2 text-left w-8"><input type="checkbox" checked={filteredAssets.length > 0 && filteredAssets.every(a => selectedAssets.has(a.id))} onChange={selectAllFiltered} className="rounded" /></th>
                <th className="px-3 py-2 text-left text-xs font-semibold text-slate-500">Tài sản</th>
                <th className="px-3 py-2 text-left text-xs font-semibold text-slate-500">Mã</th>
                <th className="px-3 py-2 text-left text-xs font-semibold text-slate-500">Danh mục</th>
                <th className="px-3 py-2 text-left text-xs font-semibold text-slate-500">Đơn vị</th>
                <th className="px-3 py-2 text-center text-xs font-semibold text-slate-500 w-20">Theo dõi</th>
                <th className="px-3 py-2 text-right text-xs font-semibold text-slate-500 w-20">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {filteredAssets.length === 0 ? (
                <tr><td colSpan={7} className="px-3 py-12 text-center text-slate-400 text-xs">{assetSearch ? 'Không tìm thấy' : 'Chưa có tài sản cụ thể nào'}</td></tr>
              ) : (
                filteredAssets.map(a => (
                  <tr key={a.id} className={`border-t border-slate-100 hover:bg-slate-50 ${selectedAssets.has(a.id) ? 'bg-primary-50' : ''}`}>
                    <td className="px-3 py-2"><input type="checkbox" checked={selectedAssets.has(a.id)} onChange={() => toggleSelectAsset(a.id)} className="rounded" /></td>
                    <td className="px-3 py-2"><div className="flex items-center gap-2"><AppIcon name={a.icon} size={16} /><span className="font-medium text-slate-700">{a.name}</span></div></td>
                    <td className="px-3 py-2 font-mono text-xs text-slate-500">{a.ticker}</td>
                    <td className="px-3 py-2"><span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">{a.category}</span></td>
                    <td className="px-3 py-2 text-xs text-slate-500">{a.unit}</td>
                    <td className="px-3 py-2 text-center">
                      <button onClick={() => handleToggleTrack(a.id, a.is_tracked)} className={`p-1 rounded-lg transition ${a.is_tracked ? 'text-emerald-600 hover:bg-emerald-50' : 'text-slate-300 hover:bg-slate-100'}`} title={a.is_tracked ? 'Đang theo dõi' : 'Chưa theo dõi'}>
                        {a.is_tracked ? <Eye size={16} /> : <EyeSlash size={16} />}
                      </button>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <button onClick={() => startEditAsset(a)} className="text-slate-400 hover:text-primary-600 p-1" title="Sửa"><PencilSimple size={14} /></button>
                      <button onClick={() => handleDeleteAsset(a.id)} className="text-slate-300 hover:text-red-500 p-1" title="Xóa"><Trash size={14} /></button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="mt-2 flex items-center justify-between text-[10px] text-slate-400">
          <span>{filteredAssets.length} / {childAssets.length} tài sản</span>
          {selectedAssets.size > 0 && <button onClick={() => setSelectedAssets(new Set())} className="text-primary-600 hover:underline">Bỏ chọn tất cả</button>}
        </div>
      </div>

      {/* Data Management */}
      <div className="card border border-red-200">
        <h3 className="text-sm font-semibold text-slate-700 mb-1">Quản lý dữ liệu</h3>
        <p className="text-xs text-slate-500 mb-4">Xóa dữ liệu đã nhập. Không thể hoàn tác.</p>

        {stats && (
          <div className="grid grid-cols-5 gap-3 mb-4">
            <div className="p-3 bg-slate-50 rounded-xl text-center">
              <p className="text-lg font-bold text-slate-800">{stats.monthly}</p>
              <p className="text-[10px] text-slate-400">Tháng đã nhập</p>
            </div>
            <div className="p-3 bg-slate-50 rounded-xl text-center">
              <p className="text-lg font-bold text-slate-800">{stats.txns}</p>
              <p className="text-[10px] text-slate-400">Giao dịch</p>
            </div>
            <div className="p-3 bg-slate-50 rounded-xl text-center">
              <p className="text-lg font-bold text-slate-800">{stats.allocs}</p>
              <p className="text-[10px] text-slate-400">Phân bổ</p>
            </div>
            <div className="p-3 bg-slate-50 rounded-xl text-center">
              <p className="text-lg font-bold text-slate-800">{stats.savings || 0}</p>
              <p className="text-[10px] text-slate-400">Sổ tiết kiệm</p>
            </div>
            <div className="p-3 bg-slate-50 rounded-xl text-center">
              <p className="text-lg font-bold text-slate-800">{stats.activity}</p>
              <p className="text-[10px] text-slate-400">Hoạt động</p>
            </div>
          </div>
        )}

        <div className="space-y-2">
          <div className="flex items-center justify-between p-4 min-h-[72px] bg-slate-50 rounded-xl">
            <div>
              <p className="text-sm font-medium text-slate-700">Xóa giao dịch</p>
              <p className="text-xs text-slate-400">Xóa tất cả lệnh mua/bán. Giữ nguyên nhập liệu tháng.</p>
            </div>
            <button onClick={() => setConfirmClear('transactions')} className="btn-danger text-sm w-44 shrink-0" disabled={!stats?.txns}>Xóa giao dịch</button>
          </div>

          <div className="flex items-center justify-between p-4 min-h-[72px] bg-slate-50 rounded-xl">
            <div>
              <p className="text-sm font-medium text-slate-700">Xóa dữ liệu nhập liệu</p>
              <p className="text-xs text-slate-400">Xóa tất cả nhập liệu tháng + giao dịch + phân bổ.</p>
            </div>
            <button onClick={() => setConfirmClear('monthly')} className="btn-danger text-sm w-44 shrink-0" disabled={!stats?.monthly}>Xóa nhập liệu</button>
          </div>

          <div className="flex items-center justify-between p-4 min-h-[72px] bg-slate-50 rounded-xl">
            <div>
              <p className="text-sm font-medium text-slate-700">Xóa sổ tiết kiệm</p>
              <p className="text-xs text-slate-400">Xóa tất cả sổ tiết kiệm. Dữ liệu khác giữ nguyên.</p>
            </div>
            <button onClick={() => setConfirmClear('savings')} className="btn-danger text-sm w-44 shrink-0" disabled={!stats?.savings}>Xóa sổ tiết kiệm</button>
          </div>

          <div className="flex items-center justify-between p-4 min-h-[72px] bg-red-50 rounded-xl">
            <div>
              <p className="text-sm font-medium text-red-700">Xóa tất cả & Reset</p>
              <p className="text-xs text-red-400">Xóa toàn bộ dữ liệu, reset về trạng thái ban đầu.</p>
            </div>
            <button onClick={() => setConfirmClear('all')} className="btn-danger text-sm font-bold w-44 shrink-0">Reset toàn bộ</button>
          </div>
        </div>
      </div>

      {/* Confirm Modal */}
      {confirmClear && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 animate-fade-in">
          <div className="card max-w-sm w-full mx-4">
            <h3 className="text-lg font-bold text-red-700 mb-2">
              {confirmClear === 'all' ? 'Reset toàn bộ?' : confirmClear === 'monthly' ? 'Xóa dữ liệu nhập liệu?' : confirmClear === 'savings' ? 'Xóa sổ tiết kiệm?' : 'Xóa giao dịch?'}
            </h3>
            <p className="text-sm text-slate-500 mb-4">
              {confirmClear === 'all' && 'Toàn bộ dữ liệu sẽ bị xóa. Phase sẽ reset về Giai đoạn 1. Không thể hoàn tác.'}
              {confirmClear === 'monthly' && 'Tất cả nhập liệu tháng, phân bổ, và giao dịch sẽ bị xóa. Không thể hoàn tác.'}
              {confirmClear === 'transactions' && 'Tất cả giao dịch mua/bán sẽ bị xóa. Nhập liệu tháng vẫn giữ. Không thể hoàn tác.'}
              {confirmClear === 'savings' && 'Tất cả sổ tiết kiệm sẽ bị xóa. Dữ liệu khác giữ nguyên. Không thể hoàn tác.'}
            </p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setConfirmClear(null)} className="btn-ghost">Hủy</button>
              <button onClick={() => handleClear(confirmClear)} className="btn-danger font-bold">
                {confirmClear === 'all' ? 'Reset tất cả' : confirmClear === 'savings' ? 'Xóa sổ tiết kiệm' : 'Xóa'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
