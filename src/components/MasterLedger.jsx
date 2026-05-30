import { useState, useEffect } from 'react';
import { apiClient } from '../utils/apiClient';
import { formatVND } from '../utils/formatters';

export default function MasterLedger() {
  const [entries, setEntries] = useState([]);
  const [filter, setFilter] = useState('has-data');

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    const data = await apiClient.monthly.get();
    setEntries(data);
  }

  const filtered = filter === 'all' ? entries : entries.filter(e => e.income > 0 || e.expenses > 0);

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold">Sổ cái tổng hợp</h3>
        <select value={filter} onChange={e => setFilter(e.target.value)} className="input w-auto">
          <option value="has-data">Có dữ liệu</option>
          <option value="all">Tất cả</option>
        </select>
      </div>
      {filtered.length === 0 ? (
        <p className="text-gray-400 text-sm">Chưa có dữ liệu</p>
      ) : (
        <table className="table">
          <thead><tr><th>Tháng</th><th>Giai đoạn</th><th>Thu nhập</th><th>Chi tiêu</th><th>Tiết kiệm</th><th>Ròng</th></tr></thead>
          <tbody>
            {filtered.map(e => (
              <tr key={e.id}>
                <td>{e.month}/{e.year}</td>
                <td><span className="badge bg-gray-100 text-gray-700">{e.phase_name || '—'}</span></td>
                <td className="text-emerald-600">{formatVND(e.income)}</td>
                <td className="text-red-600">{formatVND(e.expenses)}</td>
                <td className="text-violet-600">{formatVND(e.savings)}</td>
                <td className="font-medium">{formatVND(e.income - e.expenses)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
