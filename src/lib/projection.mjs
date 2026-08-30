/**
 * projection.mjs — Mô hình dự phóng. Hàm thuần: không React, không I/O, không
 * thư viện. Gọi lại được vài nghìn lần mỗi giây để thanh trượt chạy mượt.
 *
 * Đuôi .mjs vì package.json không khai báo type: module, mà tests/ chạy bằng
 * CommonJS — đặt .js thì require() chết ngay ở từ khoá export.
 *
 * ── Vì sao năm xô thay vì một số dư ──────────────────────────────────────
 * Mô hình một-số-dư-một-lợi-suất phải chọn một con số đại diện cho cả danh
 * mục, và con số đó luôn sai ở đầu hành trình: hôm nay phần lớn tài sản nằm
 * trong sổ tiết kiệm 4,75%, không phải mix mục tiêu của giai đoạn. Chia theo
 * năm nhóm cho ba thứ miễn phí:
 *   · lợi suất mở đúng bằng mix THẬT đang có
 *   · glide path tự xuất hiện khi lên giai đoạn, vì tiền mới chia theo tỷ lệ
 *     của giai đoạn đang chạy chứ không theo một tỷ lệ cố định
 *   · kiểm được ngưỡng "dự phòng ≥ 3× chi tiêu" — thứ mô hình một số dư
 *     không thể biết
 */

/** Năm nhóm tài sản, đúng năm danh mục phân bổ của app. */
export const CLASSES = ['reserve', 'savings', 'gold', 'stocks', 'sniper'];

/**
 * Lợi suất danh nghĩa mặc định mỗi năm.
 *
 * Cố ý KHÔNG lấy CAGR 33,9% mà E1VFVN30 vừa đạt làm mặc định: 15 tháng quá
 * ngắn để ngoại suy hơn mười năm, và lợi suất người dùng thực nhận chỉ +1,16%
 * vì mua ở vùng giá cao. Con số đó thuộc về phần chú thích, không phải mặc định.
 */
export const DEFAULT_CLASS_RETURNS = {
  reserve: 0.0475,
  savings: 0.0475,
  gold: 0.075,
  stocks: 0.115,
  sniper: 0,
};

/** Dải hợp lý của từng nhóm — dùng làm biên cho thanh trượt. */
export const CLASS_RETURN_BANDS = {
  reserve: [0.001, 0.07],
  savings: [0.03, 0.08],
  gold: [0.05, 0.1],
  stocks: [0.08, 0.15],
  sniper: [0, 0.05],
};

const MAX_MONTHS = 1200; // 100 năm — quá mốc này thì coi như không tới

// ── Nhãn tháng ────────────────────────────────────────────────────────────

/**
 * "T11/2026" — cùng công thức mà backend dùng để sinh monthly_entries, nên mốc
 * trong dự phóng và dòng trong sổ luôn gọi cùng một tháng bằng cùng một tên.
 * `index` đếm từ 1.
 */
export function monthLabel(index, startMonth, startYear) {
  const i = Math.max(1, Math.round(index)) - 1;
  const m = ((startMonth - 1 + i) % 12) + 1;
  const y = startYear + Math.floor((startMonth - 1 + i) / 12);
  return `T${m}/${y}`;
}

/** "2026-11" — để so sánh và sắp xếp. */
export function monthKey(index, startMonth, startYear) {
  const i = Math.max(1, Math.round(index)) - 1;
  const m = ((startMonth - 1 + i) % 12) + 1;
  const y = startYear + Math.floor((startMonth - 1 + i) / 12);
  return `${y}-${String(m).padStart(2, '0')}`;
}

// ── Thống kê từ dữ liệu đã ghi ────────────────────────────────────────────

/**
 * Ba mức đóng góp, cả ba đều là số CÓ THẬT trong sổ của người dùng.
 * Nhân 0,8 / 1,0 / 1,2 vào một con số trung bình thì ba kịch bản chỉ khác nhau
 * ở một hệ số bịa ra; ở đây "thận trọng" là tháng chỉ có lương, "lạc quan" là
 * tháng tốt nhất đã từng xảy ra.
 */
