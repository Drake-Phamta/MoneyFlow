/** Scene 11 — Outro: tech stack + cam kết dữ liệu nằm trên máy người dùng. */
const path = require('path');
const { pathToFileURL } = require('url');
const { ROOT } = require('../harness');

module.exports = {
  fade: { fadeIn: 0.45, fadeOut: 0.9 },

  async setup(rec) {
    await rec.goto(pathToFileURL(path.join(ROOT, 'demo/assets/outro.html')).href, '.wrap');
    await rec.cursor(false);
    await rec.hold(500);
  },

  async perform(rec, ctx) {
    await rec.page.evaluate(() => document.body.classList.add('go'));
    await ctx.end();
  },
};
