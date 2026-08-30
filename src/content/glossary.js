/**
 * glossary.js — Mỗi khái niệm tiền bạc trong app định nghĩa đúng MỘT lần.
 *
 * Nhãn, chú thích và công thức của cùng một khái niệm nằm trong cùng một bản
 * ghi. Trước đây ba thứ đó nằm ba nơi nên nhãn nói một đằng, con số bên cạnh
 * lại là một đại lượng khác.
 *
 *   label   nhãn hiện trên màn hình
 *   hint    câu chú thích ngắn, chỉ có khi nhãn không tự đủ nghĩa
 *   formula cách tính, viết bằng chính từ ngữ người dùng đọc được
 */

export const TERMS = {
  netWorth: {
    label: 'Tổng tài sản',
    hint: 'Mọi thứ bạn đang sở hữu, quy ra tiền hôm nay.',
    formula: 'Tiền mặt + giá thị trường danh mục + gốc và lãi tiết kiệm',
  },
  liquidity: {
    label: 'Thanh khoản',
    hint: 'Rút được ngay hôm nay mà không mất lãi.',
    formula: 'Tiền mặt + sổ không kỳ hạn. Sổ có kỳ hạn không tính.',
  },
  cashTotal: {
    label: 'Tiền mặt',
    hint: 'Tiền đã kiếm được nhưng chưa nằm trong tài sản nào.',
    formula: 'Chưa chia cho danh mục nào + đã chia nhưng chưa mua',
  },
  cashUnallocated: {
    label: 'Chưa chia cho danh mục nào',
    formula: 'Tiền nhàn rỗi đã ghi nhận − tổng đã phân bổ − phần bù cho tháng chi vượt thu',
  },
  cashAwaiting: {
    label: 'Đã chia, chờ lệnh mua',
    hint: 'Đã dành cho một danh mục nhưng lệnh mua chưa vào.',
    formula: 'Tiền chia cho các danh mục thị trường − số đã giải ngân',
  },
  idleMoney: {
    label: 'Tiền nhàn rỗi',
    hint: 'Phần còn lại sau khi trừ chi tiêu — đây là tiền để phân bổ.',
    formula: 'Thu nhập + thưởng − chi tiêu, tính theo từng tháng',
  },
  deployed: {
    label: 'Đã giải ngân',
    hint: 'Tiền thật đã rời túi, đã gồm phí môi giới.',
    formula: 'Σ (tiền mua + phí) − Σ (tiền bán − phí)',
  },
  marketValue: {
    label: 'Giá thị trường',
    hint: 'Danh mục bán hết hôm nay được bao nhiêu.',
    formula: 'Σ (số lượng × giá hiện tại)',
  },
  savingsBalance: {
    label: 'Số dư tiết kiệm',
    formula: 'Gốc + lãi đã tính tới hôm nay',
  },
  projectedInterest: {
    label: 'Lãi dự kiến',
    hint: 'Lãi sẽ nhận nếu giữ sổ tới ngày đáo hạn.',
    formula: 'Gốc × lãi suất × số ngày còn lại ÷ 365',
  },
  accruedInterest: {
    label: 'Lãi đã tính',
    hint: 'Lãi tích tới hôm nay, chưa nhất thiết đã về tài khoản.',
    formula: 'Gốc × lãi suất × số ngày đã gửi ÷ 365',
  },
  reserveBalance: {
    label: 'Quỹ dự phòng',
    hint: 'Tiền để sống khi mất thu nhập. Không dùng để đầu tư.',
    formula: 'Gốc + lãi của các sổ gắn danh mục Dự Phòng',
  },
  fiNumber: {
    label: 'Mốc tự do tài chính',
    hint: 'Đủ số này thì lợi nhuận nuôi được chi tiêu, không cần đi làm.',
    formula: 'Chi tiêu mục tiêu × 12 ÷ 4%',
  },
  fiRatio: {
    label: 'Tỷ lệ tự do tài chính',
    formula: 'Tổng tài sản ÷ mốc tự do tài chính',
  },
  savingsRate: {
    label: 'Tỷ lệ để dành',
    formula: 'Tiền nhàn rỗi ÷ (thu nhập + thưởng)',
  },
  investRate: {
    label: 'Tỷ lệ đầu tư',
    hint: 'Phần tiền nhàn rỗi đã đi vào thị trường.',
    formula: 'Đã giải ngân ÷ tổng tiền nhàn rỗi',
  },
  targetExpense: {
    label: 'Chi tiêu mục tiêu',
    hint: 'Mức chi bạn muốn duy trì khi tự do tài chính, không phải mức đang chi.',
  },
  sniperAvailable: {
    label: 'Đạn còn lại',
    hint: 'Tiền mặt đang chờ thị trường sập.',
    formula: 'Đã chia cho Bắn Tỉa − đã bắn',
  },
  drawdown: {
    label: 'Mức giảm từ đỉnh',
    formula: '(Giá đỉnh − giá hiện tại) ÷ giá đỉnh',
  },
};

/** Nhãn của một khái niệm. Không có thì trả về chính khoá để lỗi lộ ra ngay. */
export function label(key) {
  return TERMS[key]?.label ?? key;
}

/**
 * Chú thích đầy đủ cho một khái niệm: câu giải thích rồi tới công thức.
 * Nhãn nào tự đủ nghĩa thì không có `hint`, và chỉ hiện công thức.
 */
export function tooltip(key) {
  const t = TERMS[key];
  if (!t) return '';
  return [t.hint, t.formula].filter(Boolean).join(' ');
}
