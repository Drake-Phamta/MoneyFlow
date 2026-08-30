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
      const leak = /\b(total_inflow|actual_amount|planned_amount|goal_amount|sort_order|monthly_entries|phase_allocations|asset_types|discrepancy_logs|savings_accounts|getFinancialSnapshot|snapshot\.)\b/;
      const hits = [];
      for (const b of bodies) {
        if (!b.file.endsWith('.jsx')) continue;
        for (const m of b.code.matchAll(jsxText)) {
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
}

module.exports = { run };
