import { useState, useEffect, useMemo } from 'react';
import { apiClient } from '../../utils/apiClient';
import { formatVND, todayLocal } from '../../utils/formatters';
import { formatNumberInput, parseNumberInput } from '../../utils/numberFormat';
import { Modal, Skeleton, useConfirm } from '../ui/index.jsx';

/**
 * Sổ quỹ ngăn Tiền mặt — tiền vào từ đâu, đi đâu, còn lại bao nhiêu.
 *
 * Cố ý không có đoạn văn giải thích nào. Hai mũi tên ← → và cột số làm hết
 * việc đó: nhìn một lần là thấy lương chảy vào, phân bổ chảy ra, sổ đáo hạn
 * chảy vào, khoản đã tiêu chảy ra.
 *
 * Đây cũng là nhà của nút "Ghi khoản đã tiêu" — nó nằm đúng chỗ tiền đang nằm,
 * không phải một thẻ riêng ở trang khác.
 */
export default function CashLedgerModal({ open, onClose, snap, onChanged }) {
  const { confirm, notify } = useConfirm();
  const [rows, setRows] = useState(null);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ amount: '', date: todayLocal(), note: '' });

  useEffect(() => {
    if (!open) return;
    setRows(null);
    apiClient.cash.ledger().then(setRows).catch(() => setRows([]));
  }, [open]);

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

    if (cf.totalInflow > 0) {
      out.push({ dir: 'in', amount: cf.totalInflow, label: `Lương và thưởng, ${cf.months || 0} tháng` });
    }
    for (const r of rows.filter((x) => x.direction === 'in')) {
      out.push({
        id: r.id, dir: 'in', amount: r.amount,
        label: r.note || SOURCE_LABEL[r.source] || 'Khác', date: r.date,
      });
    }

    const toSavings = (al.toReserve || 0) + (al.toSavings || 0);
    if (toSavings > 0) out.push({ dir: 'out', amount: toSavings, label: 'Gửi vào sổ tiết kiệm' });

    const bought = (snap.portfolio?.invested || 0) + (cash?.fromMarket || 0);
    if (bought > 0) out.push({ dir: 'out', amount: bought, label: 'Đã mua tài sản' });

    if (cf.totalDeficit > 0) {
      out.push({ dir: 'out', amount: cf.totalDeficit, label: 'Bù cho những tháng chi vượt thu' });
    }
    for (const r of rows.filter((x) => x.direction === 'out')) {
      out.push({
        id: r.id, dir: 'out', amount: r.amount,
        label: r.note || SOURCE_LABEL[r.source] || 'Đã tiêu', date: r.date,
        removable: r.source === 'spend',
      });
    }
    return out;
  }, [snap, rows, cash]);

  async function handleAdd() {
    const amount = parseNumberInput(form.amount);
    if (!amount || amount <= 0) return;
    try {
      await apiClient.cash.spend(amount, form.date, form.note || 'Đã tiêu');
      setForm({ amount: '', date: todayLocal(), note: '' });
      setAdding(false);
      setRows(await apiClient.cash.ledger());
      if (onChanged) onChanged();
    } catch (err) {
      await notify({ message: 'Lỗi: ' + err.message });
    }
  }

  async function handleRemove(row) {
    const ok = await confirm({
      title: 'Bỏ dòng này khỏi sổ quỹ',
      message: 'Tiền quay lại ngăn tiền mặt và tổng tài sản tăng lại đúng bằng ngần ấy.',
      details: [
        { label: 'Khoản', value: row.label },
        { label: 'Số tiền', value: formatVND(row.amount) },
      ],
      confirmLabel: 'Bỏ dòng này',
      tone: 'danger',
    });
    if (!ok) return;
    await apiClient.cash.deleteMovement(row.id);
    setRows(await apiClient.cash.ledger());
    if (onChanged) onChanged();
  }

  const typed = parseNumberInput(form.amount) || 0;
  const left = (cash?.total || 0) - typed;

  return (
    <Modal open={open} onClose={onClose} title="Tiền mặt" size="lg">
      <p className="text-fs-7 font-semibold text-slate-900 tabular mb-4">
        {formatVND(cash?.total || 0)}
      </p>

      {lines === null ? (
        <Skeleton rows={4} />
      ) : (
        <div className="space-y-0.5">
          {lines.map((l, i) => (
            <div
              key={l.id ? `r${l.id}` : `s${i}`}
              className="flex items-baseline gap-3 py-1.5 border-b border-slate-100 last:border-0"
            >
              <span
                aria-hidden="true"
                className={`w-4 shrink-0 text-center ${l.dir === 'in' ? 'text-emerald-600' : 'text-amber-700'}`}
              >
                {l.dir === 'in' ? '←' : '→'}
              </span>
              <span className="w-36 shrink-0 text-right tabular text-slate-800">
                {formatVND(l.amount)}
              </span>
              <span className="flex-1 min-w-0 text-fs-3 text-slate-500 truncate">{l.label}</span>
              {l.date && <span className="text-fs-2 text-slate-400 tabular shrink-0">{l.date}</span>}
              {l.removable && (
                <button
                  type="button"
                  onClick={() => handleRemove(l)}
                  className="text-fs-2 text-slate-400 hover:text-red-600 shrink-0"
                >
                  Bỏ
                </button>
              )}
            </div>
          ))}

          <div className="flex items-baseline gap-3 pt-2.5 mt-1 border-t border-slate-300">
            <span className="w-4 shrink-0" />
            <span className="w-36 shrink-0 text-right tabular font-semibold text-slate-900">
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

      <div className="mt-5 pt-4 border-t border-slate-200">
        {!adding ? (
          <button type="button" onClick={() => setAdding(true)} className="btn-primary text-fs-3">
            Ghi khoản đã tiêu
          </button>
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-3">
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
      </div>
    </Modal>
  );
}

const SOURCE_LABEL = {
  savings_withdraw: 'Rút từ sổ tiết kiệm',
  savings_matured: 'Sổ đáo hạn',
  asset_sale: 'Bán tài sản, rút ra dùng',
  spend: 'Đã tiêu',
  manual: 'Ghi tay',
};
