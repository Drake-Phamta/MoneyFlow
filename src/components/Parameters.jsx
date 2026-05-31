import { useState, useEffect } from 'react';
import { formatVND, formatPercent } from '../utils/formatters';
import { apiClient } from '../utils/apiClient';
import { Gear, Warning } from '../utils/iconMap';

const PARAM_GROUPS = [
  {
    title: 'I. Ngưỡng chuyển phase',
    keys: ['SURVIVAL_THRESHOLD', 'SURVIVAL_LOWER_BOUND'],
  },
  {
    title: 'II. Tỷ lệ phân bổ — Phase 1',
    keys: ['PHASE_1_SURVIVAL_RATIO', 'PHASE_1_ETF_RATIO'],
  },
  {
    title: 'III. Tỷ lệ phân bổ — Phase 2',
    keys: ['PHASE_2_ETF_RATIO', 'PHASE_2_SNIPER_RATIO'],
  },
  {
    title: 'IV. Lãi suất ETF — 3 kịch bản',
    keys: ['ETF_RATE_BEAR', 'ETF_RATE_BASE', 'ETF_RATE_BULL'],
  },
  {
    title: 'V. Lãi suất khác',
    keys: ['SNIPER_BANK_RATE', 'INFLATION_MONTHLY'],
  },
  {
    title: 'VI. Tham số vận hành',
    keys: ['STRESS_INCOME_MIN', 'FI_MONTHLY_EXPENSE', 'REBALANCE_THRESHOLD', 'DEFAULT_INFLOW'],
  },
];

export default function Parameters() {
  const [params, setParams] = useState([]);
  const [editingKey, setEditingKey] = useState(null);
  const [editValue, setEditValue] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => { loadParams(); }, []);

  async function loadParams() {
    const data = await apiClient.params.get();
    setParams(data);
  }

  function startEdit(key, value) {
    setEditingKey(key);
    setEditValue(value.toString());
  }

  async function saveEdit() {
    if (!editingKey) return;
    setSaving(true);
    const value = parseFloat(editValue);
    if (isNaN(value)) {
      setSaving(false);
      return;
    }
    await apiClient.params.update(editingKey, value);
    setEditingKey(null);
    await loadParams();
    setSaving(false);
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter') saveEdit();
    if (e.key === 'Escape') setEditingKey(null);
  }

  function formatValue(key, value) {
    if (key.includes('RATIO') || key.includes('RATE') || key === 'INFLATION_MONTHLY' || key === 'REBALANCE_THRESHOLD') {
      return formatPercent(value);
    }
    if (key.includes('THRESHOLD') || key.includes('EXPENSE') || key.includes('INCOME') || key.includes('INFLOW')) {
      return formatVND(value);
    }
    return value;
  }

  const paramMap = {};
  for (const p of params) paramMap[p.key] = p;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold flex items-center gap-2"><Gear size={28} /> Tham số hệ thống</h1>
        <p className="text-xs text-slate-400">Click vào giá trị để chỉnh sửa. Tự động tính lại toàn bộ khi lưu.</p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {PARAM_GROUPS.map((group) => (
          <div key={group.title} className="card">
            <h3 className="text-sm font-semibold text-primary-600 mb-3">{group.title}</h3>
            <div className="space-y-2">
              {group.keys.map((key) => {
                const p = paramMap[key];
                if (!p) return null;
                const isEditing = editingKey === key;

                return (
                  <div key={key} className="flex items-center justify-between py-1 border-b border-slate-100">
                    <div className="flex-1">
                      <div className="text-sm font-mono text-slate-700">{key}</div>
                      <div className="text-xs text-slate-400">{p.description}</div>
                    </div>
                    <div className="w-32 text-right">
                      {isEditing ? (
                        <input
                          autoFocus
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          onBlur={saveEdit}
                          onKeyDown={handleKeyDown}
                          className="input text-sm py-1 text-right"
                          disabled={saving}
                        />
                      ) : (
                        <span
                          className="text-sm font-medium text-slate-800 cursor-pointer hover:text-primary-600"
                          onClick={() => startEdit(key, p.value)}
                        >
                          {formatValue(key, p.value)}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <div className="card bg-amber-50 border-amber-200">
        <p className="text-sm text-amber-700 flex items-center gap-1">
          <Warning size={16} weight="fill" /> Chỉ chỉnh sửa các tham số trên. Toàn bộ 120 tháng sẽ tự động cập nhật khi bạn thay đổi giá trị.
        </p>
      </div>
    </div>
  );
}
