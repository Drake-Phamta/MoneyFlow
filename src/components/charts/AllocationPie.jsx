import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { formatVND } from '../../utils/formatters';
import AppIcon, { ChartDonut } from '../../utils/iconMap';

export default function AllocationPie({ data = [], layout = 'vertical', theme = 'light' }) {
  const filtered = data.filter(d => d.value > 0);

  const isDark = theme === 'dark';
  const textColor = isDark ? 'text-slate-200' : 'text-slate-600';
  const valueColor = isDark ? 'text-white' : 'text-slate-800';
  const emptyColor = isDark ? 'text-slate-400' : 'text-slate-400';

  if (filtered.length === 0) {
    return (
      <div className={`flex flex-col items-center justify-center h-[200px] ${emptyColor}`}>
        <ChartDonut size={40} weight="light" />
        <p className="text-sm mt-2">Chưa có dữ liệu</p>
        <p className={`text-xs ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>Nhập liệu tháng đầu tiên</p>
      </div>
    );
  }

  const total = filtered.reduce((s, d) => s + d.value, 0);

  const renderLegend = () => (
    <div className={layout === 'horizontal' ? "grid grid-cols-2 gap-x-3 gap-y-3 w-full content-start overflow-y-auto max-h-[180px] pr-1" : "space-y-2 mt-2 max-h-[200px] overflow-y-auto pr-1"}>
      {filtered.map((d) => (
        <div key={d.name} className="flex flex-col justify-center">
          <div className="flex items-center gap-1.5 min-w-0">
            <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: d.color }} />
            <span className={`text-xs ${textColor} flex items-center gap-1 truncate font-medium`} title={d.name}>
              {d.icon && <AppIcon name={d.icon} size={12} />}
              {d.name}
            </span>
          </div>
          <div className="flex items-baseline gap-1 mt-0.5 ml-3.5">
            <span className={`text-xs font-bold ${valueColor} truncate`}>{formatVND(d.value)}</span>
            <span className={`text-[10px] ${isDark ? 'text-slate-400' : 'text-slate-400'} flex-shrink-0`}>
              ({((d.value / total) * 100).toFixed(0)}%)
            </span>
          </div>
        </div>
      ))}
    </div>
  );

  if (layout === 'horizontal') {
    return (
      <div className="flex items-center gap-6 w-full">
        <div className="w-[180px] h-[180px] flex-shrink-0">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={filtered}
                cx="50%"
                cy="50%"
                innerRadius={45}
                outerRadius={75}
                paddingAngle={3}
                dataKey="value"
                stroke="none"
              >
                {filtered.map((d, i) => (
                  <Cell key={i} fill={d.color || '#94a3b8'} />
                ))}
              </Pie>
              <Tooltip
                formatter={(value) => formatVND(value)}
                contentStyle={{ borderRadius: '12px', border: 'none', background: isDark ? 'rgba(15, 23, 42, 0.9)' : '#fff', color: isDark ? '#fff' : '#000', fontSize: '12px' }}
                itemStyle={{ color: isDark ? '#fff' : '#000' }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="flex-1 min-w-0">
          {renderLegend()}
        </div>
      </div>
    );
  }

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
            stroke="none"
          >
            {filtered.map((d, i) => (
              <Cell key={i} fill={d.color || '#94a3b8'} />
            ))}
          </Pie>
          <Tooltip
            formatter={(value) => formatVND(value)}
            contentStyle={{ borderRadius: '12px', border: isDark ? 'none' : '1px solid #e2e8f0', background: isDark ? 'rgba(15, 23, 42, 0.9)' : '#fff', color: isDark ? '#fff' : '#000', fontSize: '12px' }}
            itemStyle={{ color: isDark ? '#fff' : '#000' }}
          />
        </PieChart>
      </ResponsiveContainer>
      {renderLegend()}
    </div>
  );
}
