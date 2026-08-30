/**
 * A07 — Sổ tiết kiệm.
 */
const { group, t } = require('../rig/assert');
const H = require('./_helpers');

async function run() {
  group('A07 — Sổ tiết kiệm');
  await H.fresh();

  await t(
    'API-SAV-01',
    'GET /api/savings trả kèm lãi đã tính, số dư và lịch sử giao dịch của từng sổ',
    ['rest:GET /api/savings', 'ipc:savings:get', 'bridge:savings.get', 'client:savings.get'],
    async () => {
      const rows = await H.getOk('/api/savings');
      H.expectShape(
        rows,
        ['id', 'name', 'bank', 'type', 'principal', 'interest_rate', 'status', 'accrued_interest', 'current_balance', 'transactions'],
        'GET /api/savings'
      );
      for (const a of rows) {
        H.ok(
          Math.abs(a.current_balance - (a.principal + a.accrued_interest)) < 1,
          `${a.name}: số dư ${H.fmt(a.current_balance)} ≠ gốc ${H.fmt(a.principal)} + lãi ${H.fmt(a.accrued_interest)}`
        );
        H.ok(Array.isArray(a.transactions), `${a.name}: transactions phải là mảng`);
      }
    }
  );

  await t(
    'API-SAV-02',
    'GET /api/savings/summary cộng đúng các sổ đang hoạt động',
    ['rest:GET /api/savings/summary', 'ipc:savings:summary', 'bridge:savings.summary', 'client:savings.summary'],
    async () => {
      const s = await H.getOk('/api/savings/summary');
      for (const k of ['totalPrincipal', 'totalAccrued', 'totalBalance', 'accountCount', 'byBank', 'byType']) {
        H.ok(k in s, `summary thiếu khoá ${k}`);
      }
      H.ok(
        Math.abs(s.totalBalance - (s.totalPrincipal + s.totalAccrued)) < 1,
        'totalBalance ≠ gốc + lãi'
      );
      const active = (await H.getOk('/api/savings')).filter((a) => a.status === 'active');
      H.eq(s.accountCount, active.length, 'accountCount so với số sổ đang hoạt động');
      const sumPrincipal = active.reduce((x, a) => x + a.principal, 0);
      H.ok(Math.abs(s.totalPrincipal - sumPrincipal) < 1, 'totalPrincipal không khớp tổng các sổ hoạt động');
    }
  );

  await t(
    'API-SAV-03',
    'GET /api/savings/overview trả đủ các xô tiền của trang Tiết kiệm',
    ['rest:GET /api/savings/overview', 'ipc:savings:overview', 'bridge:savings.overview', 'client:savings.overview'],
    async () => {
      const o = await H.getOk('/api/savings/overview');
      for (const k of [
        'totalInflow', 'totalAllocated', 'totalOtherAllocated', 'totalUnallocated',
        'totalInSavings', 'duPhongAllocated', 'availableForDuPhong', 'goldAllocated', 'availableGoldFund',
      ]) {
        H.ok(k in o, `overview thiếu khoá ${k}`);
      }
      H.ok(o.totalUnallocated >= 0, 'totalUnallocated không được âm');
      H.ok(o.availableGoldFund >= 0, 'availableGoldFund không được âm');
    }
  );

  await t(
    'API-SAV-04',
    'Vòng đời sổ: mở → sửa → bơm vốn → xoá',
    [
      'rest:POST /api/savings', 'rest:PUT /api/savings/:id', 'rest:DELETE /api/savings/:id',
      'rest:GET /api/savings/:id', 'rest:POST /api/savings/:id/transactions',
      'ipc:savings:add', 'ipc:savings:update', 'ipc:savings:delete', 'ipc:savings:getById', 'ipc:savings:addTransaction',
      'bridge:savings.add', 'bridge:savings.update', 'bridge:savings.delete', 'bridge:savings.getById', 'bridge:savings.addTransaction',
      'client:savings.add', 'client:savings.update', 'client:savings.delete', 'client:savings.getById', 'client:savings.addTransaction',
    ],
    async () => {
      await H.fresh();
      const created = await H.createSavings({ name: 'Sổ kiểm thử', principal: 3000000, rate: 6 });
      const id = typeof created === 'object' ? created.id ?? created : created;
      H.ok(id, `POST /api/savings phải trả id, nhận ${JSON.stringify(created)}`);

      const one = await H.getOk(`/api/savings/${id}`);
      H.eq(one.principal, 3000000, 'gốc ban đầu');
      H.ok(one.transactions.length >= 1, 'mở sổ phải sinh một giao dịch gửi ban đầu');

      H.expectOk(await H.put(`/api/savings/${id}`, { interest_rate: 7.5 }), 'PUT /api/savings/:id');
      H.eq((await H.getOk(`/api/savings/${id}`)).interest_rate, 7.5, 'lãi suất sau khi sửa');

      H.expectOk(
        await H.post(`/api/savings/${id}/transactions`, {
          type: 'deposit',
          amount: 1000000,
          date: new Date().toISOString().slice(0, 10),
          note: 'Bơm thêm',
        }),
        'POST bơm vốn'
      );
      H.eq((await H.getOk(`/api/savings/${id}`)).principal, 4000000, 'gốc sau khi bơm 1tr');

      H.expectOk(await H.del(`/api/savings/${id}`), 'DELETE /api/savings/:id');
      H.ok(!(await H.getOk('/api/savings')).some((a) => a.id === id), 'sổ vẫn còn sau khi xoá');
      await H.fresh();
    }
  );

  await t(
    'API-SAV-05',
    'Xoá giao dịch sổ và sửa ngày giao dịch — hai hàm chỉ có ở bản web trước đây',
    [
      'rest:DELETE /api/savings/transactions/:id', 'rest:PUT /api/savings/transactions/:id/date',
      'ipc:savings:deleteTransaction', 'ipc:savings:updateTransactionDate',
      'bridge:savings.deleteTransaction', 'bridge:savings.updateTransactionDate',
      'client:savings.deleteTransaction', 'client:savings.updateTransactionDate',
    ],
    async () => {
      await H.fresh();
      const created = await H.createSavings({ name: 'Sổ giao dịch', principal: 2000000 });
      const id = typeof created === 'object' ? created.id ?? created : created;
      await H.post(`/api/savings/${id}/transactions`, {
        type: 'deposit',
        amount: 500000,
        date: '2026-07-15',
        note: 'Đợt 2',
      });

      let acc = await H.getOk(`/api/savings/${id}`);
      const dep = acc.transactions.find((x) => x.amount === 500000);
      H.ok(dep, 'không tìm thấy giao dịch vừa thêm');

      H.expectOk(
        await H.put(`/api/savings/transactions/${dep.id}/date`, { date: '2026-07-20' }),
        'PUT sửa ngày giao dịch'
      );
      acc = await H.getOk(`/api/savings/${id}`);
      H.eq(acc.transactions.find((x) => x.id === dep.id).date, '2026-07-20', 'ngày sau khi sửa');

      H.expectOk(await H.del(`/api/savings/transactions/${dep.id}`), 'DELETE giao dịch sổ');
      acc = await H.getOk(`/api/savings/${id}`);
      H.ok(!acc.transactions.some((x) => x.id === dep.id), 'giao dịch vẫn còn sau khi xoá');
      H.eq(acc.principal, 2000000, 'gốc phải trừ lại phần đã xoá');
      await H.fresh();
    }
  );

  await t(
    'API-SAV-06',
    'GET /api/savings/maturities chỉ trả sổ đáo hạn trong khoảng được hỏi',
    ['rest:GET /api/savings/maturities', 'ipc:savings:maturities', 'bridge:savings.maturities', 'client:savings.maturities'],
    async () => {
      const rows = await H.getOk('/api/savings/maturities?days=30');
      H.ok(Array.isArray(rows), 'phải trả về mảng');
      const today = new Date().toISOString().slice(0, 10);
      const limit = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
      for (const a of rows) {
        H.ok(
          a.maturity_date >= today && a.maturity_date <= limit,
          `${a.name} đáo hạn ${a.maturity_date} nằm ngoài cửa sổ ${today}…${limit}`
        );
      }
    }
  );

  await t(
    'API-SAV-07',
    'POST /api/savings/process-matured chạy được và không đụng sổ chưa tới hạn',
    ['rest:POST /api/savings/process-matured', 'ipc:savings:processMatured', 'bridge:savings.processMatured', 'client:savings.processMatured'],
    async () => {
      await H.fresh();
      const before = await H.getOk('/api/savings');
      const notDue = before.filter((a) => a.status === 'active' && (!a.maturity_date || a.maturity_date > new Date().toISOString().slice(0, 10)));

      H.expectOk(await H.post('/api/savings/process-matured'), 'POST /api/savings/process-matured');

      const after = await H.getOk('/api/savings');
      for (const a of notDue) {
        const now = after.find((x) => x.id === a.id);
        H.eq(now.status, 'active', `${a.name} chưa tới hạn mà bị đổi trạng thái`);
      }
      await H.fresh();
    }
  );
}

module.exports = { run };
