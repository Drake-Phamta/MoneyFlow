import { useState, useEffect, useMemo } from 'react';
import { formatVND } from '../utils/formatters';
import { apiClient } from '../utils/apiClient';
import AppIcon from '../utils/iconMap';

const CATEGORY_LABELS = {
  'Chứng Khoán': 'Đầu tư',
};

// Phase checklists — concrete actionable items per phase
const PHASE_CHECKLISTS = {
  1: [
    { id: 'savings_acc', label: 'Mở tài khoản tiết kiệm online' },
    { id: 'broker_acc', label: 'Mở tài khoản chứng khoán (SSI, VPS, TCBS)' },
    { id: 'emergency_3x', label: 'Dự phòng ≥ 3× chi tiêu mục tiêu' },
    { id: 'first_etf', label: 'Bắt đầu mua ETF/cổ phiếu đầu tiên' },
    { id: 'track_money', label: 'Ghi chép mọi khoản vào Money_Flow' },
  ],
  2: [
    { id: 'emergency_done', label: 'Dự phòng đã đạt mục tiêu' },
    { id: 'diversify_stocks', label: 'Đa dạng hóa danh mục chứng khoán' },
    { id: 'gold_fund', label: 'Tích lũy quỹ vàng (mua 1 lượng SJC khi đủ)' },
    { id: 'sniper_ammo', label: 'Xây dựng vốn Bắn Tỉa' },
    { id: 'start_tktp', label: 'Bắt đầu tiết kiệm kỳ hạn / trái phiếu' },
  ],
  3: [
    { id: 'gold_1luong', label: 'Sở hữu ≥ 1 lượng vàng SJC' },
    { id: 'dividend_stocks', label: 'Chuyển trọng tâm sang cổ phiếu dividend' },
    { id: 'tktp_1so', label: 'Có ≥ 1 sổ tiết kiệm kỳ hạn' },
    { id: 'sniper_deploy', label: 'Bắn Tỉa triển khai thành công khi thị trường sụt giảm' },
    { id: 'gov_bonds', label: 'Cân nhắc trái phiếu chính phủ' },
  ],
  4: [
    { id: 'passive_income', label: 'Thu nhập thụ động ≥ chi tiêu mục tiêu' },
    { id: 'balanced_portfolio', label: 'Danh mục cân bằng giữa tăng trưởng và thu nhập' },
    { id: 'emergency_6x', label: 'Quỹ dự phòng ≥ 6× chi tiêu' },
    { id: 'rebalance_quarterly', label: 'Rebalance danh mục mỗi quý' },
  ],
};

