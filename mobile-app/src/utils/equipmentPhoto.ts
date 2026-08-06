import type { VisionLabel } from '@/services/shared/visionService';

/**
 * KIỂM ẢNH THIẾT BỊ — ảnh có đúng vật thể đang khai hay không.
 *
 * Trước đây dùng OCR (đọc chữ trong ảnh) nên chịu chết với giường, tủ, bếp, và cả cục
 * lạnh điều hoà chụp xa (logo quá nhỏ) — ảnh đúng và ảnh bàn tay đều trả về rỗng như nhau.
 * Từ 06/08/2026 BE có `POST /api/v1/vision/labels` trả nhãn VẬT THỂ máy nhìn thấy trong
 * ảnh, nên kiểm được đúng thứ cần: hình có phải thiết bị đó không.
 *
 * Ba kết quả, phân biệt rõ "SAI" với "KHÔNG BIẾT":
 *   • match      — thấy đúng loại thiết bị đang khai
 *   • mismatch   — thấy rõ thứ KHÁC (thiết bị khác, hoặc bàn tay/người/giấy tờ) → chặn
 *   • unreadable — nhãn chung chung, không đủ căn cứ kết luận → không chặn, không vu oan
 */

export type EquipmentPhotoStatus = 'match' | 'mismatch' | 'unreadable';

export interface EquipmentPhotoCheck {
  status: EquipmentPhotoStatus;
  /** Câu giải thích hiển thị thẳng cho người dùng. */
  reason?: string;
}

/** Nhãn phải đạt điểm này mới coi là "thấy đúng thiết bị". */
const MATCH_MIN_SCORE = 0.5;
/** Ngưỡng khi kết luận ảnh chụp nhầm sang thứ khác. */
const MISMATCH_MIN_SCORE = 0.6;

interface EquipmentClass {
  key: string;
  /** Tên tiếng Việt để nói chuyện với người dùng. */
  label: string;
  /** Từ khoá trong TÊN thiết bị (do quản lý/BE đặt) để xếp nhóm. */
  vi: string[];
  /** Nhãn tiếng Anh mà dịch vụ nhận diện trả về cho nhóm này. */
  labels: string[];
  /**
   * Đồ dễ kiếm ảnh sẵn trên mạng (giường, tủ, bàn ghế...) → bắt chụp trực tiếp tại chỗ,
   * không cho lấy ảnh có sẵn trong máy. Nhận diện vật thể chỉ nói "đây là cái giường",
   * không nói được "cái giường CỦA PHÒNG NÀY".
   */
  liveOnly?: boolean;
}

