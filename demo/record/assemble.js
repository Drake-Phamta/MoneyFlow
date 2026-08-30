/**
 * assemble.js — Hậu kỳ: ghép scene, đặt voiceover đúng chỗ, dựng phụ đề, xuất bản cuối.
 *
 * Điểm quan trọng: offset của tiếng được tính từ ĐỘ DÀI THẬT của từng file scene
 * (đo bằng ffprobe), không phải từ độ dài dự kiến trong timing.json. Mỗi scene
 * thường dài hơn dự kiến vài chục ms do làm tròn CFR; cộng dồn 11 scene là lệch
 * gần nửa giây. Đo thật thì không bao giờ trôi tiếng.
 *
 * Xuất ra:
 *   MoneyFlow-Demo-vi-1080p.mp4        có phụ đề burn-in  (bản chính)
 *   MoneyFlow-Demo-vi-1080p-nosub.mp4  không phụ đề
 *   MoneyFlow-Demo-vi-silent.mp4       không tiếng (để tự lồng nhạc/giọng khác)
 *   MoneyFlow-Demo-vi.srt              phụ đề rời
 *
 * Chạy: node demo/record/assemble.js
 */
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const { execFile } = require('child_process');

const ROOT = path.join(__dirname, '../..');
const BUILD = path.join(ROOT, 'demo/build');
const SCENES = path.join(BUILD, 'scenes');
const VO = path.join(BUILD, 'vo');
const OUT = path.join(ROOT, 'demo/out');

const SUB_MAX_CHARS = 44;        // mỗi dòng phụ đề
const SUB_MAX_LINES = 2;

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { maxBuffer: 128 * 1024 * 1024 }, (err, stdout, stderr) =>
      err ? reject(new Error(`${cmd} thất bại: ${(stderr || err.message).slice(0, 800)}`)) : resolve(stdout));
  });
}
const probe = async f => parseFloat(
  await run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f]));

// ── Phụ đề ────────────────────────────────────────────────────────────────
function parseSrt(file) {
  const txt = fs.readFileSync(file, 'utf8').replace(/\r/g, '');
  const toSec = s => {
    const [h, m, rest] = s.split(':');
    const [sec, ms] = rest.split(',');
    return +h * 3600 + +m * 60 + +sec + +ms / 1000;
  };
  const cues = [];
  for (const block of txt.split(/\n\n+/)) {
    const lines = block.split('\n').filter(Boolean);
    if (lines.length < 2) continue;
    const m = lines.find(l => l.includes('-->'));
    if (!m) continue;
    const [a, b] = m.split('-->').map(s => s.trim());
    const text = lines.slice(lines.indexOf(m) + 1).join(' ').trim();
    if (text) cues.push({ start: toSec(a), end: toSec(b), text });
  }
  return cues;
}

/** Cắt câu dài thành nhiều cue đọc kịp, chia thời gian theo tỉ lệ số ký tự. */
function splitCue(cue) {
  const cap = SUB_MAX_CHARS * SUB_MAX_LINES;
  if (cue.text.length <= cap) return [cue];

  const words = cue.text.split(/\s+/);
  const parts = Math.ceil(cue.text.length / cap);
  const per = Math.ceil(words.length / parts);
  const chunks = [];
  for (let i = 0; i < words.length; i += per) chunks.push(words.slice(i, i + per).join(' '));

  const totalChars = chunks.reduce((s, c) => s + c.length, 0);
  const span = cue.end - cue.start;
  let t = cue.start;
  return chunks.map(c => {
    const d = span * (c.length / totalChars);
    const out = { start: t, end: t + d, text: c };
    t += d;
    return out;
  });
}

/**
 * Bẻ dòng cho vừa bề ngang.
 * KHÔNG cắt bớt dòng thừa — thà phụ đề 3 dòng còn hơn nuốt mất chữ của lời thoại.
 * splitCue ở trên đã lo cho hầu hết cue vừa 2 dòng rồi.
 */
