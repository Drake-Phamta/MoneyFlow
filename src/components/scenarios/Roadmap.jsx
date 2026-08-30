import { useMemo, useState } from 'react';
import { formatVND } from '../../utils/formatters';
import {
  project,
  band,
  sensitivity,
  inputFromSnapshot,
  maturityEvents,
  contributionPresets,
  monthLabel,
  CLASS_RETURN_BANDS,
} from '../../lib/projection.mjs';
import { buildPhaseGuidance, PHASE_META } from '../../content/phases.js';
import { PHASE_CHECKLISTS } from '../../content/checklists.js';
import { money, num, date } from '../../content/render.js';
import { EmptyState } from '../ui/index.jsx';

/**
 * Lộ trình — trả lời theo đúng thứ tự người dùng cần biết:
 *   đang ở đâu → bao giờ tới → đổi gì nhanh nhất → giờ làm gì.
 *
 * Mọi con số chạy qua src/lib/projection.mjs. Kéo thanh trượt chỉ để xem thử,
 * không ghi vào cơ sở dữ liệu — người dùng thử nghiệm thoải mái không sợ hỏng
 * số liệu của mình.
 */
export default function Roadmap({ snap, phases }) {
  const baseInput = useMemo(() => (snap ? inputFromSnapshot(snap) : null), [snap]);

  // Trạng thái thanh trượt. `null` nghĩa là chưa đụng vào — dùng giá trị thật.
  const [expense, setExpense] = useState(null);
  const [contribution, setContribution] = useState(null);
  const [stockReturn, setStockReturn] = useState(null);
  const [forgetRenew, setForgetRenew] = useState(false);

  const dirty = expense !== null || contribution !== null || stockReturn !== null || forgetRenew;

  const input = useMemo(() => {
    if (!baseInput) return null;
    return {
      ...baseInput,
      // Chi tiêu ở đây chỉ đổi ĐÍCH tự do tài chính. Ngưỡng giai đoạn vẫn là
      // chi tiêu mục tiêu trong cơ sở dữ liệu, không bao giờ nghe thanh trượt.
      fiExpense: expense ?? baseInput.fiExpense,
      contribution: contribution ?? baseInput.contribution,
      returns: {
        ...baseInput.returns,
        stocks: stockReturn ?? baseInput.returns.stocks,
      },
      events: maturityEvents(snap, { forgetRenew }),
    };
  }, [baseInput, snap, expense, contribution, stockReturn, forgetRenew]);

  const result = useMemo(() => (input ? project(input) : null), [input]);
  const bands = useMemo(
    () => (input ? band(input, { cashflow: snap.cashflow, risk: snap.risk }) : null),
    [input, snap]
  );
  const levers = useMemo(() => (input ? sensitivity(input) : null), [input]);

  if (!snap || !result) {
    return <EmptyState title="Đang tính lộ trình" message="Cần ít nhất một tháng đã ghi." />;
  }

  const targetExpense = baseInput.fiExpense;
  const actualExpense = snap.cashflow.expenseMean || 0;
  const nextPhase = result.milestones.find((m) => m.kind === 'phase');

  function resetAll() {
    setExpense(null);
    setContribution(null);
    setStockReturn(null);
    setForgetRenew(false);
  }

  return (
    <div className="space-y-5">
      <NowBanner snap={snap} next={nextPhase} result={result} />

      <Timeline snap={snap} result={result} bands={bands} phases={phases} />

      <Controls
        snap={snap}
        baseInput={baseInput}
        result={result}
        bands={bands}
        levers={levers}
        dirty={dirty}
        onReset={resetAll}
        expense={expense ?? targetExpense}
        setExpense={setExpense}
        actualExpense={actualExpense}
        targetExpense={targetExpense}
        contribution={contribution ?? baseInput.contribution}
        setContribution={setContribution}
        stockReturn={stockReturn ?? baseInput.returns.stocks}
        setStockReturn={setStockReturn}
        forgetRenew={forgetRenew}
        setForgetRenew={setForgetRenew}
      />

      <PlanVsActual snap={snap} />
      <TodoList snap={snap} />
    </div>
  );
}

