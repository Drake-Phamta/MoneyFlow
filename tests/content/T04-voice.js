/**
 * T04 — Ba luật cứng về chữ, kiểm tự động trên toàn bộ src/.
 *
 *   1. Không viết về bản cũ. Người dùng mở app không cần biết trước đây thế nào.
 *   2. Không lộ chi tiết cài đặt. Không tên bảng, tên hàm, tên trường trong
 *      chữ người dùng đọc.
 *   3. Không còn chuỗi tiếng Anh lẫn vào giao diện tiếng Việt.
 *
 * Quét chuỗi trong JSX và trong lớp nội dung. Chú thích trong mã nguồn được
 * phép nói về bản cũ — chỉ chữ hiển thị mới bị cấm.
 */
const fs = require('fs');
const path = require('path');
const { group, t, ok } = require('../rig/assert');
const { REPO_ROOT } = require('../rig/env');

/** Mọi tệp có thể chứa chữ người dùng đọc. */
function sourceFiles() {
  const out = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.(jsx?|mjs)$/.test(e.name)) out.push(p);
    }
  };
  walk(path.join(REPO_ROOT, 'src'));
  return out;
}

/** Bỏ chú thích để chỉ còn chữ thật sự hiển thị. */
function stripComments(code) {
  return code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

function rel(p) {
  return path.relative(REPO_ROOT, p).split(String.fromCharCode(92)).join('/');
}

async function run() {
  group('T04 — Ba luật cứng về chữ');

  const files = sourceFiles();
  const bodies = files.map((f) => ({
    file: rel(f),
    code: stripComments(fs.readFileSync(f, 'utf8')),
  }));

  await t(
    'CT-30',
    'Không câu nào nói về bản cũ',
    [],
    () => {
      const banned = /["'`][^"'`]*\b(bản cũ|trước đây|thay vì trước|như trước kia)\b[^"'`]*["'`]/gi;
      const hits = [];
      for (const b of bodies) {
        for (const m of b.code.matchAll(banned)) {
          hits.push(`${b.file}: ${m[0].slice(0, 80)}`);
        }
      }
      ok(hits.length === 0, `${hits.length} chỗ viết về bản cũ:\n      ` + hits.join('\n      '));
    }
  );

  await t(
    'CT-31',
    'Không lộ tên bảng, tên trường hay tên hàm trong chữ hiển thị',
    [],
    () => {
      // Chỉ soi chữ nằm giữa hai thẻ JSX — đó chắc chắn là chữ hiển thị.
      const jsxText = /> *([^<>{}\n]{12,}?) *</g;
      const leak = /\b(total_inflow|actual_amount|planned_amount|goal_amount|sort_order|monthly_entries|phase_allocations|asset_types|asset_class|discrepancy_logs|savings_accounts|getFinancialSnapshot|snapshot\.)\b/;
      const hits = [];
      for (const b of bodies) {
        if (b.file.endsWith('.jsx')) {
          for (const m of b.code.matchAll(jsxText)) {
            if (leak.test(m[1])) hits.push(`${b.file}: "${m[1].trim().slice(0, 70)}"`);
          }
          continue;
        }
        // src/content/* cũng là chữ hiển thị, nhưng nằm trong chuỗi chứ không
        // giữa hai thẻ JSX — nên vòng trên không bao giờ soi tới. Đó là lý do
        // bốn dòng `check` trong checklists.js lọt lưới với nguyên tên cột.
        if (!b.file.startsWith('src/content/')) continue;
        for (const m of b.code.matchAll(/'([^'\n]{12,})'/g)) {
          if (leak.test(m[1])) hits.push(`${b.file}: "${m[1].trim().slice(0, 70)}"`);
        }
      }
      ok(hits.length === 0, `${hits.length} chỗ lộ chi tiết cài đặt:\n      ` + hits.join('\n      '));
    }
  );

  await t(
    'CT-32',
    'Ba lỗi chính tả đã lộ ra giao diện không được quay lại',
    [],
    () => {
      const typos = [
        ['Bắn Tiêd', 'Bắn Tỉa'],
        ['Bắn Tẩa', 'Bắn Tỉa'],
        ['rút được bất cứ lúc"', 'thiếu chữ "nào"'],
        ['Đầu Tư]', 'danh mục đã đổi tên thành Chứng Khoán'],
        ['vào phase', 'giao diện tiếng Việt còn lẫn chữ "phase"'],
      ];
      const hits = [];
      for (const b of bodies) {
        for (const [bad, note] of typos) {
          if (b.code.includes(bad)) hits.push(`${b.file}: "${bad}" — ${note}`);
        }
      }
      ok(hits.length === 0, hits.join('\n      '));
    }
  );

  await t(
    'CT-33',
    'Không nhãn giao diện nào còn là tiếng Anh',
    [],
    () => {
      const english = /^(Loading|Save|Cancel|Delete|Edit|Submit|Total|Amount|Date|Close|Confirm|Error|Success)\.{0,3}$/;
      const jsxText = />\s*([A-Za-z][A-Za-z .]{2,20})\s*</g;
      const hits = [];
      for (const b of bodies) {
        if (!b.file.endsWith('.jsx')) continue;
        for (const m of b.code.matchAll(jsxText)) {
          const s = m[1].trim();
          if (english.test(s)) hits.push(`${b.file}: "${s}"`);
        }
      }
      ok(hits.length === 0, `${hits.length} nhãn tiếng Anh:\n      ` + hits.join('\n      '));
    }
  );

  await t(
    'CT-34',
    'Không quảng cáo tên ngân hàng hay công ty chứng khoán kèm lời hứa',
    [],
    () => {
      // Tên thương hiệu kèm "miễn phí" là lời hứa sẽ cũ đi mà không ai sửa.
      const brandPromise = /["'`][^"'`]*\b(SSI|VPS|TCBS|Timo|MBBank|Techcombank|Vietcombank)\b[^"'`]*\b(miễn phí|không mất phí|rẻ nhất|tốt nhất)\b[^"'`]*["'`]/gi;
      const hits = [];
      for (const b of bodies) {
        for (const m of b.code.matchAll(brandPromise)) hits.push(`${b.file}: ${m[0].slice(0, 90)}`);
      }
      ok(hits.length === 0, hits.join('\n      '));
    }
  );
  await t(
    'CT-35',
    'Không màn hình nào còn dùng hộp thoại gốc của trình duyệt',
    [],
    () => {
      // alert() và confirm() gốc chỉ nhận được một chuỗi, nên câu hỏi luôn phải
      // chung chung: "Xoá sổ tiết kiệm này?" mà không nói sổ đó giữ bao nhiêu
      // tiền. Với một app quản lý tiền, đó là chỗ người dùng bấm nhầm.
      const native = /(?:^|[^.\w])(alert|confirm|prompt)\s*\(|window\.(alert|confirm|prompt)\s*\(/;
      const hits = [];
      for (const b of bodies) {
        if (!b.file.endsWith('.jsx')) continue;
        if (b.file.includes('components/ui/')) continue; // chính lớp thay thế
        const rows = b.code.split('\n');
        for (let i = 0; i < rows.length; i++) {
          const line = rows[i];
          if (line.includes('useConfirm')) continue;
          if (line.includes('await confirm')) continue;
          if (line.includes('await notify')) continue;
          if (native.test(line)) hits.push(b.file + ':' + (i + 1) + ' ' + line.trim().slice(0, 60));
        }
      }
      ok(hits.length === 0, hits.length + ' chỗ còn hộp thoại gốc: ' + hits.join(' | '));
    }
  );

  await t(
    'CT-36',
    'Lãi xanh, lỗ đỏ, hoà vốn vàng — không màn hình nào tự chia đôi',
    [],
    () => {
      // Chia đôi bằng `>= 0` thì hoà vốn bị tô xanh như đang lãi. Con số 0 nói
      // một điều khác hẳn con số dương, và người dùng cần thấy sự khác đó.
      const hits = [];
      for (const b of bodies) {
        if (!b.file.endsWith('.jsx')) continue;
        if (b.file.includes('components/ui/')) continue; // chính nơi định nghĩa
        const rows = b.code.split('\n');
        for (let i = 0; i < rows.length; i++) {
          const line = rows[i];
          if (line.includes('toneClass') || line.includes('GainLoss')) continue;
          const hasGreen = /text-emerald-\d00/.test(line);
          const hasRed = /text-red-\d00/.test(line);
          const isTernary = line.includes('?') && line.includes(':');
          // Xanh/đỏ còn dùng cho xếp hạng ngưỡng (tỷ lệ tiết kiệm đạt hay
          // chưa) và cho nhãn loại giao dịch (mua/bán). Đó là nghĩa khác, ép
          // chúng qua toneClass mới là sai. Chỉ soi biến thực sự là lãi/lỗ.
          const aboutGain = /\b(gain|profit|lai|lãi|diff|pnl|change)\w*\s*[<>=?]/i.test(line);
          if (hasGreen && hasRed && isTernary && aboutGain) {
            hits.push(b.file + ':' + (i + 1) + ' ' + line.trim().slice(0, 70));
          }
        }
      }
      ok(
        hits.length === 0,
        hits.length + ' chỗ còn tự chia đôi lãi/lỗ thay vì dùng toneClass: ' +
          hits.slice(0, 5).join(' | ')
      );
    }
  );
}

module.exports = { run };