export function contributionPresets(cashflow) {
  const c = cashflow || {};
  return [
    { id: 'salary', label: 'Chỉ lương', amount: Math.max(0, c.salaryNet || 0) },
    { id: 'mean', label: `Trung bình ${c.months || 0} tháng`, amount: Math.max(0, c.inflowMean || 0) },
    { id: 'best', label: 'Tháng tốt nhất', amount: Math.max(0, c.bestMonth || 0) },
  ];
}

/**
 * Sai số chuẩn của dòng tiền trung bình: sd/√n.
 * Ghi thêm một tháng là dải hẹp lại — một lý do có thật để chăm ghi chép.
 */
export function contributionStdError(cashflow) {
  const n = cashflow?.months || 0;
  if (n < 2) return 0;
  return (cashflow.inflowSd || 0) / Math.sqrt(n);
}

/**
 * Độ bất định của lợi suất sau T năm: σ/√T.
 * σ đo từ price_snapshots khi có đủ phiên; không đủ thì dùng mức mặc định của
 * thị trường cổ phiếu Việt Nam.
 */
export function returnStdError(risk, years, fallbackVol = 0.2) {
  const assets = Object.values(risk?.byAsset || {});
  const vol = assets.length
    ? assets.reduce((s, a) => s + (a.annualVol || 0), 0) / assets.length
    : fallbackVol;
  return years > 0 ? vol / Math.sqrt(years) : vol;
}

// ── Giai đoạn ─────────────────────────────────────────────────────────────

/**
 * Xếp giai đoạn từ số dư. Chép nguyên ngưỡng của máy dò phía backend
 * (_resolvePhase trong electron/database.js): GĐ2 khi dự phòng ≥ 3× chi tiêu
 * mục tiêu, GĐ3 khi tổng tài sản ≥ 6×, GĐ4 khi ≥ 24×.
 *
 * `phaseExpense` LUÔN là chi tiêu mục tiêu trong cơ sở dữ liệu. Thanh trượt
 * chi tiêu không bao giờ được chạm vào tham số này — nếu chạm, mốc giai đoạn
 * trên trang Kịch bản sẽ khác mốc trên Tổng quan.
 */
export function detectPhase(buckets, phaseExpense) {
  const reserve = buckets.reserve || 0;
  const total = CLASSES.reduce((s, k) => s + (buckets[k] || 0), 0);
  if (total >= 24 * phaseExpense) return 4;
  if (total >= 6 * phaseExpense) return 3;
  if (reserve >= 3 * phaseExpense) return 2;
  return 1;
}

/** Lợi suất danh nghĩa bình quân gia quyền của số dư hiện tại. */
export function blendedReturn(buckets, returns) {
  const total = CLASSES.reduce((s, k) => s + (buckets[k] || 0), 0);
  if (total <= 0) return 0;
  return CLASSES.reduce((s, k) => s + (buckets[k] || 0) * (returns[k] ?? 0), 0) / total;
}

/** Lợi suất của dòng tiền MỚI ở một giai đoạn — tức mix mục tiêu. */
export function phaseReturn(allocation, returns) {
  const rows = allocation || [];
  const sum = rows.reduce((s, a) => s + (a.ratio || 0), 0);
  if (sum <= 0) return 0;
  return rows.reduce((s, a) => s + (a.ratio || 0) * (returns[a.kind] ?? 0), 0) / sum;
}

// ── Động cơ ───────────────────────────────────────────────────────────────

