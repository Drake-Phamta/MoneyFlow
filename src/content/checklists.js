/**
 * checklists.js — Mục checklist: nhãn và ĐIỀU KIỆN KIỂM nằm cạnh nhau.
 *
 * Ba mục từng nói một đằng kiểm một nẻo ("cổ phiếu dividend" đếm cả crypto,
 * "thu nhập thụ động" bắt nhầm ghi chú "chốt lãi" của một lệnh bán, "tái cơ
 * cấu" bật lên khi có bất kỳ giao dịch nào). Để nhãn và điều kiện xa nhau thì
 * sớm muộn chúng lại trôi ra khỏi nhau.
 *
 *   label  chữ người dùng đọc
 *   check  app đang kiểm chính xác điều gì — hiện khi người dùng hỏi "vì sao
 *          mục này chưa tick"
 *
 * `check` phải mô tả đúng vị từ trong getChecklistStatus (electron/database.js).
 */

export const PHASE_CHECKLISTS = {
  1: [
    {
      id: 'savings_acc',
      label: 'Mở tài khoản tiết kiệm online',
      check: 'Có ít nhất một sổ tiết kiệm đang hoạt động',
    },
    {
      id: 'broker_acc',
      label: 'Mở tài khoản chứng khoán',
      check: 'Danh mục có ít nhất một tài sản',
    },
    {
      id: 'emergency_3x',
      label: 'Quỹ dự phòng ≥ 3× chi tiêu mục tiêu',
      check: 'Gốc và lãi các sổ gắn danh mục Dự Phòng ≥ 3 lần chi tiêu mục tiêu',
    },
    {
      id: 'first_etf',
      label: 'Mua mã cổ phiếu hoặc ETF đầu tiên',
      check: 'Danh mục có ít nhất một mã cổ phiếu hoặc ETF',
    },
    {
      id: 'track_money',
      label: 'Ghi chép ít nhất một tháng',
      check: 'Có ít nhất một tháng đã lưu',
    },
  ],
  2: [
    {
      id: 'emergency_done',
      label: 'Quỹ dự phòng đã đạt mục tiêu',
      check: 'Cùng ngưỡng với mục ở giai đoạn 1',
    },
    {
      id: 'diversify_stocks',
      label: 'Sở hữu ≥ 3 mã cổ phiếu hoặc ETF',
      check: 'Đếm các mã có asset_class là stock hoặc etf',
    },
    {
      id: 'gold_fund',
      label: 'Đã phân bổ tiền vào quỹ vàng',
      check: 'Danh mục Vàng có ít nhất một dòng phân bổ khác 0',
    },
    {
      id: 'sniper_ammo',
      label: 'Đã phân bổ tiền vào quỹ Bắn Tỉa',
      check: 'Danh mục Bắn Tỉa có ít nhất một dòng phân bổ khác 0',
    },
    {
      id: 'start_tktp',
      label: 'Có sổ tiết kiệm kỳ hạn đầu tiên',
      check: 'Có ít nhất một sổ loại có kỳ hạn',
    },
  ],
  3: [
    {
      id: 'gold_1chi',
      label: 'Sở hữu ≥ 1 chỉ vàng SJC',
      check: 'Tổng số lượng tài sản asset_class gold ≥ 1',
    },
    {
      id: 'dividend_stocks',
      label: 'Sở hữu ≥ 3 mã cổ phiếu riêng lẻ',
      check: 'Đếm các mã có asset_class là stock — ETF và crypto không tính',
    },
    {
      id: 'tktp_1so',
      label: 'Có ≥ 1 sổ tiết kiệm kỳ hạn',
      check: 'Có ít nhất một sổ loại có kỳ hạn',
    },
    {
      id: 'sniper_deploy',
      label: 'Đã bắn tỉa ít nhất một lần',
      check: 'Có giao dịch nào ghi chiến lược Sniper',
    },
    {
      id: 'gov_bonds',
      label: 'Sở hữu trái phiếu',
      check: 'Có giao dịch asset_class bond, hoặc sổ tiết kiệm loại trái phiếu',
    },
  ],
  4: [
    {
      id: 'passive_income',
      label: 'Lãi và cổ tức thực nhận ≥ chi tiêu mục tiêu mỗi tháng',
      check: 'Lãi ngân hàng đã ghi nhận cộng cổ tức đã ghi nhận trong 12 tháng, chia 12',
    },
    {
      id: 'balanced_portfolio',
      label: 'Danh mục có đủ cổ phiếu, vàng và sổ kỳ hạn',
      check: '≥ 3 mã cổ phiếu hoặc ETF, có vàng, và có sổ kỳ hạn',
    },
    {
      id: 'emergency_6x',
      label: 'Quỹ dự phòng ≥ 6× chi tiêu mục tiêu',
      check: 'Gốc và lãi các sổ Dự Phòng ≥ 6 lần chi tiêu mục tiêu',
    },
    {
      id: 'rebalance_quarterly',
      label: 'Cân lại danh mục trong 90 ngày',
      check: 'Trong 90 ngày có tiền vào từ 2 nhóm tài sản trở lên, hoặc có lệnh bán',
    },
  ],
};

/** Mọi id checklist app biết — dùng để bắt lệch giữa nhãn và vị từ backend. */
export function allChecklistIds() {
  return Object.values(PHASE_CHECKLISTS)
    .flat()
    .map((x) => x.id);
}
