/**
 * harness.js — Bộ đồ nghề quay màn hình bằng Puppeteer + CDP screencast.
 *
 * Ý tưởng chính:
 *  - Chrome hệ thống, headless mới, viewport 1536×864 @ deviceScaleFactor 1.5
 *    => frame gốc 2304×1296, downscale về 1920×1080 nên chữ rất nét,
 *       và UI to hơn ~25% so với quay thẳng 1920 (dễ đọc trên điện thoại).
 *  - Chuột giả / ripple / lower-third là DOM thật, nằm ngoài #root, nên được
 *    screencast bắt luôn — không phải composite ở hậu kỳ.
 *  - Zoom = CSS transform trên #root. Chrome re-rasterize chữ ở tỉ lệ mới nên
 *    zoom vẫn sắc nét, không phải phóng to pixel như zoompan của ffmpeg.
 *  - Mỗi frame lưu kèm timestamp thật; lúc dựng video sinh file ffconcat với
 *    duration chính xác => tiếng không bao giờ lệch dù tốc độ capture dao động.
 */
const puppeteer = require('puppeteer');
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const { execFile } = require('child_process');

const ROOT = path.join(__dirname, '../..');
const INTER_CSS_PATH = path.join(ROOT, 'demo/assets/inter/inter.css');

const VIEWPORT = { width: 1536, height: 864, deviceScaleFactor: 1.5 };
const OUT_W = 1920, OUT_H = 1080, OUT_FPS = 60;
const JPEG_QUALITY = 88;

const sleep = ms => new Promise(r => setTimeout(r, ms));

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { maxBuffer: 64 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) reject(new Error(`${cmd} failed: ${stderr || err.message}`));
      else resolve(stdout);
    });
  });
}

// ─── Code chạy TRONG trang: chuột giả, ripple, lower-third, zoom ───────────
function overlayBootstrap() {
  // Chặn Dashboard tự gọi đồng bộ giá lúc mount (nó chỉ chạy nếu >1h kể từ lần cuối).
  try { localStorage.setItem('lastPriceRefresh', String(Date.now())); } catch (e) {}

  window.__demo = window.__demo || {};
  const D = window.__demo;

  function install() {
    if (D.installed) return;
    if (!document.body) return;
    D.installed = true;

    const style = document.createElement('style');
    style.textContent = `
      #__demo_layer { position: fixed; inset: 0; pointer-events: none; z-index: 2147483647; }
      #__demo_cursor { position: absolute; left: 0; top: 0; width: 26px; height: 26px;
        will-change: transform; transform: translate(-100px,-100px);
        filter: drop-shadow(0 2px 4px rgba(15,23,42,.35)); }
      .__demo_ripple { position: absolute; width: 14px; height: 14px; margin: -7px 0 0 -7px;
        border-radius: 999px; background: rgba(37,99,235,.45); border: 2px solid rgba(37,99,235,.9);
        animation: __demo_rip .55s cubic-bezier(.22,.61,.36,1) forwards; }
      @keyframes __demo_rip {
        0%   { transform: scale(.35); opacity: 1; }
        100% { transform: scale(3.6);  opacity: 0; }
      }
      #__demo_lt { position: absolute; left: 56px; bottom: 56px; max-width: 720px;
        background: rgba(255,255,255,.94); backdrop-filter: blur(18px);
        border: 1px solid rgba(226,232,240,.9); border-left: 4px solid #2563eb;
        border-radius: 16px; padding: 16px 22px; box-shadow: 0 18px 50px rgba(15,23,42,.16);
        opacity: 0; transform: translateY(14px); transition: opacity .38s ease, transform .38s ease;
        font-family: Inter, -apple-system, sans-serif; }
      #__demo_lt.on { opacity: 1; transform: translateY(0); }
      #__demo_lt .t { font-size: 21px; font-weight: 700; color: #0f172a; letter-spacing: -.01em; }
      #__demo_lt .s { font-size: 14px; font-weight: 500; color: #64748b; margin-top: 3px; }
      #root { transform-origin: 50% 50%; will-change: transform; }
    `;
    document.head.appendChild(style);

    const layer = document.createElement('div');
    layer.id = '__demo_layer';
    layer.innerHTML = `
      <svg id="__demo_cursor" viewBox="0 0 24 24" fill="none">
        <path d="M5.5 2.8 L18.6 12.4 L12.2 13.1 L15.1 19.6 L12.4 20.8 L9.5 14.2 L5.5 18.1 Z"
              fill="#0f172a" stroke="#ffffff" stroke-width="1.4" stroke-linejoin="round"/>
      </svg>
      <div id="__demo_lt"><div class="t"></div><div class="s"></div></div>`;
    document.body.appendChild(layer);

    D.layer = layer;
    D.cursor = layer.querySelector('#__demo_cursor');
    D.lt = layer.querySelector('#__demo_lt');
    D.pos = { x: VIEWPORT_W * 0.5, y: VIEWPORT_H * 0.62 };
    D.setPos = (x, y) => { D.pos = { x, y }; D.cursor.style.transform = `translate(${x - 3}px, ${y - 2}px)`; };
    D.setPos(D.pos.x, D.pos.y);
  }

  const VIEWPORT_W = window.innerWidth, VIEWPORT_H = window.innerHeight;

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install);
  else install();
  D.install = install;

  // Di chuột mượt với ease-in-out, trả về khi tới nơi
  D.moveTo = (x, y, ms) => new Promise(res => {
    install();
    const from = { ...D.pos };
    const t0 = performance.now();
    const ease = t => (t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
    function step(now) {
      const t = Math.min(1, (now - t0) / ms);
      D.setPos(from.x + (x - from.x) * ease(t), from.y + (y - from.y) * ease(t));
      if (t < 1) requestAnimationFrame(step); else res();
    }
    requestAnimationFrame(step);
  });

  D.ripple = () => {
    install();
    const r = document.createElement('div');
    r.className = '__demo_ripple';
    r.style.left = D.pos.x + 'px';
    r.style.top = D.pos.y + 'px';
    D.layer.appendChild(r);
    setTimeout(() => r.remove(), 700);
  };

  D.lowerThird = (title, sub) => {
    install();
    if (title === null) { D.lt.classList.remove('on'); return; }
    D.lt.querySelector('.t').textContent = title;
    D.lt.querySelector('.s').textContent = sub || '';
    D.lt.classList.add('on');
  };

  // Zoom bằng CSS transform trên #root — Chrome vẽ lại chữ ở tỉ lệ mới nên vẫn nét.
  D.zoom = (scale, originX, originY, ms) => {
    const root = document.getElementById('root');
    if (!root) return;
    root.style.transition = `transform ${ms}ms cubic-bezier(.4,0,.2,1)`;
    root.style.transformOrigin = `${originX}px ${originY}px`;
    root.style.transform = `scale(${scale})`;
  };
  D.cursorVisible = v => { install(); D.cursor.style.opacity = v ? '1' : '0'; };
}

