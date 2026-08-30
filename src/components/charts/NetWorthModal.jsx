import { useEffect, useMemo, useState } from 'react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import { apiClient } from '../../utils/apiClient';
import { formatVND } from '../../utils/formatters';
import { money, num } from '../../content/render.js';
import { Modal, EmptyState, Skeleton, Money } from '../ui/index.jsx';

/**
 * Tài sản ròng đã đi thế nào.
 *
 * Số liệu lấy thẳng từ GET /api/networth/history, tính XUÔI thời gian từ bản
 * ghi thật. Bản trước dựng lại lịch sử ngay trong trình duyệt bằng cách neo vào
 * tổng tài sản HÔM NAY rồi trừ ngược — nên mỗi lần đồng bộ giá là cả đường
 * lịch sử dịch theo, quá khứ không đứng yên.
 */
const SERIES = [
  { key: 'savings', label: 'Tiết kiệm', color: 'rgb(var(--c-emerald-600))' },
  { key: 'portfolio', label: 'Đầu tư', color: 'rgb(var(--c-blue-600))' },
  { key: 'cash', label: 'Tiền mặt', color: 'rgb(var(--c-slate-400))' },
];

export default function NetWorthModal({ onClose }) {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let alive = true;
    apiClient.networth
      .history()
      .then((d) => alive && setRows(d || []))
      .catch((e) => alive && setError(e));
    return () => { alive = false; };
  }, []);

  const data = useMemo(
    () =>
      (rows || []).map((r) => ({
        ...r,
        cash: Math.max(0, r.cash),
        portfolio: Math.max(0, r.portfolio),
        savings: Math.max(0, r.savings),
      })),
    [rows]
  );

  const first = data[0];
  const last = data[data.length - 1];
  const growth = first && last ? last.total - first.total : 0;
  const estimated = data.filter((d) => d.estimated).length;

  return (
    <Modal
      open
      onClose={onClose}
      size="xl"
      title="Tài sản ròng đã đi thế nào"
      description="Mỗi mốc là số dư chốt cuối tháng, tính từ những gì bạn đã ghi."
    >
      {error ? (
        <EmptyState
          title="Chưa đọc được lịch sử"
          message="Số liệu của bạn vẫn nguyên vẹn. Thử đóng rồi mở lại."
        />
      ) : !rows ? (
        <Skeleton rows={6} />
      ) : data.length < 2 ? (
        <EmptyState
          title="Chưa đủ mốc để vẽ"
          message="Ghi ít nhất hai tháng thì đường tài sản mới có hình."
        />
      ) : (
        <>
          <div className="flex flex-wrap items-baseline gap-x-10 gap-y-2 mb-5">
            <div>
              <p className="text-fs-1 uppercase tracking-widest text-slate-400 font-semibold">
                Hiện tại
              </p>
              <Money value={last.total} className="text-fs-7 text-slate-900 font-semibold" />
            </div>
            <div>
              <p className="text-fs-1 uppercase tracking-widest text-slate-400 font-semibold">
                Từ {first.month_label}
              </p>
              <p className="text-fs-5 font-semibold text-emerald-600 tabular">
                +{money(growth)}
                {first.total > 0 && (
                  <span className="text-fs-3 text-slate-500 font-normal ml-2">
                    gấp {num(last.total / first.total)} lần
                  </span>
                )}
              </p>
            </div>
          </div>

          <div className="h-[300px] -ml-2">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 8 }}>
                <CartesianGrid stroke="rgb(var(--c-slate-200))" vertical={false} />
                <XAxis
                  dataKey="month_label"
                  tick={{ fontSize: 11, fill: 'rgb(var(--c-slate-400))' }}
                  axisLine={{ stroke: 'rgb(var(--c-slate-200))' }}
                  tickLine={false}
                />
                <YAxis
                  tickFormatter={(v) => money(v)}
                  tick={{ fontSize: 11, fill: 'rgb(var(--c-slate-400))' }}
                  axisLine={false}
                  tickLine={false}
                  width={64}
                />
                <Tooltip
                  formatter={(v, n) => [formatVND(v), n]}
                  labelFormatter={(l) => 'Chốt cuối ' + l}
                  contentStyle={{
                    background: 'rgb(var(--c-white))',
                    border: '1px solid rgb(var(--c-slate-200))',
                    borderRadius: 'var(--r-input)',
                    fontSize: 'var(--fs-3)',
                    color: 'rgb(var(--c-slate-800))',
                  }}
                />
                <Legend iconType="square" iconSize={9} wrapperStyle={{ fontSize: 'var(--fs-2)', paddingTop: 8 }} />
                {SERIES.map((s) => (
                  <Area
                    key={s.key}
                    type="monotone"
                    dataKey={s.key}
                    name={s.label}
                    stackId="1"
                    stroke={s.color}
                    fill={s.color}
                    fillOpacity={0.85}
                    strokeWidth={0}
                    isAnimationActive={false}
                  />
                ))}
              </AreaChart>
            </ResponsiveContainer>
          </div>

          <div className="table-wrap mt-5 max-h-64">
            <table className="table">
              <thead>
                <tr>
                  <th>Chốt cuối</th>
                  <th className="text-right">Tiền mặt</th>
                  <th className="text-right">Đầu tư</th>
                  <th className="text-right">Tiết kiệm</th>
                  <th className="text-right">Tổng</th>
                </tr>
              </thead>
              <tbody>
                {[...data].reverse().map((r) => (
                  <tr key={r.month_index}>
                    <td className="whitespace-nowrap">{r.month_label}</td>
                    <td className="text-right tabular">{money(r.cash)}</td>
                    <td className="text-right tabular">{money(r.portfolio)}</td>
                    <td className="text-right tabular">{money(r.savings)}</td>
                    <td className="text-right tabular font-semibold text-slate-800">{money(r.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {estimated > 0 && (
            <p className="text-fs-2 text-slate-400 mt-3">
              {estimated} mốc dựng lại từ giao dịch và giá đóng cửa của chính tháng đó, vì
              app chưa chụp danh mục ở thời điểm ấy. Từ nay mỗi lần lưu một tháng là một
              ảnh chụp được ghi lại.
            </p>
          )}
        </>
      )}
    </Modal>
  );
}
