import React from 'react';
import {
  StyleProp, StyleSheet, Text, TextProps, TextStyle, View, ViewStyle,
} from 'react-native';
import type { LucideIcon } from 'lucide-react-native';
import AirVent from 'lucide-react-native/icons/air-vent';
import AlarmClock from 'lucide-react-native/icons/alarm-clock';
import Archive from 'lucide-react-native/icons/archive';
import Armchair from 'lucide-react-native/icons/armchair';
import ArrowDown from 'lucide-react-native/icons/arrow-down';
import ArrowLeft from 'lucide-react-native/icons/arrow-left';
import ArrowLeftRight from 'lucide-react-native/icons/arrow-left-right';
import ArrowRight from 'lucide-react-native/icons/arrow-right';
import ArrowUp from 'lucide-react-native/icons/arrow-up';
import ArrowUpDown from 'lucide-react-native/icons/arrow-up-down';
import Award from 'lucide-react-native/icons/award';
import BadgeCheck from 'lucide-react-native/icons/badge-check';
import Ban from 'lucide-react-native/icons/ban';
import Banknote from 'lucide-react-native/icons/banknote';
import BedDouble from 'lucide-react-native/icons/bed-double';
import Bell from 'lucide-react-native/icons/bell';
import BellOff from 'lucide-react-native/icons/bell-off';
import BookOpen from 'lucide-react-native/icons/book-open';
import Bookmark from 'lucide-react-native/icons/bookmark';
import BrushCleaning from 'lucide-react-native/icons/brush-cleaning';
import Building2 from 'lucide-react-native/icons/building-complex';
import Cake from 'lucide-react-native/icons/cake';
import Calculator from 'lucide-react-native/icons/calculator';
import CalendarCheck from 'lucide-react-native/icons/calendar-check';
import CalendarClock from 'lucide-react-native/icons/calendar-clock';
import CalendarDays from 'lucide-react-native/icons/calendar-days';
import CalendarX from 'lucide-react-native/icons/calendar-x';
import Camera from 'lucide-react-native/icons/camera';
import ChartColumn from 'lucide-react-native/icons/chart-column';
import Check from 'lucide-react-native/icons/check';
import ChevronDown from 'lucide-react-native/icons/chevron-down';
import ChevronLeft from 'lucide-react-native/icons/chevron-left';
import ChevronRight from 'lucide-react-native/icons/chevron-right';
import ChevronUp from 'lucide-react-native/icons/chevron-up';
import CircleAlert from 'lucide-react-native/icons/circle-alert';
import CircleCheck from 'lucide-react-native/icons/circle-check';
import CirclePause from 'lucide-react-native/icons/circle-pause';
import CirclePlay from 'lucide-react-native/icons/circle-play';
import CircleX from 'lucide-react-native/icons/circle-x';
import ClipboardCheck from 'lucide-react-native/icons/clipboard-check';
import ClipboardList from 'lucide-react-native/icons/clipboard-list';
import ListChecks from 'lucide-react-native/icons/list-checks';
import Clock from 'lucide-react-native/icons/clock';
import Coffee from 'lucide-react-native/icons/coffee';
import Coins from 'lucide-react-native/icons/coins';
import CookingPot from 'lucide-react-native/icons/cooking-pot';
import Copy from 'lucide-react-native/icons/copy';
import CreditCard from 'lucide-react-native/icons/credit-card';
import DoorClosed from 'lucide-react-native/icons/door-closed';
import DoorOpen from 'lucide-react-native/icons/door-open';
import Download from 'lucide-react-native/icons/download';
import Droplet from 'lucide-react-native/icons/droplet';
import Ellipsis from 'lucide-react-native/icons/ellipsis';
import ExternalLink from 'lucide-react-native/icons/external-link';
import Eye from 'lucide-react-native/icons/eye';
import EyeOff from 'lucide-react-native/icons/eye-off';
import FilePen from 'lucide-react-native/icons/file-pen';
import FileText from 'lucide-react-native/icons/file-text';
import Flag from 'lucide-react-native/icons/flag';
import FolderOpen from 'lucide-react-native/icons/folder-open';
import Gauge from 'lucide-react-native/icons/gauge';
import Hammer from 'lucide-react-native/icons/hammer';
import HandCoins from 'lucide-react-native/icons/hand-coins';
import Handshake from 'lucide-react-native/icons/handshake';
import HardHat from 'lucide-react-native/icons/hard-hat';
import Hash from 'lucide-react-native/icons/hash';
import Heart from 'lucide-react-native/icons/heart';
import History from 'lucide-react-native/icons/rotate-ccw-clock';
import Hourglass from 'lucide-react-native/icons/hourglass';
import House from 'lucide-react-native/icons/house';
import IdCard from 'lucide-react-native/icons/id-card';
import Image from 'lucide-react-native/icons/image';
import ImageOff from 'lucide-react-native/icons/image-off';
import ImagePlus from 'lucide-react-native/icons/image-plus';
import Images from 'lucide-react-native/icons/images';
import Inbox from 'lucide-react-native/icons/inbox';
import Info from 'lucide-react-native/icons/info';
import KeyRound from 'lucide-react-native/icons/key-round';
import Landmark from 'lucide-react-native/icons/landmark';
import Layers from 'lucide-react-native/icons/layers';
import LayoutDashboard from 'lucide-react-native/icons/layout-dashboard';
import LayoutGrid from 'lucide-react-native/icons/layout-grid';
import Leaf from 'lucide-react-native/icons/leaf';
import Lightbulb from 'lucide-react-native/icons/lightbulb';
import ListFilter from 'lucide-react-native/icons/list-filter';
import Lock from 'lucide-react-native/icons/lock';
import LogOut from 'lucide-react-native/icons/log-out';
import Mail from 'lucide-react-native/icons/mail';
import MapPin from 'lucide-react-native/icons/map-pin';
import Maximize2 from 'lucide-react-native/icons/maximize-2';
import MessageCircle from 'lucide-react-native/icons/message-circle';
import MessageSquareText from 'lucide-react-native/icons/message-square-text';
import Minus from 'lucide-react-native/icons/minus';
import NotebookPen from 'lucide-react-native/icons/notebook-pen';
import OctagonAlert from 'lucide-react-native/icons/octagon-alert';
import Package from 'lucide-react-native/icons/package';
import PartyPopper from 'lucide-react-native/icons/party-popper';
import Pencil from 'lucide-react-native/icons/pencil';
import Phone from 'lucide-react-native/icons/phone';
import PiggyBank from 'lucide-react-native/icons/piggy-bank';
import Play from 'lucide-react-native/icons/play';
import Plus from 'lucide-react-native/icons/plus';
import QrCode from 'lucide-react-native/icons/qr-code';
import ReceiptText from 'lucide-react-native/icons/receipt-text';
import Recycle from 'lucide-react-native/icons/recycle';
import RefreshCw from 'lucide-react-native/icons/refresh-cw';
import Repeat from 'lucide-react-native/icons/repeat';
import RotateCcw from 'lucide-react-native/icons/rotate-ccw';
import Ruler from 'lucide-react-native/icons/ruler';
import Save from 'lucide-react-native/icons/save';
import ScanLine from 'lucide-react-native/icons/scan-line';
import ScanQrCode from 'lucide-react-native/icons/scan-qr-code';
import ScrollText from 'lucide-react-native/icons/scroll-text';
import Search from 'lucide-react-native/icons/search';
import Send from 'lucide-react-native/icons/send';
import Settings from 'lucide-react-native/icons/settings';
import ShieldCheck from 'lucide-react-native/icons/shield-check';
import ShoppingCart from 'lucide-react-native/icons/shopping-cart';
import ShowerHead from 'lucide-react-native/icons/shower-head';
import Siren from 'lucide-react-native/icons/siren';
import Smartphone from 'lucide-react-native/icons/smartphone';
import Snowflake from 'lucide-react-native/icons/snowflake';
import Sofa from 'lucide-react-native/icons/sofa';
import SwitchCamera from 'lucide-react-native/icons/switch-camera';
import Sprout from 'lucide-react-native/icons/sprout';
import SquareParking from 'lucide-react-native/icons/square-parking';
import Star from 'lucide-react-native/icons/star';
import Tag from 'lucide-react-native/icons/tag';
import Timer from 'lucide-react-native/icons/timer';
import TimerOff from 'lucide-react-native/icons/timer-off';
import Toolbox from 'lucide-react-native/icons/toolbox';
import Trash2 from 'lucide-react-native/icons/trash';
import TriangleAlert from 'lucide-react-native/icons/triangle-alert';
import Truck from 'lucide-react-native/icons/truck';
import Tv from 'lucide-react-native/icons/tv';
import Upload from 'lucide-react-native/icons/upload';
import UserRound from 'lucide-react-native/icons/user-round';
import UserRoundCheck from 'lucide-react-native/icons/user-round-check';
import UsersRound from 'lucide-react-native/icons/users-round';
import Video from 'lucide-react-native/icons/video';
import Wallet from 'lucide-react-native/icons/wallet';
import WashingMachine from 'lucide-react-native/icons/washing-machine';
import Wifi from 'lucide-react-native/icons/wifi';
import Wrench from 'lucide-react-native/icons/wrench';
import X from 'lucide-react-native/icons/x';
import Zap from 'lucide-react-native/icons/zap';
import { Colors } from '@/constants';