// Financial knowledge sections
const KNOWLEDGE_SECTIONS = [
  {
    id: 'compound',
    icon: 'trend-up',
    title: 'Lãi Kép — Siêu sức mạnh của thời gian',
    content: `Lãi kép là yếu tố quan trọng nhất trong đầu tư dài hạn. Albert Einstein từng gọi nó là "kỳ quan thứ 8 của thế giới".

Công thức: A = P × (1 + r/n)^(nt)

Trong đó:
• P = vốn ban đầu
• r = lãi suất năm (dạng thập phân)
• n = số lần tính lãi/năm
• t = số năm

Ví dụ thực tế:
Gửi 100 triệu với lãi 7%/năm, sau 10 năm bạn có 196.7 triệu (gần gấp đôi).
Sau 20 năm: 386.9 triệu (gấp gần 4 lần).
Sau 30 năm: 761.2 triệu (gấp 7.6 lần).

Bài học: Bắt đầu sớm 5 năm có thể thêm hàng trăm triệu nhờ lãi kép. Mỗi tháng trì hoãn là mất đi cơ hội tăng trưởng.`,
  },
  {
    id: 'inflation',
    icon: 'trend-down',
    title: 'Tác động của Lạm phát — Kẻ thù thầm lặng',
    content: `Lạm phát ở Việt Nam trung bình 3.5-4%/năm. Điều này có nghĩa:

• 4 triệu hôm nay = 5.6 triệu sau 10 năm (cùng sức mua)
• 4 triệu hôm nay = 7.8 triệu sau 20 năm
• 100 triệu để không = mất 30-40% sức mua sau 10 năm

Lợi suất thực = Lợi suất danh nghĩa - Lạm phát
Ví dụ: Gửi ngân hàng 6%/năm, lạm phát 4% → lợi suất thực chỉ 2%.

Bài học: Để tiền không đầu tư = mất 3-4% mỗi năm một cách thầm lặng. Đầu tư không phải để giàu, để bảo vệ giá trị đồng tiền.`,
  },
  {
    id: 'four_pct',
    icon: 'crosshair',
    title: 'Quy tắc 4% — Con số Tự do Tài chính',
    content: `Quy tắc 4% (từ nghiên cứu Trinity Study, 1998) cho biết:

Nếu bạn rút 4% tài sản mỗi năm, tiền gần như không bao giờ hết trong 30 năm.

Công thức FI Number = Chi tiêu năm × 25
Ví dụ: Chi tiêu 48 triệu/năm → FI Number = 1.2 tỷ

Tại sao 25×?
• Rút 4%/năm = 1/25 tài sản
• Phần còn lại (96%) tiếp tục sinh lời 7%/năm
• Lợi nhuận bù được phần rút ra

Lưu ý quan trọng:
• 4% là tỷ lệ an toàn, không phải tỷ lệ tối ưu
• Nếu rút ít hơn (3%), tiền gần như không bao giờ hết
• Thị trường VN có thể biến động mạnh hơn → có thể cần 3.5% cho an toàn`,
  },
  {
    id: 'allocation',
    icon: 'scales',
    title: 'Phân bổ Tài sản — Đa dạng hóa đúng cách',
    content: `Phân bổ tài sản là quyết định quan trọng nhất trong đầu tư (chiếm 90% kết quả theo nghiên cứu).

Quy tắc cơ bản:
• Tuổi trẻ → chịu được rủi ro cao → nhiều cổ phiếu
• Tuổi cao → ưu tiên ổn định → nhiều trái phiếu/tiết kiệm

Phổ rủi ro từ thấp đến cao:
TK&TP (3-7%/năm) → Dự Phòng (3-5%) → Vàng (5-10%) → CK (8-15%) → Bắn Tỉa (15-30%+)

Tại sao 5 danh mục?
• Dự Phòng: thanh khoản cao, không rủi ro
• Chứng Khoán: tăng trưởng dài hạn
• Vàng: hedge chống lạm phát, trú ẩn an toàn
• Bắn Tỉa: lợi nhuận cao khi thị trường sụt giảm
• TK&TP: ổn định, thu nhập thụ động

Rebalance: Mỗi quý, kiểm tra tỷ lệ thực tế vs mục tiêu. Chênh lệch >5% → điều chỉnh.`,
  },
  {
    id: 'savings_strategy',
    icon: 'bank',
    title: 'Chiến lược Tiết kiệm — Thang bậc lãi suất',
    content: `Tiết kiệm không phải để giàu, để bảo vệ vốn trước khi đầu tư.

Chiến lược "Ladder" (Thang bậc):
Chia tiền thành nhiều sổ, mỗi sổ kỳ hạn khác nhau.

Ví dụ với 30 triệu:
• 10 triệu: không kỳ hạn (3-4%/năm) — dự phòng khẩn cấp
• 10 triệu: 3 tháng (5%/năm) — đáo hạn luân phiên
• 10 triệu: 6 tháng (6%/năm) — lãi suất cao hơn

Khi sổ 3 tháng đáo hạn → gửi lại 6 tháng (lãi cao hơn).
Kết quả: luôn có tiền đáo hạn mỗi 3 tháng, lãi suất trung bình cao hơn.

Lãi suất tham khảo (2024-2025):
• Không kỳ hạn: 0.5-1%/năm
• 1 tháng: 3.5-4%/năm
• 3 tháng: 4.5-5%/năm
• 6 tháng: 5.5-6.5%/năm
• 12 tháng: 6-7%/năm

Mẹo: Gửi online thường được lãi suất cao hơn 0.5-1% so với tại quầy.`,
  },
];

function formatVNDShort(n) {
  if (!n) return '0';
  if (n >= 1e9) return (n / 1e9).toFixed(1) + ' tỷ';
  if (n >= 1e6) return (n / 1e6).toFixed(1) + ' tr';
  if (n >= 1e3) return (n / 1e3).toFixed(0) + 'K';
  return n.toLocaleString('vi-VN');
}

