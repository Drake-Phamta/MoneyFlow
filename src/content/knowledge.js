/**
 * knowledge.js — Phần kiến thức nền, viết lại cho khớp chính công thức app dùng.
 *
 * Bản cũ có sáu chỗ nói khác app hoặc khác chính nó:
 *   · ví dụ tính bằng 4tr/tháng trong khi chi tiêu mục tiêu của người dùng là
 *     một tham số có thật trong DB
 *   · lạm phát khi 3,5% khi 4%
 *   · lãi sổ không kỳ hạn ghi 3–4% ở đoạn trên, 0,5–1% ở đoạn dưới
 *   · phổ rủi ro xếp Dự Phòng rủi ro hơn Tiết kiệm & Trái phiếu
 *   · quy tắc 4% giải thích bằng lợi suất danh nghĩa, còn mô hình dự phóng
 *     của app chạy trên lợi suất thực
 *   · trích dẫn "phân bổ tài sản chiếm 90% kết quả"
 *
 * Mọi mục ở đây là HÀM của tham số người dùng, nên ví dụ luôn nói bằng con số
 * của chính họ.
 */
import { money, pct, vnd } from './render.js';

/** Lãi suất tham khảo thị trường VN — một bộ số, dùng chung mọi nơi. */
export const RATE_GUIDE = [
  { term: 'Không kỳ hạn', low: 0.001, high: 0.005 },
  { term: '1 tháng', low: 0.032, high: 0.042 },
  { term: '3 tháng', low: 0.038, high: 0.048 },
  { term: '6 tháng', low: 0.045, high: 0.055 },
  { term: '12 tháng', low: 0.052, high: 0.062 },
];

/** Phổ rủi ro, xếp từ thấp lên cao. Lợi suất kỳ vọng năm. */
export const RISK_SPECTRUM = [
  { name: 'Dự Phòng', low: 0.001, high: 0.005, why: 'rút được bất cứ lúc nào nên gần như không sinh lãi' },
  { name: 'Tiết kiệm & Trái phiếu', low: 0.04, high: 0.07, why: 'khoá kỳ hạn để đổi lấy lãi cao hơn' },
  { name: 'Vàng', low: 0.05, high: 0.1, why: 'giữ giá trị khi tiền mất giá, nhưng không trả cổ tức' },
  { name: 'Chứng Khoán', low: 0.08, high: 0.15, why: 'tăng trưởng dài hạn, đổi lại là biến động' },
  { name: 'Bắn Tỉa', low: 0.15, high: 0.3, why: 'chỉ mua khi thị trường sập, nên phần lớn thời gian nằm im' },
];

function rateTable(rows) {
  return rows.map((r) => `• ${r.term}: ${pct(r.low)}–${pct(r.high)}/năm`).join('\n');
}

function riskTable(rows) {
  return rows
    .map((r) => `• ${r.name} ${pct(r.low)}–${pct(r.high)}/năm — ${r.why}`)
    .join('\n');
}

/**
 * @param {object} p { targetExpense, inflation, stockReturn, savingsRate, netWorth }
 */
