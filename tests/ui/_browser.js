/**
 * _browser.js — Lớp bọc mỏng quanh Recorder của demo/record/harness.js.
 *
 * Tái dùng Recorder nguyên trạng vì nó đã lo sẵn ba thứ khó:
 *  · chặn Google Fonts và trả về Inter cục bộ → không phụ thuộc mạng
 *  · seed localStorage.lastPriceRefresh → Dashboard không tự đồng bộ giá lúc
 *    mount, nên mỗi lần chạy cho kết quả giống nhau
 *  · bắt sự kiện pageerror
 *
 * Phần này chỉ thêm: gom lỗi thành mảng, chuẩn hoá chữ, và dò các ký tự báo
 * hiệu tính toán hỏng.
 */
const path = require('path');
const env = require('../rig/env');
const { Recorder } = require(path.join(env.REPO_ROOT, 'demo/record/harness'));

/** Những chuỗi không bao giờ được xuất hiện trước mắt người dùng. */
const BAD_TOKENS = ['NaN', 'undefined', 'Infinity', 'null ₫', '[object Object]'];

class Browser {
  constructor() {
    this.rec = null;
    this.errors = [];
  }

  async open() {
    this.rec = new Recorder({ buildDir: env.SCRATCH_BUILD, name: 'ui-test' });
    try {
      await this.rec.launch();
    } catch (e) {
      throw new Error(
        `Không mở được Chrome (${e.message}). Recorder dùng channel:'chrome' — ` +
          `cần Google Chrome cài sẵn trên máy.`
      );
    }
    // Recorder ghi pageerror ra console.warn; gom lại để test kiểm được.
    this.rec.page.on('pageerror', (e) => this.errors.push(String(e.message || e)));
    this.rec.page.on('console', (m) => {
      if (m.type() === 'error') this.errors.push('console.error: ' + m.text());
    });
    return this;
  }

  /**
   * Mở một route. Cache-bust đặt TRƯỚC dấu # — đổi mỗi phần hash thì SPA không
   * remount, tab đang chọn và vị trí cuộn bị giữ lại từ lần trước.
   */
  async goto(hashRoute, waitSelector = '.card, .bento-card, main') {
    this.errors.length = 0;
    const url = `${env.BASE}/?t=${Date.now()}#${hashRoute}`;
    await this.rec.page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
    await this.rec.page.waitForSelector(waitSelector, { timeout: 20000 }).catch(() => {});
    await this.rec.page.evaluate(() => document.fonts.ready).catch(() => {});
    await this.waitForData();
  }

  /**
   * Đợi tới khi trang thật sự có dữ liệu, thay vì ngủ một khoảng cố định.
   *
   * Mỗi trang tự gọi API rồi mới render, nên "mạng đã rảnh" chưa có nghĩa là
   * React đã vẽ xong. Ngủ cố định thì máy chậm là hỏng, máy nhanh là phí thời
   * gian — và bộ test trở nên lúc xanh lúc đỏ.
   */
  async waitForData(timeout = 15000) {
    const started = Date.now();
    while (Date.now() - started < timeout) {
      const state = await this.rec.page
        .evaluate(() => {
          const m = document.querySelector('main') || document.body;
          const txt = m.innerText || '';
          return { loading: txt.includes('Đang tải'), chars: txt.trim().length };
        })
        .catch(() => null);
      if (state && !state.loading && state.chars > 40) {
        // Một nhịp nữa cho các khối phụ thuộc lời gọi thứ hai kịp vẽ.
        await this.sleep(250);
        return;
      }
      await this.sleep(100);
    }
  }

  sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  /** Toàn bộ chữ trong vùng nội dung, đã chuẩn hoá khoảng trắng không ngắt. */
  async mainText() {
    return this.rec.page.evaluate(() => {
      const m = document.querySelector('main') || document.body;
      return (m.innerText || '').replace(/ /g, ' ');
    });
  }

  async mainIsEmpty() {
    const txt = await this.mainText();
    return txt.trim().length < 20;
  }

  /** Các chuỗi báo hiệu tính toán hỏng đang lộ ra màn hình. */
  async badTokens() {
    const txt = await this.mainText();
    return BAD_TOKENS.filter((tok) => txt.includes(tok));
  }

  /** Đọc mọi số tiền đang hiển thị, đã parse về number. */
  async moneyValues() {
    const txt = await this.mainText();
    const out = [];
    for (const m of txt.matchAll(/(-?[\d.]+)\s*₫/g)) {
      const n = Number(m[1].replace(/\./g, ''));
      if (isFinite(n)) out.push(n);
    }
    return out;
  }

  /** Có tìm thấy đoạn chữ này trên trang không. */
  async hasText(needle) {
    const txt = await this.mainText();
    return txt.includes(needle);
  }

  /** Bấm vào phần tử đầu tiên chứa đoạn chữ cho trước. */
  async clickText(needle, { tag = '*' } = {}) {
    const el = await this.rec.byText(needle, { tag });
    if (!el) return false;
    await this.rec.clickElement(el);
    await this.sleep(600);
    return true;
  }

  async close() {
    if (this.rec) await this.rec.close().catch(() => {});
    this.rec = null;
  }
}

module.exports = { Browser, BAD_TOKENS };
