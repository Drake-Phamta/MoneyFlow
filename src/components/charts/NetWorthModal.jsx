import { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { formatVND, todayLocal, toLocalDateStr } from '../../utils/formatters';
import { apiClient } from '../../utils/apiClient';

// Tùy chỉnh Tooltip hiển thị
function NetWorthTooltip({ active, payload, label }) {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    if (data.netWorth === null) {
      return (
        <div className="bg-white p-3 rounded-xl shadow-xl border border-slate-100 min-w-[150px]">
          <p className="text-fs-1 font-semibold text-slate-400 uppercase tracking-widest mb-1">{label}</p>
          <p className="text-base font-bold text-slate-800 tracking-tight">—</p>
        </div>
      );
    }
    return (
      <div className="bg-white p-4 rounded-2xl shadow-xl border border-slate-100 min-w-[220px] space-y-2">
        <p className="text-fs-1 font-semibold text-slate-400 uppercase tracking-widest">{label}</p>
        
        <div className="border-b border-slate-100 pb-2">
          <p className="text-fs-1 uppercase tracking-wider font-semibold text-slate-400">Tổng tài sản ròng</p>
          <p className="text-base font-bold text-slate-800 tracking-tight font-mono">{formatVND(data.netWorth)}</p>
        </div>

        <div className="grid grid-cols-2 gap-4 text-xs pt-1">
          <div>
            <p className="text-fs-1 uppercase tracking-wider font-semibold text-slate-400">Tiền mặt & Tiết kiệm</p>
            <p className="font-semibold text-slate-700 font-mono">{formatVND(data.cashAndSavings)}</p>
          </div>
          <div>
            <p className="text-fs-1 uppercase tracking-wider font-semibold text-slate-400">Giá trị đầu tư</p>
            <p className="font-semibold text-slate-700 font-mono">{formatVND(data.investmentValue)}</p>
          </div>
        </div>
      </div>
    );
  }
  return null;
}

// Thống nhất bộ lọc thời gian (giống AssetDetailModal)
const FILTERS = [
  { label: '1 Tháng', value: '1M', days: 30 },
  { label: '3 Tháng', value: '3M', days: 90 },
  { label: '6 Tháng', value: '6M', days: 180 },
  { label: '1 Năm', value: '1Y', days: 365 },
  { label: 'Tất cả', value: 'ALL', days: 0 },
];

