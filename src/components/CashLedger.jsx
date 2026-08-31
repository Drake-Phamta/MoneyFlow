import { useState, useEffect, useMemo } from 'react';
import { apiClient } from '../utils/apiClient';
import { formatVND, formatDate, todayLocal } from '../utils/formatters';
import { formatNumberInput, parseNumberInput } from '../utils/numberFormat';
import { EmptyState, Skeleton, useConfirm } from './ui/index.jsx';

/**
 * Ngăn Tiền mặt — tiền vào từ đâu, đi đâu, còn lại bao nhiêu, và nơi ghi những
 * khoản đã tiêu ra khỏi tài sản.
 *
 * Trước đây phần này sống trong một hộp thoại mở từ Tổng quan. Sai hai lẽ: mọi
 * hộp thoại khác trong app chỉ để GIẢI THÍCH một con số (NetWorthModal,
 * AssetDetailModal — không cái nào ghi gì), và mọi loại bản ghi khác đều có một
 * trang làm nhà. Khoản đã tiêu thì không. Giờ nó ở đây, cạnh Sổ cái.
 */

const SOURCE_LABEL = {
  savings_withdraw: 'Rút từ sổ tiết kiệm',
  savings_matured: 'Sổ đáo hạn',
  asset_sale: 'Bán tài sản, rút ra dùng',
  spend: 'Đã tiêu',
  manual: 'Ghi tay',
};

