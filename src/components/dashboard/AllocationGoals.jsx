import { useState, useEffect, useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { formatVND } from '../../utils/formatters';
import { apiClient } from '../../utils/apiClient';
import AppIcon, { CheckCircle } from '../../utils/iconMap';

// Dự phòng khi một danh mục chưa có màu riêng. Cùng bảng màu giấy với
// categories.color, xem migrateToV9.
const COLORS = ['#0F5D4A', '#3A6B8A', '#B06D22', '#A93E27', '#67558F'];

export default function AllocationGoals() {
  const [loading, setLoading] = useState(true);
  const [snap, setSnap] = useState(null);
  const [phaseAllocs, setPhaseAllocs] = useState([]);

  useEffect(() => {
    (async () => {
      try {
        const sn = await apiClient.snapshot.get();
        setSnap(sn);
        setPhaseAllocs(sn.phaseAllocations?.[sn.phase?.sortOrder] || []);
      } catch (err) {
        console.error('AllocationGoals load error:', err);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const portfolio = snap?.portfolio.items || [];
  const totalCurrentValue = snap?.portfolio.marketValue || 0;
  const categories = snap?.categories || [];
  const phase = snap?.phase || null;
  const targetExpense = snap?.params.FI_MONTHLY_EXPENSE || 0;

  // Tong tai san - cung mot con so voi Tong quan va Kich ban.
  const totalAssets = snap?.netWorth.total || 0;

  // Tien de danh moi thang, dung de uoc luong thoi gian con lai.
  const avgMonthlySavings = snap?.cashflow.inflowMean || 0;

  // Moi danh muc do bang dung mot don vi: gia thi truong voi khoan dau tu,
  // so du goc + lai voi so tiet kiem. Danh muc chua co tai san la 0%.
  const currentAlloc = useMemo(() => {
    if (!snap) return [];
    const pf = snap.portfolio.byCategory || {};
    const sv = snap.savings.byCategory || {};
    const rows = categories.map(c => {
      const currentTotal = (pf[c.name]?.marketValue || 0) + (sv[c.name]?.balance || 0);
      return {
        name: c.name,
        label: c.name,
        icon: c.icon,
        color: c.color,
        currentPct: totalAssets > 0 ? (currentTotal / totalAssets) * 100 : 0,
        currentTotal,
        itemCount: (pf[c.name]?.items?.length || 0) + (sv[c.name]?.count || 0),
      };
    }).filter(c => c.currentTotal > 0 || phaseAllocs.some(pa => pa.category_name === c.name));

    // Tien mat cung la tai san. Tach lam hai vi hai loai nay khac nhau ve y dinh:
    // mot ben da chia cho danh muc va dang cho lenh mua, mot ben chua chia.
    const pushCash = (key, label, color, amount) => {
      if (amount <= 0) return;
      rows.push({
        name: key,
        label,
        icon: null,
        color,
        currentPct: totalAssets > 0 ? (amount / totalAssets) * 100 : 0,
        currentTotal: amount,
        itemCount: 0,
      });
    };
    pushCash('__awaiting__', 'Đã chia, chờ lệnh mua', '#64748b', snap.cash.awaitingInvestment);
    pushCash('__unallocated__', 'Chưa chia cho danh mục nào', '#cbd5e1', snap.cash.unallocated);
    return rows;
  }, [snap, categories, phaseAllocs, totalAssets]);

  // Moc cua giai doan quy ra tien cho tung danh muc.
  const targetAlloc = useMemo(() => {
    if (!phaseAllocs.length || !phase?.goalAmount) return [];
    
    // Giai doan 1 do quy du phong, nen moc cua ca danh muc la moc du phong
    // chia cho ty le danh cho Du Phong. Tu giai doan 2 moc la tong tai san.
    const isPhase1 = phase.sortOrder === 1;
    let totalGoal;
    
    if (isPhase1) {
      const dpRatio = phaseAllocs.find(pa => pa.category_name?.toLowerCase().includes('dự phòng'))?.ratio || 1;
      totalGoal = phase.goalAmount / dpRatio;
    } else {
      totalGoal = phase.goalAmount;
    }

    return phaseAllocs.map(pa => ({
      name: pa.category_name,
      label: pa.category_name,
      color: pa.color,
      icon: pa.icon,
      targetPct: pa.ratio * 100,
      targetVND: totalGoal * pa.ratio,
    }));
  }, [phaseAllocs, phase]);

  // Rebalance alerts
  const rebalanceAlerts = useMemo(() => {
    return currentAlloc.map(c => {
      const target = targetAlloc.find(t => t.name === c.name);
      if (!target) return null;
      const diff = c.currentPct - target.targetPct;
      const diffVND = c.currentTotal - target.targetVND;
      if (Math.abs(diff) > 10) {
        return {
          name: c.name,
          label: c.label,
          icon: c.icon,
          current: c.currentPct,
          target: target.targetPct,
          diff,
          diffVND,
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
    target: (p.goal_multiplier || 0) * targetExpense,
    desc: p.goal_description,
    name: p.name,
    multiplier: p.goal_multiplier,
  }));

  // Risk metrics
  const maxSingleAsset = portfolio.length > 0
    ? Math.max(...portfolio.map(p => p.current_value))
    : 0;
  const concentrationRisk = totalCurrentValue > 0 ? (maxSingleAsset / totalCurrentValue) * 100 : 0;
  const assetCount = portfolio.length;
  const categoryCount = currentAlloc.filter(c => !c.name.startsWith('__')).length;

  if (loading) return <div className="flex items-center justify-center h-64 text-slate-400">Đang tải...</div>;

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
              <div className="space-y-2.5 flex-1">
                {currentAlloc.filter(c => c.currentTotal > 0).map(c => (
                  <div key={c.name}>
                    <div className="flex items-center justify-between mb-0.5">
                      <div className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-full" style={{ background: c.color }} />
                        <span className="text-xs text-slate-600">{c.label}</span>
                      </div>
                      <span className="text-xs font-bold text-slate-800">{c.currentPct.toFixed(1)}%</span>
                    </div>
                    <p className="text-[10px] text-slate-400 ml-5">{formatVND(c.currentTotal)}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Target allocation — Bullet chart */}
        <div className="card xl:col-span-3">
          <h3 className="text-sm font-semibold text-slate-700 mb-4">
            Phân bổ mục tiêu
            {phase && <span className="text-xs text-slate-400 ml-2">({phase.name})</span>}
          </h3>
          {targetAlloc.length === 0 ? (
            <div className="text-center py-12 text-slate-400 text-sm">Chưa có phân bổ mục tiêu</div>
          ) : (
            <div className="space-y-4">
              {targetAlloc.map(t => {
                const current = currentAlloc.find(c => c.name === t.name);
                const currentVND = current?.currentTotal || 0;
                const maxVND = Math.max(t.targetVND, currentVND, 1);
                const fillPct = (currentVND / maxVND) * 100;
                const targetPct = (t.targetVND / maxVND) * 100;
                const diff = currentVND - t.targetVND;
                const reached = currentVND >= t.targetVND;

                return (
                  <div key={t.name}>
                    {/* Label row */}
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-sm text-slate-700 flex items-center gap-1.5">
                        <AppIcon name={t.icon} size={16} /> {t.label}
                      </span>
                      <div className="flex items-center gap-2">
                        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${
                          reached ? 'bg-emerald-50 text-emerald-600' : 'bg-blue-50 text-blue-600'
                        }`}>
                          {reached ? '✓ Đạt' : `Còn ${formatVND(Math.abs(diff))}`}
                        </span>
                      </div>
                    </div>

                    {/* Bullet bar: target = background, current = fill */}
                    <div className="relative h-3 bg-slate-100 rounded-full overflow-hidden">
                      {/* Target background */}
                      <div
                        className="absolute inset-y-0 left-0 rounded-full opacity-25"
                        style={{ width: `${Math.min(targetPct, 100)}%`, background: t.color }}
                      />
                      {/* Current fill */}
                      <div
                        className="absolute inset-y-0 left-0 rounded-full transition-all duration-700"
                        style={{ width: `${Math.min(fillPct, 100)}%`, background: t.color }}
                      />
                    </div>

                    {/* Values row */}
                    <div className="flex items-center justify-between mt-1.5 text-[11px]">
                      <span className="text-slate-500">
                        Hiện tại: <span className="font-semibold text-slate-700">{formatVND(currentVND)}</span>
                      </span>
                      <span className="text-slate-400">
                        Mục tiêu: <span className="font-medium text-slate-600">{formatVND(t.targetVND)}</span>
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
                <span className="text-amber-700 flex items-center gap-1"><AppIcon name={a.icon} size={14} /> {a.label}</span>
                <div className="text-right">
                  <span className="text-amber-600">
                    {a.direction === 'thừa' ? 'Thừa' : 'Thiếu'} {formatVND(Math.abs(a.diffVND))}
                  </span>
                  <span className="text-amber-400 text-[10px] ml-1.5">
                    ({a.current.toFixed(0)}% → {a.target.toFixed(0)}%)
                  </span>
                </div>
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
            const isFI = m.multiplier === 0;
            const phaseNum = parseInt(m.label);

            // Milestones theo kịch bản giai đoạn:
            // Phase 1: Dự phòng balance (xây quỹ dự phòng)
            // Phase 2: Total assets (đầu tư tăng trưởng)
            // Phase 3: Total assets (tích lũy)
            // Phase 4: FI
            // Cung nguong may do giai doan dung: giai doan 1 do quy du phong,
            // cac giai doan sau do tong tai san.
            const currentValue = phaseNum === 1
              ? (snap?.savings.reserveBalance || 0)
              : totalAssets;

            const pct = m.target > 0 ? Math.min((currentValue / m.target) * 100, 100) : 0;
            const reached = m.target > 0 && currentValue >= m.target;

            return (
              <div key={m.name || i} className={`p-3 rounded-xl border ${reached ? 'bg-emerald-50 border-emerald-200' : 'border-slate-200'}`}>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-3">
                    <span className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold ${reached ? 'bg-emerald-500 text-oncolor' : 'bg-slate-100 text-slate-500'}`}>
                      {reached ? <CheckCircle size={16} weight="fill" /> : m.label}
                    </span>
                    <div>
                      <p className="text-sm font-semibold text-slate-800">{m.name}</p>
                      <p className="text-xs text-slate-400">{m.desc}</p>
                      {m.multiplier > 0 && <p className="text-[10px] text-slate-400">= {m.multiplier}× chi tiêu mục tiêu</p>}
                    </div>
                  </div>
                  {!isFI && (
                    <div className="text-right">
                      <p className="text-sm font-bold text-slate-800">{pct.toFixed(1)}%</p>
                      <p className="text-[10px] text-slate-400">{formatVND(currentValue)} / {formatVND(m.target)}</p>
                      {!reached && avgMonthlySavings > 0 && (() => {
                        const gap = m.target - currentValue;
                        // Phase 1: only allocation ratio goes to Dự Phòng
                        // Phase 2+: all savings contribute to total assets
                        const duPhongRatio = phaseAllocs.find(a => a.category_name === 'Dự Phòng')?.ratio || 0.7;
                        const monthlyRate = phaseNum === 1 ? avgMonthlySavings * duPhongRatio : avgMonthlySavings;
                        const months = monthlyRate > 0 ? Math.ceil(gap / monthlyRate) : 999;
                        return <p className="text-[10px] text-blue-600">Đạt trong ~{months} tháng</p>;
                      })()}
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
                      style={{ width: `${pct}%`, background: reached ? '#0F5D4A' : '#3A6B8A' }}
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
            <p className={`text-xs ${assetCount >= 3 ? 'text-emerald-600' : 'text-amber-600'}`}>
              {assetCount >= 3 ? 'Đa dạng tốt' : 'Cần đa dạng thêm'}
            </p>
          </div>
          <div className="p-4 bg-slate-50 rounded-xl text-center">
            <p className="text-xs text-slate-400 mb-1">Số danh mục</p>
            <p className="text-2xl font-bold text-slate-800">{categoryCount}</p>
            <p className={`text-xs ${categoryCount >= 3 ? 'text-emerald-600' : 'text-amber-600'}`}>
              {categoryCount >= 3 ? 'Phân bổ tốt' : 'Nên mở rộng'}
            </p>
          </div>
          <div className="p-4 bg-slate-50 rounded-xl text-center">
            <p className="text-xs text-slate-400 mb-1">Tập trung cao nhất</p>
            <p className={`text-2xl font-bold ${concentrationRisk > 60 ? 'text-red-600' : concentrationRisk > 40 ? 'text-amber-600' : 'text-emerald-600'}`}>
              {concentrationRisk.toFixed(0)}%
            </p>
            <p className={`text-xs ${concentrationRisk > 60 ? 'text-red-600' : 'text-slate-400'}`}>
              {concentrationRisk > 60 ? 'Quá tập trung!' : concentrationRisk > 40 ? 'Hơi tập trung' : 'Cân bằng tốt'}
            </p>
          </div>
        </div>

        {/* Asset breakdown */}
        {portfolio.length > 0 && (
          <div className="mt-4 space-y-2">
            <p className="text-xs text-slate-400 font-semibold">Top {Math.min(portfolio.length, 5)} tài sản tập trung:</p>
            {portfolio.slice(0, 5).map((p, i) => {
              const pct = totalCurrentValue > 0 ? (p.current_value / totalCurrentValue) * 100 : 0;
              return (
                <div key={p.asset_type_id} className="flex items-center gap-3">
                  <span className="text-xs text-slate-400 w-4 text-right">{i + 1}</span>
                  <span className="text-sm w-28 truncate text-slate-700">{p.name}</span>
                  <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${pct}%`,
                        background: pct > 40 ? '#A93E27' : pct > 25 ? '#B06D22' : '#0F5D4A',
                      }}
                    />
                  </div>
                  <span className="text-xs font-medium text-slate-600 w-16 text-right">{formatVND(p.current_value)}</span>
                  <span className="text-xs text-slate-400 w-10 text-right">{pct.toFixed(0)}%</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
