import { useState, useEffect } from 'react';
import { apiClient } from '../utils/apiClient';
import { formatVND } from '../utils/formatters';
import { Download, Upload, Gear, Plus } from '@phosphor-icons/react';
import FormattedInput from './FormattedInput';

export default function Settings() {
  const [params, setParams] = useState([]);
  const [phases, setPhases] = useState([]);
  const [categories, setCategories] = useState([]);
  const [assets, setAssets] = useState([]);
  const [editingParam, setEditingParam] = useState(null);
  const [paramValue, setParamValue] = useState('');
  const [showAddAsset, setShowAddAsset] = useState(false);
  const [assetForm, setAssetForm] = useState({ name: '', ticker: '', unit: 'cổ phiếu', category: 'Giao dịch' });

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    const [p, ph, c, a] = await Promise.all([apiClient.params.get(), apiClient.phases.get(), apiClient.categories.get(), apiClient.assets.get()]);
    setParams(p); setPhases(ph); setCategories(c); setAssets(a);
  }

  async function handleParamSave(key) {
    await apiClient.params.update(key, paramValue);
    setEditingParam(null);
    loadData();
  }

  async function handleActivatePhase(id) {
    await apiClient.phases.setActive(id);
    loadData();
  }

  async function handleImport() {
    const result = await apiClient.data.import();
    if (result) alert(`Đã import ${result.imported} bản ghi`);
    loadData();
  }

  async function handleExport() {
    const url = apiClient.data.export();
    window.open(url, '_blank');
  }

  async function handleAddAsset() {
    if (!assetForm.name) return alert('Nhập tên tài sản');
    await apiClient.assets.add(assetForm);
    setAssetForm({ name: '', ticker: '', unit: 'cổ phiếu', category: 'Giao dịch' });
    setShowAddAsset(false);
    loadData();
  }

  const PARAM_LABELS = {
    monthly_income: 'Thu nhập hàng tháng',
    emergency_fund_target: 'Mục tiêu quỹ dự phòng',
    savings_rate: 'Tỷ lệ tiết kiệm',
    inflation_rate: 'Lạm phát',
    investment_return: 'Lợi nhuận đầu tư',
  };

  const PARAM_GROUPS = {
    'Thu nhập': ['monthly_income'],
    'Mục tiêu': ['emergency_fund_target', 'savings_rate'],
    'Kinh tế': ['inflation_rate', 'investment_return'],
  };

  return (
    <div className="space-y-6 animate-fadeIn">
      <div className="page-header">
        <h1 className="text-2xl font-bold flex items-center gap-2"><Gear size={24} /> Cài Đặt</h1>
      </div>

      {/* Import/Export */}
      <div className="card">
        <h3 className="font-semibold mb-3">Dữ liệu</h3>
        <div className="flex gap-3">
          <button onClick={handleImport} className="btn-primary flex items-center gap-2"><Upload size={16} /> Import Excel</button>
          <button onClick={handleExport} className="btn-secondary flex items-center gap-2"><Download size={16} /> Export Excel</button>
        </div>
      </div>

      {/* Parameters */}
      <div className="card">
        <h3 className="font-semibold mb-3">Thông số hệ thống</h3>
        {Object.entries(PARAM_GROUPS).map(([group, keys]) => (
          <div key={group} className="mb-4">
            <h4 className="text-xs font-medium text-gray-500 uppercase mb-2">{group}</h4>
            <div className="space-y-2">
              {keys.map(key => {
                const param = params.find(p => p.key === key);
                const isEditing = editingParam === key;
                return (
                  <div key={key} className="flex items-center gap-3">
                    <span className="text-sm w-48">{PARAM_LABELS[key] || key}</span>
                    {isEditing ? (
                      <div className="flex gap-2 flex-1">
                        <FormattedInput value={paramValue} onChange={setParamValue} className="flex-1" />
                        <button onClick={() => handleParamSave(key)} className="btn-success text-xs">Lưu</button>
                        <button onClick={() => setEditingParam(null)} className="btn-ghost text-xs">Hủy</button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 flex-1">
                        <span className="text-sm font-medium">
                          {key.includes('rate') ? formatPercent(parseFloat(param?.value || 0) * 100) : formatVND(parseFloat(param?.value || 0))}
                        </span>
                        <button onClick={() => { setEditingParam(key); setParamValue(param?.value || '0'); }} className="btn-ghost text-xs">Sửa</button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Phases */}
      <div className="card">
        <h3 className="font-semibold mb-3">Giai đoạn</h3>
        <div className="space-y-2">
          {phases.map(p => (
            <div key={p.id} className="flex items-center justify-between p-2 rounded-lg hover:bg-gray-50">
              <div>
                <span className="font-medium">{p.name}</span>
                <span className="text-xs text-gray-500 ml-2">Mục tiêu: {formatVND(p.target_amount)}</span>
              </div>
              <div className="flex items-center gap-2">
                {p.is_active && <span className="badge bg-primary-100 text-primary-700">Đang dùng</span>}
                {!p.is_active && (
                  <button onClick={() => handleActivatePhase(p.id)} className="btn-ghost text-xs">Kích hoạt</button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Categories */}
      <div className="card">
        <h3 className="font-semibold mb-3">Danh mục</h3>
        <div className="flex flex-wrap gap-2">
          {categories.map(c => (
            <span key={c.id} className="badge px-3 py-1.5" style={{ background: c.color + '20', color: c.color }}>
              {c.icon} {c.name}
            </span>
          ))}
        </div>
      </div>

      {/* Asset Types */}
      <div className="card">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold">Loại tài sản</h3>
          <button onClick={() => setShowAddAsset(!showAddAsset)} className="btn-ghost text-xs flex items-center gap-1"><Plus size={14} /> Thêm</button>
        </div>

        {showAddAsset && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3 p-3 bg-gray-50 rounded-xl">
            <input value={assetForm.name} onChange={e => setAssetForm({ ...assetForm, name: e.target.value })} className="input" placeholder="Tên" />
            <input value={assetForm.ticker} onChange={e => setAssetForm({ ...assetForm, ticker: e.target.value })} className="input" placeholder="Mã (VD: FPT)" />
            <input value={assetForm.unit} onChange={e => setAssetForm({ ...assetForm, unit: e.target.value })} className="input" placeholder="Đơn vị" />
            <div className="flex gap-2">
              <button onClick={handleAddAsset} className="btn-success text-xs">Thêm</button>
              <button onClick={() => setShowAddAsset(false)} className="btn-ghost text-xs">Hủy</button>
            </div>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          {assets.map(a => (
            <span key={a.id} className="badge px-3 py-1.5 bg-gray-100">
              {a.icon} {a.name} ({a.ticker})
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function formatPercent(val) {
  if (isNaN(val)) return '0%';
  return val.toFixed(1) + '%';
}