export default function NetWorthModal({ filled, grandTotal, portfolio, onClose }) {
  const [filter, setFilter] = useState('1M');
  const [allPriceData, setAllPriceData] = useState({}); // { assetId: [{date, price},...] }
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);

  // Fetch TOÀN BỘ lịch sử giá và toàn bộ giao dịch (1 lần duy nhất)
  useEffect(() => {
    async function loadData() {
      setLoading(true);
      try {
        const [txData] = await Promise.all([
          apiClient.transactions.get()
        ]);
        // Sắp xếp giao dịch lũy kế tăng dần
        const sortedTxs = [...txData].sort((a, b) => {
          const cmp = a.date.localeCompare(b.date);
          if (cmp !== 0) return cmp;
          return a.id - b.id;
        });
        setTransactions(sortedTxs);

        const priceMap = {};
        await Promise.all(portfolio.map(async (p) => {
          try {
            const data = await apiClient.priceHistory.fetch(p.asset_type_id, 0);
            if (data && data.length) {
              // Đảo ngược để chronological (cũ → mới)
              priceMap[p.asset_type_id] = [...data].reverse().map(d => ({
                date: d.date,
                price: d.close
              }));
            }
          } catch (e) {
            console.error('Failed to fetch history for', p.asset_type_id, e);
          }
        }));
        setAllPriceData(priceMap);
      } catch (err) {
        console.error('Failed to fetch Net Worth Modal data:', err);
      } finally {
        setLoading(false);
      }
    }

    if (portfolio.length > 0) {
      loadData();
    } else {
      setLoading(false);
    }
  }, [portfolio]);

  // Tính toán Hybrid Net Worth Chart
  const chartData = useMemo(() => {
    if (loading) return [];

    const selectedFilter = FILTERS.find(f => f.value === filter);

    // Tính toán holdings lũy kế cho từng tài sản
    const runningHoldingsMap = {};
    portfolio.forEach(p => {
      const assetTxs = transactions.filter(t => t.asset_type_id === p.asset_type_id);
      const running = [];
      let qty = 0;
      let avgC = 0;
      for (const tx of assetTxs) {
        const tQty = Number(tx.quantity);
        const tAmount = Number(tx.total_amount);
        if (tx.type === 'BUY') {
          const prevQty = qty;
          qty += tQty;
          if (qty > 0) {
            avgC = (prevQty * avgC + tAmount) / qty;
          } else {
            avgC = 0;
          }
        } else if (tx.type === 'SELL') {
          qty = Math.max(0, qty - tQty);
          if (qty === 0) avgC = 0;
        }
        running.push({
          date: tx.date,
          quantity: qty,
          avgCost: avgC
        });
      }
      runningHoldingsMap[p.asset_type_id] = running;
    });

    const getHoldingsAt = (assetId, dateStr) => {
      const running = runningHoldingsMap[assetId];
      if (!running || running.length === 0) return { quantity: 0, avgCost: 0 };
      let latest = null;
      for (const h of running) {
        if (h.date <= dateStr) {
          latest = h;
        } else {
          break;
        }
      }
      return latest || { quantity: 0, avgCost: 0 };
    };

    const parseMonthLabel = (label) => {
      const m = label.match(/T(\d+)\/(\d+)/);
      if (m) {
        const month = m[1].padStart(2, '0');
        const year = m[2];
        return `${year}-${month}-01`;
      }
      return null;
    };

    const parseMonthEnd = (label) => {
      const m = label.match(/T(\d+)\/(\d+)/);
      if (m) {
        const month = parseInt(m[1]);
        const year = parseInt(m[2]);
        const lastDay = new Date(year, month, 0).getDate();
        return `${year}-${m[1].padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
      }
      return null;
    };

    const getYearMonth = (dateStr) => {
      return dateStr.substring(0, 7); // "YYYY-MM"
    };

    // Chế độ Daily Hybrid: Tiền mặt/Tiết kiệm cố định + giá tài sản biến động theo ngày
    const currentPortfolioValue = portfolio.reduce((sum, p) => sum + (p.current_value || 0), 0);
    const baseCashAndSavings = grandTotal - currentPortfolioValue;

    // Thu thập tất cả các ngày duy nhất từ tất cả tài sản, các tháng đã ghi nhận và hôm nay
    const dateSet = new Set();
    Object.values(allPriceData).forEach(arr => arr.forEach(d => dateSet.add(d.date)));
    
    filled.forEach(m => {
      const parsed = parseMonthLabel(m.month_label);
      if (parsed) dateSet.add(parsed);
    });
    
    const todayStr = todayLocal();
    dateSet.add(todayStr);

    let allDates = [...dateSet].sort();

    // Tìm ngày giao dịch đầu tiên hoặc ngày ghi nhận đầu tiên
    let earliestDate = null;
    if (transactions.length > 0) {
      earliestDate = transactions[0].date;
    }
    if (filled.length > 0) {
      const firstMonthDate = parseMonthLabel(filled[0].month_label);
      if (firstMonthDate && (!earliestDate || firstMonthDate < earliestDate)) {
        earliestDate = firstMonthDate;
      }
    }

    // Giới hạn biểu đồ theo đầu tháng của mốc thời gian bắt đầu thực tế
    let startOfMonthDate = null;
    if (earliestDate) {
      const parts = earliestDate.split('-');
      if (parts.length >= 2) {
        startOfMonthDate = `${parts[0]}-${parts[1]}-01`;
      }
    }

    if (startOfMonthDate) {
      allDates = allDates.filter(d => d >= startOfMonthDate);
    }

    // Lọc theo bộ lọc thời gian (1M, 3M, 6M, 1Y)
    if (selectedFilter && selectedFilter.days > 0) {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - selectedFilter.days);
      const cutoffStr = toLocalDateStr(cutoff);
      allDates = allDates.filter(d => d >= cutoffStr);
    }

    if (allDates.length === 0) {
      return [{ date: 'Hiện tại', dateLabel: 'Hiện tại', netWorth: grandTotal }];
    }

    // Cho mỗi ngày, tính tổng giá trị portfolio và điều chỉnh tiền mặt ngược dòng
    const data = allDates.map(dateStr => {
      let dailyPortfolioValue = 0;
      portfolio.forEach(p => {
        const prices = allPriceData[p.asset_type_id];
        if (prices && prices.length > 0) {
          // Tìm giá gần nhất cho ngày này
          let closestPrice = prices[0].price;
          for (const pt of prices) {
            if (pt.date <= dateStr) closestPrice = pt.price;
            else break;
          }
          const { quantity } = getHoldingsAt(p.asset_type_id, dateStr);
          dailyPortfolioValue += quantity * closestPrice;
        }
      });

      // Điều chỉnh tiền ngược dòng thời gian (Reverse adjustments)
      let adjustedCashAndSavings = baseCashAndSavings;
      
      // 1. Điều chỉnh theo các giao dịch mua/bán tài sản
      transactions.forEach(t => {
        if (t.date > dateStr) {
          const amt = Number(t.total_amount) + Number(t.fee || 0);
          if (t.type === 'BUY') {
            adjustedCashAndSavings += amt; // trước đó ta có nhiều tiền hơn
          } else if (t.type === 'SELL') {
            adjustedCashAndSavings -= amt; // trước đó ta có ít tiền hơn
          }
        }
      });

      // 2. Điều chỉnh theo dòng tiền tích lũy hàng tháng (income + bonus - expense)
      // Dùng nội suy tuyến tính (Linear Interpolation) để phân bổ dòng tiền đều đặn mỗi ngày
      // Tránh việc biểu đồ bị "nhảy bậc" (jump) vào đầu/cuối tháng
      const currentYearMonth = getYearMonth(todayStr);
      filled.forEach(m => {
        const mDateStr = parseMonthLabel(m.month_label);
        if (mDateStr) {
          const mYearMonth = getYearMonth(mDateStr);
          // Không điều chỉnh đối với tháng hiện tại của thời gian thực (tránh làm lệch số dư Hiện tại)
          if (mYearMonth !== currentYearMonth) {
            const mStart = mDateStr;
            const mEnd = parseMonthEnd(m.month_label);
            const netFlow = (m.income || 0) + (m.bonus || 0) - (m.expense || 0);

            if (mEnd && mStart) {
              if (dateStr < mStart) {
                // Nếu đang xem một ngày TRƯỚC tháng này -> tháng này chưa tích lũy tí nào -> trừ toàn bộ
                adjustedCashAndSavings -= netFlow;
              } else if (dateStr >= mStart && dateStr <= mEnd) {
                // Nếu đang TRONG tháng này -> Nội suy tuyến tính (Linear Interpolation)
                const startDt = new Date(mStart);
                const endDt = new Date(mEnd);
                const currentDt = new Date(dateStr);
                
                const totalDays = endDt.getDate(); // Tổng số ngày trong tháng (vd: 30, 31)
                const currentDay = currentDt.getDate(); // Ngày đang xét
                
                // Số tiền CHƯA được tích lũy tính từ currentDay đến cuối tháng
                const unaccumulatedRatio = (totalDays - currentDay) / totalDays;
                adjustedCashAndSavings -= (netFlow * unaccumulatedRatio);
              }
              // Nếu dateStr > mEnd -> Tháng này ĐÃ tích lũy xong -> Không trừ (giữ nguyên trong số dư)
            }
          }
        }
      });

      return {
        date: dateStr,
        dateLabel: new Date(dateStr).toLocaleDateString('vi-VN', { 
          day: '2-digit', 
          month: '2-digit',
          year: '2-digit'
        }),
        netWorth: (earliestDate && dateStr < earliestDate) ? null : (adjustedCashAndSavings + dailyPortfolioValue),
        cashAndSavings: (earliestDate && dateStr < earliestDate) ? null : adjustedCashAndSavings,
        investmentValue: (earliestDate && dateStr < earliestDate) ? null : dailyPortfolioValue
      };
    });

    return data;
  }, [filter, filled, grandTotal, portfolio, allPriceData, transactions, loading]);

  // Thống kê
  const stats = useMemo(() => {
    if (!chartData.length) return null;
    
    const filteredData = chartData.filter(d => d.netWorth !== null);
    if (!filteredData.length) return null;
    
    const startPrice = filteredData[0].netWorth;
    const endPrice = filteredData[filteredData.length - 1].netWorth;
    const change = endPrice - startPrice;
    const changePct = startPrice > 0 ? (change / startPrice) * 100 : 0;
    
    let high = filteredData[0].netWorth;
    let low = filteredData[0].netWorth;
    filteredData.forEach(d => {
      if (d.netWorth > high) high = d.netWorth;
      if (d.netWorth < low) low = d.netWorth;
    });

    const isPositive = change >= 0;

    return { startPrice, endPrice, change, changePct, high, low, isPositive };
  }, [chartData]);

  // Tính số ticks hiển thị trên trục X
  const minTickGap = chartData.length > 90 ? 60 : chartData.length > 30 ? 40 : 20;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 animate-fade-in">
      {/* Background overlay */}
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={onClose}></div>
      
      {/* Modal Content */}
      <div className="relative bg-white rounded-3xl shadow-2xl w-full max-w-4xl overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="p-6 sm:p-8 pb-4 border-b border-slate-100 flex items-start justify-between">
          <div>
            <h2 className="text-2xl sm:text-3xl font-bold text-slate-800 tracking-tight">Tổng tài sản ròng</h2>
            <p className="text-fs-1 uppercase tracking-widest font-semibold text-slate-400 mt-1">Biến động quỹ đạo tích lũy</p>
          </div>
          <button onClick={onClose} className="p-2 bg-slate-100 hover:bg-slate-200 rounded-full text-slate-500 transition-colors">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          </button>
        </div>

        {/* Main Content */}
        <div className="p-6 sm:p-8 pt-6 flex-1 overflow-y-auto">
          {/* Main Price & Stats */}
          <div className="flex flex-col sm:flex-row sm:items-end justify-between mb-8 gap-4">
            <div>
              <p className="text-fs-1 uppercase tracking-widest font-semibold text-slate-400 mb-1">Hiện tại</p>
              <div className="flex items-end gap-3">
                <p className="text-4xl font-bold text-slate-800 tracking-tight">{formatVND(grandTotal)}</p>
                {stats && (
                  <p className={`text-sm font-bold mb-1 ${stats.isPositive ? 'text-emerald-600' : 'text-red-600'}`}>
                    {stats.isPositive ? '+' : ''}{formatVND(stats.change)} ({stats.isPositive ? '+' : ''}{stats.changePct.toFixed(2)}%)
                  </p>
                )}
              </div>
            </div>
            
            {/* Filter Buttons — Đồng nhất với Asset Detail Modal */}
            <div className="flex bg-slate-100 p-1 rounded-xl">
              {FILTERS.map(f => (
                <button 
                  key={f.value}
                  onClick={() => setFilter(f.value)}
                  className={`px-4 py-1.5 text-xs font-bold rounded-lg transition-all ${filter === f.value ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {/* Chart Area */}
          <div className="h-[300px] sm:h-[400px] w-full relative">
            {loading ? (
              <div className="absolute inset-0 flex items-center justify-center flex-col gap-3">
                <div className="w-8 h-8 border-4 border-slate-200 border-t-primary-500 rounded-full animate-spin"></div>
                <p className="text-xs font-bold text-slate-400">Đang tải lịch sử giá tài sản...</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 10, right: 0, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorNwModal" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={stats?.isPositive ? '#0F5D4A' : '#f43f5e'} stopOpacity={0.4}/>
                      <stop offset="95%" stopColor={stats?.isPositive ? '#0F5D4A' : '#f43f5e'} stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis 
                    dataKey="dateLabel" 
                    tickLine={false} 
                    axisLine={false} 
                    tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: 700 }}
                    tickMargin={10}
                    minTickGap={minTickGap}
                  />
                  <YAxis 
                    tickLine={false} 
                    axisLine={false} 
                    tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: 700 }}
                    tickFormatter={(v) => formatVND(v)}
                    width={80}
                  />
                  <Tooltip content={<NetWorthTooltip />} cursor={{ stroke: '#cbd5e1', strokeWidth: 1, strokeDasharray: '3 3' }} />
                  <Area 
                    type="monotone" 
                    dataKey="netWorth" 
                    stroke={stats?.isPositive ? '#0F5D4A' : '#f43f5e'} 
                    strokeWidth={2.5} 
                    fillOpacity={1} 
                    fill="url(#colorNwModal)" 
                    isAnimationActive={false} 
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Stats Grid */}
          {stats && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-8 pt-8 border-t border-slate-100">
              <div className="bg-slate-50 p-4 rounded-2xl">
                <p className="text-fs-1 uppercase tracking-widest font-semibold text-slate-400 mb-1">Đỉnh ({FILTERS.find(f=>f.value===filter)?.label})</p>
                <p className="text-lg font-bold text-slate-800 tracking-tight">{formatVND(stats.high)}</p>
              </div>
              <div className="bg-slate-50 p-4 rounded-2xl">
                <p className="text-fs-1 uppercase tracking-widest font-semibold text-slate-400 mb-1">Đáy ({FILTERS.find(f=>f.value===filter)?.label})</p>
                <p className="text-lg font-bold text-slate-800 tracking-tight">{formatVND(stats.low)}</p>
              </div>
              <div className="bg-slate-50 p-4 rounded-2xl">
                <p className="text-fs-1 uppercase tracking-widest font-semibold text-slate-400 mb-1">Khởi điểm ({FILTERS.find(f=>f.value===filter)?.label})</p>
                <p className="text-lg font-bold text-slate-800 tracking-tight">{formatVND(stats.startPrice)}</p>
              </div>
              <div className="bg-slate-50 p-4 rounded-2xl">
                <p className="text-fs-1 uppercase tracking-widest font-semibold text-slate-400 mb-1">Biên độ dao động</p>
                <p className="text-lg font-bold text-slate-800 tracking-tight font-mono">{formatVND(stats.high - stats.low)}</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
