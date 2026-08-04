import AsyncStorage from '@react-native-async-storage/async-storage';
// CHỈ import KIỂU từ selfService để KHÔNG tạo vòng import (selfService gọi ngược lại
// noteOwnCheckoutAction ở file này). `import type` bị xoá hoàn toàn khi biên dịch.
import type { CheckoutRequestDto } from '@/services/tenant/selfService';
import { checkoutMeta, CHECKOUT_AUTO_ACCEPT_DAYS } from '@/constants/checkout';
import { formatCurrency, formatDate } from '@/utils/helpers';
import { pushLocalNotification } from '@/services/core/localPush';
import { localAlertStore, LocalAlert } from '@/store/localAlertStore';

/**
 * THÔNG BÁO 2 CHIỀU CHO LUỒNG TRẢ PHÒNG.
 *
 * Yêu cầu: tenant hay manager làm bất cứ thao tác nào trong luồng trả phòng thì NGƯỜI
 * CÒN LẠI phải nhận được thông báo trên điện thoại + thấy trong app.
 *
 * Cách làm (không đụng backend): mỗi máy định kỳ tải hồ sơ trả phòng của mình
 * (useCheckoutWatcher), so với ẢNH CHỤP trạng thái lần trước; chỗ nào đổi nghĩa là
 * đối phương vừa thao tác → sinh thông báo, bắn lên thanh thông báo máy (localPush)
 * và lưu vào trung tâm thông báo (localAlertStore).
 *
 * KHÔNG tự báo cho chính người vừa bấm: mọi hàm gọi API hành động đều gọi
 * `noteOwnCheckoutAction(dto)` để ghi thẳng trạng thái mới vào ảnh chụp, nên vòng
 * kiểm tra sau đó không coi đó là thay đổi của đối phương nữa.
 */

export type CheckoutViewerRole = 'manager' | 'tenant';

const SEEN_PREFIX = 'checkout_seen_v1:';

/** Ảnh chụp trạng thái: { [requestId]: signature } của tài khoản đang đăng nhập. */
let seen: Record<string, string> = {};
let seenKey: string | null = null;
/** Lần đầu chạy trên tài khoản này → chỉ ghi nhận hiện trạng, KHÔNG báo dồn hồ sơ cũ. */
let seenIsFresh = true;

const persistSeen = async () => {
  if (!seenKey) return;
  try {
    await AsyncStorage.setItem(seenKey, JSON.stringify(seen));
  } catch { /* lỗi storage không được làm hỏng luồng nghiệp vụ */ }
};

/** Nạp ảnh chụp của user (đổi tài khoản thì nạp lại). */
export const loadCheckoutSnapshot = async (userId: string): Promise<void> => {
  const key = SEEN_PREFIX + userId;
  if (seenKey === key) return;
  seenKey = key;
  try {
    const raw = await AsyncStorage.getItem(key);
    const stored = raw ? (JSON.parse(raw) as Record<string, string>) : {};
    // Gộp chứ không đè: thao tác vừa ghi bằng noteOwnCheckoutAction (nếu người dùng
    // bấm trước khi đọc xong storage) phải thắng dữ liệu cũ, nếu không chính người
    // vừa bấm lại nhận thông báo về việc của mình.
    seen = { ...stored, ...seen };
    seenIsFresh = !raw;
  } catch {
    seen = {};
    seenIsFresh = true;
  }
};

/** Đăng xuất: quên ảnh chụp để tài khoản sau không bị báo nhầm. */
export const resetCheckoutSnapshot = (): void => {
  seen = {};
  seenKey = null;
  seenIsFresh = true;
};

/**
 * Dấu vân tay của hồ sơ — đổi khi có thao tác đáng báo.
 * Ngoài `status` còn kèm vài mốc để bắt được thao tác KHÔNG đổi trạng thái
 * (vd manager ghi nhận hoàn cọc khi hồ sơ vẫn đang SETTLING).
 */
export const checkoutSignature = (r: CheckoutRequestDto): string => [
  (r.status || '').toUpperCase(),
  r.settlement?.refundedAt ?? '',
  r.inspection?.inspectedAt ?? '',
  r.disputedAt ?? '',
  r.completedAt ?? '',
].join('|');

/**
 * Ghi nhận thao tác của CHÍNH MÌNH — gọi ngay sau khi API trả về DTO mới.
 * Không có bước này thì người vừa bấm sẽ tự nhận thông báo về hành động của mình.
 */
