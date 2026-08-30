/**
 * U07 — Bản đã dựng trong dist/ phải mới hơn mã nguồn.
 *
 * `node server.js` phục vụ thẳng thư mục dist/ mà không dựng lại. Nếu dist cũ
 * hơn src thì người dùng mở app ra và thấy một bản từ lần dựng gần nhất — code
 * đã sửa nhưng màn hình không đổi, và không có lời cảnh báo nào.
 *
 * Đây không phải giả thuyết: nó đã xảy ra. Suốt một buổi làm việc, mọi thay
 * đổi chỉ được dựng vào thư mục test, còn dist/ của dự án đứng yên từ sáng.
 */
const fs = require('fs');
const path = require('path');
const { group, t, ok } = require('../rig/assert');
const { REPO_ROOT } = require('../rig/env');

/** Thời điểm sửa gần nhất trong một cây thư mục. */
function newestMtime(dir, exts) {
  let newest = 0;
  let newestFile = null;
  const walk = (d) => {
    let entries;
    try {
      entries = fs.readdirSync(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) {
        walk(p);
      } else if (exts.some((x) => e.name.endsWith(x))) {
        const m = fs.statSync(p).mtimeMs;
        if (m > newest) {
          newest = m;
          newestFile = p;
        }
      }
    }
  };
  walk(dir);
  return { newest, newestFile };
}

function rel(p) {
  return p ? path.relative(REPO_ROOT, p).split(path.sep).join('/') : '—';
}

async function run() {
  group('U07 — Bản dựng không được cũ hơn mã nguồn');

  const distDir = path.join(REPO_ROOT, 'dist');

  await t(
    'UI-S-01',
    'dist/ của dự án tồn tại — không có thì mở app ra là trang trắng',
    [],
    () => {
      ok(
        fs.existsSync(path.join(distDir, 'index.html')),
        'không có dist/index.html. `node server.js` sẽ phục vụ một thư mục rỗng.'
      );
    }
  );

  await t(
    'UI-S-02',
    'dist/ mới hơn mọi tệp nguồn và mọi tệp cấu hình',
    [],
    () => {
      if (!fs.existsSync(distDir)) return;

      const src = newestMtime(path.join(REPO_ROOT, 'src'), ['.js', '.jsx', '.mjs', '.css']);
      const built = newestMtime(distDir, ['.js', '.css', '.html']);

      let configNewest = 0;
      let configFile = null;
      for (const f of ['vite.config.js', 'tailwind.config.js', 'index.html', 'package.json']) {
        const p = path.join(REPO_ROOT, f);
        if (!fs.existsSync(p)) continue;
        const m = fs.statSync(p).mtimeMs;
        if (m > configNewest) {
          configNewest = m;
          configFile = p;
        }
      }

      const newestInput = Math.max(src.newest, configNewest);
      const newestInputFile = src.newest >= configNewest ? src.newestFile : configFile;
      const behindMin = (newestInput - built.newest) / 60000;

      ok(
        built.newest >= newestInput,
        `dist/ dựng lúc ${new Date(built.newest).toLocaleString('vi-VN')} nhưng ` +
          `${rel(newestInputFile)} sửa lúc ${new Date(newestInput).toLocaleString('vi-VN')} — ` +
          `chậm ${behindMin.toFixed(0)} phút. Chạy \`npm run build\` hoặc \`npx vite build\`; ` +
          `không thì app phục vụ bản cũ mà không báo gì.`
      );
    }
  );

  await t(
    'UI-S-03',
    'Mọi tệp mà index.html trỏ tới đều có thật',
    [],
    () => {
      const idx = path.join(distDir, 'index.html');
      if (!fs.existsSync(idx)) return;
      const html = fs.readFileSync(idx, 'utf8');

      const refs = [...html.matchAll(/(?:src|href)="\.?\/?(assets\/[^"]+)"/g)].map((m) => m[1]);
      ok(refs.length > 0, 'index.html không trỏ tới tệp assets nào');

      const missing = refs.filter((r) => !fs.existsSync(path.join(distDir, r)));
      ok(
        missing.length === 0,
        `index.html trỏ tới tệp không tồn tại: ${missing.join(', ')} — ` +
          `dist/ đang lẫn hai lần dựng khác nhau`
      );
    }
  );
}

module.exports = { run };
