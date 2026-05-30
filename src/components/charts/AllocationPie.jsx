import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { formatVND } from '../../utils/formatters';
import { AppIcon } from '../../utils/iconMap';

const COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4'];

export default function AllocationPie({ allocations }) {
  if (!allocations || allocations.length === 0) {
    return (
      <div className="card flex items-center justify-center">
        <p className="text-gray-400 text-sm">Chưa có dữ liệu phân bổ</p>
      </div>
    );
  }

  // Group by category
  const grouped = {};
  for (const a of allocations) {
    const key = a.category_name;
    if (!grouped[key]) grouped[key] = { name: key, icon: a.icon, color: a.color, planned: 0, actual: 0 };
    grouped[key].planned += a.planned_amount || 0;
    grouped[key].actual += a.actual_amount || 0;
  }
  const pieData = Object.values(grouped).map((g, i) => ({
    ...g,
    Icon: null, // Will be resolved from iconMap
    value: g.actual || g.planned,
    fill: g.color || COLORS[i % COLORS.length],
  }));

  return (
    <div className="card">
      <h3 className="font-semibold mb-3">Phân bổ danh mục</h3>
      <div className="flex items-center gap-4">
        <div className="w-40 h-40">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={pieData} cx="50%" cy="50%" innerRadius={40} outerRadius={70} dataKey="value" paddingAngle={2}>
                {pieData.map((d, i) => <Cell key={i} fill={d.fill} />)}
              </Pie>
              <Tooltip formatter={(v) => formatVND(v)} />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="flex-1 space-y-2">
          {pieData.map((d, i) => (
            <div key={i} className="flex items-center gap-2 text-sm">
              <div className="w-3 h-3 rounded-full shrink-0" style={{ background: d.fill }} />
              <span className="text-gray-700">{d.name}</span>
              <span className="ml-auto font-medium">{formatVND(d.value)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