/* ── 1. Đang ở đâu ────────────────────────────────────────────────────────── */

function NowBanner({ snap, next, result }) {
  const p = snap.phase;
  const meta = PHASE_META[p.sortOrder];
  const gap = Math.max(0, p.goalAmount - p.current);

  return (
    <div className="card">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-fs-1 uppercase tracking-widest text-slate-400 font-semibold">
            Đang ở đâu
          </p>
          <h2 className="text-xl font-bold text-slate-800 mt-0.5">{meta?.name || p.name}</h2>
          <p className="text-fs-3 text-slate-500 mt-1">{meta?.about}</p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-fs-1 uppercase tracking-widest text-slate-400 font-semibold">
            Chạm mốc tự do tài chính
          </p>
          <p className="text-xl font-bold text-slate-800 tabular" data-testid="fi-date">
            {result.reached
              ? result.milestones.find((m) => m.kind === 'fi')?.label
              : 'chưa tới trong 100 năm'}
          </p>
          {result.reached && (
            <p className="text-fs-2 text-slate-400">{num(result.yearsToFI)} năm nữa</p>
          )}
        </div>
      </div>

      <div className="mt-4">
        <div className="flex items-baseline justify-between mb-1.5">
          <span className="text-fs-2 text-slate-500">
            {formatVND(p.current)} / {formatVND(p.goalAmount)}
          </span>
          <span className="text-fs-3 font-bold text-primary-600 tabular">
            {num(p.pct)}%
          </span>
        </div>
        <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-primary-500 rounded-full transition-all"
            style={{ width: `${Math.min(100, p.pct)}%` }}
          />
        </div>
        <p className="text-fs-2 text-slate-500 mt-2">
          {gap > 0 ? (
            <>
              Còn thiếu <strong className="text-slate-700">{formatVND(gap)}</strong>
              {next && (
                <>
                  {' '}
                  — dự kiến đủ vào{' '}
                  <strong className="text-slate-700" data-testid="next-phase-date">
                    {next.label}
                  </strong>
                </>
              )}
            </>
          ) : (
            'Đã đạt mốc của giai đoạn này.'
          )}
        </p>
      </div>
    </div>
  );
}

/* ── 2. Thang mốc theo lịch ───────────────────────────────────────────────── */

