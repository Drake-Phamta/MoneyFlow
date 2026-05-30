import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { formatCompact } from '../../utils/formatters';
import { useMemo } from 'react';

export default function AssetGrowth({ ledger, rates, params }) {
  const data = useMemo(() => {
    if (!ledger.length) return [];
    const scenarios = { bear: [], base: [], bull: [] };
    const rateValues = [rates.bear, rates.base, rates.bull];
    const rateKeys = ['bear', 'base', 'bull'];

    for (let r = 0; r < 3; r++) {
      let stBalance = 0, etfPlan = 0, sniperBalance = 0, inPhase2 = false;
      for (const row of ledger) {
        const inflow = row.inflow || params.DEFAULT_INFLOW || 3700000;
        if (!inPhase2 && stBalance >= (params.SURVIVAL_THRESHOLD || 30000000)) inPhase2 = true;
        else if (inPhase2 && stBalance <= (params.SURVIVAL_LOWER_BOUND || 25000000)) inPhase2 = false;

        if (!inPhase2) {
          stBalance += Math.round(inflow * (params.PHASE_1_SURVIVAL_RATIO || 0.7));
          etfPlan += Math.round(inflow * (params.PHASE_1_ETF_RATIO || 0.3));
        } else {
          etfPlan += Math.round(inflow * (params.PHASE_2_ETF_RATIO || 0.8));
          sniperBalance += Math.round(inflow * (params.PHASE_2_SNIPER_RATIO || 0.2));
        }
        etfPlan += etfPlan * rateValues[r];
        sniperBalance += sniperBalance * (params.SNIPER_BANK_RATE || 0.00375);
        scenarios[rateKeys[r]].push(Math.round(stBalance + etfPlan + sniperBalance));
      }
    }

    return ledger.map((row, i) => ({
      month: row.month_label,
      bear: scenarios.bear[i] || 0,
      base: scenarios.base[i] || 0,
      bull: scenarios.bull[i] || 0,
      actual: row.total_assets || 0,
    }));
  }, [ledger, rates, params]);

  const CustomTooltip = ({ active, payload, label }) => {
    if (!active || !payload) return null;
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-3 shadow-xl">
        <p className="text-slate-500 text-xs mb-2 font-medium">{label}</p>
        {payload.map((entry) => (
          <p key={entry.name} className="text-xs font-semibold" style={{ color: entry.color }}>
            {entry.name}: {formatCompact(entry.value)}
          </p>
        ))}
      </div>
    );
  };

  return (
    <ResponsiveContainer width="100%" height={280}>
      <LineChart data={data} margin={{ top: 5, right: 10, bottom: 5, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
        <XAxis dataKey="month" tick={{ fill: '#94a3b8', fontSize: 10 }} interval={11} angle={-45} textAnchor="end" height={40} />
        <YAxis tick={{ fill: '#94a3b8', fontSize: 10 }} tickFormatter={formatCompact} width={60} />
        <Tooltip content={<CustomTooltip />} />
        <Line type="monotone" dataKey="bear" stroke="#ef4444" strokeWidth={1.5} dot={false} />
        <Line type="monotone" dataKey="base" stroke="#3b82f6" strokeWidth={2} dot={false} />
        <Line type="monotone" dataKey="bull" stroke="#10b981" strokeWidth={1.5} dot={false} />
        {data.some(d => d.actual > 0) && (
          <Line type="monotone" dataKey="actual" stroke="#f59e0b" strokeWidth={2.5} dot={false} strokeDasharray="5 5" />
        )}
      </LineChart>
    </ResponsiveContainer>
  );
}
