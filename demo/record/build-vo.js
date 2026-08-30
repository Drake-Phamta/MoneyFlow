/**
 * build-vo.js — Pass 1: sinh voiceover + phụ đề + bảng thời lượng.
 *
 * edge-tts trả kèm SRT theo word-boundary nên phụ đề khớp giọng chính xác,
 * không phải canh tay. Đo độ dài thật bằng ffprobe rồi ghi timing.json —
 * lúc quay, mỗi scene đọc thời lượng được cấp và tự dàn nhịp cho đủ,
 * nên video LUÔN dài hơn tiếng, không bao giờ lệch mồm.
 *
 * Chạy: node demo/record/build-vo.js [--voice vi-VN-NamMinhNeural]
 */
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');

const ROOT = path.join(__dirname, '../..');
const SCRIPT = path.join(ROOT, 'demo/script.json');
const VO_DIR = path.join(ROOT, 'demo/build/vo');

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { maxBuffer: 32 * 1024 * 1024 }, (err, stdout, stderr) =>
      err ? reject(new Error(`${cmd}: ${stderr || err.message}`)) : resolve(stdout));
  });
}

async function duration(file) {
  const out = await run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file]);
  return parseFloat(out.trim());
}

async function main() {
  const cfg = JSON.parse(fs.readFileSync(SCRIPT, 'utf8'));
  const vIdx = process.argv.indexOf('--voice');
  const voice = vIdx > -1 ? process.argv[vIdx + 1] : cfg.voice;
  fs.mkdirSync(VO_DIR, { recursive: true });

  console.log(`Giọng: ${voice}   Tốc độ: ${cfg.rate}\n`);
  const timing = { voice, rate: cfg.rate, scenes: [] };
  let total = 0;

  for (const s of cfg.scenes) {
    const mp3 = path.join(VO_DIR, `${s.id}.mp3`);
    const srt = path.join(VO_DIR, `${s.id}.srt`);
    await run('python', ['-m', 'edge_tts', '--voice', voice, `--rate=${cfg.rate}`,
      '--text', s.vo, '--write-media', mp3, '--write-subtitles', srt]);

    const voDur = await duration(mp3);
    const sceneDur = +(s.padStart + voDur + s.padEnd).toFixed(3);
    timing.scenes.push({ id: s.id, title: s.title, vo: voDur, padStart: s.padStart, padEnd: s.padEnd, duration: sceneDur });
    total += sceneDur;
    console.log(`  ${s.id.padEnd(14)} vo ${voDur.toFixed(2)}s  → scene ${sceneDur.toFixed(2)}s`);
  }

  timing.total = +total.toFixed(3);
  fs.writeFileSync(path.join(ROOT, 'demo/build/timing.json'), JSON.stringify(timing, null, 2), 'utf8');

  const mm = Math.floor(total / 60), ss = Math.round(total % 60);
  console.log(`\nTỔNG: ${total.toFixed(1)}s  (${mm}:${String(ss).padStart(2, '0')})`);
  console.log(`→ demo/build/timing.json`);
}

main().catch(e => { console.error('BUILD VO FAILED:', e.message); process.exit(1); });
