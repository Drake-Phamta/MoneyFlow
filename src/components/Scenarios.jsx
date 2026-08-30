import { useState, useEffect, useMemo } from 'react';
import { formatVND, formatCompact as formatVNDShort } from '../utils/formatters';
import { apiClient } from '../utils/apiClient';
import AppIcon, { Check, CaretDown } from '../utils/iconMap';

import { PHASE_CHECKLISTS } from '../content/checklists.js';
import { knowledgeSections } from '../content/knowledge.js';
import { buildPhaseGuidance } from '../content/phases.js';

export default function Scenarios() {
  const [filled, setFilled] = useState([]);
  const [phase, setPhase] = useState(null);
  const [phases, setPhases] = useState([]);
  const [totalMonths, setTotalMonths] = useState(120);
  const [avgExpense, setAvgExpense] = useState(4000000);
  const [expectedExpense, setExpectedExpense] = useState(4000000);
  const [expectedInflow, setExpectedInflow] = useState(3700000);
  const [useExpectedInflow, setUseExpectedInflow] = useState(false);
  const [expandedPhase, setExpandedPhase] = useState(null);
  const [expandedKnowledge, setExpandedKnowledge] = useState(null);
  const [snap, setSnap] = useState(null);

  // Auto-verified checklist from DB
  const [checklistStatus, setChecklistStatus] = useState({});

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      const [sn, f, allPhases] = await Promise.all([
        apiClient.snapshot.get(),
        apiClient.monthly.filled(),
        apiClient.phases.get(),
      ]);
      setSnap(sn);
      setFilled(f);
      setPhases(allPhases);
      setChecklistStatus(sn.checklist || {});

      const active = allPhases.find((p) => p.id === sn.phase?.id) || null;
      setPhase(active);
      if (active) setExpandedPhase(active.sort_order);

      setAvgExpense(sn.cashflow.expenseMean || 0);
      setExpectedExpense(sn.params.FI_MONTHLY_EXPENSE || 4000000);
      setExpectedInflow(sn.params.DEFAULT_INFLOW || 3700000);
      setTotalMonths(sn.params.TOTAL_MONTHS || 120);
    } catch (err) {
      console.error('Scenarios load error:', err);
    }
  }

  const totalInflow = filled.reduce((s, m) => s + (m.total_inflow || 0), 0);
  const avgInflow = filled.length > 0 ? totalInflow / filled.length : 0;
  const knowledge = useMemo(
    () =>
      knowledgeSections({
        targetExpense: snap?.params.FI_MONTHLY_EXPENSE,
        inflation: snap?.params.INFLATION_RATE,
        stockReturn: snap?.params.EXPECTED_RETURN_STOCK,
        savingsRate: snap?.savings.weightedRate ? snap.savings.weightedRate / 100 : undefined,
      }),
    [snap]
  );

  const byCategory = snap?.portfolio.byCategory || {};
  const totalCurrentValue = snap?.netWorth.total || 0;

  // Quy tắc 4%: cần 25 năm chi tiêu để sống bằng lợi suất.
  const fiNumber = expectedExpense * 12 / 0.04;
  const fiRatio = fiNumber > 0 ? (totalCurrentValue / fiNumber) * 100 : 0;

  // Projection scenarios using Real Return (Lợi suất thực = Lợi suất - Lạm phát)
  // Giữ nguyên mốc mục tiêu (fiNumber) theo giá trị tiền hiện tại để người dùng dễ hiểu
  function calcScenario(monthlyContrib, annualReturn) {
    let balance = totalCurrentValue;
    const realReturn = annualReturn - 0.035; // Lạm phát 3.5%
    const monthlyReturn = realReturn / 12;
    let monthsToFI = 0;
    const targetFI = expectedExpense * 12 / 0.04;

    for (let m = 0; m < 600; m++) {
      balance = balance * (1 + monthlyReturn) + monthlyContrib;
      monthsToFI = m + 1;
      if (balance >= targetFI) break;
    }
    return { monthsToFI, yearsToFI: (monthsToFI / 12).toFixed(1), finalBalance: balance };
  }

  const baseInflow = useExpectedInflow ? expectedInflow : avgInflow;

  const scenarios = [
    { name: 'Thận trọng', monthly: baseInflow * 0.8, rate: 0.05, color: 'text-slate-600', bg: 'bg-slate-50' },
    { name: 'Cơ sở', monthly: baseInflow, rate: 0.07, color: 'text-primary-600', bg: 'bg-primary-50' },
    { name: 'Lạc quan', monthly: baseInflow * 1.2, rate: 0.10, color: 'text-emerald-600', bg: 'bg-emerald-50' },
  ].map(s => ({ ...s, ...calcScenario(s.monthly, s.rate) }));

  function getPhaseStatus(phaseSortOrder) {
    if (!phase) return 'locked';
    if (phase.sort_order > phaseSortOrder) return 'completed';
    if (phase.sort_order === phaseSortOrder) return 'active';
    return 'locked';
  }

  // Cùng ngưỡng mà máy dò giai đoạn dùng: giai đoạn 1 đo quỹ dự phòng,
  // các giai đoạn sau đo tổng tài sản; mốc = bội số × chi tiêu mục tiêu.
  function phaseGoal(p) {
    return (p.goal_multiplier || 0) * (snap?.params.FI_MONTHLY_EXPENSE || 0);
  }

  function getPhaseProgress(p) {
    const goal = phaseGoal(p);
    if (goal <= 0) return 100;
    const current = p.sort_order === 1 ? (snap?.savings.reserveBalance || 0) : totalCurrentValue;
    return Math.min(100, Math.max(0, (current / goal) * 100));
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* ===== Section 1: Journey Overview ===== */}
      <div>
        <h1 className="page-title">Phân tích & kịch bản</h1>
        <p className="page-subtitle">Lộ trình tài chính cá nhân hóa</p>
      </div>

      <div className="grid grid-cols-4 gap-4">
        <div className="kpi">
          <span className="kpi-label">Tiến độ hành trình</span>
          <p className="kpi-value">{filled.length}/{totalMonths}</p>
          <div className="mt-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
            <div className="h-full bg-primary-500 rounded-full" style={{ width: `${Math.min(100, (filled.length / totalMonths) * 100)}%` }} />
          </div>
        </div>
        <div className="kpi">
          <span className="kpi-label">Giai đoạn hiện tại</span>
          <p className="kpi-value text-violet-600 text-lg">{phase?.name?.split(':')[0] || '—'}</p>
          <p className="text-xs text-slate-400">{phase?.name?.split(':')[1]?.trim() || ''}</p>
        </div>
        <div className="kpi">
          <span className="kpi-label">Tỷ lệ Tự do Tài chính</span>
          <p className={`kpi-value ${fiRatio >= 100 ? 'text-emerald-600' : 'text-primary-600'}`}>
            {fiRatio.toFixed(1)}%
          </p>
          <p className="text-xs text-slate-400">Mục tiêu: {formatVNDShort(fiNumber)}</p>
        </div>
        <div className="kpi">
          <span className="kpi-label">Dòng tiền trung bình/tháng</span>
          <p className="kpi-value text-blue-600">{formatVND(avgInflow)}</p>
          <p className="text-xs text-slate-400">{filled.length} tháng ghi nhận</p>
        </div>
      </div>

      {/* ===== Section 2: Phase Roadmap ===== */}
      <div className="card">
        <h3 className="text-sm font-semibold text-slate-700 mb-4">Lộ trình giai đoạn</h3>
        <div className="space-y-3">
          {phases.map((p) => {
            const status = getPhaseStatus(p.sort_order);
            const isExpanded = expandedPhase === p.sort_order;
            const progress = getPhaseProgress(p);
            const checklist = PHASE_CHECKLISTS[p.sort_order] || [];
            const isDone = status === 'completed';
            const isActive = status === 'active';

            return (
              <div key={p.id} className={`rounded-xl border overflow-hidden ${isActive ? 'border-primary-300' : isDone ? 'border-emerald-200' : 'border-slate-200'}`}>
                <button
                  onClick={() => setExpandedPhase(isExpanded ? null : p.sort_order)}
                  className={`w-full flex items-center gap-3 p-4 text-left ${isActive ? 'bg-primary-50' : isDone ? 'bg-emerald-50' : 'bg-white'}`}
                >
                  <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${isDone ? 'bg-emerald-500 text-white' : isActive ? 'bg-primary-600 text-white' : 'bg-slate-200 text-slate-500'}`}>
                    {isDone ? <Check size={16} className="text-white" /> : p.sort_order}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-semibold ${isActive ? 'text-primary-700' : 'text-slate-700'}`}>{p.name}</p>
                    <p className="text-xs text-slate-500">{p.goal_description}</p>
                    {phaseGoal(p) > 0 && (
                      <div className="mt-1.5 h-1.5 bg-slate-200 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full ${isDone ? 'bg-emerald-500' : 'bg-primary-500'}`} style={{ width: `${progress}%` }} />
                      </div>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-bold text-slate-700">
                      {phaseGoal(p) > 0 ? formatVND(phaseGoal(p)) : 'Tự do'}
                    </p>
                    {phaseGoal(p) > 0 && (
                      <p className="text-[10px] text-slate-400">{progress.toFixed(0)}% đạt</p>
                    )}
                  </div>
                  <CaretDown size={16} className={`text-slate-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                </button>

                {isExpanded && (
                  <div className="px-4 pb-4 space-y-4">
                    <div className={`p-3 rounded-lg ${isActive ? 'bg-primary-100' : isDone ? 'bg-emerald-100' : 'bg-slate-100'}`}>
                      <p className="text-xs font-medium text-slate-600 mb-1">Điều kiện vào giai đoạn</p>
                      <p className={`text-sm font-semibold ${isActive ? 'text-primary-700' : isDone ? 'text-emerald-700' : 'text-slate-600'}`}>
                        {p.entry_condition}
                      </p>
                    </div>
                    {(() => {
                      // Các dòng phân bổ sinh thẳng từ phase_allocations, nên
                      // đổi tỷ lệ hoặc đổi tên danh mục là chữ đổi theo.
                      const g = buildPhaseGuidance(
                        { sortOrder: p.sort_order, name: p.name, goalMultiplier: p.goal_multiplier },
                        snap?.phaseAllocations?.[p.sort_order] || [],
                        {
                          targetExpense: snap?.params.FI_MONTHLY_EXPENSE,
                          goldUnitPrice: snap?.prices?.goldUnit,
                        }
                      );
                      if (!g) return null;
                      return (
                        <div className="p-3 bg-slate-50 rounded-lg space-y-3">
                          <p className="text-sm text-slate-600">{g.about}</p>

                          <div>
                            <p className="text-xs font-medium text-slate-500 mb-1.5">Tiền nhàn rỗi mỗi tháng chia thế nào</p>
                            <div className="space-y-1">
                              {g.allocation.map(a => (
                                <div key={a.name} className="flex items-baseline gap-2 text-sm">
                                  <span className="w-10 shrink-0 text-right font-semibold text-slate-700 tabular-nums">
                                    {Math.round(a.ratio * 100)}%
                                  </span>
                                  <span className="font-medium text-slate-700">{a.name}</span>
                                  <span className="text-slate-500">— {a.action}</span>
                                </div>
                              ))}
                            </div>
                          </div>

                          <div>
                            <p className="text-xs font-medium text-slate-500 mb-1.5">Việc cần làm</p>
                            <ol className="space-y-1 list-decimal list-inside text-sm text-slate-600">
                              {g.actions.map((x, i) => <li key={i}>{x}</li>)}
                            </ol>
                          </div>

                          <p className="text-sm font-medium text-slate-700">{g.exit}</p>

                          {g.principles.length > 0 && (
                            <ul className="space-y-0.5 text-sm text-slate-500">
                              {g.principles.map((x, i) => <li key={i}>• {x}</li>)}
                            </ul>
                          )}
                        </div>
                      );
                    })()}
                    {checklist.length > 0 && (
                      <div>
                        <p className="text-xs font-medium text-slate-600 mb-2">App tự kiểm, không cần bạn tick:</p>
                        <div className="space-y-1.5">
                          {checklist.map(item => {
                            // Chỉ tick khi dữ liệu thật sự xác nhận. Trước đây
                            // `isDone ||` khiến mọi mục của giai đoạn đã qua đều
                            // bị gạch xanh — kể cả việc người dùng chưa từng làm —
                            // vì điều kiện qua giai đoạn chỉ là ngưỡng tài sản.
                            const itemChecked = !!(checklistStatus[p.sort_order]?.[item.id]);
                            return (
                              <div key={item.id}
                                className={`flex items-baseline gap-2 text-sm w-full text-left py-0.5 ${itemChecked ? '' : 'opacity-80'}`}>
                                <div className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${itemChecked ? 'border-emerald-400 bg-emerald-50' : 'border-slate-300'}`}>
                                  {itemChecked && <span className="text-emerald-500 text-[10px]">✓</span>}
                                </div>
                                <span className={itemChecked ? 'text-emerald-700 line-through opacity-60' : 'text-slate-700'}>{item.label}</span>
                                {!itemChecked && item.check && (
                                  <span className="text-xs text-slate-400">— {item.check}</span>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ===== Section 3: Portfolio Breakdown ===== */}
      {Object.keys(byCategory).length > 0 && (
        <div className="card">
          <h3 className="text-sm font-semibold text-slate-700 mb-4">Phân bổ danh mục hiện tại</h3>
          <div className="grid grid-cols-2 gap-3">
            {Object.entries(byCategory).map(([cat, data]) => {
              const gain = data.marketValue - data.invested;
              const gainPct = data.invested > 0 ? (gain / data.invested) * 100 : 0;
              return (
                <div key={cat} className="p-3 bg-slate-50 rounded-lg">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium text-slate-700">{cat}</span>
                    <span className="text-sm font-bold text-slate-800">{formatVND(data.marketValue)}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs text-slate-400">
                    <span>Vốn: {formatVND(data.invested)}</span>
                    <span className={gain >= 0 ? 'text-emerald-500' : 'text-red-400'}>
                      {gain >= 0 ? '+' : ''}{gainPct.toFixed(1)}%
                    </span>
                  </div>
                  {data.items.map(item => (
                    <div key={item.asset_type_id} className="flex items-center justify-between text-xs text-slate-500 py-0.5 mt-1">
                      <span className="flex items-center gap-1"><AppIcon emoji={item.icon} size={14} /> {item.ticker || item.name}</span>
                      <span>{formatVND(item.current_value)}</span>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ===== Section 5: Projection Scenarios ===== */}
      <div className="card">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold text-slate-700">Kịch bản tự do tài chính</h3>
          <div className="flex bg-slate-100 p-0.5 rounded-lg">
            <button
              onClick={() => setUseExpectedInflow(false)}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${!useExpectedInflow ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              Theo thực tế
            </button>
            <button
              onClick={() => setUseExpectedInflow(true)}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${useExpectedInflow ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              Theo kỳ vọng
            </button>
          </div>
        </div>
        <p className="text-xs text-slate-400 mb-4">Dự báo dựa trên lãi kép, lạm phát 3.5%/năm, quy tắc 4% và chi tiêu mục tiêu {formatVND(expectedExpense)}/tháng</p>

        <div className="grid grid-cols-3 gap-4">
          {scenarios.map(s => (
            <div key={s.name} className={`p-4 rounded-xl ${s.bg}`}>
              <p className={`text-sm font-semibold ${s.color} mb-2`}>{s.name}</p>
              <div className="space-y-2">
                <div>
                  <p className="text-[10px] text-slate-400 uppercase">Dòng tiền/tháng</p>
                  <p className="text-sm font-bold text-slate-800">{formatVND(s.monthly)}</p>
                </div>
                <div>
                  <p className="text-[10px] text-slate-400 uppercase">Lợi suất</p>
                  <p className="text-sm font-bold text-slate-800">{(s.rate * 100).toFixed(0)}%/năm</p>
                </div>
                <div className="pt-2 border-t border-slate-200">
                  <p className="text-[10px] text-slate-400 uppercase">Thời gian đạt FI</p>
                  <p className={`text-lg font-bold ${s.color}`}>
                    {s.monthsToFI < 600 ? s.yearsToFI + ' năm' : '> 50 năm'}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] text-slate-400 uppercase">Tổng tài sản cuối</p>
                  <p className="text-sm font-semibold text-slate-700">{formatVNDShort(s.finalBalance)}</p>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-4 p-3 bg-slate-50 rounded-lg">
          <p className="text-xs text-slate-500">
            <strong>Lưu ý:</strong> Các kịch bản chỉ mang tính tham khảo. Kết quả thực tế phụ thuộc vào biến động thị trường,
            thay đổi thu nhập, và lạm phát. Hãy review lại mỗi 6 tháng.
          </p>
        </div>
      </div>

      {/* ===== Section 6: Financial Knowledge Base ===== */}
      <div className="card">
        <h3 className="text-sm font-semibold text-slate-700 mb-4">Kiến thức tài chính</h3>
        <p className="text-xs text-slate-400 mb-4">Nắm vững các nguyên tắc cốt lõi để đạt mục tiêu dài hạn</p>
        <div className="space-y-2">
          {knowledge.map(section => {
            const isOpen = expandedKnowledge === section.id;
            return (
              <div key={section.id} className="border border-slate-200 rounded-xl overflow-hidden">
                <button
                  onClick={() => setExpandedKnowledge(isOpen ? null : section.id)}
                  className="w-full flex items-center gap-3 p-3 text-left hover:bg-slate-50"
                >
                  <span className="text-lg"><AppIcon emoji={section.icon} size={20} /></span>
                  <span className="flex-1 text-sm font-medium text-slate-700">{section.title}</span>
                  <CaretDown size={16} className={`text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                </button>
                {isOpen && (
                  <div className="px-4 pb-4">
                    <div className="text-sm text-slate-700 whitespace-pre-line leading-relaxed bg-slate-50 p-4 rounded-lg">
                      {section.content}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
