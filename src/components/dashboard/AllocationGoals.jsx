import { useState, useEffect, useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { formatVND, formatPercent } from '../../utils/formatters';
import { apiClient } from '../../utils/apiClient';
import AppIcon, { CheckCircle } from '../../utils/iconMap';

const COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6'];

const CATEGORY_LABELS = {
  'Chứng Khoán': 'Đầu tư',
};

export default function AllocationGoals() {
  const [summary, setSummary] = useState(null);
  const [phase, setPhase] = useState(null);
  const [phaseAllocs, setPhaseAllocs] = useState([]);
  const [categories, setCategories] = useState([]);
  const [filled, setFilled] = useState([]);
  const [allocsByCategory, setAllocsByCategory] = useState({});

  useEffect(() => {
    (async () => {
      try {
        const [s, p, c, f] = await Promise.all([
          apiClient.portfolio.summary(),
          apiClient.phases.active(),
          apiClient.categories.get(),
          apiClient.monthly.filled(),
        ]);
        setSummary(s);
        setPhase(p);
        setCategories(c);
        setFilled(f);
        if (p) {
          const pa = await apiClient.phases.allocations(p.id);
          setPhaseAllocs(pa || []);
        }
        // Fetch allocations for filled months
        if (f.length > 0) {
          const allAllocs = await Promise.all(
            f.map(m => apiClient.allocations.get(m.id).catch(() => []))
          );
          const byCat = {};
          for (const monthAllocs of allAllocs) {
            for (const a of monthAllocs) {
              const name = a.category_name;
              if (!byCat[name]) byCat[name] = { total: 0, color: a.color, icon: a.icon };
              byCat[name].total += a.actual_amount || a.planned_amount || 0;
            }
          }
          setAllocsByCategory(byCat);
        }
      } catch (err) {
        console.error('AllocationGoals load error:', err);
      }
    })();
  }, []);

  const portfolio = summary?.portfolio || [];
  const totalCurrentValue = summary?.totalCurrentValue || 0;
  const byCategory = summary?.byCategory || {};

  // Current allocation by category (from portfolio, fallback to monthly allocations)
  const totalAllocated = Object.values(allocsByCategory).reduce((s, c) => s + c.total, 0);
  const baseTotal = totalCurrentValue > 0 ? totalCurrentValue : totalAllocated;
  const currentAlloc = useMemo(() => {
    return categories.map(c => {
      const catData = byCategory[c.name];
      const allocTotal = allocsByCategory[c.name]?.total || 0;
      const currentTotal = catData?.currentTotal || allocTotal;
      const currentPct = baseTotal > 0 ? (currentTotal / baseTotal) * 100 : 0;
      return {
        name: c.name,
        label: CATEGORY_LABELS[c.name] || c.name,
        icon: c.icon,
        color: c.color,
        currentPct,
        currentTotal,
        itemCount: catData?.items?.length || 0,
      };
    }).filter(c => c.currentTotal > 0 || phaseAllocs.some(pa => pa.category_name === c.name));
  }, [categories, byCategory, totalCurrentValue, phaseAllocs, allocsByCategory]);

  // Target allocation from phase
  const targetAlloc = useMemo(() => {
    return phaseAllocs.map(pa => ({
      name: pa.category_name,
      label: CATEGORY_LABELS[pa.category_name] || pa.category_name,
      color: pa.color,
      icon: pa.icon,
      targetPct: pa.ratio * 100,
    }));
  }, [phaseAllocs]);

  // Rebalance alerts
  const rebalanceAlerts = useMemo(() => {
    return currentAlloc.map(c => {
      const target = targetAlloc.find(t => t.name === c.name);
      if (!target) return null;
      const diff = c.currentPct - target.targetPct;
      if (Math.abs(diff) > 10) {
        return {
          name: c.name,
          label: c.label,
          icon: c.icon,
          current: c.currentPct,
          target: target.targetPct,
          diff,
          direction: diff > 0 ? 'thừa' : 'thiếu',
        };
      }
      return null;
    }).filter(Boolean);
  }, [currentAlloc, targetAlloc]);

  // Pie data
  const pieData = currentAlloc.filter(c => c.currentTotal > 0).map(c => ({
    name: c.name,
    value: c.currentTotal,
    color: c.color,
  }));

  // Milestones from phase goals (dynamic based on monthly expenses)
  const [phases, setPhases] = useState([]);

  useEffect(() => {
    apiClient.phases.get().then(setPhases).catch(err => console.error('Phases load error:', err));
  }, []);

  const milestones = phases.map(p => ({
    label: p.sort_order.toString(),
    target: p.goal_amount || 0,
    desc: p.goal_description,
    name: p.name,
    multiplier: p.goal_multiplier,
  }));

  const totalAssets = totalCurrentValue;

  // Risk metrics
  const maxSingleAsset = portfolio.length > 0
    ? Math.max(...portfolio.map(p => p.current_value))
    : 0;
  const concentrationRisk = totalCurrentValue > 0 ? (maxSingleAsset / totalCurrentValue) * 100 : 0;
  const assetCount = portfolio.length;
  const categoryCount = Object.keys(byCategory).length;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Allocation: Current vs Target */}
      <div className="grid grid-cols-1 xl:grid-cols-5 gap-4">
        {/* Current allocation pie */}
        <div className="card xl:col-span-2">
          <h3 className="text-sm font-semibold text-slate-700 mb-4">Phân bổ hiện tại</h3>
          {pieData.length === 0 ? (
            <div className="text-center py-12 text-slate-400 text-sm">Chưa có dữ liệu</div>
          ) : (
            <div className="flex items-center gap-6">
              <ResponsiveContainer width={180} height={180}>
                <PieChart>
                  <Pie data={pieData} cx="50%" cy="50%" innerRadius={50} outerRadius={75} paddingAngle={3} dataKey="value">
                    {pieData.map((d, i) => <Cell key={i} fill={d.color} />)}
                  </Pie>
                  <Tooltip formatter={v => formatVND(v)} />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-2 flex-1">
                {currentAlloc.filter(c => c.currentTotal > 0).map(c => (
                  <div key={c.name} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full" style={{ background: c.color }} />
                      <span className="text-xs text-slate-600 flex items-center gap-1"><AppIcon emoji={c.icon} size={14} /> {c.label}</span>
                    </div>
                    <span className="text-xs font-bold text-slate-800">{c.currentPct.toFixed(1)}%</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Target allocation */}
        <div className="card xl:col-span-3">
          <h3 className="text-sm font-semibold text-slate-700 mb-4">
            Phân bổ mục tiêu
            {phase && <span className="text-xs text-slate-400 ml-2">({phase.name})</span>}
          </h3>
          {targetAlloc.length === 0 ? (
            <div className="text-center py-12 text-slate-400 text-sm">Chưa có phân bổ mục tiêu</div>
          ) : (
            <div className="space-y-3">
              {targetAlloc.map(t => {
                const current = currentAlloc.find(c => c.name === t.name);
                const diff = (current?.currentPct || 0) - t.targetPct;
                return (
                  <div key={t.name}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm text-slate-700 flex items-center gap-1.5"><AppIcon emoji={t.icon} size={16} /> {t.label}</span>
                      <span className="text-sm font-bold" style={{ color: t.color }}>{t.targetPct.toFixed(0)}%</span>
                    </div>
                    <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${Math.min(current?.currentPct || 0, 100)}%`, background: t.color }} />
                    </div>
                    <div className="flex justify-between text-[10px] text-slate-400 mt-0.5">
                      <span>Hiện tại: {(current?.currentPct || 0).toFixed(1)}%</span>
                      <span className={diff > 5 ? 'text-amber-500' : diff < -5 ? 'text-blue-500' : 'text-emerald-500'}>
                        {diff > 0 ? '+' : ''}{diff.toFixed(1)}%
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Rebalance Alerts */}
      {rebalanceAlerts.length > 0 && (
        <div className="card bg-amber-50 border-amber-200">
          <h3 className="text-sm font-bold text-amber-800 mb-3">Cần rebalance</h3>
          <div className="space-y-2">
            {rebalanceAlerts.map(a => (
              <div key={a.name} className="flex items-center justify-between text-sm">
                <span className="text-amber-700 flex items-center gap-1"><AppIcon emoji={a.icon} size={14} /> {a.label}</span>
                <span className="text-amber-600">
                  {a.direction === 'thừa' ? 'Thừa' : 'Thiếu'} {Math.abs(a.diff).toFixed(1)}% ({a.current.toFixed(0)}% → {a.target.toFixed(0)}%)
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Milestones */}
      <div className="card">
        <h3 className="text-sm font-semibold text-slate-700 mb-4">Tiến độ mục tiêu</h3>
        <div className="space-y-3">
          {milestones.map((m, i) => {
            const pct = m.target > 0 ? Math.min((totalAssets / m.target) * 100, 100) : 0;
            const reached = m.target > 0 && totalAssets >= m.target;
            const isFI = m.multiplier === 0;

            // For FI milestone, calculate based on passive income
            const fiPct = isFI ? 0 : pct; // TODO: calculate from passive income

            return (
              <div key={m.name || i} className={`p-3 rounded-xl border ${reached ? 'bg-emerald-50 border-emerald-200' : 'border-slate-200'}`}>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-3">
                    <span className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold ${reached ? 'bg-emerald-500 text-white' : 'bg-slate-100 text-slate-500'}`}>
                      {reached ? <CheckCircle size={16} weight="fill" /> : m.label}
                    </span>
                    <div>
                      <p className="text-sm font-semibold text-slate-800">{m.name}</p>
                      <p className="text-xs text-slate-400">{m.desc}</p>
                      {m.multiplier > 0 && <p className="text-[10px] text-slate-300">= {m.multiplier}× chi tiêu</p>}
                    </div>
                  </div>
                  {!isFI && (
                    <div className="text-right">
                      <p className="text-sm font-bold text-slate-800">{pct.toFixed(1)}%</p>
                      <p className="text-[10px] text-slate-400">{formatVND(totalAssets)} / {formatVND(m.target)}</p>
                    </div>
                  )}
                  {isFI && (
                    <div className="text-right">
                      <p className="text-xs text-slate-400">Thu nhập thụ động ≥ chi tiêu</p>
                    </div>
                  )}
                </div>
                {!isFI && (
                  <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-1000"
                      style={{ width: `${pct}%`, background: reached ? '#10b981' : '#3b82f6' }}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Risk Overview */}
      <div className="card">
        <h3 className="text-sm font-semibold text-slate-700 mb-4">Rủi ro & Đa dạng hóa</h3>
        <div className="grid grid-cols-3 gap-4">
          <div className="p-4 bg-slate-50 rounded-xl text-center">
            <p className="text-xs text-slate-400 mb-1">Số tài sản</p>
            <p className="text-2xl font-bold text-slate-800">{assetCount}</p>
            <p className={`text-xs ${assetCount >= 3 ? 'text-emerald-500' : 'text-amber-500'}`}>
              {assetCount >= 3 ? 'Đa dạng tốt' : 'Cần đa dạng thêm'}
            </p>
          </div>
          <div className="p-4 bg-slate-50 rounded-xl text-center">
            <p className="text-xs text-slate-400 mb-1">Số danh mục</p>
            <p className="text-2xl font-bold text-slate-800">{categoryCount}</p>
            <p className={`text-xs ${categoryCount >= 3 ? 'text-emerald-500' : 'text-amber-500'}`}>
              {categoryCount >= 3 ? 'Phân bổ tốt' : 'Nên mở rộng'}
            </p>
          </div>
          <div className="p-4 bg-slate-50 rounded-xl text-center">
            <p className="text-xs text-slate-400 mb-1">Tập trung cao nhất</p>
            <p className={`text-2xl font-bold ${concentrationRisk > 60 ? 'text-red-500' : concentrationRisk > 40 ? 'text-amber-500' : 'text-emerald-500'}`}>
              {concentrationRisk.toFixed(0)}%
            </p>
            <p className={`text-xs ${concentrationRisk > 60 ? 'text-red-500' : 'text-slate-400'}`}>
              {concentrationRisk > 60 ? 'Quá tập trung!' : concentrationRisk > 40 ? 'Hơi tập trung' : 'Cân bằng tốt'}
            </p>
          </div>
        </div>

        {/* Asset breakdown */}
        {portfolio.length > 0 && (
          <div className="mt-4 space-y-2">
            <p className="text-xs text-slate-400 font-semibold">Mức tập trung theo tài sản:</p>
            {portfolio.slice(0, 5).map(p => {
              const pct = totalCurrentValue > 0 ? (p.current_value / totalCurrentValue) * 100 : 0;
              return (
                <div key={p.asset_type_id} className="flex items-center gap-3">
                  <span className="text-sm w-24 truncate flex items-center gap-1"><AppIcon emoji={p.icon} size={14} /> {p.name}</span>
                  <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${pct}%`,
                        background: pct > 40 ? '#ef4444' : pct > 25 ? '#f59e0b' : '#10b981',
                      }}
                    />
                  </div>
                  <span className="text-xs font-medium text-slate-600 w-12 text-right">{pct.toFixed(0)}%</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
