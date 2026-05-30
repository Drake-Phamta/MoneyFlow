import { useState, useEffect } from 'react';
import { apiClient } from '../../utils/apiClient';
import { formatVND, formatCompact, formatPercent } from '../../utils/formatters';

export default function AllocationGoals() {
  const [allocations, setAllocations] = useState([]);
  const [categories, setCategories] = useState([]);
  const [phase, setPhase] = useState(null);

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    const [a, c, p] = await Promise.all([apiClient.allocations.getAll(), apiClient.categories.get(), apiClient.phases.getActive()]);
    setAllocations(a); setCategories(c); setPhase(p);
  }

  // Aggregate by category
  const byCategory = {};
  for (const cat of categories) {
    byCategory[cat.id] = { ...cat, planned: 0, actual: 0 };
  }
  for (const a of allocations) {
    if (byCategory[a.category_id]) {
      byCategory[a.category_id].planned += a.planned_amount || 0;
      byCategory[a.category_id].actual += a.actual_amount || 0;
    }
  }
  const cats = Object.values(byCategory).filter(c => c.planned > 0 || c.actual > 0);
  const totalPlanned = cats.reduce((s, c) => s + c.planned, 0);
  const totalActual = cats.reduce((s, c) => s + c.actual, 0);

  return (
    <div className="space-y-4">
      <h3 className="font-semibold">Phân bổ mục tiêu</h3>

      {cats.length === 0 ? (
        <div className="card"><p className="text-gray-400 text-sm">Chưa có dữ liệu phân bổ. Hãy thêm dòng tiền trước.</p></div>
      ) : (
        <>
          <div className="card">
            <table className="table">
              <thead><tr><th>Danh mục</th><th>Dự kiến</th><th>Thực tế</th><th>Chênh lệch</th><th>% Thực tế</th></tr></thead>
              <tbody>
                {cats.map(c => {
                  const diff = c.actual - c.planned;
                  const pct = totalActual > 0 ? (c.actual / totalActual) * 100 : 0;
                  return (
                    <tr key={c.id}>
                      <td><span style={{ color: c.color }}>{c.icon}</span> {c.name}</td>
                      <td>{formatVND(c.planned)}</td>
                      <td className="font-medium">{formatVND(c.actual)}</td>
                      <td className={diff >= 0 ? 'text-emerald-600' : 'text-red-600'}>{diff >= 0 ? '+' : ''}{formatVND(diff)}</td>
                      <td>{formatPercent(pct)}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="font-semibold border-t">
                  <td>Tổng</td>
                  <td>{formatVND(totalPlanned)}</td>
                  <td>{formatVND(totalActual)}</td>
                  <td className={totalActual >= totalPlanned ? 'text-emerald-600' : 'text-red-600'}>
                    {totalActual >= totalPlanned ? '+' : ''}{formatVND(totalActual - totalPlanned)}
                  </td>
                  <td>100%</td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Visual bars */}
          <div className="card">
            <h4 className="text-sm font-medium mb-3">So sánh dự kiến vs thực tế</h4>
            <div className="space-y-3">
              {cats.map(c => (
                <div key={c.id}>
                  <div className="flex justify-between text-xs mb-1">
                    <span>{c.icon} {c.name}</span>
                    <span className="text-gray-500">{formatPercent(c.planned > 0 ? ((c.actual / c.planned) * 100) : 0)}</span>
                  </div>
                  <div className="relative h-6 bg-gray-100 rounded-full overflow-hidden">
                    <div className="absolute h-full bg-gray-300 rounded-full" style={{ width: `${totalPlanned > 0 ? (c.planned / totalPlanned) * 100 : 0}%` }} />
                    <div className="absolute h-full rounded-full opacity-80" style={{ width: `${totalActual > 0 ? (c.actual / totalActual) * 100 : 0}%`, background: c.color }} />
                  </div>
                </div>
              ))}
            </div>
            <div className="flex gap-4 mt-3 text-xs text-gray-500">
              <span className="flex items-center gap-1"><span className="w-3 h-3 bg-gray-300 rounded" /> Dự kiến</span>
              <span className="flex items-center gap-1"><span className="w-3 h-3 bg-primary-500 rounded" /> Thực tế</span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
