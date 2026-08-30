const g = require('../rig/guard');
const server = require('../rig/server');
const { reset } = require('../rig/reset');
const F = require('./_formulas');
const { fmt } = require('../rig/assert');

(async () => {
  g.armTripwire();
  await server.start();
  await g.assertIsolated({ expectFixture: false });
  await reset();
  const d = await F.loadAll();

  console.log('\n=== SÁU CÔNG THỨC "TỔNG TÀI SẢN" ===');
  for (const f of F.NET_WORTH_FORMULAS) {
    console.log(`  ${f.key.padEnd(17)} ${fmt(f.fn(d)).padStart(15)}  (${f.src})`);
  }

  console.log('\n=== BA CÔNG THỨC "TIẾN ĐỘ GIAI ĐOẠN" ===');
  console.log(`  Giai đoạn: ${d.phase.name}, mục tiêu ${fmt(d.phase.goal_amount)}`);
  for (const f of F.PHASE_PROGRESS_FORMULAS) {
    const r = f.fn(d);
    console.log(`  ${f.key.padEnd(17)} ${fmt(r.current).padStart(15)}  =${r.pct.toFixed(1)}%  (${f.src})`);
  }

  console.log('\n=== DANH MỤC ===');
  console.log('  Bảng categories :', d.categories.map(c => c.name).join(' | '));
  console.log('  byCategory keys :', Object.keys(d.summary.byCategory || {}).join(' | '));

  console.log('\n=== ĐÃ GIẢI NGÂN ===');
  console.log('  có phí   :', fmt(F.deployed_withFee(d)));
  console.log('  không phí:', fmt(F.deployed_exFee(d)));

  console.log('\n=== TIỀN MẶT ===');
  console.log(' ', JSON.stringify(F.dashboardCash(d), null, 1));
  console.log('  overview.totalUnallocated =', fmt(d.savingsOverview.totalUnallocated));

  g.checkTripwire('sau probe');
  server.stop();
  process.exit(0);
})().catch(e => { console.error(e); server.stop(); process.exit(1); });
