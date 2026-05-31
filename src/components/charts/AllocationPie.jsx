import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { formatVND } from '../../utils/formatters';
import AppIcon, { ChartDonut } from '../../utils/iconMap';

export default function AllocationPie({ data = [] }) {
  const filtered = data.filter(d => d.value > 0);

  if (filtered.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-[200px] text-slate-400">
        <ChartDonut size={40} weight="light" />
        <p className="text-sm mt-2">Chưa có dữ liệu</p>
        <p className="text-xs text-slate-300">Nhập liệu tháng đầu tiên</p>
      </div>
    );
  }

  const total = filtered.reduce((s, d) => s + d.value, 0);

  return (
    <div>
      <ResponsiveContainer width="100%" height={180}>
        <PieChart>
          <Pie
            data={filtered}
            cx="50%"
            cy="50%"
            innerRadius={45}
            outerRadius={70}
            paddingAngle={3}
            dataKey="value"
          >
            {filtered.map((d, i) => (
              <Cell key={i} fill={d.color || '#94a3b8'} />
            ))}
          </Pie>
          <Tooltip
            formatter={(value) => formatVND(value)}
            contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', fontSize: '12px' }}
          />
        </PieChart>
      </ResponsiveContainer>
      <div className="space-y-2 mt-2">
        {filtered.map((d) => (
          <div key={d.name} className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-full" style={{ background: d.color }} />
              <span className="text-xs text-slate-600 flex items-center gap-1">
                {d.icon && <AppIcon name={d.icon} size={14} />}
                {d.name}
              </span>
            </div>
            <div className="text-right">
              <span className="text-xs font-semibold text-slate-800">{formatVND(d.value)}</span>
              <span className="text-[10px] text-slate-400 ml-1">({((d.value / total) * 100).toFixed(0)}%)</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
