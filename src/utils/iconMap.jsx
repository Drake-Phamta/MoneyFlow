import {
  // Categories
  ShieldCheck, TrendUp, Diamond, CrosshairSimple, Bank,
  // Asset types
  ChartLineUp, ChartPieSlice, ChartDonut, CurrencyBtc, Scroll, House, Package,
  // Navigation
  SquaresFour, ArrowsLeftRight, BookOpen, Gear,
  // Actions
  NotePencil, ArrowDownLeft, ArrowUpRight, Trash, BookmarkSimple,
  // Status
  CheckCircle, Warning, XCircle, Calendar, Lightbulb, ClipboardText,
  Spinner, DownloadSimple, UploadSimple,
  // Savings
  Drop, Lock,
  // Trends
  TrendDown, Minus,
  // Misc
  FileText, Bell, CaretDown, X, ArrowClockwise, Check,
  Coins, Money, Wallet, PiggyBank, ChartBar, ChartLine,
  MagnifyingGlass, Plus, PencilSimple, Eye, EyeSlash,
  ArrowSquareOut, CaretRight, CaretUp, Info, Star,
  Hourglass, Clock, Flag, Rocket, Fire, Lightning,
  Buildings, Storefront, Globe, Stack, GridFour,
  ListChecks, Path, Compass, MapTrifold,
} from '@phosphor-icons/react';

// ===== Emoji → Phosphor mapping =====
// For database-stored emoji icons, map to Phosphor components
const EMOJI_MAP = {
  // Categories
  '🛡️': ShieldCheck,
  '📈': TrendUp,
  '🥇': Diamond,
  '🎯': CrosshairSimple,
  '🏦': Bank,

  // Asset types
  '📊': ChartPieSlice,
  '🪙': CurrencyBtc,
  '📜': Scroll,
  '🏠': House,
  '📦': Package,
  '💰': Money,

  // Actions
  '📝': NotePencil,
  '🟢': ArrowDownLeft,
  '🔴': ArrowUpRight,
  '🗑️': Trash,
  '📌': BookmarkSimple,

  // Status
  '✅': CheckCircle,
  '⚠️': Warning,
  '❌': XCircle,
  '📅': Calendar,
  '💡': Lightbulb,
  '📋': ClipboardText,
  '⏳': Spinner,
  '📥': DownloadSimple,
  '📤': UploadSimple,

  // Savings
  '💧': Drop,
  '🔒': Lock,

  // Trends
  '📉': TrendDown,
  '➡️': Minus,

  // Misc
  '⚙️': Gear,
};

// ===== Icon name → Phosphor component =====
// For direct usage in source code
const ICON_MAP = {
  // Categories
  'shield-check': ShieldCheck,
  'trend-up': TrendUp,
  'gem': Diamond,
  'crosshair': CrosshairSimple,
  'bank': Bank,

  // Asset types
  'chart-line': ChartLineUp,
  'chart-pie': ChartPieSlice,
  'chart-bar': ChartBar,
  'currency-btc': CurrencyBtc,
  'scroll': Scroll,
  'house': House,
  'package': Package,
  'coins': Coins,
  'money': Money,
  'wallet': Wallet,
  'piggy-bank': PiggyBank,

  // Navigation
  'squares-four': SquaresFour,
  'arrows-left-right': ArrowsLeftRight,
  'book-open': BookOpen,
  'gear': Gear,

  // Actions
  'note-pencil': NotePencil,
  'arrow-down-left': ArrowDownLeft,
  'arrow-up-right': ArrowUpRight,
  'trash': Trash,
  'bookmark': BookmarkSimple,
  'plus': Plus,
  'pencil': PencilSimple,
  'eye': Eye,
  'eye-slash': EyeSlash,
  'magnifying-glass': MagnifyingGlass,

  // Status
  'check-circle': CheckCircle,
  'warning': Warning,
  'x-circle': XCircle,
  'calendar': Calendar,
  'lightbulb': Lightbulb,
  'clipboard': ClipboardText,
  'spinner': Spinner,
  'download': DownloadSimple,
  'upload': UploadSimple,
  'check': Check,
  'x': X,
  'info': Info,
  'star': Star,

  // Savings
  'drop': Drop,
  'lock': Lock,

  // Trends
  'trend-down': TrendDown,
  'minus': Minus,

  // Misc
  'bell': Bell,
  'caret-down': CaretDown,
  'caret-right': CaretRight,
  'caret-up': CaretUp,
  'refresh': ArrowClockwise,
  'file-text': FileText,
  'hourglass': Hourglass,
  'clock': Clock,
  'flag': Flag,
  'rocket': Rocket,
  'fire': Fire,
  'lightning': Lightning,
  'buildings': Buildings,
  'storefront': Storefront,
  'globe': Globe,
  'stack': Stack,
  'grid': GridFour,
  'list-checks': ListChecks,
  'path': Path,
  'compass': Compass,
  'map': MapTrifold,
  'arrow-square-out': ArrowSquareOut,
  'scales': ListChecks, // alias for allocation/balance
};

/**
 * AppIcon — renders a Phosphor icon by name or maps emoji/icon-name to Phosphor.
 *
 * Usage:
 *   <AppIcon name="shield-check" size={20} />
 *   <AppIcon emoji="🛡️" size={20} />        // emoji string
 *   <AppIcon emoji="shield-check" size={20} /> // icon name from database
 *   <AppIcon name="trend-up" size={16} color="#0F5D4A" weight="bold" />
 */
export default function AppIcon({ name, emoji, size = 16, color, weight = 'regular', className = '', ...props }) {
  let IconComponent = null;

  if (name) {
    IconComponent = ICON_MAP[name];
  } else if (emoji) {
    // Try emoji map first, then icon name map (database stores icon names)
    IconComponent = EMOJI_MAP[emoji] || ICON_MAP[emoji];
  }

  if (IconComponent) {
    return <IconComponent size={size} color={color} weight={weight} className={className} {...props} />;
  }

  // Fallback: render the string as text (for old emoji data)
  if (emoji) {
    return <span className={className} style={{ fontSize: size, lineHeight: 1 }}>{emoji}</span>;
  }

  return null;
}

// Re-export all icons for direct import when needed
export {
  ShieldCheck, TrendUp, Diamond, CrosshairSimple, Bank,
  ChartLineUp, ChartPieSlice, ChartDonut, CurrencyBtc, Scroll, House, Package,
  SquaresFour, ArrowsLeftRight, BookOpen, Gear,
  NotePencil, ArrowDownLeft, ArrowUpRight, Trash, BookmarkSimple,
  CheckCircle, Warning, XCircle, Calendar, Lightbulb, ClipboardText,
  Spinner, DownloadSimple, UploadSimple,
  Drop, Lock, TrendDown, Minus,
  FileText, Bell, CaretDown, X, ArrowClockwise, Check,
  Coins, Money, Wallet, PiggyBank, ChartBar, ChartLine,
  MagnifyingGlass, Plus, PencilSimple, Eye, EyeSlash,
  ArrowSquareOut, CaretRight, CaretUp, Info, Star,
  Hourglass, Clock, Flag, Rocket, Fire, Lightning,
  Buildings, Storefront, Globe, Stack, GridFour,
  ListChecks, Path, Compass, MapTrifold,
};
