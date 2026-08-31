/**
 * phases.js — Hướng dẫn từng giai đoạn, SINH RA từ dữ liệu chứ không chép tay.
 *
 * Danh sách phần trăm phân bổ từng là nguồn lỗi nội dung lớn nhất: nó nằm
 * trong ba bản guidance chép tay trong DB, còn tỷ lệ thật nằm ở bảng
 * phase_allocations. Đổi một tỷ lệ hoặc đổi tên một danh mục là hai bên lệch
 * nhau ngay, và không có gì bắt được.
 *
 * Ở đây các dòng phân bổ sinh thẳng từ phase_allocations và categories.name,
 * nên lớp lỗi đó không thể tái diễn.
 */
import { money, pct, lines } from './render.js';
import { actionFor, kindOf } from '../utils/categoryMeta.js';

/**
 * Bậc triển khai Bắn Tỉa. Cùng bộ số với SniperPlaybook và với ngưỡng cảnh báo
 * giá ở backend — hướng dẫn không được hứa một tỷ lệ khác cái nút thật sự làm.
 */
export const SNIPER_TIERS = [
  { level: 1, from: 0.15, to: 0.25, deploy: 0.3 },
  { level: 2, from: 0.25, to: 0.35, deploy: 0.3 },
  { level: 3, from: 0.35, to: null, deploy: 0.4 },
];

export const SNIPER_TRIGGER = SNIPER_TIERS[0].from;

/** Tên và một câu nói giai đoạn này là về cái gì. */
export const PHASE_META = {
  1: {
    name: 'Giai đoạn 1: Nền tảng',
    about: 'Dựng quỹ dự phòng và thói quen ghi chép. Chưa vội tăng trưởng.',
  },
  2: {
    name: 'Giai đoạn 2: Tăng tốc',
    about: 'Dự phòng đã đủ. Tiền mới chảy sang tăng trưởng.',
  },
  3: {
    name: 'Giai đoạn 3: Tích lũy',
    about: 'Đa dạng hoá và bắt đầu xây dòng thu nhập không phụ thuộc lương.',
  },
  4: {
    name: 'Giai đoạn 4: Thu nhập thụ động',
    about: 'Lợi nhuận từ tài sản gánh dần phần chi tiêu hằng tháng.',
  },
};

/** Việc cụ thể cần làm ở mỗi giai đoạn — ngắn, có ngưỡng, không lời khuyên chung chung. */
const ACTIONS = {
  1: (ctx) => [
    'Mở tài khoản tiết kiệm online',
    'Mở tài khoản chứng khoán',
    'Dồn cho quỹ dự phòng trước — đủ ngưỡng rồi hãy nghĩ tới chứng khoán',
    'Gộp đủ vài triệu hãy đặt một lệnh — phí tối thiểu ăn hết những lệnh quá nhỏ',
    'Ghi lại mọi tháng — không có số liệu thì không có gì để tính',
  ],
  2: (ctx) => [
    'Mua cổ phiếu hoặc ETF đều đặn mỗi tháng',
    ctx.goldUnitPrice
      ? `Gom tiền vàng qua sổ kỳ hạn ngắn, đủ ${money(ctx.goldUnitPrice)} thì mua 1 chỉ SJC`
      : 'Gom tiền vàng qua sổ kỳ hạn ngắn tới khi đủ mua 1 chỉ SJC',
    `Bắn Tỉa: chờ mức giảm từ đỉnh vượt ${pct(SNIPER_TRIGGER, 0)} mới triển khai`,
    'Cân lại danh mục mỗi quý',
  ],
  3: (ctx) => [
    'Mỗi lần mua thêm, ưu tiên mã có trả cổ tức đều vài năm liền',
    'Mua 1–2 chỉ SJC mỗi năm',
    'Cân nhắc trái phiếu chính phủ hoặc chứng chỉ tiền gửi — thứ tra được lãi suất và kỳ hạn trước khi mua',
    sniperLadder(),
    'Cân lại danh mục mỗi quý',
  ],
  4: (ctx) => [
    'Ưu tiên tài sản trả tiền đều: cổ tức, lãi trái phiếu, lãi sổ kỳ hạn dài',
    'Giữ tỷ lệ vàng, mua đều, không đầu cơ',
    `Quỹ dự phòng nâng lên 6× chi tiêu mục tiêu (${money(6 * (ctx.targetExpense || 0))})`,
    'Cân lại danh mục mỗi quý',
  ],
};

// Nguyên tắc phải LÀM THEO ĐƯỢC. Bốn dòng ở đây từng là châm ngôn — "Giữ được
// tài sản khó hơn kiếm được nó" đọc xuôi tai nhưng không bảo được ai làm gì.
const PRINCIPLES = {
  1: [
    'Không rút dự phòng để đầu tư, kể cả khi thị trường đang giảm sâu',
    'Ghi đủ mọi tháng — thiếu một tháng là mọi con số trung bình đều lệch',
  ],
  2: [
    'Vẫn mua đều mỗi tháng bằng phần đã chia; quỹ Bắn Tỉa là khoản riêng, ' +
      'chờ giá giảm sâu mới dùng tới',
  ],
  3: [
    'Không để một mã chiếm quá một phần tư phần chứng khoán',
  ],
  4: [
    'Chỉ tiêu phần lợi nhuận nhận được bằng tiền mặt — cổ tức, lãi sổ — ' +
      'không bán bớt tài sản để tiêu',
  ],
};

