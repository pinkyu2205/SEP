/**
 * KIỂM ẢNH HIỆN TRẠNG PHÒNG trước khi chấp nhận.
 *
 * Vì sao cần: ảnh hiện trạng là bằng chứng đối soát khi khách trả phòng — nó quyết
 * định có trừ tiền cọc hay không. Trước đây phần upload không kiểm gì cả, ảnh nào
 * cũng lọt: ảnh chế, poster quảng cáo, ảnh chụp đồng hồ, ảnh nhầm trong thư viện.
 *
 * Cách kiểm: gửi ảnh qua Google Vision LABEL_DETECTION (BE đã có sẵn endpoint
 * /api/v1/vision/labels) rồi đối chiếu nhãn trả về với danh sách nhãn phòng ốc.
 * Không phải bộ nhận dạng tuyệt đối — chỉ chặn những thứ RÕ RÀNG không phải phòng,
 * và luôn nói lý do để người chụp chụp lại.
 */

/** Khớp `VisionLabel` của services/shared/visionService — khai lại để utils không phụ
 *  thuộc ngược vào tầng service (equipmentPhoto.ts cũng làm vậy). */
export interface VisionLabelLike {
  name: string;
  score: number;
}

export interface RoomPhotoCheck {
  ok: boolean;
  /** Lý do từ chối, hiển thị thẳng cho người dùng. */
  reason?: string;
  /** Nhãn khiến ảnh bị từ chối — đưa vào thông báo cho dễ hiểu. */
  matchedBlocked?: string;
}

/**
 * Nhãn cho thấy đây là ảnh chụp trong nhà/phòng. Google Vision trả nhãn tiếng Anh.
 * Danh sách rộng tay: mục tiêu là chặn thứ rõ ràng sai, không phải bắt lỗi ảnh thật.
 */
const ROOM_LABELS = [
  'room', 'floor', 'flooring', 'wall', 'ceiling', 'door', 'window', 'building',
  'house', 'home', 'apartment', 'property', 'real estate', 'interior design',
  'furniture', 'bed', 'bedroom', 'bed frame', 'mattress', 'couch', 'sofa', 'chair',
  'table', 'desk', 'cabinetry', 'cupboard', 'shelf', 'wardrobe', 'closet', 'drawer',
  'bathroom', 'toilet', 'sink', 'plumbing fixture', 'bathtub', 'shower', 'tap',
  'kitchen', 'countertop', 'kitchen appliance', 'refrigerator', 'stove', 'oven',
  'tile', 'tiles', 'wood', 'plaster', 'paint', 'light fixture', 'lighting',
  'curtain', 'window covering', 'balcony', 'stairs', 'handrail', 'fan', 'air conditioning',
  'living room', 'hall', 'daylighting', 'roof', 'brick', 'concrete', 'glass',
];

/**
 * Nhãn cho thấy ảnh CHẮC CHẮN không phải hiện trạng phòng — chặn ngay kể cả khi
 * lẫn vài nhãn phòng ốc (poster in hình phòng, ảnh chế có bàn ghế phía sau...).
 */
const BLOCKED_LABELS: { key: string; label: string }[] = [
  { key: 'cartoon', label: 'ảnh hoạt hình' },
  { key: 'animated cartoon', label: 'ảnh hoạt hình' },
  { key: 'animation', label: 'ảnh hoạt hình' },
  { key: 'illustration', label: 'ảnh minh hoạ' },
  { key: 'clip art', label: 'ảnh clip art' },
  { key: 'drawing', label: 'hình vẽ' },
  { key: 'sketch', label: 'hình vẽ' },
  { key: 'poster', label: 'poster' },
  { key: 'advertising', label: 'ảnh quảng cáo' },
  { key: 'flyer', label: 'tờ rơi' },
  { key: 'banner', label: 'banner' },
  { key: 'screenshot', label: 'ảnh chụp màn hình' },
  { key: 'document', label: 'ảnh tài liệu' },
  { key: 'paper', label: 'ảnh giấy tờ' },
  { key: 'gauge', label: 'ảnh đồng hồ đo' },
  { key: 'measuring instrument', label: 'ảnh đồng hồ đo' },
  { key: 'meme', label: 'ảnh chế' },
  { key: 'selfie', label: 'ảnh tự sướng' },
  { key: 'food', label: 'ảnh đồ ăn' },
  { key: 'vegetable', label: 'ảnh rau củ' },
  { key: 'motorcycle', label: 'ảnh xe cộ' },
  { key: 'vehicle', label: 'ảnh xe cộ' },
];

/** Nhãn phải đạt tối thiểu ngưỡng này mới được tính (Vision trả score 0..1). */
const MIN_SCORE = 0.6;

/**
 * @param labels nhãn từ POST /api/v1/vision/labels
 */
export function validateRoomPhoto(labels: VisionLabelLike[] | null | undefined): RoomPhotoCheck {
  // Không gọi được Vision (lỗi mạng, hết quota, chưa cấu hình key) → KHÔNG chặn.
  // Thà lọt một ảnh sai còn hơn khoá cứng luồng đón khách vì dịch vụ ngoài lỗi.
  if (!labels || labels.length === 0) return { ok: true };

  const strong = labels.filter(l => (l.score ?? 0) >= MIN_SCORE);
  const names = strong.map(l => (l.name || '').toLowerCase());

  const blocked = BLOCKED_LABELS.find(b => names.some(n => n === b.key || n.includes(b.key)));
  if (blocked) {
    return {
      ok: false,
      matchedBlocked: blocked.label,
      reason: `Đây có vẻ là ${blocked.label}, không phải ảnh hiện trạng phòng. `
        + 'Chụp thẳng vào phòng (tường, sàn, trần, nội thất) để làm bằng chứng khi khách trả phòng.',
    };
  }

  const hasRoom = names.some(n => ROOM_LABELS.some(r => n === r || n.includes(r)));
  if (!hasRoom) {
    const top = strong.slice(0, 3).map(l => l.name).join(', ');
    return {
      ok: false,
      reason: 'Ảnh này không giống ảnh chụp phòng'
        + (top ? ` (máy nhận ra: ${top})` : '')
        + '. Chụp lại toàn cảnh phòng — tường, sàn, trần hoặc nội thất.',
    };
  }

  return { ok: true };
}