/**
 * Chạy dự phóng.
 *
 * @param {object} input
 *   buckets        {reserve, savings, gold, stocks, sniper} số dư mở
 *   allocations    {1..4: [{kind, ratio}]} tỷ lệ chia tiền mới theo giai đoạn
 *   contribution   tiền nhàn rỗi mỗi tháng
 *   fiExpense      chi tiêu dùng để tính ĐÍCH tự do tài chính — thanh trượt
 *                  điều khiển con số này
 *   phaseExpense   chi tiêu dùng cho NGƯỠNG giai đoạn — luôn lấy từ DB
 *   returns        lợi suất danh nghĩa từng nhóm
 *   inflation      lạm phát năm
 *   startMonth/startYear  để đặt tên tháng
 *   events         [{monthIndex, apply(buckets, ctx)}] sự kiện đã biết trước
 *   horizon        số tháng tối đa
 */
export function project(input) {
  const {
    buckets: opening = {},
    allocations = {},
    contribution = 0,
    fiExpense = 0,
    phaseExpense = fiExpense,
    returns = DEFAULT_CLASS_RETURNS,
    inflation = 0.035,
    startMonth = 1,
    startYear = new Date().getFullYear(),
    // Tháng đầu tiên CHƯA ghi. Bắt đầu từ 1 thì mốc rơi vào quá khứ: người
    // dùng đã nhập tới T8/2026 mà app báo "lên Giai đoạn 2 vào T7/2026".
    startIndex = 1,
    events = [],
    horizon = MAX_MONTHS,
  } = input || {};

  // Đích tính theo quy tắc 4%, giữ nguyên giá trị tiền HÔM NAY. Vì đích đứng
  // yên theo giá hôm nay, số dư phải lớn lên theo lợi suất THỰC — nếu không,
  // lạm phát bị bỏ quên đúng một lần.
  const fiTarget = (fiExpense * 12) / 0.04;

  const monthlyReal = {};
  for (const k of CLASSES) {
    monthlyReal[k] = ((returns[k] ?? 0) - inflation) / 12;
  }

  const b = {};
  for (const k of CLASSES) b[k] = Math.max(0, opening[k] || 0);

  const eventsByMonth = new Map();
  for (const e of events) {
    if (!e || !e.monthIndex) continue;
    if (!eventsByMonth.has(e.monthIndex)) eventsByMonth.set(e.monthIndex, []);
    eventsByMonth.get(e.monthIndex).push(e);
  }

  const milestones = [];
  const seenPhase = new Set();
  const path = [];

  let phase = detectPhase(b, phaseExpense);
  seenPhase.add(phase);

  let total = sum(b);
  let reached = total >= fiTarget;
  let monthsToFI = reached ? 0 : null;
  let fiIndex = reached ? 0 : null;

  const first = Math.max(1, Math.round(startIndex));
  const cap = first + Math.min(horizon, MAX_MONTHS) - 1;

  for (let m = first; m <= cap && !reached; m++) {
    // 1. Sự kiện đã biết trước (sổ đáo hạn, đổi lãi suất…) áp trước khi chia tiền.
    const evts = eventsByMonth.get(m);
    if (evts) for (const e of evts) e.apply(b, { month: m, returns });

    // 2. Tiền mới chia theo tỷ lệ của giai đoạn ĐANG chạy. Đây là chỗ glide
    //    path tự xuất hiện: lên giai đoạn thì tỷ lệ đổi, không cần khai báo.
    const rows = allocations[phase] || [];
    const ratioSum = rows.reduce((s, a) => s + (a.ratio || 0), 0);
    if (contribution > 0 && ratioSum > 0) {
      for (const a of rows) {
        b[a.kind] = (b[a.kind] || 0) + (contribution * (a.ratio || 0)) / ratioSum;
      }
    } else if (contribution > 0) {
      b.reserve += contribution; // chưa có tỷ lệ thì dồn vào nhóm an toàn nhất
    }

    // 3. Mỗi nhóm lớn lên theo lợi suất riêng của nó.
    for (const k of CLASSES) {
      b[k] = Math.max(0, b[k] * (1 + monthlyReal[k]));
    }

    // 4. Xếp lại giai đoạn — cùng một vòng lặp sinh ra cả tiến độ lẫn ngày.
    const next = detectPhase(b, phaseExpense);
    if (next > phase) {
      for (let p = phase + 1; p <= next; p++) {
        if (!seenPhase.has(p)) {
          seenPhase.add(p);
          milestones.push({
            id: `phase-${p}`,
            kind: 'phase',
            phase: p,
            monthIndex: m,
            label: monthLabel(m, startMonth, startYear),
            key: monthKey(m, startMonth, startYear),
            amount: sum(b),
          });
        }
      }
    }
    phase = next;

    total = sum(b);
    if ((m - first) % 12 === 0 || m === first) {
      path.push({ monthIndex: m, label: monthLabel(m, startMonth, startYear), total, phase });
    }

    if (total >= fiTarget) {
      reached = true;
      fiIndex = m;
      monthsToFI = m - first + 1;
      milestones.push({
        id: 'fi',
        kind: 'fi',
        monthIndex: m,
        label: monthLabel(m, startMonth, startYear),
        key: monthKey(m, startMonth, startYear),
        amount: total,
      });
    }
  }

  return {
    reached,
    monthsToFI,
    fiIndex,
    startIndex: first,
    yearsToFI: monthsToFI === null ? null : monthsToFI / 12,
    fiTarget,
    finalBuckets: { ...b },
    finalTotal: total,
    phase,
    milestones,
    path,
    blendedReturnStart: blendedReturn(opening, returns),
    blendedReturnEnd: blendedReturn(b, returns),
  };
}

