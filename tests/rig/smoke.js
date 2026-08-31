/**
 * smoke.js — Kiểm tra nhanh rig có hoạt động và DB thật có nguyên vẹn không.
 * Chạy: node tests/rig/smoke.js
 */
const { armTripwire, checkTripwire, assertIsolated } = require('./guard');
const server = require('./server');
const { reset } = require('./reset');
const { get } = require('./http');

(async () => {
  armTripwire();
  await server.start();
  await assertIsolated({ expectFixture: false });
  await reset();
  await assertIsolated();

  const stats = await get('/api/data/stats');
  console.log('[SMOKE] stats      =', JSON.stringify(stats.data));
  const cats = await get('/api/categories');
  console.log('[SMOKE] danh mục   =', cats.data.map((c) => c.name).join(' | '));
  const phase = await get('/api/phases/active');
  console.log('[SMOKE] giai đoạn  =', phase.data && phase.data.name);

  checkTripwire('cuối smoke');
  server.stop();
  console.log('[SMOKE] Rig hoạt động, DB thật nguyên vẹn.');
  process.exit(0);
})().catch((e) => {
  console.error(e);
  server.stop();
  process.exit(1);
});
