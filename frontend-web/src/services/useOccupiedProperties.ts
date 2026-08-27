import { useEffect, useState } from 'react';
import { handoverService } from './handover.service';

/**
 * NHỮNG CĂN ĐANG CÓ KHÁCH Ở — dùng để lọc ô chọn nhà ở hai trang phát hành hoá đơn.
 *
 * ─── Vì sao cần ──────────────────────────────────────────────────────────────
 * Hoá đơn điện/nước chỉ có nghĩa với căn đang có người ở. Ô chọn nhà ở trang "Hoá đơn
 * điện EVN" và "Hoá đơn nước" trước đây đổ ra toàn bộ 25 căn, kể cả nhà chưa ai thuê,
 * nhà còn chờ host duyệt — admin phải tự nhớ căn nào đang có khách, và chọn nhầm thì
 * phát hành một hoá đơn không gửi cho ai.
 *
 * ─── Vì sao dùng `handover-status` ───────────────────────────────────────────
 * Danh sách nhà (`GET /properties`) KHÔNG có tín hiệu nào tin được cho việc này:
 *   • `currentTenant` — mapper của BE không hề gán, luôn undefined
 *   • `priceLocked`   — bật khi có HĐ ACTIVE **hoặc EXPIRED**, nên căn đã trả phòng
 *                       từ lâu vẫn bị tính là có khách
 *   • `status = RENTED` — không chỗ nào trong BE gán trạng thái này
 *
 * `GET /admin/handover-status` thì trả `roomsHandedOver` đếm đúng hợp đồng
 * `ContractStatus.ACTIVE` (`AdminHandoverServiceImpl`) — tức là khách đã dọn vào và
 * đang ở, không tính hồ sơ nháp cũng không tính hợp đồng đã hết hạn. Một request cho
 * toàn bộ nhà, và cả hai trang này đều là trang ADMIN nên có quyền gọi.
 *
 * ─── Hỏng thì MỞ HẾT, không phải khoá hết ────────────────────────────────────
 * Gọi lỗi thì trả `ids = null` để nơi dùng hiểu là "không biết" và hiện đủ danh sách.
 * Lọc theo dữ liệu không lấy được sẽ cho ra ô chọn trống trơn — admin tưởng hệ thống
 * không còn nhà nào, tệ hơn nhiều so với việc phải tự lọc bằng mắt như trước.
 */
export const useOccupiedProperties = () => {
  /** `null` = chưa biết (đang tải hoặc lỗi) → nơi dùng phải hiện đủ danh sách. */
  const [ids, setIds] = useState<Set<number> | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    handoverService.list()
      .then((rows) => {
        if (cancelled) return;
        setIds(new Set(rows.filter((r) => (r.roomsHandedOver ?? 0) > 0).map((r) => r.propertyId)));
      })
      .catch(() => { if (!cancelled) setIds(null); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  return { occupiedIds: ids, loadingOccupied: loading };
};