function wrap(text) {
  if (text.length <= SUB_MAX_CHARS) return text;

  const words = text.split(/\s+/);
  // Hai dòng thì cân cho đều nhau: BorderStyle=3 vẽ hộp ôm sát từng dòng,
  // bẻ dòng kiểu "tham lam" sẽ ra một hộp dài một hộp ngắn, nhìn rất so le.
  if (text.length <= SUB_MAX_CHARS * 2) {
    let best = null;
    for (let i = 1; i < words.length; i++) {
      const a = words.slice(0, i).join(' ');
      const b = words.slice(i).join(' ');
      if (a.length > SUB_MAX_CHARS || b.length > SUB_MAX_CHARS) continue;
      const skew = Math.abs(a.length - b.length);
      if (!best || skew < best.skew) best = { a, b, skew };
    }
    if (best) return `${best.a}\\N${best.b}`;
  }

  const lines = [];
  let cur = '';
  for (const w of words) {
    if (cur && (cur + ' ' + w).length > SUB_MAX_CHARS) { lines.push(cur); cur = w; }
    else cur = cur ? cur + ' ' + w : w;
  }
  if (cur) lines.push(cur);
  return lines.join('\\N');
}

const assTime = s => {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  const sec = (s % 60).toFixed(2).padStart(5, '0');
  return `${h}:${String(m).padStart(2, '0')}:${sec}`;
};
const srtTime = s => {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60), ms = Math.round((s % 1) * 1000);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
};