export const noteOwnCheckoutAction = (r?: CheckoutRequestDto | null): void => {
  if (!r?.id) return;
  seen[String(r.id)] = checkoutSignature(r);
  persistSeen();
};

// ===================== NỘI DUNG THÔNG BÁO =====================

interface AlertDraft {
  title: string;
  body: string;
  screen: string;
  params?: Record<string, any>;
}

/** "Phòng 101 · Nhà Nguyễn Trãi" — nói rõ hồ sơ nào, đừng bắt người đọc mở app ra đoán. */
const placeOf = (r: CheckoutRequestDto): string => {
  const room = r.roomNumber ? `Phòng ${r.roomNumber}` : 'Nguyên căn';
  return r.propertyName ? `${room} · ${r.propertyName}` : room;
};

const moneyLine = (r: CheckoutRequestDto): string => {
  const refund = r.settlement?.refundAmount ?? 0;
  const extra = r.settlement?.extraChargeAmount ?? 0;
  if (refund > 0) return `Hoàn lại ${formatCurrency(refund)}.`;
  if (extra > 0) return `Cần đóng thêm ${formatCurrency(extra)}.`;
  return '';
};

/** Việc TENANT làm → báo cho MANAGER. */
const draftForManager = (prev: string | undefined, r: CheckoutRequestDto): AlertDraft | null => {
  const status = (r.status || '').toUpperCase();
  const who = r.tenantFullName || 'Khách thuê';

  // Hồ sơ chưa từng thấy = khách vừa gửi yêu cầu mới.
  if (!prev) {
    if (status !== 'PENDING') return null; // hồ sơ cũ đang chạy dở, không phải việc mới
    return {
      title: '🚪 Yêu cầu trả phòng mới',
      body: `${who} — ${placeOf(r)}${r.expectedMoveOutDate ? `, muốn trả ngày ${formatDate(r.expectedMoveOutDate)}` : ''}. Bấm để duyệt.`,
      screen: 'CheckoutRequests',
    };
  }

  switch (status) {
    case 'CANCELLED':
      return {
        title: 'Khách đã huỷ yêu cầu trả phòng',
        body: `${who} — ${placeOf(r)} vừa huỷ yêu cầu. Hồ sơ khép lại, phòng giữ nguyên hợp đồng.`,
        screen: 'CheckoutRequests',
      };
    case 'SETTLING':
      return {
        title: '✅ Khách đã đồng ý bảng quyết toán',
        body: `${who} — ${placeOf(r)}. ${moneyLine(r) || 'Tiến hành hoàn cọc rồi bấm Hoàn tất trả phòng.'}`,
        screen: 'CheckoutSettlement',
        params: { checkoutId: r.id },
      };
    case 'DISPUTED':
      return {
        title: '⚠️ Khách không đồng ý bảng quyết toán',
        body: `${who} — ${placeOf(r)}: ${r.disputeReason || 'Khách phản đối, xem lại biên bản và gửi lại bảng tiền.'}`,
        screen: 'CheckoutSettlement',
        params: { checkoutId: r.id },
      };
    default:
      // APPROVED / INSPECTING / WAITING_TENANT / COMPLETED / REJECTED là thao tác của
      // chính phía quản lý → không báo ngược lại cho manager.
      return null;
  }
};

