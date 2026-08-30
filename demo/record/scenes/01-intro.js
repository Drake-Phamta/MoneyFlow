/** Scene 01 — Intro: logo + tên + tech stack, animation CSS thuần. */
const path = require('path');
const { pathToFileURL } = require('url');
const { ROOT } = require('../harness');

module.exports = {
  fade: { fadeIn: 0.4, fadeOut: 0.5 },

  async setup(rec) {
    await rec.goto(pathToFileURL(path.join(ROOT, 'demo/assets/intro.html')).href, '.wrap');
    await rec.cursor(false);          // intro không cần chuột giả
    await rec.hold(500);
  },

  async perform(rec, ctx) {
    // kích hoạt animation đúng khoảnh khắc bắt đầu quay
    await rec.page.evaluate(() => document.body.classList.add('go'));
    await ctx.end();
  },
};