export default function CashLedger({ snap, onChanged }) {
  const { confirm, notify } = useConfirm();
  const [rows, setRows] = useState(null);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ amount: '', date: todayLocal(), note: '' });
  const [editing, setEditing] = useState(null); // { id, field }
  const [editValue, setEditValue] = useState('');

  useEffect(() => { reload(); }, []);

  async function reload() {
    try {
      setRows(await apiClient.cash.ledger());
    } catch {
      setRows([]);
    }
  }

  const cash = snap?.cash;

  // Các dòng phải CỘNG ĐÚNG ra số còn lại, nếu không sổ quỹ tự mâu thuẫn và
  // người đọc thôi tin cả màn hình. Đẳng thức backend bảo đảm:
  //
  //   còn lại = lương&thưởng + (các dòng vào)
  //             − gửi vào sổ − (đã mua tài sản + phần bán đã rút ra)
  //             − bù tháng chi vượt thu − (các dòng ra)
  //
  // Tiền bán đã rút ra dùng hiện thành một dòng VÀO, nên phần "đã mua tài sản"
  // phải cộng nó lại — nếu không cùng một khoản bị trừ hai lần.
  const lines = useMemo(() => {
    if (!snap || rows === null) return null;
    const al = snap.allocations || {};
    const cf = snap.cashflow || {};
    const out = [];

    // Gộp theo nguồn, không liệt kê từng dòng: đây là bản TÓM TẮT, chi tiết
    // nằm ở bảng ngay dưới. Liệt kê từng khoản thì sau vài chục lần tiêu là
    // sổ quỹ dài bằng cả trang và thôi tóm tắt được gì.
    const group = (dir) => {
      const by = {};
      for (const r of rows.filter((x) => x.direction === dir)) {
        by[r.source] ||= { amount: 0, count: 0 };
        by[r.source].amount += r.amount;
        by[r.source].count++;
      }
      return Object.entries(by).map(([source, g]) => ({
        dir,
        amount: g.amount,
        label: (SOURCE_LABEL[source] || 'Khác') + (g.count > 1 ? ` (${g.count} lần)` : ''),
      }));
    };

    if (cf.totalInflow > 0) {
      out.push({ dir: 'in', amount: cf.totalInflow, label: `Lương và thưởng, ${cf.months || 0} tháng` });
    }
    out.push(...group('in'));

    const toSavings = (al.toReserve || 0) + (al.toSavings || 0);
    if (toSavings > 0) out.push({ dir: 'out', amount: toSavings, label: 'Gửi vào sổ tiết kiệm' });

    const bought = (snap.portfolio?.invested || 0) + (cash?.fromMarket || 0);
    if (bought > 0) out.push({ dir: 'out', amount: bought, label: 'Đã mua tài sản' });

    if (cf.totalDeficit > 0) {
      out.push({ dir: 'out', amount: cf.totalDeficit, label: 'Bù cho những tháng chi vượt thu' });
    }
    out.push(...group('out'));
    return out;
  }, [snap, rows, cash]);

  async function handleAdd() {
    const amount = parseNumberInput(form.amount);
    if (!amount || amount <= 0) return;
    try {
      await apiClient.cash.spend(amount, form.date, form.note || 'Đã tiêu');
      setForm({ amount: '', date: todayLocal(), note: '' });
      setAdding(false);
      await reload();
      if (onChanged) onChanged();
    } catch (err) {
      await notify({ message: 'Lỗi: ' + err.message });
    }
  }

  async function handleDelete(row) {
    const ok = await confirm({
      title: 'Xoá khoản này khỏi sổ quỹ',
      message: 'Tiền quay lại ngăn tiền mặt và tổng tài sản tăng lại đúng bằng ngần ấy.',
      details: [
        { label: 'Khoản', value: row.note || SOURCE_LABEL[row.source] || 'Đã tiêu' },
        { label: 'Ngày', value: formatDate(row.date) },
        { label: 'Số tiền', value: formatVND(row.amount) },
      ],
      confirmLabel: 'Xoá',
      tone: 'danger',
    });
    if (!ok) return;
    await apiClient.cash.deleteMovement(row.id);
    await reload();
    if (onChanged) onChanged();
  }

  // Sửa tại ô, lưu khi rời ô — đúng cách Sổ cái đang làm, không hỏi lại.
  function startEdit(row, field) {
    if (row.source !== 'spend') return;
    setEditing({ id: row.id, field });
    setEditValue(field === 'amount' ? String(Math.round(row.amount)) : String(row[field] || ''));
  }

  async function saveEdit() {
    if (!editing) return;
    const { id, field } = editing;
    setEditing(null);
    const row = rows.find((r) => r.id === id);
    if (!row) return;

    const next =
      field === 'amount' ? parseNumberInput(editValue) : editValue.trim();
    if (field === 'amount' && (!next || next <= 0)) return;
    if (String(next) === String(row[field] || '')) return;

    try {
      await apiClient.cash.updateMovement(id, { [field]: next });
      await reload();
      if (onChanged) onChanged();
    } catch (err) {
      await notify({ message: 'Lỗi: ' + err.message });
    }
  }

  function onEditKey(e) {
    if (e.key === 'Enter') e.currentTarget.blur();
    if (e.key === 'Escape') { setEditing(null); }
  }

  const typed = parseNumberInput(form.amount) || 0;
  const left = (cash?.total || 0) - typed;

  return (
    <div className="space-y-5">
      {/* ── Sổ quỹ chữ T: mũi tên làm hết việc giải thích ───────────── */}
      <div className="card">
        <h3 className="text-fs-4 font-semibold text-slate-700">Tiền mặt</h3>
        <p className="text-fs-7 font-semibold text-slate-900 tabular mt-1 mb-4">
          {formatVND(cash?.total || 0)}
        </p>

        {lines === null ? (
          <Skeleton rows={4} />
        ) : (
          <div className="space-y-0.5">
            {lines.map((l, i) => (
              <div
                key={i}
                className="flex items-baseline gap-3 py-1.5 border-b border-slate-100 last:border-0"
              >
                <span
                  aria-hidden="true"
                  className={`w-4 shrink-0 text-center ${l.dir === 'in' ? 'text-emerald-600' : 'text-amber-700'}`}
                >
                  {l.dir === 'in' ? '←' : '→'}
                </span>
                <span className="w-40 shrink-0 text-right tabular text-slate-800">
                  {formatVND(l.amount)}
                </span>
                <span className="flex-1 min-w-0 text-fs-3 text-slate-500 truncate">{l.label}</span>
              </div>
            ))}

            <div className="flex items-baseline gap-3 pt-2.5 mt-1 border-t border-slate-300">
              <span className="w-4 shrink-0" />
              <span className="w-40 shrink-0 text-right tabular font-semibold text-slate-900">
                {formatVND(cash?.total || 0)}
              </span>
              <span className="flex-1 text-fs-3 text-slate-500">Còn lại</span>
            </div>
          </div>
        )}

        {cash?.overspent > 0 && (
          <p className="mt-3 text-fs-3 text-amber-800 bg-amber-50 border border-amber-200 rounded-input px-3 py-2 tabular">
            Đã ghi tiêu nhiều hơn tiền mặt đang có {formatVND(cash.overspent)}.
          </p>
        )}
      </div>

      {/* ── Từng lần tiền ra vào ─────────────────────────────────────── */}
      <div className="card">
        <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
          <h3 className="text-fs-4 font-semibold text-slate-700">Tiền ra vào</h3>
          {!adding && (
            <button type="button" onClick={() => setAdding(true)} className="btn-primary text-fs-3">
              Ghi khoản đã tiêu
            </button>
          )}
        </div>

        {adding && (
          <div className="mb-4 p-3 rounded-card border border-primary-200 bg-primary-50/40 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="text-fs-2 text-slate-500 mb-1 block">Số tiền</label>
                <input
                  type="text"
                  inputMode="numeric"
                  autoFocus
                  value={form.amount ? formatNumberInput(form.amount) : ''}
                  onChange={(e) => setForm({ ...form, amount: e.target.value.replace(/\D/g, '') })}
                  className="input text-sm"
                />
              </div>
              <div>
                <label className="text-fs-2 text-slate-500 mb-1 block">Ngày</label>
                <input
                  type="date"
                  value={form.date}
                  onChange={(e) => setForm({ ...form, date: e.target.value })}
                  className="input text-sm"
                />
              </div>
              <div>
                <label className="text-fs-2 text-slate-500 mb-1 block">Tiêu vào việc gì</label>
                <input
                  type="text"
                  value={form.note}
                  onChange={(e) => setForm({ ...form, note: e.target.value })}
                  placeholder="VD: Mua xe"
                  className="input text-sm"
                />
              </div>
            </div>

            {/* Hậu quả hiện ngay khi đang gõ, trước cả khi bấm lưu. */}
            {typed > 0 && (
              <p className="text-fs-3 text-slate-500 tabular">
                Ghi xong tiền mặt còn{' '}
                <strong className={left < 0 ? 'text-amber-800' : 'text-slate-800'}>
                  {formatVND(Math.max(0, left))}
                </strong>
                {left < 0 && <> — thiếu {formatVND(-left)}</>}
              </p>
            )}

            <div className="flex gap-2">
              <button type="button" onClick={handleAdd} disabled={!typed} className="btn-primary text-fs-3">
                Ghi vào sổ
              </button>
              <button
                type="button"
                onClick={() => { setAdding(false); setForm({ amount: '', date: todayLocal(), note: '' }); }}
                className="btn-ghost text-fs-3"
              >
                Huỷ
              </button>
            </div>
          </div>
        )}

        {rows === null ? (
          <Skeleton rows={3} />
        ) : rows.length === 0 ? (
          <EmptyState
            title="Chưa có lần nào"
            message="Rút sổ, sổ đáo hạn hay ghi một khoản đã tiêu thì nó hiện ở đây."
          />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th className="w-28">Ngày</th>
                  <th>Việc</th>
                  <th className="text-right w-40">Số tiền</th>
                  <th className="w-16" />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const editable = r.source === 'spend';
                  const sign = r.direction === 'in' ? '+' : '−';
                  const cell = (field, display) =>
                    editing?.id === r.id && editing?.field === field ? (
                      <input
                        autoFocus
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        onBlur={saveEdit}
                        onKeyDown={onEditKey}
                        className="input py-1 px-2 text-fs-3"
                      />
                    ) : (
                      <span
                        className={editable ? 'cursor-pointer hover:text-primary-600 hover:bg-primary-50 px-1 py-0.5 rounded' : ''}
                        onClick={() => startEdit(r, field)}
                      >
                        {display}
                      </span>
                    );

                  return (
                    <tr key={r.id}>
                      <td className="tabular">{cell('date', formatDate(r.date))}</td>
                      <td>{cell('note', r.note || SOURCE_LABEL[r.source] || 'Khác')}</td>
                      <td className={`text-right tabular ${r.direction === 'in' ? 'text-emerald-700' : 'text-amber-800'}`}>
                        {cell('amount', `${sign}${formatVND(r.amount)}`)}
                      </td>
                      <td className="text-right">
                        {editable && (
                          <button
                            type="button"
                            onClick={() => handleDelete(r)}
                            className="text-fs-2 text-slate-400 hover:text-red-600"
                          >
                            Xoá
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
