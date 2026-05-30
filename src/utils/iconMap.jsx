import {
  ShieldCheck, TrendUp, Coins, Crosshair, PiggyBank,
  ChartLineUp, Wallet, Bank, Vault, House, Lightning,
  ArrowUp, ArrowDown, Minus, Plus, Check, X, Gear,
  FileText, Calendar, Clock, Warning, Info, Star,
  ArrowClockwise, Download, Upload, Trash, Pencil,
  Eye, EyeSlash, MagnifyingGlass, Funnel, SortAscending,
  DotsThree, CaretDown, CaretUp, CaretLeft, CaretRight,
  ChartBar, ChartPieSlice, ChartLine, TrendDown,
  Buildings, Factory, Storefront, Airplane, Car, Boat,
  Desktop, DeviceMobile, Drop, Fire, Leaf, Mountain,
  MusicNote, PaintBrush, Planet, RadioButton, Rocket,
  Smiley, Sun, Moon, Cloud, Umbrella,
} from '@phosphor-icons/react';

const ICON_MAP = {
  'shield-check': ShieldCheck,
  'trend-up': TrendUp,
  'coins': Coins,
  'crosshair': Crosshair,
  'piggy-bank': PiggyBank,
  'chart-line-up': ChartLineUp,
  'wallet': Wallet,
  'bank': Bank,
  'vault': Vault,
  'house': House,
  'lightning': Lightning,
  'arrow-up': ArrowUp,
  'arrow-down': ArrowDown,
  'minus': Minus,
  'plus': Plus,
  'check': Check,
  'x': X,
  'gear': Gear,
  'file-text': FileText,
  'calendar': Calendar,
  'clock': Clock,
  'warning': Warning,
  'info': Info,
  'star': Star,
  'refresh': ArrowClockwise,
  'download': Download,
  'upload': Upload,
  'trash': Trash,
  'pencil': Pencil,
  'eye': Eye,
  'eye-slash': EyeSlash,
  'search': MagnifyingGlass,
  'filter': Funnel,
  'sort': SortAscending,
  'dots': DotsThree,
  'caret-down': CaretDown,
  'caret-up': CaretUp,
  'caret-left': CaretLeft,
  'caret-right': CaretRight,
  'chart-bar': ChartBar,
  'chart-pie': ChartPieSlice,
  'chart-line': ChartLine,
  'trend-down': TrendDown,
};

const EMOJI_MAP = {
  '📊': ChartBar,
  '🏢': Buildings,
  '🥛': Storefront,
  '🥇': Coins,
  '🏦': Bank,
  '🏗️': Factory,
  '🔩': Fire,
};

export function AppIcon({ name, size = 16, weight = 'regular', className = '' }) {
  const IconComponent = ICON_MAP[name] || EMOJI_MAP[name];
  if (!IconComponent) return null;
  return <IconComponent size={size} weight={weight} className={className} />;
}

export { ICON_MAP, EMOJI_MAP };
export * from '@phosphor-icons/react';
