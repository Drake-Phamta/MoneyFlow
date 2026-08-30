import { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { AreaChart, Area, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { formatVND, toLocalDateStr } from '../../utils/formatters';
import { apiClient } from '../../utils/apiClient';

// Tùy chỉnh Tooltip hiển thị đầy đủ thông số đầu tư thực tế
function AssetTooltip({ active, payload, label }) {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    if (data.currentValue === null) {
      return (
        <div className="bg-white p-3 rounded-xl shadow-xl border border-slate-100 min-w-[150px]">
          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest mb-1">{label}</p>
          <p className="text-xs font-semibold text-slate-400">Chưa sở hữu tài sản</p>
        </div>
      );
    }
    
    const isGain = data.profit >= 0;
    return (
      <div className="bg-white p-4 rounded-2xl shadow-xl border border-slate-100 min-w-[200px] space-y-2">
        <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest">{label}</p>
        
        <div className="border-b border-slate-100 pb-2">
          <p className="text-[9px] uppercase tracking-wider font-semibold text-slate-400">Giá trị tài sản</p>
          <p className="text-base font-bold text-slate-800 tracking-tight">{formatVND(data.currentValue)}</p>
        </div>

        <div className="grid grid-cols-2 gap-2 text-xs">
          <div>
            <p className="text-[9px] uppercase tracking-wider font-semibold text-slate-400">Vốn đầu tư</p>
            <p className="font-semibold text-slate-700 font-mono">{formatVND(data.costBasis)}</p>
          </div>
          <div>
            <p className="text-[9px] uppercase tracking-wider font-semibold text-slate-400">Giá thị trường</p>
            <p className="font-semibold text-slate-700 font-mono">{formatVND(data.price)}</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 text-xs pt-1 border-t border-slate-100">
          <div>
            <p className="text-[9px] uppercase tracking-wider font-semibold text-slate-400">Số lượng sở hữu</p>
            <p className="font-semibold text-slate-700 font-mono">{data.quantity}</p>
          </div>
          <div>
            <p className="text-[9px] uppercase tracking-wider font-semibold text-slate-400">Lãi / Lỗ</p>
            <p className={`font-bold font-mono ${isGain ? 'text-emerald-600' : 'text-red-600'}`}>
              {isGain ? '+' : ''}{formatVND(data.profit)}
              <span className="text-[10px] block font-medium">({isGain ? '+' : ''}{data.profitPct.toFixed(2)}%)</span>
            </p>
          </div>
        </div>
      </div>
    );
  }
  return null;
}

// Thống nhất bộ lọc thời gian
const FILTERS = [
  { label: '1 Tháng', value: '1M', days: 30 },
  { label: '3 Tháng', value: '3M', days: 90 },
  { label: '6 Tháng', value: '6M', days: 180 },
  { label: '1 Năm', value: '1Y', days: 365 },
  { label: 'Tất cả', value: 'ALL', days: 0 },
];

export default function AssetDetailModal({ asset, onClose }) {
  const [allData, setAllData] = useState([]); // Toàn bộ lịch sử (fetch 1 lần)
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('1M');

  // Fetch TOÀN BỘ lịch sử và giao dịch 1 lần duy nhất khi mở Modal
  useEffect(() => {
    if (!asset) return;
    
    async function loadData() {
      setLoading(true);
      try {
        const [historyData, txData] = await Promise.all([
          apiClient.priceHistory.fetch(asset.asset_type_id, 0),
          apiClient.transactions.get()
        ]);
        
        // Lọc giao dịch của tài sản hiện tại
        const assetTxs = txData
          .filter(t => t.asset_type_id === asset.asset_type_id)
          .sort((a, b) => {
            const cmp = a.date.localeCompare(b.date);
            if (cmp !== 0) return cmp;
            return a.id - b.id;
          });

        setTransactions(assetTxs);

        if (historyData && historyData.length) {
          // Tính lũy kế số lượng nắm giữ và giá vốn trung bình di động
          const runningHoldings = [];
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
            runningHoldings.push({
              date: tx.date,
              quantity: qty,
              avgCost: avgC
            });
          }

          const getHoldingsAt = (dateStr) => {
            let latest = null;
            for (const h of runningHoldings) {
              if (h.date <= dateStr) {
                latest = h;
              } else {
                break;
              }
            }
            return latest || { quantity: 0, avgCost: 0 };
          };

          // Xác định ngày mua đầu tiên
          const firstBuyTx = assetTxs.find(t => t.type === 'BUY');
          const firstBuyDate = firstBuyTx ? firstBuyTx.date : asset.first_buy_date;

          let startOfMonthDate = null;
          if (firstBuyDate) {
            const parts = firstBuyDate.split('-');
            if (parts.length >= 2) {
              startOfMonthDate = `${parts[0]}-${parts[1]}-01`;
            }
          }

          // Tạo dữ liệu biểu đồ cá nhân hóa
          const mapped = [...historyData].reverse().map(d => {
            const { quantity, avgCost } = getHoldingsAt(d.date);
            
            // Chỉ bắt đầu tính toán các thông số sở hữu từ ngày mua đầu tiên
            const hasStarted = firstBuyDate && d.date >= firstBuyDate;
            const costBasis = hasStarted ? quantity * avgCost : null;
            const currentValue = hasStarted ? quantity * d.close : null;
            const profit = hasStarted ? currentValue - costBasis : null;
            const profitPct = (hasStarted && costBasis > 0) ? (profit / costBasis) * 100 : 0;

            return {
              date: d.date,
              dateLabel: new Date(d.date).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: '2-digit' }),
              price: d.close,
              open: d.open,
              high: d.high,
              low: d.low,
              quantity: hasStarted ? quantity : null,
              avgCost: hasStarted ? avgCost : null,
              costBasis,
              currentValue,
              profit,
              profitPct
            };
          });

          // Cắt bớt phần lịch sử trước đầu tháng của giao dịch đầu tiên
          const cropped = startOfMonthDate 
            ? mapped.filter(d => d.date >= startOfMonthDate)
            : mapped;

          setAllData(cropped);
        } else {
          setAllData([]);
        }
      } catch (err) {
        console.error('Failed to load asset details:', err);
        setAllData([]);
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, [asset]);

  // Lọc data theo filter đã chọn
  const filteredData = useMemo(() => {
    if (!allData.length) return [];
    const selectedFilter = FILTERS.find(f => f.value === filter);
    if (!selectedFilter || selectedFilter.days === 0) return allData;
    
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - selectedFilter.days);
    const cutoffStr = toLocalDateStr(cutoff);
    
    return allData.filter(d => d.date >= cutoffStr);
  }, [allData, filter]);

  // Các thông số thống kê dựa trên giá trị tài sản
  const stats = useMemo(() => {
    if (!filteredData.length) return null;
    
    // Lọc bỏ những ngày chưa mua tài sản (currentValue là null) để tính toán số liệu chính xác
    const validData = filteredData.filter(d => d.currentValue !== null);
    if (!validData.length) return null;
    
    const startValue = validData[0].currentValue;
    const endValue = validData[validData.length - 1].currentValue;
    const change = endValue - startValue;
    const changePct = startValue > 0 ? (change / startValue) * 100 : 0;
    
    let high = validData[0].currentValue;
    let low = validData[0].currentValue;
    validData.forEach(d => {
      if (d.currentValue > high) high = d.currentValue;
      if (d.currentValue < low) low = d.currentValue;
    });

    const isPositive = change >= 0;

    return { startValue, endValue, change, changePct, high, low, isPositive };
  }, [filteredData]);

  if (!asset) return null;

  // Tính số ticks hiển thị trên trục X
  const minTickGap = filteredData.length > 90 ? 60 : filteredData.length > 30 ? 40 : 20;

  // Định dạng nhãn trục Y thông minh
  const formatYAxis = (val) => {
    if (val >= 1000000) return (val / 1000000).toFixed(1).replace('.0', '') + 'tr';
    if (val >= 1000) return (val / 1000).toFixed(0) + 'k';
    return val;
  };

  const currentProfit = asset.current_value - asset.total_invested;
  const currentProfitPct = asset.total_invested > 0 ? (currentProfit / asset.total_invested) * 100 : 0;
  const isOverallPositive = currentProfit >= 0;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 animate-fade-in">
      {/* Background overlay */}
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={onClose}></div>
      
      {/* Modal Content */}
      <div className="relative bg-white rounded-3xl shadow-2xl w-full max-w-4xl overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="p-6 sm:p-8 pb-4 border-b border-slate-100 flex items-start justify-between">
          <div>
            <h2 className="text-2xl sm:text-3xl font-bold text-slate-800 tracking-tight">{asset.name}</h2>
            <p className="text-[10px] uppercase tracking-widest font-semibold text-slate-400 mt-1">{asset.category}</p>
          </div>
          <button onClick={onClose} className="p-2 bg-slate-100 hover:bg-slate-200 rounded-full text-slate-500 transition-colors">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          </button>
        </div>

        {/* Main Content */}
        <div className="p-6 sm:p-8 pt-6 flex-1 overflow-y-auto">
          {/* Main Price & Stats */}
          <div className="flex flex-col sm:flex-row sm:items-end justify-between mb-8 gap-6">
            <div className="flex flex-wrap gap-8">
              <div>
                <p className="text-[10px] uppercase tracking-widest font-semibold text-slate-400 mb-1">Giá hiện tại</p>
                <p className="text-3xl font-bold text-slate-800 tracking-tight font-mono">{formatVND(asset.current_price)}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-widest font-semibold text-slate-400 mb-1">Lãi / Lỗ đầu tư của bạn</p>
                <div className="flex items-end gap-2">
                  <p className={`text-3xl font-bold tracking-tight font-mono ${isOverallPositive ? 'text-emerald-600' : 'text-red-600'}`}>
                    {isOverallPositive ? '+' : ''}{formatVND(currentProfit)}
                  </p>
                  <p className={`text-sm font-medium mb-1 ${isOverallPositive ? 'text-emerald-600' : 'text-red-600'}`}>
                    ({isOverallPositive ? '+' : ''}{currentProfitPct.toFixed(2)}%)
                  </p>
                </div>
              </div>
            </div>
            
            {/* Filter Buttons */}
            <div className="flex bg-slate-100 p-1 rounded-xl self-start sm:self-auto">
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
                <p className="text-xs font-bold text-slate-400">Đang tính toán tăng trưởng tài sản...</p>
              </div>
            ) : filteredData.length === 0 ? (
              <div className="absolute inset-0 flex items-center justify-center flex-col text-slate-400">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" className="mb-2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>
                <p className="text-sm font-bold">Chưa có dữ liệu đầu tư của tài sản này</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={filteredData} margin={{ top: 10, right: 0, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorAsset" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={stats?.isPositive ? '#10b981' : '#f43f5e'} stopOpacity={0.3}/>
                      <stop offset="95%" stopColor={stats?.isPositive ? '#10b981' : '#f43f5e'} stopOpacity={0}/>
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
                    domain={['auto', 'auto']}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={formatYAxis}
                    tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: 700 }}
                    width={55}
                    orientation="right"
                  />
                  <Tooltip content={<AssetTooltip />} cursor={{ stroke: '#cbd5e1', strokeWidth: 1, strokeDasharray: '3 3' }} />
                  <ReferenceLine y={stats?.startValue} stroke="#cbd5e1" strokeDasharray="3 3" />
                  
                  {/* Vùng Giá trị tài sản */}
                  <Area 
                    type="monotone" 
                    dataKey="currentValue" 
                    stroke={stats?.isPositive ? '#10b981' : '#f43f5e'} 
                    strokeWidth={2.5} 
                    fillOpacity={1} 
                    fill="url(#colorAsset)" 
                    isAnimationActive={false} 
                  />

                  {/* Đường Vốn đầu tư gốc */}
                  <Line 
                    type="monotone" 
                    dataKey="costBasis" 
                    stroke="#94a3b8" 
                    strokeWidth={1.5} 
                    strokeDasharray="4 4" 
                    dot={false}
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
                <p className="text-[10px] uppercase tracking-widest font-semibold text-slate-400 mb-1">Đỉnh tài sản ({FILTERS.find(f=>f.value===filter)?.label})</p>
                <p className="text-lg font-bold text-slate-800 tracking-tight font-mono">{formatVND(stats.high)}</p>
              </div>
              <div className="bg-slate-50 p-4 rounded-2xl">
                <p className="text-[10px] uppercase tracking-widest font-semibold text-slate-400 mb-1">Đáy tài sản ({FILTERS.find(f=>f.value===filter)?.label})</p>
                <p className="text-lg font-bold text-slate-800 tracking-tight font-mono">{formatVND(stats.low)}</p>
              </div>
              <div className="bg-slate-50 p-4 rounded-2xl">
                <p className="text-[10px] uppercase tracking-widest font-semibold text-slate-400 mb-1">Khối lượng đang giữ</p>
                <p className="text-lg font-bold text-slate-800 tracking-tight font-mono">
                  {asset.total_quantity} <span className="text-xs font-normal text-slate-500">{asset.unit || 'đơn vị'}</span>
                </p>
              </div>
              <div className="bg-slate-50 p-4 rounded-2xl">
                <p className="text-[10px] uppercase tracking-widest font-semibold text-slate-400 mb-1">Giá vốn TB</p>
                <p className="text-lg font-bold text-slate-800 tracking-tight font-mono">{formatVND(asset.avg_cost)}</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
