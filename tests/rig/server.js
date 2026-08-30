/**
 * server.js — Khởi động demo/record/demo-server.js trên DB scratch.
 *
 * KHÔNG dùng server.js gốc của dự án: server.js:22 là `new FinancialDB()` không
 * tham số nên luôn mở data/financial.sqlite, không cách nào chuyển hướng.
 * demo-server.js nhận MF_DEMO_DB/MF_DEMO_DIST/PORT qua env và tự từ chối boot
 * nếu bị trỏ vào DB thật (demo-server.js:27-32).
 */
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const env = require('./env');
const { get } = require('./http');

const SERVER_SCRIPT = path.join(env.REPO_ROOT, 'demo', 'record', 'demo-server.js');

let child = null;

async function waitForHealth({ tries = 120, delayMs = 500 } = {}) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await get('/api/demo/health', { timeout: 2000 });
      if (r.status === 200 && r.data && r.data.ok) return r.data;
    } catch {
      /* chưa lên, thử lại */
    }
    await new Promise((r) => setTimeout(r, delayMs));
  }
  throw new Error(
    `Server test không lên sau ${(tries * delayMs) / 1000}s tại ${env.BASE}`
  );
}

/** Cổng đã bị chiếm bởi thứ gì đó KHÔNG phải demo-server? Từ chối chạy. */
async function assertPortFree() {
  let r;
  try {
    r = await get('/api/demo/health', { timeout: 1500 });
  } catch {
    return; // không ai trả lời → cổng rảnh
  }
  if (r.status === 200 && r.data && r.data.db) {
    const dbPath = path.resolve(r.data.db);
    if (dbPath === path.resolve(env.DEMO_DB)) {
      console.log('[RIG] Đã có server test chạy sẵn trên đúng DB — tái sử dụng.');
      return 'reuse';
    }
  }
  const { die } = require('./guard');
  die([
    `Cổng ${env.PORT} đang bị chiếm bởi một tiến trình khác.`,
    `Phản hồi: ${String(r.raw).slice(0, 200)}`,
    'Nghi vấn: server.js hoặc npm run dev:web đang chạy → sẽ ghi vào DB THẬT.',
    'Hãy tắt nó trước khi chạy test.',
  ]);
}

async function start({ quiet = true } = {}) {
  const reuse = await assertPortFree();
  if (reuse === 'reuse') return { reused: true };

  fs.mkdirSync(path.dirname(env.DEMO_DB), { recursive: true });
  fs.mkdirSync(env.DEMO_DIST, { recursive: true });

  child = spawn(process.execPath, [SERVER_SCRIPT], {
    cwd: env.REPO_ROOT,
    env: env.serverEnv(),
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const log = [];
  child.stdout.on('data', (d) => {
    const s = d.toString();
    log.push(s);
    if (!quiet) process.stdout.write('[srv] ' + s);
  });
  child.stderr.on('data', (d) => {
    const s = d.toString();
    log.push(s);
    process.stderr.write('[srv!] ' + s);
  });
  child.on('exit', (code) => {
    if (code !== 0 && code !== null) {
      console.error(`[RIG] demo-server thoát với mã ${code}`);
      console.error(log.join(''));
    }
  });

  const health = await waitForHealth();
  console.log(`[RIG] Server test: ${env.BASE}`);
  console.log(`[RIG] DB         : ${health.db}`);
  return { reused: false, health };
}

function stop() {
  if (child && !child.killed) {
    child.kill();
    child = null;
  }
}

module.exports = { start, stop, waitForHealth };

// Cho phép chạy độc lập để debug: node tests/rig/server.js --keep-alive
if (require.main === module) {
  const { armTripwire, assertIsolated } = require('./guard');
  armTripwire();
  start({ quiet: false })
    .then(() => assertIsolated({ expectFixture: false }))
    .then(() => {
      if (!process.argv.includes('--keep-alive')) stop();
      else console.log('[RIG] Giữ server chạy. Ctrl+C để dừng.');
    })
    .catch((e) => {
      console.error(e);
      stop();
      process.exit(1);
    });
}