/** Việc MANAGER làm → báo cho TENANT. */
const draftForTenant = (prev: string | undefined, r: CheckoutRequestDto): AlertDraft | null => {
  const status = (r.status || '').toUpperCase();
  const params = { requestId: r.id };

  // Hồ sơ tự nhiên xuất hiện mà khách không tạo = quản lý mở hộ (khách đi không báo,
  // hết hạn hợp đồng...). Yêu cầu do chính khách gửi đã được noteOwnCheckoutAction ghi.
  if (!prev) {
    if (status !== 'PENDING') return null;
    return {
      title: '🚪 Quản lý đã mở hồ sơ trả phòng',
      body: `Hồ sơ trả phòng cho ${placeOf(r)} vừa được quản lý tạo. Bấm để xem chi tiết.`,
      screen: 'CheckoutDetail',
      params,
    };
  }

  switch (status) {
    case 'APPROVED':
      return {
        title: '✅ Quản lý đã duyệt yêu cầu trả phòng',
        body: r.managerNote
          ? `${placeOf(r)} — ghi chú của quản lý: ${r.managerNote}`
          : `${placeOf(r)}. Quản lý sẽ hẹn lịch tới kiểm tra phòng.`,
        screen: 'CheckoutDetail',
        params,
      };
    case 'REJECTED':
      return {
        title: '❌ Yêu cầu trả phòng bị từ chối',
        body: r.rejectReason
          ? `Lý do: ${r.rejectReason}`
          : `${placeOf(r)} — liên hệ quản lý để trao đổi thêm.`,
        screen: 'CheckoutDetail',
        params,
      };
    case 'INSPECTING':
      return {
        title: '📋 Quản lý đã kiểm tra phòng',
        body: `${placeOf(r)} — biên bản kiểm tra đã lập (ảnh hiện trạng, chỉ số điện/nước). Bấm để xem.`,
        screen: 'CheckoutDetail',
        params,
      };
    case 'WAITING_TENANT':
      return {
        title: '💰 Bảng quyết toán cần bạn xác nhận',
        body: `${placeOf(r)}. ${moneyLine(r)} Quá ${CHECKOUT_AUTO_ACCEPT_DAYS} ngày không phản hồi, hệ thống coi như bạn đồng ý.`.trim(),
        screen: 'CheckoutDetail',
        params,
      };
    case 'SETTLING':
      // Khách vừa bấm đồng ý thì đã ghi vào ảnh chụp; tới đây đổi tiếp = quản lý hoàn cọc.
      if (!r.settlement?.refundedAt) return null;
      return {
        title: '💸 Quản lý đã hoàn tiền cọc',
        body: `${placeOf(r)} — ${moneyLine(r) || 'Đã ghi nhận hoàn cọc.'} Kiểm tra tài khoản và báo lại nếu chưa nhận được.`,
        screen: 'CheckoutDetail',
        params,
      };
    case 'COMPLETED':
      return {
        title: '🎉 Trả phòng đã hoàn tất',
        body: `${placeOf(r)} — hợp đồng đã thanh lý${r.completedAt ? ` ngày ${formatDate(r.completedAt)}` : ''}. Cảm ơn bạn đã thuê nhà.`,
        screen: 'CheckoutDetail',
        params,
      };
    case 'CANCELLED':
      return null; // khách tự huỷ
    default:
      return {
        title: 'Hồ sơ trả phòng có cập nhật',
        body: `${placeOf(r)} — chuyển sang "${checkoutMeta(status).label}".`,
        screen: 'CheckoutDetail',
        params,
      };
  }
};

// ===================== SO SÁNH & PHÁT THÔNG BÁO =====================

/**
 * So danh sách hồ sơ vừa tải với ảnh chụp lần trước → sinh thông báo cho các thay đổi
 * do ĐỐI PHƯƠNG gây ra, bắn lên thanh thông báo máy và lưu vào trung tâm thông báo.
 * Trả về những thông báo mới (để nơi gọi hiện toast nếu muốn).
 */
export const processCheckoutSnapshot = async (
  userId: string,
  role: CheckoutViewerRole,
  list: CheckoutRequestDto[],
): Promise<LocalAlert[]> => {
  await loadCheckoutSnapshot(userId);
  const firstRun = seenIsFresh;
  const now = new Date().toISOString();
  const drafts: LocalAlert[] = [];

  for (const r of list) {
    const sig = checkoutSignature(r);
    const key = String(r.id);
    const prev = seen[key];
    if (prev === sig) continue;

    if (!firstRun) {
      const draft = role === 'manager' ? draftForManager(prev, r) : draftForTenant(prev, r);
      if (draft) {
        drafts.push({
          id: `checkout:${r.id}:${sig}`,
          kind: 'checkout',
          refId: r.id,
          title: draft.title,
          body: draft.body,
          screen: draft.screen,
          params: draft.params,
          createdAt: now,
          read: false,
        });
      }
    }
    seen[key] = sig;
  }

  // Lần đầu chỉ chụp hiện trạng — tránh dội một loạt thông báo về việc đã cũ.
  seenIsFresh = false;
  await persistSeen();

  if (drafts.length === 0) return [];

  const fresh = localAlertStore.add(drafts);
  for (const a of fresh) {
    // Best-effort: máy không bắn được (Expo Go/web/chưa cấp quyền) thì vẫn còn toast
    // trong app + trung tâm thông báo, không mất thông tin.
    await pushLocalNotification({
      title: a.title,
      body: a.body,
      data: { screen: a.screen, params: a.params, type: 'checkout_request' },
    });
  }
  return fresh;
};
