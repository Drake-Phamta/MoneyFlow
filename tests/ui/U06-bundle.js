/**
 * U06 — Kích thước gói tải về không được bò lại.
 *
 * Gói từng là MỘT tệp 1.076KB: mở Tổng quan cũng phải tải cả thư viện biểu đồ
 * và thư viện đọc Excel. Bộ này canh gác con số đó, vì nó chỉ phình lên chứ
 * không bao giờ tự nhỏ lại.
 */
const fs = require('fs');
const path = require('path');
const { group, t, ok, fail } = require('../rig/assert');
const env = require('../rig/env');

const KB = 1024;

/** Mọi tệp .js đã dựng, kèm kích thước. */
function bundleFiles() {
  const dir = path.join(env.SCRATCH_BUILD, 'dist', 'assets');
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.js'))
    .map((f) => ({ name: f, size: fs.statSync(path.join(dir, f)).size }));
}

/** Các tệp trình duyệt phải tải TRƯỚC khi vẽ được màn hình đầu tiên. */
function startupFiles(files) {
  const html = fs.readFileSync(path.join(env.SCRATCH_BUILD, 'dist', 'index.html'), 'utf8');
  const entry = files.filter((f) => html.includes(f.name));
  // Gói vào cùng lúc với entry: react và bộ biểu tượng nằm trong thanh bên,
  // nên chúng luôn phải có mặt ở lần vẽ đầu.
  const eager = files.filter((f) => /^(react|icons)-/.test(f.name));
  return [...new Set([...entry, ...eager])];
}

async function run() {
  group('U06 — Kích thước gói tải về');

  const files = bundleFiles();

  await t(
    'UI-B-01',
    'Không tệp nào vượt 500KB',
    [],
    () => {
      ok(files.length > 0, 'chưa dựng bản build — không có gì để đo');
      const huge = files.filter((f) => f.size > 500 * KB);
      ok(
        huge.length === 0,
        huge.map((f) => `${f.name} ${(f.size / KB).toFixed(0)}KB`).join(', ') +
          ' — tệp lớn thế này chặn màn hình đầu tiên'
      );
    }
  );

  await t(
    'UI-B-02',
    'Phần phải tải trước khi vẽ màn hình đầu dưới 450KB',
    [],
    () => {
      const startup = startupFiles(files);
      const total = startup.reduce((s, f) => s + f.size, 0);
      ok(
        total < 450 * KB,
        `phải tải ${(total / KB).toFixed(0)}KB trước khi thấy gì: ` +
          startup.map((f) => `${f.name} ${(f.size / KB).toFixed(0)}KB`).join(', ')
      );
    }
  );

  await t(
    'UI-B-03',
    'Thư viện biểu đồ và thư viện Excel không nằm trong phần tải trước',
    [],
    () => {
      const startup = startupFiles(files).map((f) => f.name);
      for (const heavy of ['charts', 'excel']) {
        const inStartup = startup.some((n) => n.startsWith(heavy + '-'));
        ok(
          !inStartup,
          `"${heavy}" nằm trong phần tải trước — nó chỉ cần khi người dùng mở ` +
            `đúng trang dùng tới nó`
        );
      }
    }
  );

  await t(
    'UI-B-04',
    'Mỗi trang là một tệp riêng, không gộp hết vào một',
    [],
    () => {
      const pages = ['Dashboard', 'CashFlowPage', 'InvestmentsPage', 'Scenarios', 'Settings'];
      const missing = pages.filter((p) => !files.some((f) => f.name.startsWith(p + '-')));
      ok(
        missing.length === 0,
        `${missing.join(', ')} không được tách thành tệp riêng — mở một trang là ` +
          `tải cả năm trang`
      );
    }
  );
}

module.exports = { run };
