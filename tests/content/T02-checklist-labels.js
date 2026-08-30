/**
 * T02 — Nhãn checklist và vị từ backend phải khớp nhau từng id.
 *
 * Nhãn nằm ở src/content/checklists.js, vị từ nằm ở getChecklistStatus.
 * Hai danh sách lệch nhau thì hoặc người dùng thấy một mục không bao giờ tick
 * được, hoặc backend kiểm một điều kiện chẳng ai nhìn thấy.
 */
const { group, t, ok, eq } = require('../rig/assert');
const { reset } = require('../rig/reset');
const { getOk } = require('../rig/http');

async function run() {
  group('T02 — Nhãn checklist khớp vị từ');
  await reset();

  const { PHASE_CHECKLISTS } = await import('../../src/content/checklists.js');
  const status = await getOk('/api/phases/checklist');

  await t(
    'CT-10',
    'Mỗi giai đoạn: id trong nhãn và id trong vị từ trùng khớp hoàn toàn',
    ['rest:GET /api/phases/checklist'],
    () => {
      for (const sort of Object.keys(PHASE_CHECKLISTS)) {
        const labels = PHASE_CHECKLISTS[sort].map((x) => x.id).sort();
        const preds = Object.keys(status[sort] || {}).sort();

        const orphanLabels = labels.filter((x) => !preds.includes(x));
        const orphanPreds = preds.filter((x) => !labels.includes(x));

        ok(
          orphanLabels.length === 0,
          `giai đoạn ${sort}: có nhãn nhưng không có vị từ nào kiểm — ` +
            `${orphanLabels.join(', ')} (mục này không bao giờ tick được)`
        );
        ok(
          orphanPreds.length === 0,
          `giai đoạn ${sort}: backend kiểm nhưng không nhãn nào hiện — ` +
            `${orphanPreds.join(', ')}`
        );
      }
    }
  );

  await t(
    'CT-11',
    'Mọi mục đều nói được app đang kiểm điều gì',
    [],
    () => {
      for (const sort of Object.keys(PHASE_CHECKLISTS)) {
        for (const item of PHASE_CHECKLISTS[sort]) {
          ok(
            item.check && item.check.length > 10,
            `giai đoạn ${sort} · "${item.id}" thiếu mô tả điều kiện kiểm — ` +
              `người dùng không có cách nào biết vì sao mục này chưa tick`
          );
        }
      }
    }
  );

  await t(
    'CT-12',
    'Nhãn không hứa thứ dữ liệu không kiểm được',
    [],
    () => {
      const all = Object.values(PHASE_CHECKLISTS).flat();
      // Bảng asset_types không có cờ cổ tức, nên không nhãn nào được hứa
      // "cổ phiếu trả cổ tức" như một điều kiện kiểm được.
      const dividend = all.filter((x) =>
        /cổ tức/i.test(x.label) && x.id !== 'passive_income'
      );
      ok(
        dividend.length === 0,
        `nhãn hứa lọc theo cổ tức nhưng schema không có cờ đó: ` +
          dividend.map((x) => `"${x.label}"`).join(', ')
      );

      const vague = all.filter((x) => /^(Đa dạng hóa|Chuyển trọng tâm)/.test(x.label));
      ok(
        vague.length === 0,
        `nhãn không nêu ngưỡng kiểm được: ` + vague.map((x) => `"${x.label}"`).join(', ')
      );
    }
  );

  await t(
    'CT-13',
    'Mọi giai đoạn trong DB đều có nhãn checklist',
    ['rest:GET /api/phases'],
    async () => {
      const phases = await getOk('/api/phases');
      for (const p of phases) {
        ok(
          PHASE_CHECKLISTS[p.sort_order]?.length > 0,
          `giai đoạn ${p.sort_order} "${p.name}" không có mục checklist nào`
        );
      }
      eq(
        Object.keys(PHASE_CHECKLISTS).length,
        phases.length,
        'số giai đoạn có nhãn so với số giai đoạn trong DB'
      );
    }
  );
}

module.exports = { run };
