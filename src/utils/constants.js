export const PHASE_COLORS = {
  'PHASE 1': { bg: 'bg-emerald-500/20', text: 'text-emerald-400', border: 'border-emerald-500/30' },
  'PHASE 2': { bg: 'bg-purple-500/20', text: 'text-purple-400', border: 'border-purple-500/30' },
};

export const MILESTONE_COLORS = {
  '🚀 50M!': 'text-yellow-400',
  '🎯 100M!': 'text-orange-400',
  '⭐ 200M!': 'text-pink-400',
  '🏆 500M!': 'text-red-400',
};

export const SNIPER_LEVELS = [
  { level: '🟢 GIỮ NGUYÊN', condition: 'Drawdown < 15%', pct: 0, color: 'text-emerald-400' },
  { level: '🟡 CẤP 1', condition: 'Drawdown 15-24%', pct: 30, color: 'text-yellow-400' },
  { level: '🟠 CẤP 2', condition: 'Drawdown 25-34%', pct: 30, color: 'text-orange-400' },
  { level: '🔴 CẤP 3', condition: 'Drawdown ≥ 35%', pct: 40, color: 'text-red-400' },
];
