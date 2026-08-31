import { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { formatVND } from '../utils/formatters';
import { formatNumberInput, formatQuantity } from '../utils/numberFormat';
import { money, num } from '../content/render.js';
import { apiClient } from '../utils/apiClient';
import AllocationPie from './charts/AllocationPie';
import AssetDetailModal from './charts/AssetDetailModal';
import NetWorthModal from './charts/NetWorthModal';
import CustomTooltip from '../utils/CustomTooltip';
import { ArrowClockwise, Trash, CheckCircle, XCircle, Bell } from '../utils/iconMap';
import { useConfirm, EmptyState, Skeleton, GainLoss, toneClass } from './ui/index.jsx';

// Relative time formatter for activity feed
function formatRelativeTime(dateStr) {
  if (!dateStr) return '';
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Vừa xong';
  if (diffMins < 60) return `${diffMins} phút trước`;
  if (diffHours < 24) return `${diffHours} giờ trước`;
  if (diffDays < 7) return `${diffDays} ngày trước`;
  return date.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
}


// Loading skeleton component

// Màu và icon dự phòng, tra theo tên danh mục. Chỉ dùng khi bản ghi trong DB
// thiếu color/icon — tên danh mục luôn lấy từ DB chứ không viết cứng ở đây,
// vì viết cứng đúng là thứ đã làm nhóm Chứng Khoán biến mất khỏi biểu đồ
// (danh mục từng tên là 'Đầu Tư', migrateToV5 đổi tên mà chỗ này không đổi theo).
const CATEGORY_FALLBACK = {
  'Dự Phòng': { color: '#0F5D4A', icon: 'wallet' },
  'Chứng Khoán': { color: '#3A6B8A', icon: 'chart-line' },
  'Vàng': { color: '#B06D22', icon: 'coins' },
  'Bắn Tỉa': { color: '#A93E27', icon: 'crosshair' },
  'Tiết kiệm & Trái phiếu': { color: '#67558F', icon: 'bank' },
};

export default function Dashboard() {
  const { confirm } = useConfirm();
  const navigate = useNavigate();
  const [summary, setSummary] = useState(null);
  const [phase, setPhase] = useState(null);
  const [phaseAllocs, setPhaseAllocs] = useState([]);
  const [categories, setCategories] = useState([]);
  const [snap, setSnap] = useState(null);
  const [filled, setFilled] = useState([]);
  const [activity, setActivity] = useState([]);
  const [nextMonth, setNextMonth] = useState(null);
  const [editingPrice, setEditingPrice] = useState(null);
  const [priceValue, setPriceValue] = useState('');
  const [selectedAssetForModal, setSelectedAssetForModal] = useState(null);
  const [showNetWorthModal, setShowNetWorthModal] = useState(false);
  const [alertCount, setAlertCount] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefresh, setLastRefresh] = useState(null);
  const [savingsSummary, setSavingsSummary] = useState(null);
  const [savingsOverview, setSavingsOverview] = useState(null);
  const [maturities, setMaturities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);
  const [showAlerts, setShowAlerts] = useState(false);
  const [alerts, setAlerts] = useState([]);
  const [expandedCategory, setExpandedCategory] = useState(null);

  useEffect(() => {
    loadData();
    const lastRefreshTime = localStorage.getItem('lastPriceRefresh');
    const oneHour = 60 * 60 * 1000;
    if (!lastRefreshTime || (Date.now() - parseInt(lastRefreshTime)) > oneHour) {
      handleRefreshPrices(true);
    }
  }, []);

  // Poll activity every 30s (only when tab visible)
  const lastActivityIdRef = useRef(0);

  useEffect(() => {
    const POLL_INTERVAL = 30000;

    const poll = async () => {
      if (document.hidden) return;
      try {
        const latest = await apiClient.activity.get(1);
        if (latest.length > 0 && latest[0].id !== lastActivityIdRef.current) {
          lastActivityIdRef.current = latest[0].id;
          const fresh = await apiClient.activity.get(10);
          setActivity(fresh);
          // Also refresh alert count
          const ac = await apiClient.alerts.count().catch(() => ({ count: 0 }));
          setAlertCount(ac?.count || 0);
        }
      } catch (e) { /* silent */ }
    };

    const interval = setInterval(poll, POLL_INTERVAL);
    const onVisibility = () => { if (!document.hidden) poll(); };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  async function loadData() {
    try {
      setLoading(true);
      const [sn, s, f, a, n, ac, mats, alertsData] = await Promise.all([
        apiClient.snapshot.get().catch(e => { console.error('snapshot error:', e); return null; }),
        apiClient.portfolio.summary().catch(e => { console.error('portfolio.summary error:', e); return null; }),
        apiClient.monthly.filled(),
        apiClient.activity.get(10),
        apiClient.monthly.next(),
        apiClient.alerts.count().catch(() => ({ count: 0 })),
        apiClient.savings.maturities(30).catch(() => []),
        apiClient.alerts.get().catch(() => []),
      ]);
      // Snapshot đã mang sẵn danh mục, giai đoạn và toàn bộ số liệu tiết kiệm,
      // nên bốn lời gọi riêng cho những thứ đó không còn cần nữa.
      setSnap(sn);
      setCategories(sn?.categories || []);
      const p = sn?.phase ? { ...sn.phase, sort_order: sn.phase.sortOrder, goal_amount: sn.phase.goalAmount } : null;
      const ss = sn ? { totalPrincipal: sn.savings.principal, totalAccrued: sn.savings.accrued, totalBalance: sn.savings.balance, accountCount: sn.savings.accountCount } : null;
      const so = sn ? { totalUnallocated: sn.cash.unallocated, totalAllocated: sn.allocations.toReserve + sn.allocations.toSavings, totalOtherAllocated: sn.allocations.toMarket } : null;
      setSummary(s);
      setPhase(p);
      setFilled(f);
      setActivity(a);
      setNextMonth(n);
      setAlertCount(ac?.count || 0);
      setSavingsSummary(ss);
      setSavingsOverview(so);
      setMaturities(mats);
      setAlerts(alertsData || []);

      // Update last activity ID for polling
      if (a.length > 0) {
        lastActivityIdRef.current = a[0].id;
      }

      // Tỷ lệ phân bổ của giai đoạn hiện tại đã nằm sẵn trong snapshot.
      setPhaseAllocs(sn?.phaseAllocations?.[sn?.phase?.sortOrder] || []);
    } catch (err) {
      console.error('Dashboard load error:', err);
    } finally {
      setLoading(false);
    }
  }

  async function handleDeleteActivity(id) {
    const ok = await confirm({
      title: 'Xoá khỏi nhật ký',
      message: 'Dòng này biến mất khỏi nhật ký hoạt động. Giao dịch và số liệu tài chính không đổi.',
      confirmLabel: 'Xoá',
      tone: 'danger',
    });
    if (!ok) return;
    try {
      await apiClient.activity.delete(id);
      setToast({ type: 'success', message: 'Đã xóa hoạt động thành công' });
      setTimeout(() => setToast(null), 3000);
      const fresh = await apiClient.activity.get(10);
      setActivity(fresh);
      if (fresh.length > 0) {
        lastActivityIdRef.current = fresh[0].id;
      } else {
        lastActivityIdRef.current = 0;
      }
    } catch (err) {
      console.error('Delete activity error:', err);
      setToast({ type: 'error', message: 'Lỗi khi xóa hoạt động: ' + err.message });
      setTimeout(() => setToast(null), 4000);
    }
  }

  const portfolio = summary?.portfolio || [];
  const totalInvested = summary?.totalInvested || 0;
  const totalCurrentValue = summary?.totalCurrentValue || 0;
  const totalGain = summary?.totalGain || 0;
  const totalGainPct = totalInvested > 0 ? (totalGain / totalInvested) * 100 : 0;
  const byCategory = summary?.byCategory || {};

  // Cash flow data for mini chart (last 6 months)
  // Ba tháng gần nhất là đủ để thấy xu hướng mà cột không bị bóp nhỏ.
  // Muốn xem đủ thì sang trang Dòng tiền.
  const MINI_MONTHS = 3;
  const miniChartData = useMemo(() => {
    return filled.slice(-MINI_MONTHS).map(m => ({
      month: m.month_label,
      luong: m.income || 0,
      thuong: m.bonus || 0,
      chi: m.expense || 0,
    }));
  }, [filled]);

  // ── Mọi con số tài chính đến từ snapshot ────────────────────────────
  // Trang này từng tự tính tổng tài sản, tiền mặt và tiến độ giai đoạn theo
  // cách riêng, khác với trang Kịch bản và tab Phân bổ. Giờ cả ba đọc chung.
  const totalIncome = snap?.cashflow.totalIncome || 0;
  const totalNet = snap?.cashflow.totalInflow || 0;
  const hasExpenseData = (snap?.cashflow.totalExpense || 0) > 0;
  // Mẫu số là TOÀN BỘ tiền kiếm được, gồm cả thưởng. Chia cho riêng lương thì
  // Tổng quan hiện 88,4% còn Dòng tiền hiện 59,7% cho cùng một nhãn.
  const totalEarned = totalIncome + (snap?.cashflow.totalBonus || 0);
  const savingsRate =
    totalEarned > 0 && hasExpenseData ? (totalNet / totalEarned) * 100 : null;

  const totalSavingsPrincipal = snap?.savings.principal || 0;
  const totalSavingsAccrued = snap?.savings.accrued || 0;
  const totalSavingsBalance = snap?.savings.balance || 0;

  const totalCashUnallocated = snap?.cash.unallocated || 0;
  const uninvestedCash = snap?.cash.awaitingInvestment || 0;
  const totalCashOnHand = snap?.cash.total || 0;

  // Lãi/lỗ chưa bán của danh mục cộng lãi tiết kiệm đã tính tới hôm nay.
  const totalOverallGain = totalGain + totalSavingsAccrued;
  // Ba trạng thái, không phải hai: hoà vốn không phải là lãi.
  const gainChip =
    totalOverallGain > 0
      ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
      : totalOverallGain < 0
        ? 'border-red-200 bg-red-50 text-red-700'
        : 'border-amber-200 bg-amber-50 text-amber-700';
  const gainArrow = totalOverallGain > 0 ? '▲' : totalOverallGain < 0 ? '▼' : '=';
  const grandTotal = snap?.netWorth.total || 0;
  const liquidity = snap?.liquidity.total || 0;

  const phaseProgress = snap?.phase
    ? {
        current: snap.phase.current,
        goal: snap.phase.goalAmount,
        pct: snap.phase.pct,
        basis: snap.phase.basis,
      }
    : null;

  // Next phase info
  const nextPhase = snap?.nextPhase
    ? { ...snap.nextPhase, sort_order: snap.nextPhase.sortOrder }
    : null;

  // Danh mục lấy thẳng từ DB, theo đúng sort_order. Màu/icon ưu tiên giá trị
  // trong DB, chỉ dùng bảng dự phòng khi bản ghi thiếu.
  const categoryMeta = useMemo(() => {
    return (categories || []).map(c => {
      const fb = CATEGORY_FALLBACK[c.name] || {};
      return {
        name: c.name,
        color: c.color || fb.color || '#64748b',
        icon: c.icon || fb.icon || 'package',
      };
    });
  }, [categories]);

  // Allocation pie data (mọi danh mục)
  const allocPieData = useMemo(() => {
    return categoryMeta.map(c => ({
      name: c.name,
      value: byCategory[c.name]?.currentTotal || 0,
      color: c.color,
      icon: c.icon,
    }));
  }, [byCategory, categoryMeta]);

  // Target allocation lookup — VND per category
  // phase.goal_amount = target of the dominant category (e.g. Dự Phòng = 3× expense)
  // Total goal = goal_amount / max_ratio, then each category = total × its_ratio
  const targetLookup = (() => {
    if (!phaseAllocs.length || !phaseProgress?.goal) return {};
    const maxRatio = Math.max(...phaseAllocs.map(a => a.ratio));
    if (maxRatio <= 0) return {};
    const totalGoal = phaseProgress.goal / maxRatio;
    const lookup = {};
    phaseAllocs.forEach(a => { lookup[a.category_name] = totalGoal * a.ratio; });
    return lookup;
  })();

  async function handlePriceUpdate(assetId) {
    const price = parseFloat(priceValue);
    if (isNaN(price) || price <= 0) return;
    try {
      await apiClient.assets.updatePrice(assetId, price);
      setEditingPrice(null);
      setPriceValue('');
      loadData();
    } catch (err) {
      console.error('Price update error:', err);
    }
  }

  async function handleRefreshPrices(silent = false) {
    if (refreshing) return;
    setRefreshing(true);
    try {
      const result = await apiClient.prices.refresh();
      setLastRefresh(new Date());
      localStorage.setItem('lastPriceRefresh', Date.now().toString());
      await loadData();

      if (!silent && result) {
        const { total = 0, success = 0, failed = 0, noData = 0 } = result;

        if (total === 0) {
          setToast({ type: 'info', message: 'Không có tài sản nào đang đầu tư để cập nhật' });
        } else if (failed === 0 && noData === 0) {
          setToast({ type: 'success', message: 'Đã cập nhật giá thành công' });
        } else if (success > 0) {
          const failNames = (result.results || [])
            .filter(r => r.status === 'error')
            .map(r => r.ticker || r.name)
            .slice(0, 3)
            .join(', ');
          const detail = failNames ? ` (${failNames})` : '';
          setToast({ type: 'warning', message: `Cập nhật ${success}/${total} thành công, ${failed} lỗi${detail}` });
        } else {
          setToast({ type: 'error', message: 'Không thể cập nhật giá. Kiểm tra kết nối mạng.' });
        }
        setTimeout(() => setToast(null), failed > 0 ? 5000 : 4000);
      }
    } catch (err) {
      console.error('Refresh error:', err);
      if (!silent) {
        setToast({ type: 'error', message: 'Lỗi đồng bộ giá: ' + err.message });
        setTimeout(() => setToast(null), 5000);
      }
      localStorage.setItem('lastPriceRefresh', Date.now().toString());
    } finally {
      setRefreshing(false);
    }
  }

  function formatTime(date) {
    if (!date) return '';
    return date.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="card"><Skeleton rows={3} /></div>
        <div className="card"><Skeleton rows={5} /></div>
      </div>
    );
  }

  return (
    <div className="space-y-5 animate-fade-in">
      {/* ── Đầu trang: tên, nhắc việc thu nhỏ, đồng bộ giá ────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="page-title">Tổng quan</h1>
          <div className="flex flex-wrap items-center gap-2 mt-1">
            <span className="page-subtitle">Đã ghi nhận {filled.length} tháng</span>
            {nextMonth && (
              <button
                type="button"
                onClick={() => navigate('/cashflow?ghi=1')}
                data-testid="chip-nhap-lieu"
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-pill border border-primary-200 bg-primary-50 text-primary-700 text-fs-2 font-medium hover:bg-primary-100 transition"
              >
                Chưa nhập {nextMonth.month_label}
                <span aria-hidden="true">›</span>
              </button>
            )}
            {maturities.length > 0 && (
              <button
                type="button"
                onClick={() => navigate('/investments?tab=savings')}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-pill border border-amber-200 bg-amber-50 text-amber-700 text-fs-2 font-medium hover:bg-amber-100 transition"
              >
                {maturities.length} sổ sắp đáo hạn
                <span aria-hidden="true">›</span>
              </button>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowAlerts(v => !v)}
              aria-label={alertCount ? `Thông báo, ${alertCount} chưa đọc` : 'Thông báo'}
              className="relative p-2 rounded-input text-slate-500 hover:bg-slate-100 transition"
            >
              <Bell size={18} weight="regular" />
              {alertCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 bg-danger text-oncolor text-fs-1 rounded-pill min-w-[18px] h-[18px] px-1 flex items-center justify-center font-semibold">
                  {alertCount}
                </span>
              )}
            </button>
            {showAlerts && (
              <div className="absolute right-0 top-full mt-2 w-80 card p-0 z-30 max-h-96 overflow-y-auto">
                <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200">
                  <span className="text-fs-3 font-semibold text-slate-700">Thông báo</span>
                  {alertCount > 0 && (
                    <button
                      type="button"
                      onClick={async () => {
                        await apiClient.alerts.markAllRead();
                        setAlertCount(0);
                        setAlerts(prev => prev.map(a => ({ ...a, read: 1 })));
                      }}
                      className="text-fs-2 text-primary-700 hover:underline"
                    >
                      Đọc tất cả
                    </button>
                  )}
                </div>
                {alerts.length === 0 ? (
                  <p className="px-4 py-6 text-fs-3 text-slate-400 text-center">Không có thông báo</p>
                ) : (
                  alerts.slice(0, 12).map(a => (
                    <div key={a.id} className={`px-4 py-3 border-b border-slate-100 last:border-0 ${a.read ? '' : 'bg-primary-50'}`}>
                      <p className="text-fs-3 text-slate-700">{a.message}</p>
                      <p className="text-fs-2 text-slate-400 mt-0.5">{formatRelativeTime(a.created_at)}</p>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={() => handleRefreshPrices(false)}
            disabled={refreshing}
            className="btn-ghost text-fs-3 flex items-center gap-1.5"
          >
            <ArrowClockwise size={15} weight="regular" className={refreshing ? 'animate-spin' : ''} />
            {refreshing ? 'Đang đồng bộ…' : 'Đồng bộ giá'}
          </button>
        </div>
      </div>

      {/* ── 1. Tổng tài sản, và nó gồm những gì ───────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-[1.55fr_1fr] gap-4 items-start">
        <div className="card">
          <p className="kpi-label">Tổng tài sản</p>
          <button
            type="button"
            onClick={() => setShowNetWorthModal(true)}
            data-testid="net-worth"
            className="block text-left mt-1 group"
          >
            <span
              className="block text-slate-900 tabular group-hover:text-primary-700 transition"
              style={{ fontFamily: 'var(--font-display)', fontSize: '54px', fontWeight: 500, lineHeight: 1, letterSpacing: '-0.025em' }}
            >
              {formatVND(grandTotal)}
            </span>
            <span className="text-fs-2 text-slate-400 mt-1.5 block">Bấm để xem đã đi thế nào</span>
          </button>

          <dl className="grid grid-cols-3 gap-3 mt-6 pt-5 border-t border-slate-200">
            {[
              ['Tiền mặt', totalCashOnHand],
              ['Đầu tư', totalCurrentValue],
              ['Tiết kiệm', totalSavingsBalance],
            ].map(([label, value]) => (
              <div key={label}>
                <dt className="text-fs-2 text-slate-400">{label}</dt>
                <dd className="text-fs-4 font-semibold text-slate-800 tabular mt-0.5">{formatVND(value)}</dd>
              </div>
            ))}
          </dl>

          <div className="flex flex-wrap items-center gap-2.5 mt-4">
            <span className={`inline-flex items-baseline gap-1.5 px-2.5 py-1 rounded-pill border text-fs-3 font-semibold tabular ${gainChip}`}>
              <span aria-hidden="true">{gainArrow}</span>
              {totalInvested > 0 ? `${num(Math.abs(totalGainPct), 2)}%` : formatVND(Math.abs(totalOverallGain))}
            </span>
            <span className="text-fs-2 text-slate-500">
              {totalOverallGain === 0
                ? 'Chưa lãi chưa lỗ'
                : `${totalOverallGain > 0 ? 'Lãi' : 'Lỗ'} ${formatVND(Math.abs(totalOverallGain))} tính từ lúc bắt đầu`}
            </span>
          </div>
        </div>

        <div className="card">
          <p className="kpi-label mb-3">Cơ cấu</p>
          {allocPieData.filter(d => d.value > 0).length === 0 ? (
            <EmptyState
              title="Chưa có tài sản nào"
              message="Ghi tháng đầu tiên là biểu đồ này có hình."
              action={
                <button type="button" onClick={() => navigate('/cashflow?ghi=1')} className="btn-primary text-fs-3">
                  Nhập liệu tháng đầu tiên
                </button>
              }
            />
          ) : (
            <AllocationPie data={allocPieData.filter(d => d.value > 0)} layout="horizontal" />
          )}
        </div>
      </div>

      {/* ── 2. Bốn con số cần liếc mỗi ngày ───────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatTile label="Tiền nhàn rỗi" value={formatVND(totalNet)} note={`Thu trừ chi, cộng dồn ${filled.length} tháng`} />
        <StatTile
          label="Thanh khoản"
          value={formatVND(liquidity)}
          note={
            snap?.savings.termPrincipal > 0
              ? `Rút ngay được — ${money(snap.savings.termPrincipal)} còn khoá kỳ hạn`
              : 'Rút ngay được, không mất lãi'
          }
        />
        <StatTile
          label="Tỷ lệ tiết kiệm"
          value={savingsRate !== null ? `${num(savingsRate)}%` : '—'}
          note={savingsRate !== null ? `Kiếm 100đ thì giữ lại được ${Math.round(savingsRate)}đ` : 'Chưa đủ dữ liệu'}
        />
        <StatTile
          label="Mốc tự do tài chính"
          value={snap ? money(snap.fi.fiNumber) : '—'}
          note={snap ? `Đủ số này thì sống bằng lợi nhuận — đã đi ${num(snap.fi.ratio, 2)}%` : ''}
        />
      </div>

      {/* ── 3. Giai đoạn đang ở ───────────────────────────────────────── */}
      {phaseProgress && phase && (
        <div className="card">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <span className="kpi-label">{phase.name}</span>
            <span className="text-fs-4 font-semibold text-slate-800 tabular">
              {formatVND(phaseProgress.current)} / {formatVND(phaseProgress.goal)}
            </span>
          </div>
          <div className="mt-3 h-2 bg-slate-100 rounded-pill overflow-hidden">
            <div
              className="h-full bg-primary-600 rounded-pill transition-all duration-700"
              style={{ width: `${Math.min(100, phaseProgress.pct)}%` }}
            />
          </div>
          <div className="flex flex-wrap items-baseline justify-between gap-2 mt-2">
            <span className="text-fs-2 text-slate-500">
              {phaseProgress.current < phaseProgress.goal ? (
                <>Còn <strong className="text-slate-700">{formatVND(phaseProgress.goal - phaseProgress.current)}</strong> nữa</>
              ) : (
                'Đã đạt mốc của giai đoạn này'
              )}
            </span>
            <span className="text-fs-3 font-semibold text-primary-700 tabular">{num(phaseProgress.pct)}%</span>
          </div>

          {phaseAllocs.length > 0 && (
            <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 mt-4 pt-4 border-t border-slate-200">
              <span className="text-fs-2 text-slate-400 uppercase tracking-widest font-semibold">Phân bổ</span>
              {phaseAllocs.map(a => (
                <span key={a.category_name} className="text-fs-3 text-slate-600">
                  <strong className="text-slate-800 tabular">{Math.round(a.ratio * 100)}%</strong> {a.category_name}
                </span>
              ))}
            </div>
          )}
          {nextPhase && <p className="text-fs-2 text-slate-400 mt-3">Tiếp theo: {nextPhase.name}</p>}
        </div>
      )}

      {/* ── 4. Danh mục đang nắm giữ ──────────────────────────────────── */}
      <div className="card">
        <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
          <h3 className="text-fs-4 font-semibold text-slate-700">Danh mục đang nắm giữ</h3>
          <span className="text-fs-2 text-slate-400">Bấm vào giá để sửa</span>
        </div>

        {(summary?.portfolio || []).length === 0 ? (
          <EmptyState
            title="Chưa nắm giữ tài sản nào"
            message="Ghi một lệnh mua là nó xuất hiện ở đây."
            action={
              <button type="button" onClick={() => navigate('/investments?tab=portfolio')} className="btn-primary text-fs-3">
                Ghi giao dịch đầu tiên
              </button>
            }
          />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Mã</th>
                  <th className="text-right">Số lượng</th>
                  <th className="text-right">Giá vốn TB</th>
                  <th className="text-right">Giá hiện tại</th>
                  <th className="text-right">Giá trị</th>
                  <th className="text-right">Lãi/lỗ</th>
                </tr>
              </thead>
              <tbody>
                {(summary?.portfolio || []).map(p => {
                  const gain = (p.current_value || 0) - (p.total_invested || 0);
                  const gainPct = p.total_invested > 0 ? (gain / p.total_invested) * 100 : 0;
                  return (
                    <tr key={p.asset_type_id}>
                      <td>
                        <button
                          type="button"
                          onClick={() => setSelectedAssetForModal(p)}
                          className="font-medium text-slate-800 hover:text-primary-700 transition text-left"
                        >
                          {p.ticker || p.name}
                        </button>
                        {p.ticker && <span className="block text-fs-2 text-slate-400">{p.name}</span>}
                      </td>
                      <td className="text-right tabular">{formatQuantity(p.total_quantity)} {p.unit}</td>
                      <td className="text-right tabular">{formatVND(p.avg_cost)}</td>
                      <td className="text-right">
                        {editingPrice === p.asset_type_id ? (
                          <input
                            autoFocus
                            aria-label={`Giá của ${p.ticker || p.name}`}
                            value={priceValue ? formatNumberInput(priceValue) : ''}
                            onChange={e => setPriceValue(e.target.value.replace(/\D/g, ''))}
                            onBlur={() => handlePriceUpdate(p.asset_type_id)}
                            onKeyDown={e => {
                              if (e.key === 'Enter') handlePriceUpdate(p.asset_type_id);
                              if (e.key === 'Escape') setEditingPrice(null);
                            }}
                            className="input text-fs-3 text-right w-28 py-1"
                          />
                        ) : (
                          <button
                            type="button"
                            onClick={() => { setEditingPrice(p.asset_type_id); setPriceValue(p.current_price?.toString() || ''); }}
                            className="tabular hover:text-primary-700 transition"
                          >
                            {formatVND(p.current_price)}
                          </button>
                        )}
                      </td>
                      <td className="text-right tabular font-semibold text-slate-800">{formatVND(p.current_value)}</td>
                      <td className="text-right">
                        <GainLoss value={gain} pct={gainPct} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={4} className="font-medium text-slate-600">Tổng</td>
                  <td className="text-right tabular font-semibold text-slate-800">{formatVND(totalCurrentValue)}</td>
                  <td className="text-right">
                    <GainLoss value={totalGain} className="font-semibold" />
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {/* ── 5. Thu chi gần đây ────────────────────────────────────────── */}
      {miniChartData.length > 0 && (
        <div className="card">
          <div className="flex flex-wrap items-baseline justify-between gap-2 mb-1">
            <h3 className="text-fs-4 font-semibold text-slate-700">
              Thu chi {miniChartData.length} tháng gần nhất
            </h3>
            <button
              type="button"
              onClick={() => navigate('/cashflow')}
              className="text-fs-2 text-primary-700 hover:underline"
            >
              Xem đầy đủ ›
            </button>
          </div>
          <p className="text-fs-2 text-slate-400 mb-3">
            Cột trái là tiền vào, cột phải là tiền ra. Phần chênh lệch là tiền bạn giữ lại được.
          </p>
          <div className="h-52">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={miniChartData} margin={{ top: 4, right: 4, bottom: 0, left: 0 }} barGap={4}>
                <CartesianGrid stroke="rgb(var(--c-slate-200))" vertical={false} />
                <XAxis
                  dataKey="month"
                  tick={{ fontSize: 11, fill: 'rgb(var(--c-slate-400))' }}
                  axisLine={{ stroke: 'rgb(var(--c-slate-200))' }}
                  tickLine={false}
                />
                <YAxis
                  tickFormatter={v => money(v)}
                  tick={{ fontSize: 11, fill: 'rgb(var(--c-slate-400))' }}
                  axisLine={false}
                  tickLine={false}
                  width={56}
                />
                <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgb(var(--c-slate-100))' }} />
                <Legend
                  iconType="square"
                  iconSize={9}
                  wrapperStyle={{ fontSize: 'var(--fs-2)', paddingTop: 6 }}
                  // Recharts tô chữ chú giải theo màu cột. Cột "Thưởng" sáng
                  // nên chữ chìm vào nền — ép về màu chữ thường.
                  formatter={(value) => (
                    <span style={{ color: 'rgb(var(--c-slate-500))' }}>{value}</span>
                  )}
                />
                {/* Lương và thưởng xếp chồng thành MỘT cột "tiền vào": tháng nào
                    thưởng lớn hơn lương thì nhìn cột là thấy ngay. */}
                <Bar dataKey="luong" stackId="thu" name="Lương" fill="rgb(var(--c-emerald-600))" />
                <Bar dataKey="thuong" stackId="thu" name="Thưởng" fill="rgb(var(--c-emerald-400))" radius={[3, 3, 0, 0]} />
                <Bar dataKey="chi" name="Chi tiêu" fill="rgb(var(--c-amber-600))" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* ── 6. Hoạt động gần đây ──────────────────────────────────────── */}
      <div className="card">
        <h3 className="text-fs-4 font-semibold text-slate-700 mb-3">Hoạt động gần đây</h3>
        {activity.length === 0 ? (
          <EmptyState title="Chưa có hoạt động nào" message="Mọi thao tác ghi chép sẽ hiện ở đây." />
        ) : (
          <div className="divide-y divide-slate-200">
            {activity.map(a => (
              <div key={a.id} className="flex items-baseline gap-3 py-2.5 group">
                <span className="text-fs-2 text-slate-400 w-24 shrink-0 tabular">{formatRelativeTime(a.date)}</span>
                <span className="flex-1 text-fs-3 text-slate-700 min-w-0">{a.description}</span>
                {a.amount > 0 && <span className="text-fs-3 text-slate-600 tabular shrink-0">{formatVND(a.amount)}</span>}
                <button
                  type="button"
                  onClick={() => handleDeleteActivity(a.id)}
                  aria-label="Xoá khỏi nhật ký"
                  className="opacity-0 group-hover:opacity-100 focus:opacity-100 text-slate-400 hover:text-red-600 transition shrink-0"
                >
                  <Trash size={14} weight="regular" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {toast && (
        <div className="fixed bottom-6 right-6 z-50 animate-slide-up bg-slate-800 text-oncolor px-5 py-3 rounded-input shadow-2xl flex items-center gap-3 max-w-sm">
          {toast.type === 'success' && <CheckCircle size={18} weight="fill" />}
          {toast.type === 'error' && <XCircle size={18} weight="fill" />}
          <span className="text-fs-3">{toast.message}</span>
        </div>
      )}

      {selectedAssetForModal && (
        <AssetDetailModal asset={selectedAssetForModal} onClose={() => setSelectedAssetForModal(null)} />
      )}
      {showNetWorthModal && <NetWorthModal onClose={() => setShowNetWorthModal(false)} />}
    </div>
  );
}

/** Một con số cần liếc mỗi ngày. Nhãn trên, số giữa, giải thích dưới. */
function StatTile({ label, value, note }) {
  return (
    <div className="card">
      <p className="kpi-label">{label}</p>
      <p className="text-fs-6 font-semibold text-slate-900 tabular mt-1">{value}</p>
      {note && <p className="text-fs-2 text-slate-400 mt-1">{note}</p>}
    </div>
  );
}
