import { useState, useEffect, useMemo } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ComposedChart, Line, Area, ReferenceLine, Legend } from 'recharts';
import { formatVND, formatCompact } from '../utils/formatters';
import { apiClient } from '../utils/apiClient';
import MonthlyEntry from './MonthlyEntry';
import { Tabs, EmptyState } from './ui/index.jsx';
import { TrendUp, TrendDown, Minus } from '../utils/iconMap';
import MasterLedger from './MasterLedger';
import CashLedger from './CashLedger';
import CustomTooltip from '../utils/CustomTooltip';
import { toneClass } from './ui/index.jsx';

export default function CashFlowPage() {
  // `?ghi=1` nghĩa là người dùng bấm vào một lối vào NHẬP LIỆU. Bấm "Xem đầy đủ"
  // dưới biểu đồ thì không có tham số này — đến để xem thì đừng bung form ra
  // che mất thứ họ muốn xem.
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const wantsEntry = searchParams.get('ghi') === '1';

  // `null` nghĩa là chưa quyết — để hiệu ứng bên dưới quyết theo dữ liệu, còn
  // khi người dùng đã bấm thì nghe người dùng.
  const [showWizard, setShowWizard] = useState(wantsEntry ? true : null);
  const [filled, setFilled] = useState([]);
  const [totalMonths, setTotalMonths] = useState(120);
  const tabFromUrl = searchParams.get('tab');
  const [activeSection, setActiveSection] = useState(
    ['charts', 'ledger', 'cash'].includes(tabFromUrl) ? tabFromUrl : 'charts'
  );
  const [phase, setPhase] = useState(null);
  const [phaseAllocs, setPhaseAllocs] = useState([]);
  const [realInvested, setRealInvested] = useState(0);
  const [snap, setSnap] = useState(null);
  const [nextMonth, setNextMonth] = useState(null);

  useEffect(() => { loadData(); }, []);

  // Chỉ mở sẵn khi CHƯA ghi tháng nào — lúc đó biểu đồ rỗng, chẳng có gì để xem.
  // Trước đây điều kiện là `|| !!nextMonth`, mà tháng kế tiếp thì lúc nào cũng
  // có, nên form bung ra ở mọi lần vào trang.
  useEffect(() => {
    if (showWizard !== null) return;
    if (!snap) return;
    setShowWizard(filled.length === 0);
  }, [snap, filled.length, showWizard]);

  async function loadData() {
    try {
      const [sn, f, nm] = await Promise.all([
        apiClient.snapshot.get(),
        apiClient.monthly.filled(),
        apiClient.monthly.next().catch(() => null),
      ]);
      setNextMonth(nm);
      setSnap(sn);
      setFilled(f);
      setPhase(sn.phase);
      setRealInvested(sn.portfolio.invested || 0);
      setTotalMonths(sn.params.TOTAL_MONTHS || 120);
      setPhaseAllocs(sn.phaseAllocations?.[sn.phase?.sortOrder] || []);
    } catch (err) {
      console.error('CashFlowPage load error:', err);
    }
  }

  // Mức để dành đặt làm mục tiêu, tính trên toàn bộ tiền kiếm được (gồm thưởng).
  const savingsTargetPct = 30;

  // Cash flow data per month
  const cashFlowData = useMemo(() => {
    return filled.map(m => {
      const income = m.income || 0;
      const bonus = m.bonus || 0;
      const expense = m.expense || 0;
      const totalIncome = income + bonus;
      const net = totalIncome - expense; // raw net, can be negative
      return {
        month: m.month_label,
        income,
        bonus,
        totalIncome,
        expense,
        net,
        savingsRate: totalIncome > 0 ? ((net / totalIncome) * 100) : 0,
        target: savingsTargetPct,
      };
    });
  }, [filled]);

  // UseMemo for all KPIs to prevent recalculation on re-renders
  const { 
    totalIncome, totalExpense, totalNet, avgSavingsRate, avgMonthly, 
    totalInvested, avgInvestRate, investTargetPct, streak, bestMonth, worstMonth 
  } = useMemo(() => {
    const inc = filled.reduce((s, m) => s + (m.income || 0) + (m.bonus || 0), 0);
    const exp = filled.reduce((s, m) => s + (m.expense || 0), 0);
    const net = cashFlowData.reduce((s, d) => s + d.net, 0);
    const avgSav = inc > 0 ? (net / inc) * 100 : 0;
    const avgMon = filled.length > 0 ? net / filled.length : 0;
    
    // Tỷ lệ đầu tư mục tiêu từ phase allocations (loại trừ Dự phòng & Tiết kiệm)
    const iRatio = phaseAllocs
      .filter(pa => {
        const name = pa.category_name?.toLowerCase() || '';
        return !name.includes('dự phòng') && !name.includes('tiết kiệm');
      })
      .reduce((s, pa) => s + (pa.ratio || 0), 0);
    const invTarget = Math.round(iRatio * 100);

    // Mục tiêu là tỷ lệ trên TIỀN NHÀN RỖI, nên tỷ lệ thực tế cũng phải chia
    // cho tiền nhàn rỗi. Chia cho thu nhập thì hai con số không so được với nhau.
    const tInvested = realInvested;
    const idle = snap?.cashflow.totalInflow || 0;
    const avgInv = idle > 0 ? (tInvested / idle) * 100 : 0;

    let str = 0;
    for (let i = cashFlowData.length - 1; i >= 0; i--) {
      if (cashFlowData[i].net > 0) str++;
      else break;
    }
    const sorted = [...cashFlowData].sort((a, b) => b.net - a.net);

    return {
      totalIncome: inc, totalExpense: exp, totalNet: net, avgSavingsRate: avgSav, avgMonthly: avgMon,
      totalInvested: tInvested, avgInvestRate: avgInv, investTargetPct: invTarget,
      streak: str, bestMonth: sorted[0] || null, worstMonth: sorted[sorted.length - 1] || null
    };
  }, [filled, cashFlowData, phaseAllocs, realInvested, snap]);

  // Empty state
  if (filled.length === 0) {
    return (
      <div className="space-y-6 animate-fade-in">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="page-title">Dòng tiền</h1>
            <p className="page-subtitle">Chưa có dữ liệu dòng tiền</p>
          </div>
          <button type="button" onClick={() => setShowWizard(true)} className="btn-primary">
            Nhập liệu tháng đầu tiên
          </button>
        </div>

        {showWizard && (
          <div className="card border-primary-200">
            <MonthlyEntry
              onSaved={loadData}
              onComplete={() => { setShowWizard(false); loadData(); }}
            />
          </div>
        )}

        {!showWizard && (
          <div className="card">
            <EmptyState
              title="Bắt đầu theo dõi dòng tiền"
              message="Ghi thu nhập và chi tiêu mỗi tháng để biết bạn để dành được bao nhiêu, và bao giờ chạm mốc."
              action={
                <button type="button" onClick={() => setShowWizard(true)} className="btn-primary">
                  Nhập liệu tháng đầu tiên
                </button>
              }
            />
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title">Dòng tiền</h1>
          <p className="page-subtitle">
            {filled.length} tháng đã ghi nhận · Để dành trung bình {formatVND(avgMonthly)}/tháng
          </p>
        </div>
        <button type="button" onClick={() => setShowWizard(!showWizard)} className="btn-primary">
          {showWizard ? 'Thu gọn' : nextMonth ? `Ghi ${nextMonth.month_label}` : 'Ghi tháng mới'}
        </button>
      </div>

      {/* Monthly Entry Wizard (collapsible) */}
      {showWizard && (
        <div className="card border-primary-200" data-testid="wizard">
          <MonthlyEntry onSaved={loadData} onComplete={() => { setShowWizard(false); loadData(); }} />
        </div>
      )}

      {/* Section Toggle */}
      <Tabs
        tabs={[
          { id: 'charts', label: 'Biểu đồ' },
          { id: 'ledger', label: 'Sổ cái' },
          { id: 'cash', label: 'Tiền mặt' },
        ]}
        value={activeSection}
        onChange={(id) => {
          setActiveSection(id);
          setSearchParams(id === 'charts' ? {} : { tab: id }, { replace: true });
        }}
      />

      {activeSection !== 'cash' && (
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="kpi">
          <span className="kpi-label">Tổng thu nhập</span>
          <p className="kpi-value text-emerald-600">{formatVND(totalIncome)}</p>
          {(() => {
            const totalBonus = filled.reduce((s, m) => s + (m.bonus || 0), 0);
            return totalBonus > 0
              ? <p className="text-xs text-emerald-600 font-medium">+{formatVND(totalBonus)} thưởng</p>
              : <p className="text-xs text-slate-400">{filled.length} tháng</p>;
          })()}
        </div>
        <div className="kpi">
          <span className="kpi-label">Tổng chi tiêu</span>
          <p className="kpi-value text-red-600">{formatVND(totalExpense)}</p>
          {filled.length > 1 && (
            <p className="text-xs text-slate-500">Trung bình {formatVND(totalExpense / filled.length)}/tháng</p>
          )}
        </div>
        <div className="kpi">
          <span className="kpi-label">Tỷ lệ để dành</span>
          <p className={`kpi-value ${avgSavingsRate >= 30 ? 'text-emerald-600' : avgSavingsRate >= 20 ? 'text-amber-600' : 'text-red-600'}`}>
            {avgSavingsRate.toFixed(1)}%
          </p>
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className={`text-fs-3 px-1.5 py-0.5 rounded-full font-medium ${avgSavingsRate >= savingsTargetPct ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'}`}>
              Mục tiêu ≥ {savingsTargetPct}%
            </span>
            {streak >= 3 ? (
              <span className="text-fs-3 px-1.5 py-0.5 rounded-full font-medium bg-amber-100 text-amber-700">
                {streak} tháng liền dư tiền
              </span>
            ) : streak > 0 ? (
              <span className="text-fs-3 px-1.5 py-0.5 rounded-full font-medium bg-emerald-50 text-emerald-600">
                {streak} tháng liền dư tiền
              </span>
            ) : null}
          </div>
        </div>
        <div className="kpi">
          <span className="kpi-label">Tỷ lệ đầu tư</span>
          <p className={`kpi-value ${investTargetPct > 0 && avgInvestRate >= investTargetPct * 0.9 ? 'text-blue-600' : 'text-amber-600'}`}>
            {avgInvestRate > 0 ? `${avgInvestRate.toFixed(1)}%` : '—'}
          </p>
          <div className="flex items-center gap-1.5 flex-wrap">
            {investTargetPct > 0 && (
              <span className={`text-fs-3 px-1.5 py-0.5 rounded-full font-medium ${
                avgInvestRate >= investTargetPct * 0.9 ? 'bg-blue-50 text-blue-600' : 'bg-amber-50 text-amber-600'
              }`}>
                Mục tiêu {investTargetPct}% của giai đoạn này
              </span>
            )}
            {totalInvested > 0 && (
              <p className="text-fs-2 text-slate-400 w-full">= {formatVND(totalInvested)} đã đầu tư</p>
            )}
          </div>
        </div>
      </div>
      )}

      {/* Charts Section */}
      {activeSection === 'charts' && (
        <div className="space-y-6">
          {/* Cash Flow Chart */}
          <div className="card">
            <h3 className="text-fs-4 font-semibold text-slate-700 mb-1">Dòng tiền theo tháng</h3>
            <p className="text-fs-2 text-slate-400 mb-3">
              Cột trái là tiền vào, cột phải là tiền ra. Phần chênh lệch là tiền bạn giữ lại được.
            </p>
            <ResponsiveContainer width="100%" height={300}>
              {/* Cùng cách đọc với biểu đồ ở Tổng quan: lương và thưởng chồng
                  thành MỘT cột tiền vào, cạnh cột chi tiêu. Tháng nào thưởng lớn
                  hơn lương thì nhìn cột là thấy. */}
              <BarChart data={cashFlowData} margin={{ top: 5, right: 10, bottom: 5, left: 0 }} barGap={4}>
                <CartesianGrid stroke="rgb(var(--c-slate-200))" vertical={false} />
                <XAxis
                  dataKey="month"
                  tickLine={false}
                  axisLine={{ stroke: 'rgb(var(--c-slate-200))' }}
                  tick={{ fill: 'rgb(var(--c-slate-400))', fontSize: 11 }}
                  tickMargin={10}
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  tick={{ fill: 'rgb(var(--c-slate-400))', fontSize: 11 }}
                  tickFormatter={formatCompact}
                  width={60}
                />
                <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgb(var(--c-slate-100))' }} />
                {/* Recharts tô chữ chú giải theo màu cột; ép về màu chữ thường
                    để "Thưởng" trên nền nhạt vẫn đọc được. */}
                <Legend
                  iconType="square"
                  iconSize={9}
                  wrapperStyle={{ fontSize: 'var(--fs-2)', paddingTop: 6 }}
                  formatter={(v) => <span style={{ color: 'rgb(var(--c-slate-500))' }}>{v}</span>}
                />
                <Bar dataKey="income" stackId="thu" name="Lương" fill="rgb(var(--c-emerald-600))" />
                <Bar dataKey="bonus" stackId="thu" name="Thưởng" fill="rgb(var(--c-emerald-400))" radius={[3, 3, 0, 0]} />
                <Bar dataKey="expense" name="Chi tiêu" fill="rgb(var(--c-amber-600))" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Savings Rate Chart */}
          <div className="card">
            <h3 className="text-fs-4 font-semibold text-slate-700 mb-1">Tỷ lệ để dành theo tháng</h3>
            <p className="text-fs-2 text-slate-400 mb-3">
              Mỗi tháng bạn giữ lại được bao nhiêu phần trăm số tiền kiếm được.
              Đường đứt nét là mức {savingsTargetPct}% đang đặt làm mục tiêu.
            </p>
            <ResponsiveContainer width="100%" height={200}>
              <ComposedChart data={cashFlowData} margin={{ top: 10, right: 10, bottom: 5, left: 0 }}>
                <defs>
                  <linearGradient id="colorSavings" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="rgb(var(--c-emerald-600))" stopOpacity={0.18} />
                    <stop offset="95%" stopColor="rgb(var(--c-emerald-600))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="rgb(var(--c-slate-200))" vertical={false} />
                <XAxis dataKey="month" tickLine={false} axisLine={{ stroke: 'rgb(var(--c-slate-200))' }} tick={{ fill: 'rgb(var(--c-slate-400))', fontSize: 11 }} tickMargin={10} />
                <YAxis tickLine={false} axisLine={false} tick={{ fill: 'rgb(var(--c-slate-400))', fontSize: 11 }} tickFormatter={v => `${v}%`} width={40} domain={[dataMin => Math.min(0, dataMin), 100]} />
                <Tooltip formatter={(v, name) => [`${typeof v === 'number' ? v.toFixed(1) : v}%`, name]} contentStyle={{ borderRadius: 'var(--r-card)', border: '1px solid rgb(var(--c-slate-200))', background: 'rgb(var(--c-surface))' }} />
                <Legend
                  iconType="plainline"
                  iconSize={14}
                  wrapperStyle={{ fontSize: 'var(--fs-2)', paddingTop: 6 }}
                  formatter={(v) => <span style={{ color: 'rgb(var(--c-slate-500))' }}>{v}</span>}
                />
                <Line type="monotone" dataKey="target" stroke="rgb(var(--c-slate-400))" strokeWidth={2} strokeDasharray="5 5" dot={cashFlowData.length === 1 ? { r: 4, fill: 'rgb(var(--c-slate-400))', stroke: 'none' } : false} activeDot={false} name="Mục tiêu" />
                <Area type="monotone" dataKey="savingsRate" fill="url(#colorSavings)" stroke="rgb(var(--c-emerald-600))" strokeWidth={2.5} dot={cashFlowData.length === 1 ? { r: 4, fill: 'rgb(var(--c-emerald-600))', stroke: 'none' } : false} activeDot={{ r: 4, fill: 'rgb(var(--c-emerald-600))', stroke: 'none' }} name="Thực tế" isAnimationActive={true} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          {/* Bottom row */}
          <div className="grid grid-cols-2 gap-4">
            <div className="card">
              <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-4">Dự báo tích lũy</h3>
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-slate-500">Đã để dành</span>
                  <span className="text-sm font-bold text-slate-800">{formatVND(totalNet)}</span>
                </div>
                {phase?.goalAmount > 0 && (() => {
                  // Cột mốc giai đoạn là mốc TÀI SẢN, nên tiến độ đo bằng tài
                  // sản. Dòng tiền chỉ dùng để ước lượng còn bao nhiêu tháng.
                  const goal = phase.goalAmount;
                  const have = phase.current;
                  const reached = have >= goal;
                  const pct = Math.min((have / goal) * 100, 100);
                  const gap = Math.max(0, goal - have);
                  const monthsToGoal = avgMonthly > 0 ? Math.ceil(gap / avgMonthly) : null;
                  return (
                    <div className="p-3 bg-primary-50 border border-primary-100 rounded-xl">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-medium text-primary-700">{phase.name}</span>
                        <span className="text-xs font-bold text-primary-600">{pct.toFixed(0)}%</span>
                      </div>
                      <div className="h-2 bg-primary-100 rounded-full overflow-hidden mb-2">
                        <div className="h-full bg-primary-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
                      </div>
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="text-primary-600">{formatVND(have)} / {formatVND(goal)}</span>
                        {!reached && monthsToGoal && (
                          <span className="text-primary-600">còn {formatVND(gap)} · ~{monthsToGoal} tháng</span>
                        )}
                        {reached && <span className="text-emerald-600 font-medium">Đã đạt</span>}
                      </div>
                    </div>
                  );
                })()}
                <div className="flex justify-between items-center">
                  <span className="text-sm text-slate-500">Còn lại {Math.max(0, totalMonths - filled.length)} tháng</span>
                  <span className="text-sm font-bold text-primary-600">+{formatVND(avgMonthly * Math.max(0, totalMonths - filled.length))}</span>
                </div>
                <div className="border-t border-slate-100 pt-2 flex justify-between items-center">
                  <span className="text-sm font-semibold text-slate-700">Tổng dự kiến</span>
                  <span className="text-lg font-bold text-primary-700">{formatVND(totalNet + avgMonthly * Math.max(0, totalMonths - filled.length))}</span>
                </div>
                {/* Nói thẳng con số này được cộng ra thế nào. Nó cộng phẳng, KHÔNG
                    có lãi — trong khi Lộ trình chạy lãi kép đầy đủ. Hai trang cho
                    hai con số khác nhau mà không chỗ nào nói ra là chuyện cũ. */}
                <p className="text-fs-2 text-slate-400">
                  Cộng thẳng {formatVND(avgMonthly)}/tháng cho {Math.max(0, totalMonths - filled.length)} tháng
                  còn lại, chưa tính lãi.{' '}
                  <button
                    type="button"
                    onClick={() => navigate('/scenarios')}
                    className="text-primary-700 hover:underline"
                  >
                    Lộ trình tính cả lãi kép ›
                  </button>
                </p>
                {filled.length >= 3 && (
                  <div className="mt-2 pt-2 border-t border-slate-100">
                    {(() => {
                      const recent3 = cashFlowData.slice(-3);
                      const recentAvg = recent3.reduce((s, d) => s + d.net, 0) / 3;
                      const diff = recentAvg - avgMonthly;
                      const TrendIcon = diff > 0 ? TrendUp : diff < 0 ? TrendDown : Minus;
                      return (
                        <div className="flex items-start gap-2">
                          <TrendIcon size={16} className={`${toneClass(diff)} mt-0.5 shrink-0`} weight="bold" />
                          <div className="min-w-0">
                            <p className="text-fs-3 text-slate-700">
                              Ba tháng gần nhất để dành{' '}
                              <strong className="tabular">{formatVND(recentAvg)}</strong>/tháng
                            </p>
                            {/* Chữ "trung bình" từng xuất hiện hai lần trên thẻ này với
                                hai nghĩa, và câu so sánh không nói so với cái nào. */}
                            {diff !== 0 && (
                              <p className="text-fs-2 text-slate-500">
                                {diff > 0 ? 'Cao hơn' : 'Thấp hơn'} mức{' '}
                                <span className="tabular">{formatVND(avgMonthly)}</span> mà dự kiến ở trên đang dùng,{' '}
                                <span className="tabular">{formatVND(Math.abs(diff))}</span> mỗi tháng
                              </p>
                            )}
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                )}
              </div>
            </div>
            <div className="card">
              <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-4">Cao nhất</h3>
              <div className="space-y-3">
                {bestMonth && (
                  <div className="p-3 bg-emerald-50 rounded-xl">
                    <p className="text-xs text-emerald-600 mb-1">Tháng để dành được nhiều nhất</p>
                    <p className="text-sm font-bold text-emerald-700">{bestMonth.month}: {formatVND(bestMonth.net)}</p>
                  </div>
                )}
                {worstMonth && (
                  <div className="p-3 bg-red-50 rounded-xl">
                    <p className="text-xs text-red-600 mb-1">Tháng để dành được ít nhất</p>
                    <p className="text-sm font-bold text-red-700">{worstMonth.month}: {formatVND(worstMonth.net)}</p>
                  </div>
                )}
                <div className="p-3 bg-blue-50 rounded-xl">
                  <p className="text-xs text-blue-600 mb-1">Số tháng liền nhau còn dư tiền</p>
                  <p className="text-sm font-bold text-blue-700">{streak} tháng</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Ledger Section */}
      {activeSection === 'ledger' && (
        <MasterLedger />
      )}

      {activeSection === 'cash' && (
        <CashLedger snap={snap} onChanged={loadData} />
      )}
    </div>
  );
}
