/**
 * probe.js — Chụp ảnh tĩnh mọi màn hình sẽ quay, để soi bố cục / chữ tràn / panel rỗng
 * TRƯỚC khi tốn công quay video.
 *
 * Chạy: node demo/record/probe.js [cssWidth] [cssHeight]
 *   vd: node demo/record/probe.js 1728 972
 */
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '../..');
const W = Number(process.argv[2] || 1536);
const H = Number(process.argv[3] || 864);
const DSF = 2304 / W;                       // luôn ra frame 2304 chiều ngang
const OUT = path.join(ROOT, 'demo/build/probe', `${W}x${H}`);
const BASE = 'http://localhost:3001';
const sleep = ms => new Promise(r => setTimeout(r, ms));

const shots = [
  { name: '01-dashboard-top',    url: '#/',                       wait: '.bento-card' },
  { name: '02-dashboard-mid',    url: '#/',                       wait: '.bento-card', scroll: 900 },
  { name: '03-dashboard-bottom', url: '#/',                       wait: '.bento-card', scroll: 2200 },
  { name: '04-cashflow',         url: '#/cashflow',               wait: '.card' },
  { name: '05-cashflow-mid',     url: '#/cashflow',               wait: '.card', scroll: 850 },
  { name: '06-invest-giaodich',  url: '#/investments?tab=portfolio',  wait: '.card' },
  { name: '07-invest-tietkiem',  url: '#/investments?tab=savings',    wait: '.card' },
  { name: '08-invest-tietkiem2', url: '#/investments?tab=savings',    wait: '.card', scroll: 900 },
  { name: '09-invest-bantia',    url: '#/investments?tab=sniper',     wait: '.card' },
  { name: '10-invest-bantia2',   url: '#/investments?tab=sniper',     wait: '.card', scroll: 800 },
  { name: '11-invest-phanbo',    url: '#/investments?tab=allocation', wait: '.card' },
  { name: '12-scenarios',        url: '#/scenarios',              wait: '.card' },
  { name: '13-scenarios-fi',     url: '#/scenarios',              wait: '.card', scroll: 1400 },
];

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const interCss = fs.readFileSync(path.join(ROOT, 'demo/assets/inter/inter.css'), 'utf8');

  const browser = await puppeteer.launch({
    channel: 'chrome', headless: true,
    defaultViewport: { width: W, height: H, deviceScaleFactor: DSF },
    args: ['--hide-scrollbars', '--font-render-hinting=none', '--force-color-profile=srgb', '--disable-lcd-text'],
  });
  const page = await browser.newPage();
  await page.emulateTimezone('Asia/Ho_Chi_Minh');
  await page.evaluateOnNewDocument(() => {
    try { localStorage.setItem('lastPriceRefresh', String(Date.now())); } catch (e) {}
  });
  await page.setRequestInterception(true);
  page.on('request', r => {
    const u = r.url();
    if (u.startsWith('https://fonts.googleapis.com')) r.respond({ status: 200, contentType: 'text/css; charset=utf-8', body: interCss });
    else if (u.startsWith('https://fonts.gstatic.com')) r.abort();
    else r.continue();
  });
  page.on('pageerror', e => console.warn('  [page error]', e.message));

  let n = 0;
  for (const s of shots) {
    // Cache-bust TRƯỚC hash: chỉ đổi hash thì SPA không remount, tab state và scrollTop bị giữ lại.
    await page.goto(`${BASE}/?p=${++n}` + s.url, { waitUntil: 'networkidle2' });
    await page.waitForSelector(s.wait, { timeout: 30000 }).catch(() => console.warn(`  ! ${s.name}: không thấy ${s.wait}`));
    await page.evaluate(() => document.fonts.ready);
    await sleep(1400);
    if (s.scroll) {
      await page.evaluate(y => { const m = document.querySelector('main'); if (m) m.scrollTo({ top: y }); }, s.scroll);
      await sleep(900);
    }
    const file = path.join(OUT, s.name + '.png');
    await page.screenshot({ path: file });
    console.log('·', s.name);
  }

  // Modal Tổng tài sản ròng
  await page.goto(BASE + '/#/', { waitUntil: 'networkidle2' });
  await page.waitForSelector('.bento-card');
  await sleep(1500);
  const opened = await page.evaluate(() => {
    const el = [...document.querySelectorAll('span')].find(e => e.textContent.trim() === 'Tổng tài sản ròng');
    const card = el && el.closest('.bento-card');
    if (card) { card.click(); return true; }
    return false;
  });
  await sleep(3000);
  await page.screenshot({ path: path.join(OUT, '14-networth-modal.png') });
  console.log('· 14-networth-modal (mở được:', opened, ')');

  // Các mốc lọc thời gian trong modal — "Tất cả" mới là cảnh đẹp nhất
  for (const [i, label] of [['15', '6 Tháng'], ['16', 'Tất cả']]) {
    await page.evaluate(l => {
      const b = [...document.querySelectorAll('button')].find(e => e.textContent.trim() === l);
      if (b) b.click();
    }, label);
    await sleep(1800);
    await page.screenshot({ path: path.join(OUT, `${i}-networth-${label.replace(/\s/g, '')}.png`) });
    console.log('·', i, 'networth', label);
  }

  await browser.close();
  console.log('\n→', OUT);
})().catch(e => { console.error('PROBE FAILED:', e); process.exit(1); });