/**
 * ─── BỘ ICON CỦA APP (02/10/2026) ───────────────────────────────────────────
 * Trước đây app lấy emoji làm icon (🏠 🔧 ⚡ 📋 ✅ ...). Emoji mỗi máy vẽ một kiểu
 * (Samsung khác iPhone khác web), màu cố định không theo bảng màu, không chỉnh được
 * độ đậm — đặt cạnh nhau là mỗi cái một phong cách. Giờ mọi biểu tượng đi qua đây,
 * dùng Lucide: cùng bộ với web quản trị (`lucide-react`), nét mảnh đều, một màu.
 *
 * Gọi theo TÊN NGHĨA (`receipt`, `water`, `back`) chứ không theo tên hình của Lucide:
 * các bảng trạng thái / loại hoá đơn / loại thông báo chỉ lưu chuỗi tên, muốn đổi
 * hình thì sửa một dòng ở đây là cả app đổi theo.
 *
 * Import từng icon (`lucide-react-native/icons/...`) thay vì cả gói: Metro không
 * tree-shake, import từ gốc là kéo nguyên ~1.900 icon vào bundle.
 */
const ICONS = {
  // ── Điều hướng & thao tác chung
  back: ChevronLeft,
  'chevron-left': ChevronLeft,
  'chevron-right': ChevronRight,
  'chevron-down': ChevronDown,
  'chevron-up': ChevronUp,
  'arrow-left': ArrowLeft,
  'arrow-right': ArrowRight,
  'arrow-up': ArrowUp,
  'arrow-down': ArrowDown,
  swap: ArrowLeftRight,
  sort: ArrowUpDown,
  close: X,
  check: Check,
  plus: Plus,
  minus: Minus,
  more: Ellipsis,
  external: ExternalLink,
  refresh: RefreshCw,
  repeat: Repeat,
  undo: RotateCcw,
  search: Search,
  filter: ListFilter,
  expand: Maximize2,
  eye: Eye,
  'eye-off': EyeOff,
  copy: Copy,
  download: Download,
  upload: Upload,
  trash: Trash2,
  edit: Pencil,
  save: Save,
  send: Send,
  logout: LogOut,
  settings: Settings,
  info: Info,

  // ── Trạng thái
  success: CircleCheck,
  error: CircleX,
  warning: TriangleAlert,
  alert: CircleAlert,
  danger: OctagonAlert,
  ban: Ban,
  siren: Siren,
  flag: Flag,
  clock: Clock,
  hourglass: Hourglass,
  pause: CirclePause,
  timer: Timer,
  'timer-off': TimerOff,
  alarm: AlarmClock,
  history: History,
  lock: Lock,
  shield: ShieldCheck,
  verified: BadgeCheck,
  star: Star,
  party: PartyPopper,
  cake: Cake,
  award: Award,
  heart: Heart,

  // ── Nhà & phòng
  dashboard: LayoutDashboard,
  grid: LayoutGrid,
  layers: Layers,
  building: Building2,
  home: House,
  door: DoorOpen,
  'door-closed': DoorClosed,
  key: KeyRound,
  location: MapPin,
  area: Ruler,
  bed: BedDouble,
  sofa: Sofa,
  chair: Armchair,
  tv: Tv,
  washer: WashingMachine,
  ac: AirVent,
  snowflake: Snowflake,
  kitchen: CookingPot,
  bath: ShowerHead,
  parking: SquareParking,
  wifi: Wifi,
  leaf: Leaf,
  sprout: Sprout,
  coffee: Coffee,
  cleaning: BrushCleaning,
  bank: Landmark,

  // ── Tiền & giấy tờ
  receipt: ReceiptText,
  document: FileText,
  contract: FilePen,
  clipboard: ClipboardList,
  'clipboard-check': ClipboardCheck,
  steps: ListChecks,
  scroll: ScrollText,
  note: NotebookPen,
  book: BookOpen,
  folder: FolderOpen,
  archive: Archive,
  recycle: Recycle,
  bookmark: Bookmark,
  tag: Tag,
  hash: Hash,
  calculator: Calculator,
  chart: ChartColumn,
  card: CreditCard,
  cash: Banknote,
  wallet: Wallet,
  deposit: PiggyBank,
  coins: Coins,
  'hand-coins': HandCoins,
  cart: ShoppingCart,
  qr: QrCode,
  scan: ScanLine,
  'scan-qr': ScanQrCode,

  // ── Điện nước
  electric: Zap,
  water: Droplet,
  meter: Gauge,
  lightbulb: Lightbulb,

  // ── Bảo trì & thiết bị
  wrench: Wrench,
  hammer: Hammer,
  'hard-hat': HardHat,
  toolbox: Toolbox,
  package: Package,
  truck: Truck,

  // ── Người & liên lạc
  user: UserRound,
  'user-check': UserRoundCheck,
  users: UsersRound,
  'id-card': IdCard,
  phone: Phone,
  smartphone: Smartphone,
  mail: Mail,
  chat: MessageCircle,
  sms: MessageSquareText,
  bell: Bell,
  'bell-off': BellOff,
  inbox: Inbox,
  handshake: Handshake,

  // ── Ảnh & video
  camera: Camera,
  'switch-camera': SwitchCamera,
  image: Image,
  images: Images,
  'image-plus': ImagePlus,
  'image-off': ImageOff,
  video: Video,
  play: Play,
  'play-circle': CirclePlay,

  // ── Lịch
  calendar: CalendarDays,
  'calendar-clock': CalendarClock,
  'calendar-check': CalendarCheck,
  'calendar-x': CalendarX,
} satisfies Record<string, LucideIcon>;