const CLASSES: EquipmentClass[] = [
  {
    key: 'ac', label: 'máy lạnh / điều hoà',
    vi: ['điều hòa', 'điều hoà', 'dieu hoa', 'máy lạnh', 'may lanh', 'air con'],
    labels: ['air conditioning', 'air conditioner', 'hvac', 'heat pump', 'ventilation'],
  },
  {
    key: 'fridge', label: 'tủ lạnh',
    vi: ['tủ lạnh', 'tu lanh', 'tủ mát', 'tu mat'],
    labels: ['refrigerator', 'freezer', 'fridge'],
  },
  {
    key: 'washer', label: 'máy giặt',
    vi: ['máy giặt', 'may giat', 'máy sấy', 'may say'],
    labels: ['washing machine', 'clothes dryer', 'laundry', 'washer'],
  },
  {
    key: 'heater', label: 'bình nóng lạnh',
    vi: ['nóng lạnh', 'nong lanh', 'bình nước nóng', 'binh nuoc nong', 'máy nước nóng', 'may nuoc nong'],
    labels: ['water heater', 'heater', 'boiler', 'water tank'],
  },
  {
    key: 'tv', label: 'tivi',
    vi: ['tivi', 'ti vi', 'tv', 'màn hình', 'man hinh'],
    labels: ['television', 'flat panel display', 'display device', 'computer monitor', 'screen'],
  },
  {
    key: 'fan', label: 'quạt',
    vi: ['quạt', 'quat'],
    labels: ['mechanical fan', 'ceiling fan', 'fan'],
  },
  {
    key: 'stove', label: 'bếp / lò',
    vi: ['bếp', 'bep', 'lò vi sóng', 'lo vi song', 'lò nướng', 'lo nuong', 'hút mùi', 'hut mui'],
    labels: ['kitchen stove', 'gas stove', 'cooktop', 'stove', 'oven', 'microwave oven', 'kitchen appliance'],
  },
  {
    key: 'bed', label: 'giường / nệm', liveOnly: true,
    vi: ['giường', 'giuong', 'nệm', 'nem', 'đệm', 'dem', 'chăn', 'chan ', 'gối', 'goi', 'ga giường'],
    labels: ['bed', 'bed frame', 'mattress', 'bedding', 'bed sheet', 'pillow', 'furniture'],
  },
  {
    key: 'wardrobe', label: 'tủ', liveOnly: true,
    vi: ['tủ', 'tu quan ao', 'kệ', 'ke '],
    labels: ['wardrobe', 'closet', 'cupboard', 'cabinetry', 'chest of drawers', 'shelf', 'drawer', 'furniture'],
  },
  {
    key: 'table', label: 'bàn ghế', liveOnly: true,
    vi: ['bàn', 'ban ', 'ghế', 'ghe', 'sofa', 'sô pha'],
    labels: ['table', 'desk', 'chair', 'couch', 'sofa bed', 'stool', 'furniture'],
  },
  {
    key: 'curtain', label: 'rèm / gương', liveOnly: true,
    vi: ['rèm', 'rem', 'gương', 'guong', 'thảm', 'tham'],
    labels: ['curtain', 'window covering', 'window treatment', 'mirror', 'carpet', 'rug', 'textile'],
  },
  {
    key: 'sanitary', label: 'thiết bị vệ sinh',
    vi: ['bồn', 'bon ', 'chậu', 'chau', 'sen', 'vòi', 'voi ', 'lavabo', 'toilet', 'bồn cầu'],
    labels: ['plumbing fixture', 'sink', 'tap', 'toilet', 'bathroom', 'shower', 'bathtub', 'plumbing'],
  },
  {
    key: 'light', label: 'đèn / ổ điện',
    vi: ['đèn', 'den ', 'bóng', 'bong den', 'ổ cắm', 'o cam', 'công tắc', 'cong tac', 'aptomat'],
    labels: ['light fixture', 'lighting', 'lamp', 'ceiling', 'light bulb', 'electrical supply', 'light switch'],
  },
  {
    key: 'door', label: 'cửa', liveOnly: true,
    vi: ['cửa', 'cua ', 'khóa', 'khoa cua'],
    labels: ['door', 'door handle', 'wood', 'fixture', 'window'],
  },
];

/** Nhóm mặc định khi tên thiết bị không khớp gì — không có nhãn kỳ vọng để so. */
const GENERIC: EquipmentClass = { key: 'generic', label: 'thiết bị', vi: [], labels: [] };

/**
 * Những thứ RÕ RÀNG không phải thiết bị trong phòng. Thấy các nhãn này với điểm cao
 * mà không thấy thiết bị nào → kết luận chụp sai. Đây là cái bắt được ảnh bàn tay,
 * ảnh selfie, ảnh chụp tờ giấy — thứ mà OCR chịu thua.
 */
const NON_EQUIPMENT_LABELS = [
  'hand', 'finger', 'nail', 'skin', 'thumb', 'wrist', 'arm', 'leg', 'foot', 'flesh',
  'face', 'selfie', 'head', 'hair', 'person', 'human', 'lip', 'eye', 'smile', 'neck',
  'food', 'dish', 'cuisine', 'drink', 'plant', 'flower', 'tree', 'sky', 'cloud', 'grass',
  'dog', 'cat', 'pet', 'animal', 'bird',
  'document', 'paper', 'handwriting', 'font', 'screenshot', 'web page', 'receipt',
];

/**
 * Từ vựng của "đồ đạc trong nhà" theo nghĩa rộng — gồm nhãn của mọi nhóm thiết bị cộng
 * thêm các nhãn bối cảnh phòng ốc và vật liệu.
 *
 * Dùng cho luật NGƯỢC, và đây mới là luật bắt được ảnh linh tinh: nếu trong ảnh KHÔNG
 * có lấy một nhãn nào thuộc từ vựng này thì chắc chắn đang chụp thứ chẳng liên quan gì
 * tới phòng trọ — khỏi cần đoán nó là cái gì. Cách này bền hơn kiểu liệt kê "thứ xấu"
 * (NON_EQUIPMENT_LABELS ở trên), vì liệt kê thì luôn thiếu.
 */
