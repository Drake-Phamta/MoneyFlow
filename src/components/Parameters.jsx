import { useState, useEffect } from 'react';
import { formatVND, formatPercent } from '../utils/formatters';

const PARAM_GROUPS = [
  {
    title: 'I. Ngưỡng Chuyển Phase',
    keys: ['SURVIVAL_THRESHOLD', 'SURVIVAL_LOWER_BOUND'],
  },
  {
    title: 'II. Tỷ Lệ Phân Bổ — Phase 1',
    keys: ['PHASE_1_SURVIVAL_RATIO', 'PHASE_1_ETF_RATIO'],
  },
  {
    title: 'III. Tỷ Lệ Phân Bổ — Phase 2',
    keys: ['PHASE_2_ETF_RATIO', 'PHASE_2_SNIPER_RATIO'],
  },
  {
    title: 'IV. Lãi Suất ETF — 3 Kịch Bản',
    keys: ['ETF_RATE_BEAR', 'ETF_RATE_BASE', 'ETF_RATE_BULL'],
  },
  {
    title: 'V. Lãi Suất Khác',
    keys: ['SNIPER_BANK_RATE', 'INFLATION_MONTHLY'],
  },
  {
    title: 'VI. Tham Số Vận Hành',
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
    const data = await window.api.getParameters();
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
    await window.api.updateParameter(editingKey, value);
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
        <h1 className="text-2xl font-bold">⚙️ Tham Số Hệ Thống</h1>
        <p className="text-xs text-dark-400">Click vào giá trị để chỉnh sửa. Tự động tính lại toàn bộ khi lưu.</p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {PARAM_GROUPS.map((group) => (
          <div key={group.title} className="kpi-card">
            <h3 className="text-sm font-semibold text-primary-400 mb-3">{group.title}</h3>
            <div className="space-y-2">
              {group.keys.map((key) => {
                const p = paramMap[key];
                if (!p) return null;
                const isEditing = editingKey === key;

                return (
                  <div key={key} className="flex items-center justify-between py-1 border-b border-dark-700/50">
                    <div className="flex-1">
                      <div className="text-sm font-mono text-dark-200">{key}</div>
                      <div className="text-xs text-dark-500">{p.description}</div>
                    </div>
                    <div className="w-32 text-right">
                      {isEditing ? (
                        <input
                          autoFocus
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          onBlur={saveEdit}
                          onKeyDown={handleKeyDown}
                          className="w-full bg-dark-700 border border-primary-500 rounded px-2 py-1 text-sm text-right focus:outline-none"
                          disabled={saving}
                        />
                      ) : (
                        <span
                          className="text-sm font-medium text-dark-100 cursor-pointer hover:text-primary-400"
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

      <div className="kpi-card bg-amber-500/5 border-amber-500/20">
        <p className="text-sm text-amber-300">
          ⚠️ Chỉ chỉnh sửa các tham số trên. Toàn bộ 120 tháng sẽ tự động cập nhật khi bạn thay đổi giá trị.
        </p>
      </div>
    </div>
  );
}