export type IconName = keyof typeof ICONS;

/**
 * Nét theo cỡ: Lucide vẽ trên khung 24px, nét 2 ở cỡ 14px chỉ còn ~1.2px trên màn —
 * mảnh tới mức nhoè. Icon nhỏ cần nét dày hơn tương đối, icon lớn (trạng thái rỗng)
 * thì nét mảnh lại cho khỏi thô.
 */
const strokeFor = (size: number) => (size <= 15 ? 2.25 : size >= 32 ? 1.5 : size >= 24 ? 1.75 : 2);

export interface IconProps {
  name: IconName;
  size?: number;
  color?: string;
  strokeWidth?: number;
  /** Tô đặc bên trong (sao đánh giá, chấm trạng thái). Mặc định chỉ có nét. */
  fill?: string;
  style?: StyleProp<ViewStyle>;
}

export const Icon: React.FC<IconProps> = ({
  name, size = 18, color = Colors.textSecondary, strokeWidth, fill, style,
}) => {
  const Glyph = ICONS[name];
  return (
    <Glyph
      size={size}
      color={color}
      strokeWidth={strokeWidth ?? strokeFor(size)}
      fill={fill ?? 'none'}
      style={style}
    />
  );
};

/** Chấm tròn màu — thay 🟢 🟡 🔴 cho mức độ / trạng thái. */
export const Dot: React.FC<{ color: string; size?: number; style?: StyleProp<ViewStyle> }> = ({
  color, size = 8, style,
}) => (
  <View style={[{ width: size, height: size, borderRadius: size / 2, backgroundColor: color }, style]} />
);

