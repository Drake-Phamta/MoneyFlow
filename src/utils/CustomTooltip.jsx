import { formatVND } from './formatters';

export default function CustomTooltip({ active, payload, label, formatValue = formatVND }) {
  if (!active || !payload) return null;
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-3 shadow-xl">
      <p className="text-slate-500 text-xs mb-2 font-medium">{label}</p>
      {payload.map(e => (
        <p key={e.name} className="text-xs font-semibold" style={{ color: e.color }}>
          {e.name}: {formatValue(e.value)}
        </p>
      ))}
    </div>
  );
}