const INDOOR_ISH_LABELS = [
  'appliance', 'home appliance', 'major appliance', 'small appliance', 'kitchen appliance',
  'machine', 'device', 'electronics', 'technology', 'gadget', 'hardware',
  'furniture', 'fixture', 'plumbing fixture', 'cabinetry', 'countertop', 'shelf',
  'wall', 'ceiling', 'floor', 'flooring', 'tile', 'room', 'interior design',
  'building', 'house', 'property', 'apartment', 'real estate',
  'door', 'window', 'glass', 'pipe', 'wire', 'cable', 'switch', 'socket',
  'metal', 'steel', 'plastic', 'wood', 'aluminium', 'composite material',
  'bedroom', 'bathroom', 'kitchen', 'living room', 'office',
];

const norm = (s?: string) => (s || '').toLowerCase().trim();

/** Tên thiết bị → nhóm. Không khớp gì thì trả nhóm chung (không kết luận sai được). */
export function classifyEquipment(name?: string): EquipmentClass {
  const n = norm(name);
  if (!n) return GENERIC;
  return CLASSES.find(c => c.vi.some(w => n.includes(w))) ?? GENERIC;
}

/** Đồ phải chụp trực tiếp tại phòng, không cho lấy ảnh có sẵn trong máy. */
export const requireLiveCapture = (name?: string): boolean => !!classifyEquipment(name).liveOnly;

const hitLabel = (labels: VisionLabel[], keywords: string[], minScore: number): VisionLabel | undefined =>
  labels.find(l => l.score >= minScore && keywords.some(k => norm(l.name).includes(k)));

/**
 * Đối chiếu ảnh với thiết bị đang khai, dựa trên nhãn vật thể từ
 * `POST /api/v1/vision/labels`.
 */
export function validateEquipmentPhoto(
  name: string | undefined,
  labels: VisionLabel[] | null | undefined,
): EquipmentPhotoCheck {
  const cls = classifyEquipment(name);
  const list = labels ?? [];

  if (list.length === 0) {
    return { status: 'unreadable', reason: 'Không nhận diện được vật thể nào trong ảnh.' };
  }

  // 1. Thấy đúng loại đang khai → xong.
  if (cls.labels.length > 0 && hitLabel(list, cls.labels, MATCH_MIN_SCORE)) {
    return { status: 'match' };
  }

  // 2. Thấy rõ một loại thiết bị KHÁC → chụp nhầm.
  const other = CLASSES.find(c =>
    c.key !== cls.key && hitLabel(list, c.labels, MISMATCH_MIN_SCORE));
  if (other) {
    return {
      status: 'mismatch',
      reason: `Ảnh này nhìn ra ${other.label}, không phải ${cls.label} đang khai. `
        + 'Kiểm tra lại xem có chụp nhầm không.',
    };
  }

  // 3. Thấy rõ thứ không phải thiết bị (bàn tay, người, giấy tờ, đồ ăn...).
  const junk = hitLabel(list, NON_EQUIPMENT_LABELS, MISMATCH_MIN_SCORE);
  if (junk) {
    return {
      status: 'mismatch',
      reason: `Trong ảnh chủ yếu là "${junk.name}", không thấy ${cls.label}. `
        + `Chụp thẳng vào ${cls.label} giúp mình.`,
    };
  }

  // 4. LUẬT NGƯỢC — không có lấy một nhãn nào thuộc từ vựng đồ đạc/phòng ốc (xét MỌI
  //    điểm số, không cần cao) → ảnh này chẳng dính dáng gì tới phòng trọ. Đây là lưới
  //    chặn cuối, bắt được cả những ảnh linh tinh mà danh sách trên chưa kịp liệt kê.
  const anyIndoor = list.some(l =>
    [...INDOOR_ISH_LABELS, ...CLASSES.flatMap(c => c.labels)]
      .some(k => norm(l.name).includes(k)));
  if (!anyIndoor) {
    const top = list[0]?.name ?? '';
    return {
      status: 'mismatch',
      reason: `Ảnh này không thấy thiết bị hay đồ đạc nào${top ? ` (máy nhìn ra "${top}")` : ''}. `
        + `Chụp thẳng vào ${cls.label} giúp mình.`,
    };
  }

  // 5. Có đồ đạc nhưng không rõ có đúng loại đang khai không (ảnh chụp cận vết hỏng,
  //    chụp góc tường...) — không đủ căn cứ kết luận. Không biết thì nói không biết.
  return {
    status: 'unreadable',
    reason: `Chưa khẳng định được ảnh có phải ${cls.label} hay không.`,
  };
}