/** Chỉ những thuộc tính CHỮ ở lại trên `<Text>` — còn lại (lề, nền, viền, flex...) là của khung. */
const TEXT_KEYS = new Set([
  'color', 'fontSize', 'fontWeight', 'fontFamily', 'fontStyle', 'fontVariant', 'lineHeight',
  'letterSpacing', 'textAlign', 'textTransform', 'textDecorationLine', 'textDecorationColor',
  'textDecorationStyle', 'textShadowColor', 'textShadowOffset', 'textShadowRadius',
  'includeFontPadding', 'textAlignVertical', 'writingDirection', 'verticalAlign',
]);

const JUSTIFY_OF_ALIGN: Record<string, ViewStyle['justifyContent']> = {
  center: 'center', right: 'flex-end',
};

export interface IconTextProps extends TextProps {
  icon: IconName;
  /** Mặc định lấy đúng màu chữ — icon và chữ đi một màu. */
  iconColor?: string;
  /** Mặc định nhỉnh hơn cỡ chữ một chút (chữ 14 → icon 16). */
  iconSize?: number;
  gap?: number;
  /** Icon đứng SAU chữ — kiểu "Xem tất cả ›". */
  trailing?: boolean;
  /**
   * Đoạn chữ có thể xuống nhiều dòng: icon bám dòng đầu thay vì trôi ra giữa đoạn.
   */
  multiline?: boolean;
  containerStyle?: StyleProp<ViewStyle>;
}

