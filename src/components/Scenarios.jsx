import { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { apiClient } from '../utils/apiClient';
import AppIcon from '../utils/iconMap';
import Roadmap from './scenarios/Roadmap.jsx';
import { knowledgeSections } from '../content/knowledge.js';
import { Tabs, Skeleton, EmptyState } from './ui/index.jsx';

const TABS = [
  { id: 'roadmap', label: 'Lộ trình' },
  { id: 'knowledge', label: 'Kiến thức' },
];

export default function Scenarios() {
  const [params, setParams] = useSearchParams();
  const tab = TABS.some((t) => t.id === params.get('tab')) ? params.get('tab') : 'roadmap';

  const [snap, setSnap] = useState(null);
  const [phases, setPhases] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [sn, ph] = await Promise.all([apiClient.snapshot.get(), apiClient.phases.get()]);
        setSnap(sn);
        setPhases(ph);
      } catch (err) {
        console.error('Scenarios load error:', err);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="page-title">Lộ trình</h1>
          <p className="page-subtitle">Đang ở đâu, bao giờ tới, đổi gì thì nhanh nhất</p>
        </div>
        <Tabs
          tabs={TABS}
          value={tab}
          onChange={(id) => setParams(id === 'roadmap' ? {} : { tab: id })}
        />
      </div>

      {loading ? (
        <div className="card">
          <Skeleton rows={4} />
        </div>
      ) : !snap ? (
        <EmptyState
          title="Chưa đọc được dữ liệu"
          message="Thử tải lại app. Số liệu của bạn vẫn nguyên vẹn."
        />
      ) : tab === 'roadmap' ? (
        <Roadmap snap={snap} phases={phases} />
      ) : (
        <Knowledge snap={snap} />
      )}
    </div>
  );
}

function Knowledge({ snap }) {
  const [open, setOpen] = useState(null);
  const sections = useMemo(
    () =>
      knowledgeSections({
        targetExpense: snap.params.FI_MONTHLY_EXPENSE,
        inflation: snap.params.INFLATION_RATE,
        stockReturn: snap.params.EXPECTED_RETURN_STOCK,
        savingsRate: snap.savings.weightedRate ? snap.savings.weightedRate / 100 : undefined,
      }),
    [snap]
  );

  return (
    <div className="card">
      <p className="text-fs-2 text-slate-400 mb-4">
        Mọi ví dụ dưới đây tính bằng chính con số của bạn.
      </p>
      <div className="space-y-2">
        {sections.map((s) => {
          const isOpen = open === s.id;
          return (
            <div key={s.id} className="rounded-input border border-slate-200 overflow-hidden">
              <button
                type="button"
                onClick={() => setOpen(isOpen ? null : s.id)}
                aria-expanded={isOpen}
                data-testid={`knowledge-${s.id}`}
                className="w-full flex items-center gap-3 p-3 text-left bg-white hover:bg-slate-50 transition"
              >
                <span className="w-8 h-8 rounded-input bg-slate-100 flex items-center justify-center shrink-0">
                  <AppIcon emoji={s.icon} size={16} />
                </span>
                <span className="flex-1 text-fs-3 font-semibold text-slate-700">{s.title}</span>
                <span className="text-fs-2 text-slate-400" aria-hidden="true">
                  {isOpen ? '▴' : '▾'}
                </span>
              </button>
              {isOpen && (
                <div className="px-4 pb-4 pt-1 bg-white">
                  <div className="text-fs-3 text-slate-600 whitespace-pre-line leading-relaxed">
                    {s.content}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