function sum(b) {
  return CLASSES.reduce((s, k) => s + (b[k] || 0), 0);
}

// ── Dải bất định ──────────────────────────────────────────────────────────

/**
 * Dải quanh kết quả cơ sở, bằng công thức đóng chứ không mô phỏng Monte Carlo.
 *
 * Monte Carlo vừa chậm cho một thanh trượt phải tính lại mỗi khung hình, vừa
 * cho ra số khác nhau khi kéo đi kéo lại đúng một chỗ — người dùng sẽ không
 * tin con số nào cả. Hai nguồn bất định độc lập, cộng theo bậc hai:
 *   · sai số chuẩn của dòng tiền trung bình  sd/√n
 *   · độ bất định của lợi suất sau T năm      σ/√T
 */
export function band(input, { cashflow, risk, z = 1 } = {}) {
  const base = project(input);
  const years = base.yearsToFI || 10;

  const cSE = contributionStdError(cashflow);
  const rSE = returnStdError(risk, years);

  // Cộng bậc hai để không thổi phồng dải khi cả hai nguồn cùng nhỏ.
  const contribShift = z * cSE;
  const returnShift = z * rSE;

  const shiftReturns = (delta) => {
    const out = {};
    for (const k of CLASSES) {
      // Nhóm không rủi ro thì lợi suất không lung lay theo thị trường.
      const risky = k === 'stocks' || k === 'gold';
      out[k] = (input.returns?.[k] ?? DEFAULT_CLASS_RETURNS[k]) + (risky ? delta : 0);
    }
    return out;
  };

  const low = project({
    ...input,
    contribution: Math.max(0, (input.contribution || 0) - contribShift),
    returns: shiftReturns(-returnShift),
  });
  const high = project({
    ...input,
    contribution: (input.contribution || 0) + contribShift,
    returns: shiftReturns(returnShift),
  });

  return {
    base,
    low,
    high,
    uncertainty: {
      contributionStdError: cSE,
      returnStdError: rSE,
      months: cashflow?.months || 0,
      // Ghi thêm một tháng thì sai số chuẩn còn lại bao nhiêu — con số này là
      // lý do để người dùng chăm ghi.
      contributionStdErrorNextMonth:
        (cashflow?.months || 0) >= 2
          ? (cashflow.inflowSd || 0) / Math.sqrt((cashflow.months || 0) + 1)
          : 0,
    },
  };
}