/**
 * Icon + chữ trên một hàng — thay cho kiểu cũ `<Text>📷 Chụp ảnh</Text>`.
 *
 * Nhận đúng `style` của dòng chữ cũ nên chỗ thay chỉ cần đổi tag. Mọi thứ không phải
 * thuộc tính chữ (lề, padding, nền, viền, flex) được nhấc ra KHUNG: để lại trên chữ thì
 * `marginBottom` của tiêu đề làm khung cao thêm khiến icon tụt thấp hơn chữ, còn nền/viền
 * chỉ bọc mỗi chữ mà bỏ icon ra ngoài.
 */
export const IconText: React.FC<IconTextProps> = ({
  icon, iconColor, iconSize, gap = 6, trailing, multiline, containerStyle, style, children, ...textProps
}) => {
  const flat = (StyleSheet.flatten(style) ?? {}) as Record<string, unknown>;
  const box: Record<string, unknown> = {};
  const text: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(flat)) (TEXT_KEYS.has(k) ? text : box)[k] = v;
  // Chữ căn giữa / phải thì cả cụm icon + chữ phải căn theo, không thì icon dạt về mép trái.
  const justify = JUSTIFY_OF_ALIGN[String(text.textAlign)];

  const fontSize = (text.fontSize as number | undefined) ?? 14;
  const size = iconSize ?? Math.round(fontSize * 1.15);
  const color = iconColor ?? (typeof text.color === 'string' ? text.color : Colors.textPrimary);
  const lineHeight = (text.lineHeight as number | undefined) ?? Math.round(fontSize * 1.25);
  const glyph = (
    <Icon
      name={icon}
      size={size}
      color={color}
      style={multiline ? { marginTop: Math.max(0, (lineHeight - size) / 2) } : undefined}
    />
  );

  return (
    <View
      style={[
        { flexDirection: 'row', alignItems: multiline ? 'flex-start' : 'center', gap },
        justify && { justifyContent: justify },
        box as ViewStyle,
        containerStyle,
      ]}
    >
      {!trailing && glyph}
      <Text {...textProps} style={[text as TextStyle, { flexShrink: 1 }]}>{children}</Text>
      {trailing && glyph}
    </View>
  );
};