function buildAss(cues) {
  // Segoe UI có sẵn trên Windows và đủ dấu tiếng Việt; libass dựng qua harfbuzz nên
  // tổ hợp dấu hiển thị đúng.
  //
  // BorderStyle=3 (hộp nền mờ) chứ không phải viền chữ: giao diện app nền sáng,
  // chữ trắng viền mảnh gần như không đọc được khi đè lên thẻ trắng.
  // Với BorderStyle=3 thì Outline = padding hộp, BackColour = màu hộp.
  // Alpha trong ASS: 00 = đục hoàn toàn, FF = trong suốt → &H33 ≈ 80% đục.
  const head = `[Script Info]
ScriptType: v4.00+
PlayResX: 1920
PlayResY: 1080
WrapStyle: 2
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, OutlineColour, BackColour, Bold, Italic, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: VN,Segoe UI Semibold,40,&H00FFFFFF,&H33101010,&H33101010,0,0,3,9,0,2,150,150,44,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;
  const body = cues.map(c =>
    `Dialogue: 0,${assTime(c.start)},${assTime(c.end)},VN,,0,0,0,,${wrap(c.text)}`).join('\n');
  return head + body + '\n';
}

const buildSrt = cues => cues.map((c, i) =>
  `${i + 1}\n${srtTime(c.start)} --> ${srtTime(c.end)}\n${c.text}\n`).join('\n');

// ── Chính ─────────────────────────────────────────────────────────────────
async function main() {
  const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'demo/script.json'), 'utf8'));
  const timing = JSON.parse(fs.readFileSync(path.join(BUILD, 'timing.json'), 'utf8'));
  await fsp.mkdir(OUT, { recursive: true });

  // 1. Đo độ dài THẬT của từng scene → offset chuẩn
  const scenes = [];
  let offset = 0;
  for (const s of cfg.scenes) {
    const file = path.join(SCENES, s.id + '.mp4');
    if (!fs.existsSync(file)) throw new Error(`Thiếu scene: ${s.id}.mp4 — quay lại scene này trước.`);
    const dur = await probe(file);
    scenes.push({ ...s, file, dur, offset, t: timing.scenes.find(x => x.id === s.id) });
    offset += dur;
  }
  const total = offset;
  console.log('Scene và mốc bắt đầu:');
  for (const s of scenes) console.log(`  ${s.id.padEnd(14)} @${s.offset.toFixed(2).padStart(7)}s  dài ${s.dur.toFixed(2)}s`);
  console.log(`  ${'TỔNG'.padEnd(14)}  ${total.toFixed(2)}s = ${Math.floor(total / 60)}:${String(Math.round(total % 60)).padStart(2, '0')}\n`);

  // 2. Ghép hình — copy stream, không encode lại (mọi scene cùng codec/tham số)
  const listFile = path.join(BUILD, 'concat-scenes.txt');
  await fsp.writeFile(listFile,
    scenes.map(s => `file '${s.file.replace(/\\/g, '/')}'`).join('\n'), 'utf8');
  const videoOnly = path.join(BUILD, 'video-only.mp4');
  await run('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error',
    '-f', 'concat', '-safe', '0', '-i', listFile, '-c', 'copy', videoOnly]);
  console.log('· ghép hình xong (stream copy, không giảm chất lượng)');

  // 3. Dựng tiếng: mỗi voiceover trễ đúng offset scene + padStart
  const voArgs = [];
  const filters = [];
  scenes.forEach((s, i) => {
    voArgs.push('-i', path.join(VO, s.id + '.mp3'));
    const delayMs = Math.round((s.offset + s.padStart) * 1000);
    filters.push(`[${i}:a]adelay=${delayMs}|${delayMs},aresample=48000[a${i}]`);
  });
  const mixIn = scenes.map((_, i) => `[a${i}]`).join('');
  // loudnorm về -16 LUFS: mức chuẩn cho video nói trên web, nghe đều ở mọi thiết bị
  filters.push(`${mixIn}amix=inputs=${scenes.length}:normalize=0:duration=longest[mix]`);
  filters.push(`[mix]apad,atrim=0:${total.toFixed(3)},loudnorm=I=-16:TP=-1.5:LRA=11[out]`);

  const audioFile = path.join(BUILD, 'voice.m4a');
  await run('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error',
    ...voArgs, '-filter_complex', filters.join(';'), '-map', '[out]',
    '-c:a', 'aac', '-b:a', '192k', audioFile]);
  console.log('· dựng tiếng xong (chuẩn hoá -16 LUFS)');

  // 4. Phụ đề — dịch mốc thời gian của từng scene về timeline chung
  let cues = [];
  for (const s of scenes) {
    const srt = path.join(VO, s.id + '.srt');
    if (!fs.existsSync(srt)) continue;
    const base = s.offset + s.padStart;
    for (const c of parseSrt(srt)) {
      for (const p of splitCue(c)) cues.push({ start: base + p.start, end: base + p.end, text: p.text });
    }
  }
  cues.sort((a, b) => a.start - b.start);
  // chống chồng lấn: edge-tts đôi khi cho cue sau bắt đầu sớm hơn cue trước kết thúc
  for (let i = 1; i < cues.length; i++) {
    if (cues[i].start < cues[i - 1].end) cues[i - 1].end = cues[i].start - 0.02;
  }

  const assFile = path.join(BUILD, 'subs.ass');
  await fsp.writeFile(assFile, buildAss(cues), 'utf8');
  await fsp.writeFile(path.join(OUT, 'MoneyFlow-Demo-vi.srt'), buildSrt(cues), 'utf8');
  console.log(`· phụ đề: ${cues.length} dòng`);

  // 5. Xuất bản
  const nosub = path.join(OUT, 'MoneyFlow-Demo-vi-1080p-nosub.mp4');
  await run('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error',
    '-i', videoOnly, '-i', audioFile,
    '-map', '0:v', '-map', '1:a', '-c:v', 'copy', '-c:a', 'copy',
    '-movflags', '+faststart', '-shortest', nosub]);
  console.log('· xuất bản không phụ đề');

  const silent = path.join(OUT, 'MoneyFlow-Demo-vi-silent.mp4');
  await fsp.copyFile(videoOnly, silent);
  console.log('· xuất bản không tiếng (để tự lồng nhạc)');

  // burn-in phải encode lại hình
  const main = path.join(OUT, cfg.output);
  const assPath = assFile.replace(/\\/g, '/').replace(/^([A-Za-z]):/, '$1\\:');
  await run('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error',
    '-i', videoOnly, '-i', audioFile,
    '-filter_complex', `[0:v]subtitles='${assPath}'[v]`,
    '-map', '[v]', '-map', '1:a',
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '19', '-pix_fmt', 'yuv420p',
    '-c:a', 'copy', '-movflags', '+faststart', '-shortest', main]);
  console.log('· xuất bản chính (phụ đề burn-in)');

  console.log('\nXong:');
  for (const f of [main, nosub, silent]) {
    const st = fs.statSync(f);
    console.log(`  ${path.basename(f).padEnd(38)} ${(st.size / 1048576).toFixed(1)} MB  ${(await probe(f)).toFixed(2)}s`);
  }
}

main().catch(e => { console.error('\nASSEMBLE FAILED:', e.message); process.exit(1); });