class Recorder {
  constructor(opts = {}) {
    this.buildDir = opts.buildDir || path.join(ROOT, 'demo/build');
    this.name = opts.name || 'scene';
    // Thư mục riêng cho từng lần quay: tránh phải xoá thư mục cũ có thể còn bị giữ handle
    // (Windows hay báo EBUSY) và cho phép quay lại 1 scene mà không đụng lần trước.
    this.framesDir = path.join(this.buildDir, 'frames', `${this.name}-${Date.now().toString(36)}`);
    this.frames = [];
    this.writes = [];
    this.capturing = false;
    this.seq = 0;
  }

  async launch() {
    const interCss = fs.readFileSync(INTER_CSS_PATH, 'utf8');

    this.browser = await puppeteer.launch({
      channel: 'chrome',
      headless: true,
      defaultViewport: VIEWPORT,
      args: [
        '--hide-scrollbars',
        '--disable-features=IsolateOrigins,site-per-process',
        '--font-render-hinting=none',
        '--force-color-profile=srgb',
        '--disable-lcd-text',
      ],
    });
    this.page = await this.browser.newPage();
    await this.page.emulateTimezone('Asia/Ho_Chi_Minh');
    await this.page.evaluateOnNewDocument(overlayBootstrap);

    // Ghim font: trả CSS local, chặn hẳn gstatic (CSS đã nhúng base64).
    await this.page.setRequestInterception(true);
    this.page.on('request', req => {
      const u = req.url();
      if (u.startsWith('https://fonts.googleapis.com')) {
        req.respond({ status: 200, contentType: 'text/css; charset=utf-8', body: interCss });
      } else if (u.startsWith('https://fonts.gstatic.com')) {
        req.abort();
      } else {
        req.continue();
      }
    });

    this.page.on('pageerror', e => console.warn(`  [page error] ${e.message}`));
    this.client = await this.page.createCDPSession();
    return this;
  }