export default function Scenarios() {
  const [filled, setFilled] = useState([]);
  const [portfolio, setPortfolio] = useState(null);
  const [phase, setPhase] = useState(null);
  const [phases, setPhases] = useState([]);
  const [totalMonths, setTotalMonths] = useState(120);
  const [avgExpense, setAvgExpense] = useState(4000000);
  const [expandedPhase, setExpandedPhase] = useState(null);
  const [expandedKnowledge, setExpandedKnowledge] = useState(null);
  const [phaseAllocs, setPhaseAllocs] = useState([]);
  const [allocsByCategory, setAllocsByCategory] = useState({});

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      const [f, p, ph, allPhases, params, avg] = await Promise.all([
        apiClient.monthly.filled(),
        apiClient.portfolio.summary(),
        apiClient.phases.active(),
        apiClient.phases.get(),
        apiClient.params.get(),
        apiClient.params.avgExpense(),
      ]);
      setFilled(f);
      setPortfolio(p);
      setPhase(ph);
      setPhases(allPhases);
      setAvgExpense(avg);
      const paramMap = {};
      for (const param of params) paramMap[param.key] = param.value;
      setTotalMonths(paramMap.TOTAL_MONTHS || 120);
      if (ph) {
        setExpandedPhase(ph.sort_order);
        const pa = await apiClient.phases.allocations(ph.id).catch(() => []);
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
      console.error('Scenarios load error:', err);
    }
  }

  const totalInflow = filled.reduce((s, m) => s + (m.total_inflow || 0), 0);
  const avgInflow = filled.length > 0 ? totalInflow / filled.length : 0;
  const byCategory = portfolio?.byCategory || {};
  const totalAllocated = Object.values(allocsByCategory).reduce((s, c) => s + c.total, 0);
  const totalCurrentValue = portfolio?.totalCurrentValue || totalAllocated;

  // FI calculation (4% rule)
  const fiNumber = avgExpense * 12 / 0.04;
  const fiRatio = fiNumber > 0 ? (totalCurrentValue / fiNumber) * 100 : 0;

  // Projection scenarios
  function calcScenario(monthlyContrib, annualReturn) {
    let balance = totalCurrentValue;
    const monthlyReturn = annualReturn / 12;
    const inflationMonthly = 0.035 / 12;
    let monthsToFI = 0;
    let currentExpense = avgExpense;

    for (let m = 0; m < 600; m++) {
      balance = balance * (1 + monthlyReturn) + monthlyContrib;
      currentExpense *= (1 + inflationMonthly);
      monthsToFI = m + 1;
      if (balance * 0.04 / 12 >= currentExpense) break;
    }
    return { monthsToFI, yearsToFI: (monthsToFI / 12).toFixed(1), finalBalance: balance };
  }

  const scenarios = [
    { name: 'Thận trọng', monthly: avgInflow * 0.8, rate: 0.05, color: 'text-slate-600', bg: 'bg-slate-50' },
    { name: 'Cơ sở', monthly: avgInflow, rate: 0.07, color: 'text-primary-600', bg: 'bg-primary-50' },
    { name: 'Lạc quan', monthly: avgInflow * 1.2, rate: 0.10, color: 'text-emerald-600', bg: 'bg-emerald-50' },
  ].map(s => ({ ...s, ...calcScenario(s.monthly, s.rate) }));

  function getPhaseStatus(phaseSortOrder) {
    if (!phase) return 'locked';
    if (phase.sort_order > phaseSortOrder) return 'completed';
    if (phase.sort_order === phaseSortOrder) return 'active';
    return 'locked';
  }

  function getPhaseProgress(p) {
    if (!p.goal_amount || p.goal_amount <= 0) return 100;
    const progress = (totalCurrentValue / p.goal_amount) * 100;
    return Math.min(100, Math.max(0, progress));
  }

  // Allocation targets from phase
  const targetAlloc = useMemo(() => {
    return phaseAllocs.map(pa => ({
      name: pa.category_name,
      label: CATEGORY_LABELS[pa.category_name] || pa.category_name,
      color: pa.color,
      icon: pa.icon,
      targetPct: pa.ratio * 100,
    }));
  }, [phaseAllocs]);

  const currentAlloc = useMemo(() => {
    return targetAlloc.map(t => {
      const catData = byCategory[t.name];
      const allocTotal = allocsByCategory[t.name]?.total || 0;
      const currentTotal = catData?.currentTotal || allocTotal;
      const currentPct = totalCurrentValue > 0 ? (currentTotal / totalCurrentValue) * 100 : 0;
      return { ...t, currentPct, currentTotal };
    });
  }, [targetAlloc, byCategory, totalCurrentValue, allocsByCategory]);

  const rebalanceAlerts = useMemo(() => {
    return currentAlloc.map(c => {
      const diff = c.currentPct - c.targetPct;
      if (Math.abs(diff) > 10) {
        return { ...c, diff, direction: diff > 0 ? 'thừa' : 'thiếu' };
      }
      return null;
    }).filter(Boolean);
  }, [currentAlloc]);

  return (
    <div className="space-y-6 animate-fade-in">
      {/* ===== Section 1: Journey Overview ===== */}
      <div>
        <h1 className="page-title">Phân Tích & Kịch Bản</h1>
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
          <span className="kpi-label">Phase hiện tại</span>
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
          <span className="kpi-label">Dòng tiền TB/tháng</span>
          <p className="kpi-value text-blue-600">{formatVND(avgInflow)}</p>
          <p className="text-xs text-slate-400">{filled.length} tháng ghi nhận</p>
        </div>
      </div>

      {/* ===== Section 2: Phase Roadmap ===== */}
      <div className="card">
        <h3 className="text-sm font-semibold text-slate-700 mb-4">Lộ trình Giai đoạn</h3>
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
                    {isDone ? '✓' : p.sort_order}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-semibold ${isActive ? 'text-primary-700' : 'text-slate-700'}`}>{p.name}</p>
                    <p className="text-xs text-slate-500">{p.goal_description}</p>
                    {p.goal_amount > 0 && (
                      <div className="mt-1.5 h-1.5 bg-slate-200 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full ${isDone ? 'bg-emerald-500' : 'bg-primary-500'}`} style={{ width: `${progress}%` }} />
                      </div>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-bold text-slate-700">
                      {p.goal_amount > 0 ? formatVND(p.goal_amount) : 'Tự do'}
                    </p>
                    {p.goal_amount > 0 && (
                      <p className="text-[10px] text-slate-400">{progress.toFixed(0)}% đạt</p>
                    )}
                  </div>
                  <svg className={`w-4 h-4 text-slate-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {isExpanded && (
                  <div className="px-4 pb-4 space-y-4">
                    <div className={`p-3 rounded-lg ${isActive ? 'bg-primary-100' : isDone ? 'bg-emerald-100' : 'bg-slate-100'}`}>
                      <p className="text-xs font-medium text-slate-600 mb-1">Điều kiện vào phase:</p>
                      <p className={`text-sm font-semibold ${isActive ? 'text-primary-700' : isDone ? 'text-emerald-700' : 'text-slate-600'}`}>
                        {p.entry_condition}
                      </p>
                    </div>
                    <div className="p-3 bg-slate-50 rounded-lg">
                      <p className="text-xs font-medium text-slate-600 mb-2">Hướng dẫn chi tiết:</p>
                      <div className="text-sm text-slate-700 whitespace-pre-line leading-relaxed">{p.guidance}</div>
                    </div>
                    {checklist.length > 0 && (
                      <div>
                        <p className="text-xs font-medium text-slate-600 mb-2">Bảng kiểm tra:</p>
                        <div className="space-y-1.5">
                          {checklist.map(item => (
                            <div key={item.id} className="flex items-center gap-2 text-sm">
                              <div className={`w-4 h-4 rounded border flex items-center justify-center ${isDone ? 'border-emerald-400 bg-emerald-50' : 'border-slate-300'}`}>
                                {isDone && <span className="text-emerald-500 text-[10px]">✓</span>}
                              </div>
                              <span className={isDone ? 'text-emerald-700 line-through opacity-60' : 'text-slate-700'}>{item.label}</span>
                            </div>
                          ))}
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

      {/* ===== Section 3: Financial Knowledge Base ===== */}
      <div className="card">
        <h3 className="text-sm font-semibold text-slate-700 mb-4">Kiến thức Tài chính</h3>
        <p className="text-xs text-slate-400 mb-4">Nắm vững các nguyên tắc cốt lõi để đạt mục tiêu dài hạn</p>
        <div className="space-y-2">
          {KNOWLEDGE_SECTIONS.map(section => {
            const isOpen = expandedKnowledge === section.id;
            return (
              <div key={section.id} className="border border-slate-200 rounded-xl overflow-hidden">
                <button
                  onClick={() => setExpandedKnowledge(isOpen ? null : section.id)}
                  className="w-full flex items-center gap-3 p-3 text-left hover:bg-slate-50"
                >
                  <span className="text-lg"><AppIcon emoji={section.icon} size={20} /></span>
                  <span className="flex-1 text-sm font-medium text-slate-700">{section.title}</span>
                  <svg className={`w-4 h-4 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
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

      {/* ===== Section 4: Allocation Goals ===== */}
      <div className="card">
        <h3 className="text-sm font-semibold text-slate-700 mb-4">
          Phân bổ Mục tiêu
          {phase && <span className="text-xs text-slate-400 ml-2">({phase.name})</span>}
        </h3>

        {targetAlloc.length === 0 ? (
          <div className="text-center py-8 text-slate-400 text-sm">Chưa có phân bổ mục tiêu cho phase này</div>
        ) : (
          <div className="space-y-4">
            {currentAlloc.map(c => {
              const diff = c.currentPct - c.targetPct;
              return (
                <div key={c.name}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm text-slate-700 flex items-center gap-1.5"><AppIcon emoji={c.icon} size={16} /> {c.label}</span>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-slate-400">Hiện tại: {c.currentPct.toFixed(1)}%</span>
                      <span className="text-sm font-bold" style={{ color: c.color }}>→ {c.targetPct.toFixed(0)}%</span>
                    </div>
                  </div>
                  <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${Math.min(c.currentPct, 100)}%`, background: c.color }} />
                  </div>
                  <div className="flex justify-between text-[10px] text-slate-400 mt-0.5">
                    <span>{formatVND(c.currentTotal)}</span>
                    <span className={diff > 5 ? 'text-amber-500' : diff < -5 ? 'text-blue-500' : 'text-emerald-500'}>
                      {diff > 0 ? '+' : ''}{diff.toFixed(1)}%
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Rebalance Alerts */}
        {rebalanceAlerts.length > 0 && (
          <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
            <p className="text-xs font-semibold text-amber-700 mb-2">Cần rebalance:</p>
            {rebalanceAlerts.map(a => (
              <div key={a.name} className="flex items-center justify-between text-sm py-0.5">
                <span className="text-amber-700 flex items-center gap-1"><AppIcon emoji={a.icon} size={14} /> {a.label}</span>
                <span className="text-amber-600">
                  {a.direction === 'thừa' ? 'Thừa' : 'Thiếu'} {Math.abs(a.diff).toFixed(1)}% ({a.currentPct.toFixed(0)}% → {a.targetPct.toFixed(0)}%)
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ===== Section 5: Projection Scenarios ===== */}
      <div className="card">
        <h3 className="text-sm font-semibold text-slate-700 mb-2">Kịch bản Tự do Tài chính</h3>
        <p className="text-xs text-slate-400 mb-4">Dự báo dựa trên lãi kép, lạm phát 3.5%/năm, và quy tắc 4%</p>

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

      {/* ===== Portfolio Breakdown (compact) ===== */}
      {Object.keys(byCategory).length > 0 && (
        <div className="card">
          <h3 className="text-sm font-semibold text-slate-700 mb-4">Phân bổ Danh mục</h3>
          <div className="grid grid-cols-2 gap-3">
            {Object.entries(byCategory).map(([cat, data]) => {
              const gain = data.currentTotal - data.total;
              const gainPct = data.total > 0 ? (gain / data.total) * 100 : 0;
              return (
                <div key={cat} className="p-3 bg-slate-50 rounded-lg">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium text-slate-700">{cat}</span>
                    <span className="text-sm font-bold text-slate-800">{formatVND(data.currentTotal)}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs text-slate-400">
                    <span>Vốn: {formatVND(data.total)}</span>
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
    </div>
  );
}
