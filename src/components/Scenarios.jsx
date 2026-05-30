import { useState, useEffect } from 'react';
import { apiClient } from '../utils/apiClient';
import { formatVND, formatPercent } from '../utils/formatters';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts';
import { ChartLineUp, BookOpen, Target, TrendUp } from '@phosphor-icons/react';

const KNOWLEDGE = [
  { title: 'Lãi kép', icon: '📈', content: 'A = P(1 + r/n)^(nt). Đầu tư sớm và đều đặn là chìa khóa.' },
  { title: 'Lạm phát', icon: '📉', content: 'VN trung bình 3-4%/năm. Tiền mặt mất giá theo thời gian.' },
  { title: 'Quy tắc 4%', icon: '🎯', content: 'Rút 4%/năm từ danh mục → có thể duy trì 30+ năm.' },
  { title: 'Đa dạng hóa', icon: '🧺', content: 'Không bỏ trứng vào một giỏ. Phân bổ theo giai đoạn.' },
  { title: 'Tiết kiệm', icon: '💰', content: 'Tiết kiệm ≥20% thu nhập. Tăng dần theo thời gian.' },
];

export default function Scenarios() {
  const [params, setParams] = useState([]);
  const [portfolio, setPortfolio] = useState(null);
  const [phases, setPhases] = useState([]);
  const [expandedPhase, setExpandedPhase] = useState(null);

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    const [p, po, ph] = await Promise.all([apiClient.params.get(), apiClient.portfolio.summary(), apiClient.phases.get()]);
    setParams(p); setPortfolio(po); setPhases(ph);
  }

  const getParam = (key) => params.find(p => p.key === key)?.value || '0';
  const monthlyIncome = parseFloat(getParam('monthly_income'));
  const savingsRate = parseFloat(getParam('savings_rate'));
  const monthlySavings = monthlyIncome * savingsRate;
  const totalAssets = (portfolio?.totalCurrentValue || 0);

  // FI Projections
  const years = 10;
  const scenarios = [
    { name: 'Bảo thủ', rate: 0.05, color: '#94a3b8' },
    { name: 'Cơ sở', rate: 0.07, color: '#3b82f6' },
    { name: 'Lạc quan', rate: 0.10, color: '#10b981' },
  ];

  const projectionData = [];
  for (let y = 0; y <= years; y++) {
    const row = { year: `N${y}` };
    for (const s of scenarios) {
      const monthlyRate = s.rate / 12;
      const months = y * 12;
      // Future value of current assets + future value of monthly contributions
      const fvAssets = totalAssets * Math.pow(1 + s.rate, y);
      const fvContributions = monthlySavings * ((Math.pow(1 + monthlyRate, months) - 1) / monthlyRate);
      row[s.name] = Math.round(fvAssets + fvContributions);
    }
    projectionData.push(row);
  }

  return (
    <div className="space-y-6 animate-fadeIn">
      <div className="page-header">
        <h1 className="text-2xl font-bold">Kịch Bản</h1>
      </div>

      {/* Phase Roadmap */}
      <div className="card">
        <h3 className="font-semibold mb-4 flex items-center gap-2"><Target size={20} /> Lộ trình giai đoạn</h3>
        <div className="space-y-3">
          {phases.map(p => (
            <div key={p.id} className={`border rounded-xl p-3 cursor-pointer transition-all ${p.is_active ? 'border-primary-300 bg-primary-50/50' : 'border-gray-200 hover:border-gray-300'}`}
              onClick={() => setExpandedPhase(expandedPhase === p.id ? null : p.id)}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${p.is_active ? 'bg-primary-600 text-white' : 'bg-gray-200 text-gray-600'}`}>
                    {p.id}
                  </div>
                  <div>
                    <div className="font-medium">{p.name}</div>
                    <div className="text-xs text-gray-500">Mục tiêu: {formatVND(p.target_amount)}</div>
                  </div>
                </div>
                {p.is_active && <span className="badge bg-primary-100 text-primary-700">Đang hoạt động</span>}
              </div>
              {expandedPhase === p.id && (
                <div className="mt-3 pt-3 border-t text-sm text-gray-600">
                  <p className="mb-2">{p.description}</p>
                  <p className="text-xs text-gray-500 italic">{p.guidance}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Knowledge Base */}
      <div className="card">
        <h3 className="font-semibold mb-4 flex items-center gap-2"><BookOpen size={20} /> Kiến thức tài chính</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {KNOWLEDGE.map((k, i) => (
            <div key={i} className="p-3 bg-gray-50 rounded-xl">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-lg">{k.icon}</span>
                <span className="font-medium text-sm">{k.title}</span>
              </div>
              <p className="text-xs text-gray-600">{k.content}</p>
            </div>
          ))}
        </div>
      </div>

      {/* FI Projection Chart */}
      <div className="card">
        <h3 className="font-semibold mb-4 flex items-center gap-2"><TrendUp size={20} /> Dự phóng tài chính 10 năm</h3>
        <div className="text-sm text-gray-600 mb-3">
          Giả sử: Tiết kiệm {formatVND(monthlySavings)}/tháng · Tài sản hiện tại: {formatVND(totalAssets)}
        </div>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={projectionData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="year" tick={{ fontSize: 12 }} />
            <YAxis tickFormatter={v => v >= 1e9 ? (v/1e9).toFixed(1)+'B' : v >= 1e6 ? (v/1e6).toFixed(0)+'M' : v} tick={{ fontSize: 12 }} />
            <Tooltip formatter={v => formatVND(v)} />
            <Legend />
            {scenarios.map(s => (
              <Line key={s.name} type="monotone" dataKey={s.name} stroke={s.color} strokeWidth={2} dot={false} />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
