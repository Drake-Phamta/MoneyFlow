import { useState, useEffect } from 'react';
import { formatVND } from '../utils/formatters';
import { apiClient } from '../utils/apiClient';
import { CheckCircle } from '@phosphor-icons/react';

export default function MasterLedger() {
  const [entries, setEntries] = useState([]);
  const [phases, setPhases] = useState([]);
  const [filter, setFilter] = useState('has-data');
  const [editingCell, setEditingCell] = useState(null);
  const [editValue, setEditValue] = useState('');

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    try {
      const [allEntries, ph] = await Promise.all([
        apiClient.monthly.getAll(),
        apiClient.phases.get(),
      ]);
      setEntries(allEntries);
      setPhases(ph);
    } catch (err) {
      console.error('MasterLedger load error:', err);
    }
  }

  // Build filter options from actual phases
  const filterOptions = [
    { key: 'has-data', label: 'Có dữ liệu' },
    { key: 'all', label: 'Tất cả' },
    ...phases.map(p => ({ key: `phase-${p.id}`, label: p.name })),
  ];

  const filtered = entries.filter(row => {
    if (filter === 'all') return true;
    if (filter === 'has-data') return row.total_inflow > 0;
    if (filter.startsWith('phase-')) {
      const phaseId = parseInt(filter.replace('phase-', ''));
      return row.phase_id === phaseId;
    }
    return true;
  });

  function startEdit(rowIndex, field, currentValue) {
    setEditingCell({ rowIndex, field });
    setEditValue(currentValue?.toString() || '');
  }

  async function saveEdit() {
    if (!editingCell) return;
    try {
      const row = filtered[editingCell.rowIndex];
      const value = parseFloat(editValue) || 0;
      await apiClient.monthly.save({
        month_index: row.month_index,
        month_label: row.month_label,
        [editingCell.field]: value,
        total_inflow: editingCell.field === 'total_inflow' ? value : row.total_inflow,
        phase_id: row.phase_id,
      });
      setEditingCell(null);
      loadData();
    } catch (err) {
      console.error('Save edit error:', err);
      alert('Lỗi khi lưu: ' + err.message);
    }
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter') saveEdit();
    if (e.key === 'Escape') setEditingCell(null);
  }

  function getPhaseName(phaseId) {
    const p = phases.find(x => x.id === phaseId);
    return p ? p.name : '—';
  }

  function getPhaseColor(phaseId) {
    const p = phases.find(x => x.id === phaseId);
    if (!p) return 'text-slate-400';
    const colors = ['text-emerald-600', 'text-blue-600', 'text-violet-600', 'text-amber-600'];
    return colors[(p.sort_order - 1) % colors.length];
  }

  const columns = [
    { key: 'month_label', label: 'Tháng', width: 'w-20' },
    { key: 'total_inflow', label: 'Dòng Tiền', width: 'w-28', editable: true, format: v => formatVND(v) },
    { key: 'phase_id', label: 'Giai đoạn', width: 'w-40', format: (v) => getPhaseName(v) },
    { key: 'note', label: 'Ghi chú', width: 'w-48' },
    { key: 'status', label: 'Trạng thái', width: 'w-20', format: v => v === 'confirmed' ? <CheckCircle size={16} className="text-emerald-500" weight="regular" /> : <span className="text-slate-300">—</span> },
  ];

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title">Sổ Cái</h1>
          <p className="page-subtitle">Bảng kê chi tiết dòng tiền theo tháng</p>
        </div>
        <div className="flex gap-1 bg-slate-100 rounded-xl p-1 flex-wrap">
          {filterOptions.map(opt => (
            <button
              key={opt.key}
              onClick={() => setFilter(opt.key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                filter === opt.key
                  ? 'bg-white text-slate-800 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div className="card p-0 overflow-hidden">
        <div className="overflow-auto max-h-[calc(100vh-220px)]">
          <table className="table">
            <thead>
              <tr>
                {columns.map(col => (
                  <th key={col.key} className={col.width}>{col.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((row, ri) => {
                const hasData = row.total_inflow > 0;
                return (
                  <tr key={row.month_index} className={hasData ? '' : 'opacity-40'}>
                    {columns.map(col => {
                      const isEditing = editingCell?.rowIndex === ri && editingCell?.field === col.key;
                      const value = row[col.key];
                      const display = col.format ? col.format(value) : (value != null ? value : '');

                      let cellClass = '';
                      if (col.key === 'phase_id') {
                        cellClass = getPhaseColor(value);
                      }

                      return (
                        <td key={col.key} className={cellClass}>
                          {isEditing ? (
                            <input
                              autoFocus
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              onBlur={saveEdit}
                              onKeyDown={handleKeyDown}
                              className="input py-1 px-2 text-xs"
                            />
                          ) : (
                            <span
                              className={col.editable ? 'cursor-pointer hover:text-primary-600 hover:bg-primary-50 px-1 py-0.5 rounded' : ''}
                              onClick={() => col.editable && startEdit(ri, col.key, value)}
                            >
                              {display}
                            </span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="text-xs text-slate-400 text-center">
        {filtered.filter(r => r.total_inflow > 0).length} tháng có dữ liệu / {filtered.length} tháng hiển thị
      </div>
    </div>
  );
}
