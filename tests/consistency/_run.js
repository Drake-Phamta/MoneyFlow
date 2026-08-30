const g = require('../rig/guard');
const server = require('../rig/server');
const { summary } = require('../rig/assert');

const FILES = process.argv.slice(2).filter(a => !a.startsWith('--'));
const list = FILES.length ? FILES : ['C01-categories', 'C02-networth'];

(async () => {
  g.armTripwire();
  await server.start();
  await g.assertIsolated({ expectFixture: false });
  for (const f of list) {
    await require(`./${f}`).run();
    g.checkTripwire(`sau ${f}`);
  }
  summary();
  server.stop();
  process.exit(0);
})().catch(e => { console.error(e); server.stop(); process.exit(1); });