// ── Độ nhạy ───────────────────────────────────────────────────────────────

/**
 * Đổi mỗi đòn bẩy 10% tương đối rồi xếp hạng theo số tháng rút ngắn được.
 * Trả lời đúng câu người dùng muốn hỏi: đổi cái gì thì nhanh nhất.
 */
export function sensitivity(input, opts = {}) {
  const step = opts.step ?? 0.1;
  const base = project(input);
  if (!base.reached) return { base, levers: [] };

  const levers = [
    {
      id: 'fiExpense',
      label: 'Chi tiêu mục tiêu',
      note: 'Kéo đích lại gần, không cần kiếm thêm đồng nào',
      make: (f) => ({ ...input, fiExpense: (input.fiExpense || 0) * (1 - f) }),
    },
    {
      id: 'contribution',
      label: 'Tiền để dành mỗi tháng',
      make: (f) => ({ ...input, contribution: (input.contribution || 0) * (1 + f) }),
    },
    {
      id: 'stocks',
      label: 'Lợi suất chứng khoán',
      make: (f) => ({
        ...input,
        returns: {
          ...(input.returns || DEFAULT_CLASS_RETURNS),
          stocks: (input.returns?.stocks ?? DEFAULT_CLASS_RETURNS.stocks) * (1 + f),
        },
      }),
    },
    {
      id: 'savings',
      label: 'Lãi suất tiết kiệm',
      make: (f) => ({
        ...input,
        returns: {
          ...(input.returns || DEFAULT_CLASS_RETURNS),
          reserve: (input.returns?.reserve ?? DEFAULT_CLASS_RETURNS.reserve) * (1 + f),
          savings: (input.returns?.savings ?? DEFAULT_CLASS_RETURNS.savings) * (1 + f),
        },
      }),
    },
    {
      id: 'startingAssets',
      label: 'Tài sản đang có',
      make: (f) => {
        const b = {};
        for (const k of CLASSES) b[k] = (input.buckets?.[k] || 0) * (1 + f);
        return { ...input, buckets: b };
      },
    },
  ];

  const rows = levers
    .map((l) => {
      const r = project(l.make(step));
      const saved = r.reached ? base.monthsToFI - r.monthsToFI : null;
      return {
        id: l.id,
        label: l.label,
        note: l.note || null,
        monthsSaved: saved,
        yearsSaved: saved === null ? null : saved / 12,
        monthsToFI: r.monthsToFI,
      };
    })
    .filter((r) => r.monthsSaved !== null)
    .sort((a, b) => b.monthsSaved - a.monthsSaved);

  return { base, step, levers: rows };
}

// ── Dựng đầu vào từ snapshot ──────────────────────────────────────────────

/** Tên danh mục → nhóm. Cùng phép nhận diện với src/utils/categoryMeta.js. */
export function kindOfCategory(name = '') {
  const n = String(name);
  if (n.includes('Dự Phòng')) return 'reserve';
  if (n.includes('Tiết kiệm') || n.includes('Trái phiếu')) return 'savings';
  if (n.includes('Vàng')) return 'gold';
  if (n.includes('Bắn Tỉa')) return 'sniper';
  return 'stocks';
}

/**
 * Chuyển snapshot của backend thành đầu vào cho động cơ.
 * Giữ ở đây để chỉ có MỘT cách ánh xạ, và để test kiểm được nó.
 */
