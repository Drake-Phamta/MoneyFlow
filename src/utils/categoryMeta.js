/**
 * categoryMeta.js — Việc cần làm với mỗi danh mục, viết đúng một lần.
 *
 * Trang nhập liệu và trang lộ trình đều cần câu "tiền vào danh mục này thì
 * làm gì". Trước đây mỗi trang tự chép một bản, nên đổi cách làm ở một chỗ là
 * chỗ kia nói khác.
 *
 * Nhận diện danh mục theo TÊN vì bảng categories cho phép người dùng đổi tên;
 * so theo id thì thêm một danh mục mới là mất hướng dẫn.
 */

export const RESERVE = 'Dự Phòng';
export const SAVINGS = 'Tiết kiệm';
export const GOLD = 'Vàng';
export const STOCKS = 'Chứng Khoán';
export const SNIPER = 'Bắn Tỉa';

/** Nhóm chuẩn của một danh mục, suy từ tên. */
export function kindOf(name = '') {
  const n = String(name);
  if (n.includes(RESERVE)) return 'reserve';
  if (n.includes(SAVINGS) || n.includes('Trái phiếu')) return 'savings';
  if (n.includes(GOLD)) return 'gold';
  if (n.includes(SNIPER)) return 'sniper';
  if (n.includes('Chứng') || n.includes('Đầu tư') || n.includes('Đầu Tư')) return 'stocks';
  return 'other';
}

/**
 * Việc cần làm với tiền vừa chia vào danh mục này.
 * `ctx.goldUnitPrice` là giá 1 chỉ SJC hiện tại — truyền vào để câu chữ không
 * đóng băng ở một mức giá cũ.
 */
export function actionFor(name, ctx = {}) {
  switch (kindOf(name)) {
    case 'reserve':
      return 'Gửi vào sổ không kỳ hạn — rút được bất cứ lúc nào';
    case 'savings':
      return 'Gửi vào sổ kỳ hạn 3–6 tháng — lãi cao hơn';
    case 'gold':
      return ctx.goldUnitPrice
        ? `Tích lũy. Đủ ${formatShort(ctx.goldUnitPrice)} thì mua 1 chỉ SJC`
        : 'Tích lũy tới khi đủ mua 1 chỉ SJC';
    case 'stocks':
      return 'Mua ETF hoặc cổ phiếu đều đặn trong tháng';
    case 'sniper':
      return `Giữ tiền mặt. Chỉ dùng khi thị trường sập > ${Math.round((ctx.sniperTrigger ?? 0.15) * 100)}%`;
    default:
      return 'Thực hiện theo kế hoạch';
  }
}

/** Nơi đi tới để thực hiện việc trên. */
export function linkFor(name) {
  const k = kindOf(name);
  if (k === 'reserve' || k === 'savings' || k === 'gold') return '/investments?tab=savings';
  if (k === 'sniper') return '/investments?tab=sniper';
  return '/investments?tab=portfolio';
}

function formatShort(n) {
  const v = Number(n) || 0;
  if (v >= 1e6) return `${String(Number((v / 1e6).toFixed(1))).replace('.', ',')}tr`;
  return new Intl.NumberFormat('vi-VN').format(Math.round(v)) + 'đ';
}
