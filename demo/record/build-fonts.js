/**
 * build-fonts.js — Ghim font Inter về local (chạy 1 lần, cần mạng).
 *
 * index.html của app load Inter từ Google Fonts CDN. Nếu lúc quay không có mạng
 * (hoặc CDN trả version khác) thì chữ sẽ rơi về font hệ thống và mỗi lần render ra một kiểu.
 * Script này tải các subset cần thiết, nhúng base64 vào MỘT file CSS để harness intercept.
 *
 * Chỉ giữ subset vietnamese + latin + latin-ext — bỏ cyrillic/greek cho nhẹ.
 *
 * Chạy: node demo/record/build-fonts.js
 */
const fs = require('fs');
const path = require('path');

const OUT_DIR = path.join(__dirname, '../assets/inter');
const OUT_CSS = path.join(OUT_DIR, 'inter.css');
const KEEP = ['vietnamese', 'latin', 'latin-ext'];
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const SRC = 'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap';

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const css = await (await fetch(SRC, { headers: { 'User-Agent': UA } })).text();

  // Tách theo comment subset: /* vietnamese */ @font-face { ... }
  const blocks = [];
  const re = /\/\*\s*([a-z-]+)\s*\*\/\s*(@font-face\s*\{[^}]*\})/g;
  let m;
  while ((m = re.exec(css)) !== null) blocks.push({ subset: m[1], text: m[2] });

  const kept = blocks.filter(b => KEEP.includes(b.subset));
  console.log(`Tổng ${blocks.length} @font-face, giữ ${kept.length} (${KEEP.join(', ')})`);
  if (!kept.length) throw new Error('Không parse được @font-face nào — Google Fonts đổi format?');

  let out = '/* Inter — ghim offline cho demo video. Sinh bởi demo/record/build-fonts.js */\n';
  let bytes = 0;
  for (const b of kept) {
    const url = b.text.match(/url\((https:\/\/fonts\.gstatic\.com[^)]+)\)/)?.[1];
    if (!url) { console.warn('  ! bỏ qua block không có url'); continue; }
    const buf = Buffer.from(await (await fetch(url, { headers: { 'User-Agent': UA } })).arrayBuffer());
    bytes += buf.length;
    const weight = b.text.match(/font-weight:\s*(\d+)/)?.[1] || '?';
    console.log(`  ${b.subset.padEnd(10)} ${weight}  ${(buf.length / 1024).toFixed(1)} KB`);
    out += b.text.replace(/url\(https:\/\/fonts\.gstatic\.com[^)]+\)/,
      `url(data:font/woff2;base64,${buf.toString('base64')})`) + '\n';
  }

  fs.writeFileSync(OUT_CSS, out, 'utf8');
  console.log(`\n→ ${OUT_CSS}`);
  console.log(`   font gốc ${(bytes / 1024).toFixed(0)} KB → css ${(out.length / 1024).toFixed(0)} KB`);
}

main().catch(e => { console.error('BUILD FONTS FAILED:', e.message); process.exit(1); });