  async goto(url, waitSelector) {
    await this.page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
    if (waitSelector) await this.page.waitForSelector(waitSelector, { timeout: 30000 });
    await this.page.evaluate(() => window.__demo && window.__demo.install());
    // đợi font thật sự sẵn sàng, tránh frame đầu bị FOUT
    await this.page.evaluate(() => document.fonts.ready);
    return this;
  }

  // ─── Capture ───────────────────────────────────────────────────────────
  async startCapture() {
    await fsp.rm(this.framesDir, { recursive: true, force: true });
    await fsp.mkdir(this.framesDir, { recursive: true });
    this.frames = []; this.writes = []; this.seq = 0; this.capturing = true;

    this.client.on('Page.screencastFrame', ev => {
      if (!this.capturing) { this.client.send('Page.screencastFrameAck', { sessionId: ev.sessionId }).catch(() => {}); return; }
      const file = `f${String(++this.seq).padStart(6, '0')}.jpg`;
      this.frames.push({ file, ts: ev.metadata.timestamp });
      this.writes.push(fsp.writeFile(path.join(this.framesDir, file), Buffer.from(ev.data, 'base64')));
      this.client.send('Page.screencastFrameAck', { sessionId: ev.sessionId }).catch(() => {});
    });

    await this.client.send('Page.startScreencast', {
      format: 'jpeg', quality: JPEG_QUALITY, everyNthFrame: 1,
      maxWidth: VIEWPORT.width * VIEWPORT.deviceScaleFactor,
      maxHeight: VIEWPORT.height * VIEWPORT.deviceScaleFactor,
    });
    this.t0 = Date.now();
    return this;
  }

  async stopCapture() {
    this.capturing = false;
    await this.client.send('Page.stopScreencast').catch(() => {});
    this.tEnd = Date.now();
    await Promise.all(this.writes);
    return this;
  }

