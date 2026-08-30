/**
 * build.js — Dựng frontend vào thư mục scratch để server test phục vụ.
 *
 * `--emptyOutDir` chỉ an toàn vì env.js:20-33 đã từ chối chạy khi MF_TEST_ROOT
 * nằm trong repo. Đừng nới lỏng chốt chặn đó.
 *
 * Có bộ nhớ đệm theo hash nội dung src/ + các file cấu hình, nên chạy lại bộ
 * test mà không sửa gì thì bỏ qua bước build (mất ~15 giây mỗi lần).
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');
const env = require('./env');

const HASH_FILE = path.join(env.SCRATCH_BUILD, '.dist-hash');

const WATCHED_FILES = ['index.html', 'vite.config.js', 'tailwind.config.js', 'postcss.config.js'];

function hashSources() {
  const h = crypto.createHash('sha256');
  const walk = (dir) => {
    if (!fs.existsSync(dir)) return;
    for (const e of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else h.update(e.name).update(fs.readFileSync(p));
    }
  };
  walk(path.join(env.REPO_ROOT, 'src'));
  for (const f of WATCHED_FILES) {
    const p = path.join(env.REPO_ROOT, f);
    if (fs.existsSync(p)) h.update(f).update(fs.readFileSync(p));
  }
  return h.digest('hex');
}

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, {
      cwd: env.REPO_ROOT,
      shell: process.platform === 'win32',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let err = '';
    p.stdout.on('data', () => {});
    p.stderr.on('data', (d) => { err += d.toString(); });
    p.on('exit', (code) =>
      code === 0 ? resolve() : reject(new Error(`${cmd} thoát mã ${code}\n${err.slice(-1500)}`))
    );
  });
}

/** Dựng dist nếu src/ đã đổi kể từ lần dựng trước. */
async function ensureDist({ force = false } = {}) {
  const want = hashSources();
  const indexHtml = path.join(env.DEMO_DIST, 'index.html');
  const have = fs.existsSync(HASH_FILE) ? fs.readFileSync(HASH_FILE, 'utf8').trim() : null;

  if (!force && have === want && fs.existsSync(indexHtml)) {
    console.log('[BUILD] dist còn mới — bỏ qua.');
    return { built: false, dist: env.DEMO_DIST };
  }

  console.log('[BUILD] Đang dựng frontend vào thư mục test…');
  fs.mkdirSync(env.SCRATCH_BUILD, { recursive: true });
  await run('npx', ['vite', 'build', '--outDir', env.DEMO_DIST, '--emptyOutDir', '--logLevel', 'error']);

  if (!fs.existsSync(indexHtml)) {
    throw new Error(`Dựng xong nhưng không thấy ${indexHtml}`);
  }
  fs.writeFileSync(HASH_FILE, want, 'utf8');
  console.log(`[BUILD] Xong: ${env.DEMO_DIST}`);
  return { built: true, dist: env.DEMO_DIST };
}

module.exports = { ensureDist, hashSources };

if (require.main === module) {
  ensureDist({ force: process.argv.includes('--force') }).catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
}
