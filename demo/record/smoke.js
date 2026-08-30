/**
 * smoke.js — Quay thử ~12s trang Tổng quan để kiểm tra chất lượng ảnh,
 * cỡ chữ, chuột giả, zoom và lower-third trước khi làm 11 scene thật.
 *
 * Chạy: node demo/record/smoke.js   (demo-server.js phải đang chạy)
 */
const path = require('path');
const { Recorder, ROOT } = require('./harness');

const URL = 'http://localhost:3001/#/';

(async () => {
  const rec = new Recorder({ name: 'smoke' });
  await rec.launch();
  console.log('· mở trang…');
  await rec.goto(URL, '.bento-card');
  await rec.hold(1200);

  console.log('· bắt đầu capture');
  await rec.startCapture();

  await rec.lowerThird('Tổng quan', 'Toàn bộ bức tranh tài chính trong một màn hình');
  await rec.hold(2200);
  await rec.hideLowerThird();

  // hero "Tổng tài sản ròng" — lấy theo text rồi trèo lên thẻ bento chứa nó
  const hero = await rec.page.evaluateHandle(() => {
    const el = [...document.querySelectorAll('span')].find(e => e.textContent.trim() === 'Tổng tài sản ròng');
    return el ? el.closest('.bento-card') : null;
  });
  const box = await hero.asElement().boundingBox();
  console.log('· hero box', box);

  await rec.moveToPoint(box.x + box.width / 2, box.y + box.height / 2, 900);
  await rec.hold(400);
  await rec.zoomTo('.bento-card', 1.22, 900);
  await rec.hold(1600);
  await rec.zoomReset(800);

  await rec.moveTo('a[href="#/cashflow"]', 800);
  await rec.hold(600);

  await rec.stopCapture();
  console.log('· encode…');
  const out = path.join(ROOT, 'demo/build/scenes/smoke.mp4');
  const info = await rec.encode(out, { fadeIn: 0.3 });
  console.log(`· xong: ${info.frames} frame, ${info.seconds.toFixed(2)}s → ${out}`);

  await rec.close();
})().catch(e => { console.error('SMOKE FAILED:', e); process.exit(1); });