export function knowledgeSections(p = {}) {
  const expense = p.targetExpense || 10000000;
  const infl = p.inflation ?? 0.035;
  const stock = p.stockReturn ?? 0.115;
  const savings = p.savingsRate ?? 0.0475;

  const fiNumber = (expense * 12) / 0.04;
  const realStock = stock - infl;

  return [
    {
      id: 'compound',
      icon: 'trend-up',
      title: 'Lãi kép — vì sao bắt đầu sớm quan trọng hơn bắt đầu lớn',
      content: `Tiền sinh lãi, rồi lãi lại sinh lãi. Càng để lâu, phần lãi-của-lãi càng lớn hơn cả vốn ban đầu.

Công thức: số cuối = vốn × (1 + lãi năm)^số năm

Gửi ${money(100000000)} một lần, không nộp thêm đồng nào:
${growthRow(100000000, savings, [10, 20, 30], 'sổ tiết kiệm ' + pct(savings))}
${growthRow(100000000, stock, [10, 20, 30], 'cổ phiếu ' + pct(stock))}

Cùng ${money(100000000)}, khác nơi để, sau 30 năm chênh ${money(
        100000000 * (Math.pow(1 + stock, 30) - Math.pow(1 + savings, 30))
      )}.

Điều đáng nhớ: hoãn 5 năm không phải mất 5 năm lãi, mà mất 5 năm CUỐI — quãng lãi kép mạnh nhất.`,
    },
    {
      id: 'inflation',
      icon: 'trend-down',
      title: 'Lạm phát — khoản lỗ không ai gửi thông báo',
      content: `App này tính với lạm phát ${pct(infl)}/năm. Nghĩa là cùng một giỏ hàng:

• ${money(expense)} hôm nay → ${money(expense * Math.pow(1 + infl, 10))} sau 10 năm
• ${money(expense)} hôm nay → ${money(expense * Math.pow(1 + infl, 20))} sau 20 năm

Lợi suất thực = lợi suất danh nghĩa − lạm phát.

• Sổ tiết kiệm ${pct(savings)} − lạm phát ${pct(infl)} = ${pct(savings - infl)} thực
• Cổ phiếu ${pct(stock)} − lạm phát ${pct(infl)} = ${pct(realStock)} thực

Tiền để yên không mất về mặt con số, nhưng mỗi năm mua được ít đi ${pct(infl)}. Sổ tiết kiệm giữ được giá trị, cổ phiếu mới làm nó lớn lên.`,
    },
    {
      id: 'four_pct',
      icon: 'crosshair',
      title: `Quy tắc 4% — vì sao mốc của bạn là ${money(fiNumber)}`,
      content: `Quy tắc này đến từ Trinity Study (1998): với danh mục cổ phiếu và trái phiếu, rút 4% giá trị ban đầu mỗi năm rồi điều chỉnh theo lạm phát thì phần lớn kịch bản 30 năm không cạn tiền.

Mốc tự do tài chính = chi tiêu một năm × 25
Chi tiêu mục tiêu ${money(expense)}/tháng → ${money(expense * 12)}/năm → mốc ${vnd(fiNumber)}

Vì sao là 25 lần: rút 4% tức là rút 1/25. Phần còn lại vẫn sinh lời, và nếu lợi suất THỰC cao hơn 4% thì tài sản còn tiếp tục lớn trong lúc bạn đang rút.

Điều kiện đó không hiển nhiên. Với lạm phát ${pct(infl)}, danh mục phải đạt lợi suất danh nghĩa trên ${pct(0.04 + infl)}/năm thì quy tắc 4% mới đứng vững.

Hai điều cần biết trước khi tin con số này:
• 4% là mức an toàn cho 30 năm, không phải mức tối ưu, và không phải mức vĩnh viễn
• Nghiên cứu chạy trên thị trường Mỹ. Thị trường Việt Nam biến động mạnh hơn — rút 3,5% cho quãng nghỉ hưu dài là lựa chọn thận trọng hơn`,
    },
    {
      id: 'allocation',
      icon: 'scales',
      title: 'Phân bổ tài sản — quyết định trước khi chọn mã',
      content: `Brinson, Hood và Beebower (1986) đo 91 quỹ hưu trí và thấy chính sách phân bổ giải thích khoảng 93,6% BIẾN ĐỘNG lợi nhuận theo thời gian của một quỹ.

Đây là câu hay bị nói quá thành "phân bổ quyết định 90% lợi nhuận". Nó không nói vậy. Nó nói: lợi nhuận của bạn lên xuống chủ yếu vì bạn đang giữ loại tài sản nào, chứ không vì bạn chọn mã nào trong loại đó.

Phổ rủi ro, thấp lên cao:
${riskTable(RISK_SPECTRUM)}

Năm nhóm này bù nhau ở những lúc khác nhau:
• Dự Phòng và Tiết kiệm giữ cho bạn không phải bán tài sản lúc thị trường xấu
• Chứng Khoán làm tài sản lớn lên
• Vàng thường tăng đúng lúc niềm tin vào tiền giấy giảm
• Bắn Tỉa biến một đợt sập thành cơ hội thay vì tai nạn

Cân lại mỗi quý: nhóm nào lệch quá 5 điểm phần trăm so với tỷ lệ mục tiêu thì hướng tiền mới vào nhóm đang thiếu, thay vì bán nhóm đang thừa.`,
    },
    {
      id: 'savings_strategy',
      icon: 'bank',
      title: 'Thang bậc kỳ hạn — có tiền đáo hạn mỗi quý',
      content: `Sổ càng dài lãi càng cao, nhưng tiền càng bị khoá lâu. Thang bậc lấy cả hai.

Chia tiền thành nhiều sổ, kỳ hạn lệch nhau. Sổ nào đáo hạn thì gửi lại ở kỳ hạn dài nhất. Sau một vòng, quý nào cũng có một sổ đáo hạn mà lãi vẫn là lãi kỳ hạn dài.

Ví dụ với ${money(expense * 3)} — đúng bằng quỹ dự phòng 3 tháng của bạn:
• ${money(expense)} không kỳ hạn — dùng khi có việc gấp
• ${money(expense)} kỳ hạn 3 tháng
• ${money(expense)} kỳ hạn 6 tháng

Lãi suất tham khảo:
${rateTable(RATE_GUIDE)}

Sổ không kỳ hạn gần như không có lãi. Nó nằm đó để bạn không phải phá sổ kỳ hạn — phá sổ là mất toàn bộ lãi đã tích.

Gửi trực tuyến thường nhỉnh hơn tại quầy khoảng 0,5 điểm phần trăm.`,
    },
  ];
}

/** "sổ tiết kiệm 4,8%: 10 năm 159,7tr · 20 năm 255,1tr · 30 năm 407,6tr" */
function growthRow(principal, rate, years, label) {
  const parts = years.map((y) => `${y} năm ${money(principal * Math.pow(1 + rate, y))}`);
  return `• ${label}: ${parts.join(' · ')}`;
}
