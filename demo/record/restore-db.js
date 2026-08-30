/**
 * restore-db.js — Đưa DB demo về một mốc snapshot rồi bảo server nạp lại.
 *
 * Dùng khi quay lại một scene có ghi dữ liệu (05 wizard, 06 sổ cái, 07 mua vàng):
 * phải khôi phục đúng trạng thái mà scene đó kỳ vọng, nếu không số liệu sẽ lệch
 * so với các scene đứng trước.
 *
 * Chạy: node demo/record/restore-db.js seeded
 *       node demo/record/restore-db.js after-05-wizard
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '../..');
const SNAP_DIR = path.join(ROOT, 'demo/build/db-snapshots');
const DEMO_DB = path.join(ROOT, 'demo/build/demo.sqlite');
const BASE = process.env.MF_DEMO_BASE || 'http://localhost:3001';

async function main() {
  const name = process.argv[2] || 'seeded';
  const file = name === 'seeded'
    ? path.join(SNAP_DIR, 'after-00-seeded.sqlite')
    : path.join(SNAP_DIR, `${name}.sqlite`);

  if (!fs.existsSync(file)) {
    console.error(`Không có snapshot "${name}". Đang có:`);
    for (const f of fs.readdirSync(SNAP_DIR)) console.error('  ·', f.replace(/\.sqlite$/, ''));
    process.exit(1);
  }

  fs.copyFileSync(file, DEMO_DB);
  console.log(`· khôi phục ${path.basename(file)} → demo.sqlite`);

  const r = await fetch(BASE + '/api/demo/reload-db', { method: 'POST' });
  if (!r.ok) throw new Error(`server không nạp lại được: ${r.status}`);
  console.log('· server đã nạp lại DB');
}

main().catch(e => { console.error('RESTORE FAILED:', e.message); process.exit(1); });