export function inputFromSnapshot(snapshot, overrides = {}) {
  const s = snapshot || {};
  const pf = s.portfolio?.byCategory || {};
  const sv = s.savings?.byCategory || {};

  const buckets = { reserve: 0, savings: 0, gold: 0, stocks: 0, sniper: 0 };
  for (const [name, v] of Object.entries(pf)) {
    buckets[kindOfCategory(name)] += v.marketValue || 0;
  }
  for (const [name, v] of Object.entries(sv)) {
    buckets[kindOfCategory(name)] += v.balance || 0;
  }
  // Tiền mặt là tiền đang chờ lệnh mua — cùng bản chất với quỹ Bắn Tỉa, và
  // cùng một điểm: nó không sinh lãi ngày nào cho tới khi được triển khai.
  buckets.sniper += s.cash?.total || 0;

  const allocations = {};
  for (const [sortOrder, rows] of Object.entries(s.phaseAllocations || {})) {
    allocations[Number(sortOrder)] = rows.map((a) => ({
      kind: kindOfCategory(a.category_name),
      name: a.category_name,
      ratio: a.ratio || 0,
    }));
  }

  const savingsRate = s.savings?.weightedRate ? s.savings.weightedRate / 100 : DEFAULT_CLASS_RETURNS.reserve;
  const returns = {
    ...DEFAULT_CLASS_RETURNS,
    reserve: savingsRate,
    savings: savingsRate,
    stocks: s.params?.EXPECTED_RETURN_STOCK ?? DEFAULT_CLASS_RETURNS.stocks,
  };

  const targetExpense = s.params?.FI_MONTHLY_EXPENSE || 0;

  return {
    buckets,
    allocations,
    contribution: s.cashflow?.inflowMean || 0,
    fiExpense: targetExpense,
    // Ngưỡng giai đoạn KHÔNG bao giờ nghe thanh trượt.
    phaseExpense: targetExpense,
    returns,
    inflation: s.params?.INFLATION_RATE ?? 0.035,
    startMonth: s.params?.START_MONTH || 1,
    startYear: s.params?.START_YEAR || new Date().getFullYear(),
    startIndex: (s.cashflow?.months || 0) + 1,
    events: [],
    ...overrides,
  };
}

/**
 * Sự kiện: một sổ có kỳ hạn đáo hạn mà không bật tái tục. Tiền rơi về mức lãi
 * không kỳ hạn cho tới khi người dùng gửi lại.
 */
export function maturityEvent(account, opts = {}) {
  const { startMonth = 1, startYear = new Date().getFullYear(), forgetRenew = false } = opts;
  if (!account?.maturity_date) return null;
  const [y, m] = String(account.maturity_date).split('-').map(Number);
  if (!y || !m) return null;
  const monthIndex = (y - startYear) * 12 + (m - startMonth) + 1;
  if (monthIndex < 1) return null;

  const amount = (account.principal || 0) + (account.accrued_interest || 0);
  const willRenew = account.auto_renew ? true : !forgetRenew;

  return {
    monthIndex,
    id: `maturity-${account.id}`,
    kind: 'maturity',
    name: account.name,
    label: monthLabel(monthIndex, startMonth, startYear),
    date: account.maturity_date,
    amount,
    autoRenew: !!account.auto_renew,
    willRenew,
    // Quên tái tục: tiền rời nhóm sổ kỳ hạn, nằm chờ ở nhóm không sinh lãi
    // cho tới khi người dùng gửi lại. Đó là toàn bộ cái giá của việc quên.
    apply: willRenew
      ? () => {}
      : (b) => {
          const from = kindOfCategory(account.category_name || '');
          const move = Math.min(b[from] || 0, amount);
          b[from] = (b[from] || 0) - move;
          b.sniper = (b.sniper || 0) + move;
        },
  };
}

/** Mọi sổ có kỳ hạn sắp đáo hạn, dựng thành sự kiện cho động cơ. */
export function maturityEvents(snapshot, { forgetRenew = false } = {}) {
  const accounts = (snapshot?.savings?.accounts || []).filter(
    (a) => a.status === 'active' && a.type !== 'liquid' && a.maturity_date
  );
  const startMonth = snapshot?.params?.START_MONTH || 1;
  const startYear = snapshot?.params?.START_YEAR || new Date().getFullYear();
  return accounts
    .map((a) => maturityEvent(a, { startMonth, startYear, forgetRenew }))
    .filter(Boolean);
}