function Timeline({ snap, result, bands, phases }) {
  const [open, setOpen] = useState(snap.phase.sortOrder);
  const maturities = maturityEvents(snap).filter((e) => !e.autoRenew);

  const rows = result.milestones.map((m) => ({
    id: m.id,
    when: m.label,
    what:
      m.kind === 'fi'
        ? 'Chạm mốc tự do tài chính'
        : `Lên ${PHASE_META[m.phase]?.name || 'giai đoạn ' + m.phase}`,
    amount: m.amount,
  }));

  return (
    <div className="card">
      <h3 className="text-sm font-semibold text-slate-700 mb-1">Bao giờ tới</h3>
      <p className="text-fs-2 text-slate-400 mb-4">
        Tính theo tiền để dành hiện tại và tỷ lệ phân bổ của từng giai đoạn.
      </p>

      {rows.length === 0 ? (
        <p className="text-fs-3 text-slate-500">Chưa đủ dữ liệu để đặt mốc.</p>
      ) : (
        <div className="space-y-1.5 mb-4" data-testid="milestones">
          {rows.map((r) => (
            <div
              key={r.id}
              className="flex items-baseline gap-3 py-1.5 border-b border-slate-100 last:border-0"
            >
              <span className="w-20 shrink-0 text-fs-3 font-bold text-slate-700 tabular">
                {r.when}
              </span>
              <span className="flex-1 text-fs-3 text-slate-600 min-w-0">{r.what}</span>
              <span className="text-fs-3 text-slate-400 tabular shrink-0">
                {money(r.amount)}
              </span>
            </div>
          ))}
        </div>
      )}

      {bands?.base?.reached && (
        <p className="text-fs-2 text-slate-400 mb-4">
          Khoảng hai phần ba khả năng rơi vào{' '}
          <strong className="text-slate-600">{num(bands.high.yearsToFI)}</strong>–
          <strong className="text-slate-600">{num(bands.low.yearsToFI)}</strong> năm. Ghi
          thêm một tháng thì dải này hẹp lại.
        </p>
      )}

      {maturities.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-input px-3 py-2.5 mb-4">
          {maturities.map((e) => (
            <p key={e.id} className="text-fs-2 text-amber-800">
              <strong>{date(e.date)}</strong> — sổ {e.name} {money(e.amount)} đáo hạn, chưa bật tái tục
            </p>
          ))}
        </div>
      )}

      <div className="space-y-2">
        {phases.map((ph) => {
          const g = buildPhaseGuidance(
            { sortOrder: ph.sort_order, name: ph.name, goalMultiplier: ph.goal_multiplier },
            snap.phaseAllocations?.[ph.sort_order] || [],
            { targetExpense: snap.params.FI_MONTHLY_EXPENSE, goldUnitPrice: snap.prices?.goldUnit }
          );
          const done = snap.phase.sortOrder > ph.sort_order;
          const active = snap.phase.sortOrder === ph.sort_order;
          const isOpen = open === ph.sort_order;

          return (
            <div
              key={ph.id}
              className={`rounded-input border overflow-hidden ${
                active ? 'border-primary-300' : done ? 'border-emerald-200' : 'border-slate-200'
              }`}
            >
              <button
                type="button"
                onClick={() => setOpen(isOpen ? null : ph.sort_order)}
                aria-expanded={isOpen}
                data-testid={`phase-card-${ph.sort_order}`}
                className={`w-full flex items-center gap-3 p-3 text-left ${
                  active ? 'bg-primary-50' : done ? 'bg-emerald-50' : 'bg-white'
                }`}
              >
                <span
                  className={`w-7 h-7 rounded-full flex items-center justify-center text-fs-2 font-bold shrink-0 ${
                    done
                      ? 'bg-emerald-500 text-oncolor'
                      : active
                        ? 'bg-primary-600 text-oncolor'
                        : 'bg-slate-200 text-slate-500'
                  }`}
                >
                  {done ? '✓' : ph.sort_order}
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block text-fs-3 font-semibold text-slate-700">
                    {g?.name || ph.name}
                  </span>
                  <span className="block text-fs-2 text-slate-500 truncate">{g?.about}</span>
                </span>
                <span className="text-fs-2 text-slate-400 shrink-0" aria-hidden="true">
                  {isOpen ? '▴' : '▾'}
                </span>
              </button>

              {isOpen && g && (
                <div className="px-3 pb-3 pt-1 bg-white space-y-3">
                  <div>
                    <p className="text-fs-1 uppercase tracking-wide text-slate-400 font-semibold mb-1.5">
                      Tiền nhàn rỗi chia thế nào
                    </p>
                    {g.allocation.map((a) => (
                      <div key={a.name} className="flex items-baseline gap-2 text-fs-3 py-0.5">
                        <span className="w-9 shrink-0 text-right font-semibold text-slate-700 tabular">
                          {Math.round(a.ratio * 100)}%
                        </span>
                        <span className="font-medium text-slate-700 shrink-0">{a.name}</span>
                        <span className="text-slate-500 min-w-0">— {a.action}</span>
                      </div>
                    ))}
                  </div>
                  <p className="text-fs-3 font-medium text-slate-700">{g.exit}</p>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ── 3. Bảng điều khiển ───────────────────────────────────────────────────── */

function Controls(props) {
  const {
    snap, baseInput, result, bands, levers, dirty, onReset,
    expense, setExpense, actualExpense, targetExpense,
    contribution, setContribution, stockReturn, setStockReturn,
    forgetRenew, setForgetRenew,
  } = props;

  const presets = contributionPresets(snap.cashflow);
  const stockBand = CLASS_RETURN_BANDS.stocks;

  // Sống ở mức chi tiêu thực tế thì đích tới sớm hơn bao lâu — con số này là
  // đòn bẩy lớn nhất mà app chưa từng nói thẳng ra.
  const atActual = useMemo(
    () => project({ ...baseInput, fiExpense: actualExpense }),
    [baseInput, actualExpense]
  );
  const savedYears =
    result.reached && atActual.reached ? (result.monthsToFI - atActual.monthsToFI) / 12 : null;

  return (
    <div className="card">
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <h3 className="text-sm font-semibold text-slate-700">Thử đổi một thứ</h3>
          <p className="text-fs-2 text-slate-400 mt-0.5">
            Kéo để xem thử. Không có gì được lưu lại.
          </p>
        </div>
        {dirty && (
          <button type="button" onClick={onReset} className="btn-ghost text-fs-2" data-testid="reset-sliders">
            Về số thật
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_260px] gap-6">
        <div className="space-y-5">
          <Slider
            label="Chi tiêu mỗi tháng khi đã tự do"
            testId="slider-expense"
            value={expense}
            min={2000000}
            max={30000000}
            step={500000}
            onChange={setExpense}
            format={formatVND}
            marks={[
              { at: actualExpense, label: `thực tế ${money(actualExpense)}` },
              { at: targetExpense, label: `mục tiêu ${money(targetExpense)}` },
            ]}
            note="Chỉ kéo đích lại gần — tiền để dành mỗi tháng vẫn là con số đo từ sổ của bạn. Đây là đòn bẩy duy nhất không đòi bạn kiếm thêm đồng nào."
          />

          <div>
            <Slider
              label="Để dành mỗi tháng"
              testId="slider-contribution"
              value={contribution}
              min={0}
              max={Math.max(20000000, Math.ceil((snap.cashflow.bestMonth || 0) * 1.5))}
              step={250000}
              onChange={setContribution}
              format={formatVND}
              marks={presets.map((p) => ({ at: p.amount, label: p.label }))}
            />
            <div className="flex gap-1.5 mt-2">
              {presets.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setContribution(p.amount)}
                  className="px-2.5 py-1 rounded-input text-fs-1 bg-slate-100 text-slate-600 hover:bg-slate-200 transition"
                >
                  {p.label} · {money(p.amount)}
                </button>
              ))}
            </div>
          </div>

          <Slider
            label="Lợi suất chứng khoán mỗi năm"
            testId="slider-stock"
            value={stockReturn}
            min={stockBand[0]}
            max={stockBand[1]}
            step={0.005}
            onChange={setStockReturn}
            format={(v) => `${num(v * 100)}%`}
            marks={
              snap.risk?.byAsset?.E1VFVN30
                ? [
                    {
                      at: Math.min(stockBand[1], snap.risk.byAsset.E1VFVN30.cagr),
                      label: `E1VFVN30 mười lăm tháng qua ${num(snap.risk.byAsset.E1VFVN30.cagr * 100, 0)}%`,
                    },
                  ]
                : []
            }
            note="Mười lăm tháng quá ngắn để suy ra hai mươi năm — mức thật đã đạt chỉ là một điểm tham chiếu."
          />

          <label className="flex items-start gap-2.5 cursor-pointer">
            <input
              type="checkbox"
              checked={forgetRenew}
              onChange={(e) => setForgetRenew(e.target.checked)}
              data-testid="toggle-renew"
              className="mt-0.5"
            />
            <span className="text-fs-3 text-slate-600">
              Quên tái tục sổ đáo hạn
              <span className="block text-fs-2 text-slate-400">
                Tiền nằm chờ không sinh lãi cho tới khi bạn gửi lại.
              </span>
            </span>
          </label>
        </div>

        <div className="lg:sticky lg:top-4 h-fit bg-slate-50 border border-slate-200 rounded-input p-4">
          <p className="text-fs-1 uppercase tracking-widest text-slate-400 font-semibold">
            Kết quả
          </p>
          <p className="text-3xl font-bold text-slate-800 tabular mt-1" data-testid="result-years">
            {result.reached ? num(result.yearsToFI) : '—'}
            {result.reached && <span className="text-base font-medium text-slate-400 ml-1">năm</span>}
          </p>
          <p className="text-fs-2 text-slate-500 mt-0.5">
            {result.reached
              ? result.milestones.find((m) => m.kind === 'fi')?.label
              : 'không tới trong 100 năm'}
          </p>

          <dl className="mt-4 space-y-2 text-fs-2">
            <Row label="Cần đạt" value={money(result.fiTarget)} />
            <Row label="Đang có" value={money(snap.netWorth.total)} />
            <Row
              label="Lợi suất bình quân"
              value={`${num(result.blendedReturnStart * 100)}% → ${num(result.blendedReturnEnd * 100)}%`}
            />
            {bands?.base?.reached && (
              <Row
                label="Dải khả năng"
                value={`${num(bands.high.yearsToFI)}–${num(bands.low.yearsToFI)} năm`}
              />
            )}
          </dl>
        </div>
      </div>

      {savedYears !== null && Math.abs(savedYears) > 0.1 && (
        <p
          className="mt-4 text-fs-3 text-slate-600 bg-amber-50 border border-amber-200 rounded-input px-3 py-2.5"
          data-testid="expense-note"
        >
          Ngưỡng giai đoạn vẫn tính theo chi tiêu mục tiêu {money(targetExpense)}/tháng. Sống ở mức{' '}
          {money(actualExpense)} như hiện nay thì mốc tự do tài chính đến sớm hơn{' '}
          <strong>{num(savedYears)} năm</strong>.
        </p>
      )}

      {levers?.levers?.length > 0 && (
        <div className="mt-5">
          <p className="text-fs-1 uppercase tracking-widest text-slate-400 font-semibold mb-2">
            Đổi 10% thì rút ngắn bao nhiêu
          </p>
          <div className="space-y-1" data-testid="levers">
            {levers.levers.map((l) => {
              const max = levers.levers[0].monthsSaved || 1;
              return (
                <div key={l.id} className="flex items-center gap-3">
                  <span className="w-44 shrink-0 text-fs-3 text-slate-600">{l.label}</span>
                  <span className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                    <span
                      className="block h-full bg-primary-400 rounded-full"
                      style={{ width: `${Math.max(2, (l.monthsSaved / max) * 100)}%` }}
                    />
                  </span>
                  <span className="w-20 text-right text-fs-3 text-slate-500 tabular shrink-0">
                    {l.monthsSaved} tháng
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <dt className="text-slate-500">{label}</dt>
      <dd className="font-semibold text-slate-700 tabular">{value}</dd>
    </div>
  );
}

/** Thanh trượt có vạch đánh dấu mức thật, để người dùng biết mình đang lệch đâu. */
function Slider({ label, value, min, max, step, onChange, format, marks = [], note, testId }) {
  const pos = (v) => ((v - min) / (max - min)) * 100;
  return (
    <div>
      <div className="flex items-baseline justify-between mb-1.5">
        <label className="text-fs-3 font-medium text-slate-700">{label}</label>
        <span className="text-fs-3 font-bold text-slate-800 tabular">{format(value)}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        data-testid={testId}
        aria-label={label}
        aria-valuetext={format(value)}
        className="w-full accent-primary-600"
      />
      {marks.length > 0 && (
        <div className="relative h-4 mt-0.5">
          {marks
            .filter((m) => m.at >= min && m.at <= max)
            .map((m) => (
              <span
                key={m.label}
                className="absolute text-fs-1 text-slate-400 whitespace-nowrap -translate-x-1/2"
                style={{ left: `${Math.min(92, Math.max(8, pos(m.at)))}%` }}
              >
                ▏{m.label}
              </span>
            ))}
        </div>
      )}
      {note && <p className="text-fs-2 text-slate-400 mt-1">{note}</p>}
    </div>
  );
}

/* ── 4. Kế hoạch vs thực tế ───────────────────────────────────────────────── */

function PlanVsActual({ snap }) {
  const rows = snap.plan?.byMonth || [];
  const logs = snap.plan?.discrepancies || [];
  if (!rows.length) return null;

  const totalDiff = logs.reduce((s, l) => s + (l.amount || 0), 0);

  return (
    <div className="card">
      <h3 className="text-sm font-semibold text-slate-700 mb-1">Kế hoạch so với thực tế</h3>
      <p className="text-fs-2 text-slate-400 mb-4">
        Bạn đã bám kế hoạch tới đâu, và lệch thì vì lý do gì.
      </p>

      <div className="space-y-1">
        {rows.map((m) => (
          <div key={m.month_index} className="flex items-baseline gap-3 py-1">
            <span className="w-20 shrink-0 text-fs-3 text-slate-600 tabular">{m.month_label}</span>
            <span className="flex-1 text-fs-3 text-slate-500 tabular">
              {money(m.actual)} / {money(m.planned)}
            </span>
            <span
              className={`text-fs-3 tabular shrink-0 ${
                Math.abs(m.diff) < 1000
                  ? 'text-slate-400'
                  : m.diff > 0
                    ? 'text-emerald-600'
                    : 'text-amber-600'
              }`}
            >
              {Math.abs(m.diff) < 1000 ? 'đúng kế hoạch' : `${m.diff > 0 ? '+' : ''}${money(m.diff)}`}
            </span>
          </div>
        ))}
      </div>

      {logs.length > 0 && (
        <div className="mt-4 pt-3 border-t border-slate-100">
          <p className="text-fs-2 text-slate-500 mb-2">
            {logs.length} lần điều chỉnh, tổng {money(totalDiff)}
          </p>
          <div className="space-y-1.5">
            {logs.map((l) => (
              <div key={l.id} className="text-fs-2 text-slate-500">
                <span className="text-slate-600 font-medium">{l.month_label}</span> ·{' '}
                {money(l.amount)} vào {l.category_name} — {l.reason}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── 5. Việc cần làm ──────────────────────────────────────────────────────── */

function TodoList({ snap }) {
  const sort = snap.phase.sortOrder;
  const status = snap.checklist?.[sort] || {};
  const items = (PHASE_CHECKLISTS[sort] || []).filter((x) => !status[x.id]);

  if (!items.length) {
    return (
      <div className="card">
        <h3 className="text-sm font-semibold text-slate-700 mb-1">Việc cần làm</h3>
        <p className="text-fs-3 text-emerald-600">
          Xong hết việc của giai đoạn này. Tiếp tục ghi chép đều là đủ.
        </p>
      </div>
    );
  }

  return (
    <div className="card">
      <h3 className="text-sm font-semibold text-slate-700 mb-1">Việc cần làm</h3>
      <p className="text-fs-2 text-slate-400 mb-3">
        App tự kiểm từ dữ liệu, bạn không cần tick.
      </p>
      <div className="space-y-2" data-testid="todo">
        {items.map((x) => (
          <div key={x.id} className="flex items-baseline gap-2.5">
            <span className="w-4 h-4 rounded border border-slate-300 shrink-0 mt-0.5" aria-hidden="true" />
            <span className="min-w-0">
              <span className="block text-fs-3 text-slate-700">{x.label}</span>
              <span className="block text-fs-2 text-slate-400">{x.check}</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