/** "Sập 15–25% bắn 30% · 25–35% bắn 30% · trên 35% bắn 40%" */
function sniperLadder() {
  const parts = SNIPER_TIERS.map((t) =>
    t.to
      ? `${pct(t.from, 0)}–${pct(t.to, 0)} bắn ${pct(t.deploy, 0)}`
      : `trên ${pct(t.from, 0)} bắn ${pct(t.deploy, 0)}`
  );
  return `Bắn Tỉa theo bậc: ${parts.join(' · ')}`;
}

/**
 * Hướng dẫn cho một giai đoạn.
 *
 * @param {object}   phase   khối phase của snapshot (sortOrder, goalMultiplier…)
 * @param {Array}    allocs  phase_allocations của chính giai đoạn đó
 * @param {object}   ctx     { targetExpense, goldUnitPrice }
 */
export function buildPhaseGuidance(phase, allocs = [], ctx = {}) {
  if (!phase) return null;
  const sort = phase.sortOrder ?? phase.sort_order;
  const meta = PHASE_META[sort] || { name: phase.name, about: '' };
  const targetExpense = ctx.targetExpense || 0;

  const allocation = [...allocs]
    .sort((a, b) => (b.ratio || 0) - (a.ratio || 0))
    .filter((a) => (a.ratio || 0) > 0)
    .map((a) => ({
      name: a.category_name,
      kind: kindOf(a.category_name),
      ratio: a.ratio || 0,
      action: actionFor(a.category_name, { ...ctx, sniperTrigger: SNIPER_TRIGGER }),
    }));

  const multiplier = phase.goalMultiplier ?? phase.goal_multiplier ?? 0;
  const goal = multiplier * targetExpense;
  const exit =
    multiplier > 0
      ? sort === 1
        ? `Lên giai đoạn sau khi quỹ dự phòng đạt ${multiplier}× chi tiêu mục tiêu — ${money(goal)}`
        : `Lên giai đoạn sau khi tổng tài sản đạt ${multiplier}× chi tiêu mục tiêu — ${money(goal)}`
      : 'Đây là giai đoạn cuối của lộ trình.';

  return {
    name: meta.name,
    about: meta.about,
    allocation,
    actions: (ACTIONS[sort] || (() => []))({ ...ctx, targetExpense }),
    exit,
    principles: PRINCIPLES[sort] || [],
  };
}

/** Bản chữ thuần, dùng cho chỗ đang render whitespace-pre-line. */
export function guidanceText(g) {
  if (!g) return '';
  return lines(
    g.about,
    '',
    'Tiền nhàn rỗi mỗi tháng chia thế nào:',
    g.allocation.map((a) => `• ${pct(a.ratio, 0)} → ${a.name} — ${a.action}`),
    '',
    'Việc cần làm:',
    g.actions.map((x, i) => `${i + 1}. ${x}`),
    '',
    g.exit,
    g.principles.length ? '' : null,
    g.principles.map((p) => `• ${p}`)
  );
}

/**
 * Hướng dẫn riêng cho trang Tiết kiệm: với mỗi danh mục gửi ngân hàng, nên
 * dùng loại sổ nào. Sinh từ chính phase_allocations nên tỷ lệ luôn khớp.
 */
export function buildSavingsGuidance(phase, allocs = [], ctx = {}) {
  if (!phase) return null;
  const sort = phase.sortOrder ?? phase.sort_order;
  const targetExpense = ctx.targetExpense || 0;
  const reserveMultiple = sort >= 3 ? 6 : 3;

  const HOW = {
    reserve: {
      1: 'Sổ không kỳ hạn, hoặc sổ 1 tháng xoay vòng. Ưu tiên rút được ngay.',
      2: 'Giữ nguyên cách gửi. Nạp thêm khi chi tiêu mục tiêu tăng.',
      3: 'Giữ nguyên cách gửi, nâng dần lên 6× chi tiêu mục tiêu.',
      4: 'Giữ nguyên cách gửi. Đây là lớp đệm, không phải chỗ kiếm lãi.',
    },
    savings: {
      1: 'Chưa cần vội. Dự phòng đủ đã rồi tính.',
      2: 'Sổ 3–6 tháng. Đáo hạn thì gửi lại kỳ hạn dài hơn.',
      3: 'Thang bậc 3, 6 và 12 tháng — quý nào cũng có một sổ đáo hạn.',
      4: 'Kỳ hạn 12 tháng trở lên, hoặc trái phiếu. Ưu tiên dòng tiền đều.',
    },
    gold: {
      1: 'Chưa cần vội.',
      2: 'Gom qua sổ kỳ hạn ngắn, căn ngày đáo hạn khớp lúc đủ tiền mua.',
      3: 'Tiếp tục gom. Mua 1–2 chỉ mỗi năm.',
      4: 'Giữ tỷ lệ. Mua đều, không đầu cơ.',
    },
  };

  const buckets = [...allocs]
    .filter((a) => ['reserve', 'savings', 'gold'].includes(kindOf(a.category_name)))
    .filter((a) => (a.ratio || 0) > 0)
    .sort((a, b) => (b.ratio || 0) - (a.ratio || 0))
    .map((a) => {
      const kind = kindOf(a.category_name);
      return {
        kind,
        name: a.category_name,
        ratio: a.ratio || 0,
        how: HOW[kind]?.[sort] || '',
        target:
          kind === 'reserve' && targetExpense
            ? `Mục tiêu ${reserveMultiple}× chi tiêu mục tiêu — ${money(reserveMultiple * targetExpense)}`
            : kind === 'gold' && ctx.goldUnitPrice
              ? `Đủ ${money(ctx.goldUnitPrice)} thì mua 1 chỉ SJC`
              : null,
      };
    });

  return { name: PHASE_META[sort]?.name || phase.name, buckets };
}