  /** Dựng scene-NN.mp4 từ frame + timestamp thật. */
  async encode(outFile, { fadeIn = 0, fadeOut = 0, exact = 0 } = {}) {
    if (this.frames.length < 2) throw new Error(`${this.name}: chỉ có ${this.frames.length} frame — capture hỏng`);

    // Screencast CHỈ phát frame khi trang có thay đổi. Trang đứng yên (animation xong,
    // hoặc đang hold) thì không có frame nào — nên độ dài video KHÔNG suy ra được từ
    // khoảng cách timestamp giữa frame đầu và cuối. Phải lấy theo thời gian thực đã quay,
    // và giữ frame cuối cho hết phần tĩnh còn lại.
    // Ép độ dài bằng cách kéo dài frame cuối cho đủ, KHÔNG dùng -t:
    // -t kết hợp -fps_mode cfr làm ffmpeg bỏ luôn phần nhân frame ở cuối (8.5s → 2.2s).
    const wall = exact > 0 ? exact : (this.tEnd - this.t0) / 1000;
    const lines = ['ffconcat version 1.0'];
    let total = 0;
    for (let i = 0; i < this.frames.length; i++) {
      const cur = this.frames[i];
      const next = this.frames[i + 1];
      const dur = next
        ? Math.max(1 / 240, next.ts - cur.ts)
        : Math.max(1 / 240, wall - (cur.ts - this.frames[0].ts));
      total += dur;
      lines.push(`file '${cur.file}'`, `duration ${dur.toFixed(6)}`);
    }
    lines.push(`file '${this.frames[this.frames.length - 1].file}'`); // idiom: lặp frame cuối để giữ duration cuối
    const listFile = path.join(this.framesDir, 'frames.txt');
    await fsp.writeFile(listFile, lines.join('\n'), 'utf8');
    // KHÔNG dùng filter fps=60 ở đây: timebase của concat demuxer là 1/25 nên nó làm tròn
    // mất các duration nhỏ hơn 0.04s và độ dài video phình lên (8.5s → 14.8s).
    // Chuyển sang CFR ở output (-fps_mode cfr -r) thì timestamp giữ nguyên, đúng độ dài.
    const target = exact > 0 ? exact : total;
    await fsp.mkdir(path.dirname(outFile), { recursive: true });

    // Encode 2 bước — cần thiết vì hai yêu cầu này xung khắc trong một filter chain:
    //
    //  · Độ dài phải đúng: filter `fps=60` đọc timebase 1/25 của concat demuxer, làm
    //    tròn mất mọi duration < 0.04s và thổi phồng video (8.5s → 14.8s). Phải để
    //    -fps_mode cfr -r 60 lo phần dựng frame.
    //  · Fade phải mượt: filter `fade` chạy TRƯỚC bước dựng frame CFR, nên với scene
    //    đứng yên lúc mở đầu (screencast không phát frame khi trang không đổi) nó chỉ
    //    có đúng một frame để tô — ra một khung đen rồi nhảy phựt sang sáng.
    //
    // Bước 1 dựng CFR đúng độ dài, bước 2 fade trên stream đã đủ 60 frame/giây.
    const pass1 = fadeIn > 0 || fadeOut > 0
      ? path.join(this.framesDir, 'raw.mp4')
      : outFile;

    await run('ffmpeg', [
      '-y', '-hide_banner', '-loglevel', 'error',
      '-f', 'concat', '-safe', '0', '-i', listFile,
      '-vf', `scale=${OUT_W}:${OUT_H}:flags=lanczos,format=yuv420p`,
      '-fps_mode', 'cfr', '-r', String(OUT_FPS),
      '-c:v', 'libx264', '-preset', 'medium', '-crf', '16',
      '-pix_fmt', 'yuv420p', pass1,
    ]);

    if (pass1 !== outFile) {
      const fades = [];
      if (fadeIn > 0) fades.push(`fade=t=in:st=0:d=${fadeIn}`);
      if (fadeOut > 0) fades.push(`fade=t=out:st=${Math.max(0, target - fadeOut).toFixed(3)}:d=${fadeOut}`);
      await run('ffmpeg', [
        '-y', '-hide_banner', '-loglevel', 'error',
        '-i', pass1, '-vf', fades.join(','),
        '-c:v', 'libx264', '-preset', 'slow', '-crf', '18',
        '-pix_fmt', 'yuv420p', '-movflags', '+faststart', outFile,
      ]);
      await fsp.rm(pass1, { force: true });
    }

    const outDur = parseFloat(await run('ffprobe',
      ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', outFile]));
    return { file: outFile, frames: this.frames.length, seconds: outDur, captured: total };
  }

  async cleanupFrames() {
    // best-effort: frame chỉ là file tạm, không đáng làm hỏng cả lượt render vì EBUSY
    try { await fsp.rm(this.framesDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 300 }); }
    catch (e) { console.warn(`  · không xoá được frame tạm (${e.code}) — bỏ qua`); }
  }

  // ─── Hành động trên camera ─────────────────────────────────────────────
  async hold(ms) { await sleep(ms); return this; }

  /** Toạ độ tâm element trong viewport — đã tính cả transform zoom. */
  async rectOf(selector) {
    const r = await this.page.evaluate(sel => {
      const el = typeof sel === 'string' ? document.querySelector(sel) : null;
      if (!el) return null;
      const b = el.getBoundingClientRect();
      return { x: b.x, y: b.y, w: b.width, h: b.height, cx: b.x + b.width / 2, cy: b.y + b.height / 2 };
    }, selector);
    if (!r) throw new Error(`${this.name}: không tìm thấy selector ${selector}`);
    return r;
  }

  /** Tìm element theo text chính xác (UI toàn tiếng Việt nên đây là cách chắc nhất). */
  async selectorByText(tag, text, { exact = true, nth = 0 } = {}) {
    const handle = await this.page.evaluateHandle((tag, text, exact, nth) => {
      const els = [...document.querySelectorAll(tag)].filter(e => {
        const t = (e.textContent || '').trim();
        return exact ? t === text : t.includes(text);
      });
      return els[nth] || null;
    }, tag, text, exact, nth);
    const el = handle.asElement();
    if (!el) throw new Error(`${this.name}: không thấy <${tag}> có text "${text}"`);
    return el;
  }

  /**
   * Tìm element theo text hiển thị — cách bám chắc nhất vì UI không có test-id.
   * closest: trèo lên container cha (vd '.bento-card') sau khi tìm được.
   */
  async byText(text, { tag = '*', exact = false, nth = 0, closest = null } = {}) {
    const h = await this.page.evaluateHandle((tag, text, exact, nth, closest) => {
      const hits = [...document.querySelectorAll(tag)].filter(e => {
        const t = (e.textContent || '').replace(/\s+/g, ' ').trim();
        if (!(exact ? t === text : t.includes(text))) return false;
        // bỏ cha bọc: chỉ giữ element sâu nhất còn khớp
        return ![...e.children].some(c => (c.textContent || '').replace(/\s+/g, ' ').trim().includes(text));
      });
      const el = hits[nth];
      if (!el) return null;
      return closest ? el.closest(closest) : el;
    }, tag, text, exact, nth, closest);
    const el = h.asElement();
    if (!el) throw new Error(`${this.name}: không thấy element có text "${text}"`);
    return el;
  }

  /** Element thứ n khớp selector (vd '.bento-card' thứ 0 là thẻ giai đoạn). */
  async nth(selector, index = 0) {
    const h = await this.page.evaluateHandle((s, i) => document.querySelectorAll(s)[i] || null, selector, index);
    const el = h.asElement();
    if (!el) throw new Error(`${this.name}: không có "${selector}" thứ ${index}`);
    return el;
  }

  /** Tâm element trong viewport (đã tính transform zoom). */
  async centerOf(el) {
    const b = await el.boundingBox();
    if (!b) throw new Error(`${this.name}: element không hiển thị`);
    return [b.x + b.width / 2, b.y + b.height / 2];
  }

  /** Đưa chuột tới tâm một ElementHandle. */
  async moveToEl(el, ms = 800) {
    const [x, y] = await this.centerOf(el);
    await this.moveToPoint(x, y, ms);
    return this;
  }

  async clickText(text, opts = {}) {
    const el = await this.byText(text, opts);
    await this.clickElement(el, opts);
    return this;
  }

  /** Cuộn khung main sao cho element nằm ở vị trí mong muốn, rồi trả về rect mới. */
  async bring(elOrSelector, { block = 'center', ms = 900 } = {}) {
    if (typeof elOrSelector === 'string') {
      await this.scrollTo(elOrSelector, { block, ms });
    } else {
      await elOrSelector.evaluate((el, block) => el.scrollIntoView({ behavior: 'smooth', block }), block);
      await sleep(ms);
    }
    return this;
  }

  /** Zoom vào một ElementHandle (không cần selector CSS). */
  async zoomElement(el, scale = 1.2, ms = 900) {
    const box = await el.boundingBox();
    if (!box) throw new Error(`${this.name}: element không hiển thị, không zoom được`);
    await this.page.evaluate((s, x, y, d) => window.__demo.zoom(s, x, y, d),
      scale, box.x + box.width / 2, box.y + box.height / 2, ms);
    await sleep(ms + 60);
    return this;
  }

  /**
   * Di chuyển chuột giả (DOM) VÀ chuột thật (CDP) song song.
   * Phải có chuột thật thì hover mới kích hoạt: tooltip recharts, highlight dòng bảng,
   * hiệu ứng hover của thẻ. Nếu chỉ vẽ con trỏ giả thì nhìn như chuột lướt qua mà
   * giao diện không phản ứng gì — lộ ngay là video dựng.
   */
  async moveToPoint(x, y, ms = 700) {
    const from = await this.page.evaluate(() => window.__demo.pos);
    const tween = this.page.evaluate((x, y, ms) => window.__demo.moveTo(x, y, ms), x, y, ms);

    const steps = Math.max(2, Math.round(ms / 45));
    const ease = t => (t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
    const started = Date.now();
    for (let i = 1; i <= steps; i++) {
      const t = ease(i / steps);
      await this.page.mouse.move(from.x + (x - from.x) * t, from.y + (y - from.y) * t);
      const due = started + (ms * i) / steps;
      const lag = due - Date.now();
      if (lag > 0) await sleep(lag);
    }
    await tween;
    return this;
  }

  async moveTo(selector, ms = 700, offset = { dx: 0, dy: 0 }) {
    const r = await this.rectOf(selector);
    await this.moveToPoint(r.cx + (offset.dx || 0), r.cy + (offset.dy || 0), ms);
    return this;
  }

  async clickHere({ settle = 450 } = {}) {
    const p = await this.page.evaluate(() => window.__demo.pos);
    await this.page.evaluate(() => window.__demo.ripple());
    await sleep(90);
    await this.page.mouse.click(p.x, p.y);
    await sleep(settle);
    return this;
  }

  async click(selector, { moveMs = 700, settle = 500, offset } = {}) {
    await this.moveTo(selector, moveMs, offset);
    await sleep(120);
    await this.clickHere({ settle });
    return this;
  }

  /**
   * Click vào element đã lấy handle.
   * Tự cuộn vào tầm nhìn nếu element nằm ngoài viewport: page.mouse.click bắn theo
   * toạ độ viewport, element ở dưới màn hình sẽ khiến cú click rơi vào chỗ khác
   * mà KHÔNG báo lỗi — kiểu hỏng im lặng khó phát hiện nhất khi quay.
   */
  async clickElement(elHandle, { moveMs = 700, settle = 500 } = {}) {
    let box = await elHandle.boundingBox();
    if (!box) throw new Error(`${this.name}: element không có boundingBox (ẩn?)`);
    const vh = VIEWPORT.height, vw = VIEWPORT.width;
    const cy = box.y + box.height / 2, cx = box.x + box.width / 2;
    if (cy < 8 || cy > vh - 8 || cx < 0 || cx > vw) {
      await elHandle.evaluate(el => el.scrollIntoView({ behavior: 'smooth', block: 'center' }));
      await sleep(750);
      box = await elHandle.boundingBox();
      if (!box) throw new Error(`${this.name}: element biến mất sau khi cuộn`);
    }
    const x = box.x + box.width / 2, y = box.y + box.height / 2;
    await this.moveToPoint(x, y, moveMs);
    await sleep(120);
    await this.page.evaluate(() => window.__demo.ripple());
    await sleep(90);
    await this.page.mouse.click(x, y);
    await sleep(settle);
    return this;
  }

  async typeInto(selector, text, { delay = 85, clear = true, moveMs = 600 } = {}) {
    await this.moveTo(selector, moveMs);
    await this.clickHere({ settle: 200 });
    if (clear) {
      await this.page.evaluate(sel => {
        const el = document.querySelector(sel);
        if (el) { el.focus(); el.select && el.select(); }
      }, selector);
      await this.page.keyboard.down('Control'); await this.page.keyboard.press('KeyA'); await this.page.keyboard.up('Control');
    }
    await this.page.type(selector, text, { delay });
    await sleep(250);
    return this;
  }

  async lowerThird(title, sub, { ms = 0 } = {}) {
    await this.page.evaluate((t, s) => window.__demo.lowerThird(t, s), title, sub);
    if (ms) { await sleep(ms); await this.page.evaluate(() => window.__demo.lowerThird(null)); await sleep(420); }
    return this;
  }
  async hideLowerThird() {
    await this.page.evaluate(() => window.__demo.lowerThird(null));
    await sleep(420);
    return this;
  }

  async zoomTo(selector, scale = 1.25, ms = 900) {
    const r = await this.rectOf(selector);
    await this.page.evaluate((s, x, y, d) => window.__demo.zoom(s, x, y, d), scale, r.cx, r.cy, ms);
    await sleep(ms + 60);
    return this;
  }
  async zoomReset(ms = 800) {
    await this.page.evaluate(d => window.__demo.zoom(1, window.innerWidth / 2, window.innerHeight / 2, d), ms);
    await sleep(ms + 60);
    return this;
  }

  /** Cuộn khung nội dung chính (main.overflow-y-auto) tới element, mượt. */
  async scrollTo(selector, { ms = 900, block = 'center' } = {}) {
    await this.page.evaluate((sel, block) => {
      const el = document.querySelector(sel);
      if (el) el.scrollIntoView({ behavior: 'smooth', block });
    }, selector, block);
    await sleep(ms);
    return this;
  }
  async scrollBy(dy, { ms = 900 } = {}) {
    await this.page.evaluate(dy => {
      const main = document.querySelector('main') || document.scrollingElement;
      main.scrollBy({ top: dy, behavior: 'smooth' });
    }, dy);
    await sleep(ms);
    return this;
  }
  async scrollTop({ ms = 700 } = {}) {
    await this.page.evaluate(() => {
      const main = document.querySelector('main') || document.scrollingElement;
      main.scrollTo({ top: 0, behavior: 'smooth' });
    });
    await sleep(ms);
    return this;
  }

  async cursor(visible) { await this.page.evaluate(v => window.__demo.cursorVisible(v), visible); return this; }

  async close() { if (this.browser) await this.browser.close(); }
}

module.exports = { Recorder, sleep, run, VIEWPORT, OUT_W, OUT_H, OUT_FPS, ROOT };
