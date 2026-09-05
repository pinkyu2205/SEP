/**
 * Đọc equipmentId từ mã QR quét được trên thiết bị — 2 dạng đang tồn tại song song:
 *   • Tem dán trực tiếp trên thiết bị (BE sinh): chuỗi thô "EQ-<id>".
 *   • Tem/poster báo bảo trì (web sinh): deep-link "slms://maintenance/new?equipmentId=<id>&...".
 * Dùng cho gate "quét QR đúng thiết bị" (xác nhận có mặt / bắt đầu sửa) — so khớp CỤC
 * BỘ với equipmentId của phiếu đang mở, không cần tra cứu qua BE.
 */
export const extractEquipmentIdFromQr = (raw: string): string | null => {
  const trimmed = (raw ?? '').trim();
  if (!trimmed) return null;

  if (trimmed.startsWith('slms://')) {
    const qs = trimmed.split('?')[1] ?? '';
    const params = Object.fromEntries(
      qs.split('&').filter(Boolean).map(p => {
        const [k, v = ''] = p.split('=');
        try { return [k, decodeURIComponent(v)]; } catch { return [k, v]; }
      }),
    );
    if (params['equipmentId']) return params['equipmentId'];
    const eq = /^EQ-(\d+)$/i.exec(params['qr'] ?? '');
    return eq ? eq[1] : null;
  }

  const eq = /^EQ-(\d+)$/i.exec(trimmed);
  if (eq) return eq[1];
  return /^\d+$/.test(trimmed) ? trimmed : null;
};
