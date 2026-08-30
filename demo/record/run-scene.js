/**
 * run-scene.js — Chạy một scene: dựng ngữ cảnh, quay, dàn nhịp theo lời thoại, encode.
 *
 * Điểm mấu chốt: SRT của edge-tts cho mốc bắt đầu của TỪNG CÂU thoại.
 * Scene dùng ctx.atCue(n) để chờ đúng lúc câu n bắt đầu rồi mới thao tác,
 * nên hành động trên màn hình khớp với những gì đang được đọc — không phải canh tay.
 *
 * Chạy: node demo/record/run-scene.js 03-networth
 *       node demo/record/run-scene.js all
 */
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const { Recorder, sleep, ROOT } = require('./harness');

const BUILD = path.join(ROOT, 'demo/build');
const SNAP_DIR = path.join(BUILD, 'db-snapshots');
const SEEDED = path.join(SNAP_DIR, 'after-00-seeded.sqlite');
const DEMO_DB = path.join(BUILD, 'demo.sqlite');
const BASE = 'http://localhost:3001';

/** Mốc bắt đầu (giây) của từng câu thoại, lấy từ SRT. */
function parseCues(srtFile) {
  if (!fs.existsSync(srtFile)) return [];
  const t = s => {
    const [h, m, rest] = s.split(':');
    const [sec, ms] = rest.split(',');
    return +h * 3600 + +m * 60 + +sec + +ms / 1000;
  };
  return [...fs.readFileSync(srtFile, 'utf8').matchAll(/(\d{2}:\d{2}:\d{2},\d{3}) --> /g)].map(m => t(m[1]));
}

async function serverUp() {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(BASE + '/api/demo/health');
      if (r.ok) return (await r.json());
    } catch (e) {}
    await sleep(500);
  }
  throw new Error('demo-server không lên ở cổng 3001 — chạy: node demo/record/demo-server.js');
}

async function runScene(id, { restore = null } = {}) {
  const timing = JSON.parse(fs.readFileSync(path.join(BUILD, 'timing.json'), 'utf8'));
  const t = timing.scenes.find(s => s.id === id);
  if (!t) throw new Error(`Không có scene "${id}" trong timing.json`);

  const mod = require(path.join(__dirname, 'scenes', id + '.js'));
  const cues = parseCues(path.join(BUILD, 'vo', id + '.srt'));

  const health = await serverUp();
  if (!/demo[\\/]build[\\/]demo\.sqlite$/.test(health.db)) {
    throw new Error(`TỪ CHỐI QUAY: server không chạy trên DB demo (${health.db})`);
  }

  console.log(`\n▶ ${id} — ${t.title}  (${t.duration.toFixed(2)}s, ${cues.length} câu)`);

  const rec = new Recorder({ name: id });
  await rec.launch();

  // ── ngữ cảnh dàn nhịp ──────────────────────────────────────────────
  let t0 = 0;
  const elapsed = () => (Date.now() - t0) / 1000;
  const ctx = {
    ...t,
    cues,
    BASE,
    /** chờ tới mốc giây tuyệt đối trong scene */
    async at(sec) {
      const wait = sec - elapsed();
      if (wait > 0) await sleep(wait * 1000);
      else if (wait < -0.6) console.warn(`    ! trễ ${(-wait).toFixed(2)}s ở mốc ${sec.toFixed(2)}s`);
    },
    /** chờ tới lúc câu thoại thứ n (1-based) bắt đầu */
    async atCue(n) { await ctx.at(t.padStart + (cues[n - 1] ?? 0)); },
    /** chờ hết scene */
    async end() { await ctx.at(t.duration); },
    elapsed,
  };

  await mod.setup(rec, ctx);          // vào đúng trang, chờ render — TRƯỚC khi bấm máy
  await rec.startCapture();
  t0 = Date.now();
  await mod.perform(rec, ctx);
  await ctx.end();
  await rec.stopCapture();

  const out = path.join(BUILD, 'scenes', id + '.mp4');
  const info = await rec.encode(out, { ...(mod.fade || {}), exact: t.duration });
  console.log(`  ✓ ${info.frames} frame · ${info.seconds.toFixed(2)}s (đích ${t.duration.toFixed(2)}s) → ${path.relative(ROOT, out)}`);

  await rec.close();
  if (!process.env.KEEP_FRAMES) await rec.cleanupFrames();

  // Scene có ghi vào DB thì lưu snapshot để quay lại scene sau này không lệch trạng thái
  if (mod.mutatesDb) {
    await fsp.mkdir(SNAP_DIR, { recursive: true });
    const snap = path.join(SNAP_DIR, `after-${id}.sqlite`);
    await fsp.copyFile(DEMO_DB, snap);
    console.log(`  · snapshot DB → ${path.basename(snap)}`);
  }
  return info;
}

async function main() {
  const arg = process.argv[2];
  if (!arg) { console.error('Cần tên scene, hoặc "all".'); process.exit(1); }

  const timing = JSON.parse(fs.readFileSync(path.join(BUILD, 'timing.json'), 'utf8'));
  const ids = arg === 'all' ? timing.scenes.map(s => s.id) : [arg];

  if (arg === 'all') {
    if (!fs.existsSync(SEEDED)) throw new Error('Chưa có snapshot DB gốc — chạy seed trước.');
    console.log('· khôi phục DB về trạng thái vừa seed (scene 05 và 07 sẽ ghi vào DB)');
    console.log('  ! nhớ restart demo-server sau bước này để nó nạp lại file');
  }

  let total = 0;
  for (const id of ids) total += (await runScene(id)).seconds;
  console.log(`\nTổng ${ids.length} scene: ${total.toFixed(1)}s`);
}

module.exports = { runScene, parseCues };
if (require.main === module) main().catch(e => { console.error('\nSCENE FAILED:', e.message); process.exit(1); });
