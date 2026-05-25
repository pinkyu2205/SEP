import { useState, useEffect } from 'react';

export type CheckoutStatus =
  | 'pending_manager_approval'
  | 'scheduled'
  | 'inspecting'
  | 'settlement_pending'
  | 'refund_processing'
  | 'completed'
  | 'disputed'
  | 'cancelled';

export type RefundStatus = 'pending' | 'processing' | 'completed' | 'disputed';

export interface DamageItem {
  id: string;
  description: string;
  deductionAmount: number;
  note?: string;
}

export interface CheckoutRequest {
  id: string;
  tenantId: string;
  tenantName: string;
  roomId: string;
  roomName: string;
  buildingId: string;
  buildingName: string;
  contractId: string;
  contractCode: string;
  requestedMoveOutDate: string;
  reason: string;
  note?: string;
  refundBankAccount: string;
  refundBankName: string;
  refundAccountHolder: string;
  photos: string[];
  status: CheckoutStatus;
  managerNote?: string;
  inspectionDate?: string;
  inspectionPhotos?: string[];
  damages: DamageItem[];
  depositAmount: number;
  unpaidBalance: number;
  damageDeduction: number;
  serviceDeduction: number;
  finalRefundAmount: number;
  refundStatus: RefundStatus;
  createdAt: string;
  updatedAt: string;
}

let _requests: CheckoutRequest[] = [];
const _listeners = new Set<() => void>();
const _notify = () => _listeners.forEach(fn => fn());

export const checkoutStore = {
  getAll: () => [..._requests],
  getByTenantId: (tenantId: string) => _requests.filter(r => r.tenantId === tenantId),
  getLatestByTenant: (tenantId: string): CheckoutRequest | null =>
    _requests.find(r => r.tenantId === tenantId) ?? null,
  add: (req: CheckoutRequest) => {
    _requests = [req, ..._requests];
    _notify();
  },
  updateById: (id: string, updates: Partial<CheckoutRequest>) => {
    _requests = _requests.map(r =>
      r.id === id ? { ...r, ...updates, updatedAt: new Date().toISOString().slice(0, 10) } : r
    );
    _notify();
  },
};

// Ordered list of statuses for step-by-step demo advancement
export const DEMO_STATUS_PROGRESSION: CheckoutStatus[] = [
  'pending_manager_approval',
  'scheduled',
  'inspecting',
  'settlement_pending',
  'refund_processing',
  'completed',
];

// Data injected at each demo transition to make it feel real
export const DEMO_TRANSITION_DATA: Partial<Record<CheckoutStatus, Partial<CheckoutRequest>>> = {
  scheduled: {
    managerNote: 'Yêu cầu đã được xác nhận. Đã lên lịch kiểm tra hiện trạng phòng vào ngày 20/05/2026. Vui lòng có mặt để bàn giao.',
    inspectionDate: '2026-05-20',
  },
  inspecting: {
    managerNote: 'Đã bắt đầu kiểm tra hiện trạng phòng. Kỹ thuật viên đang ghi nhận tình trạng các thiết bị và khu vực phòng.',
  },
  settlement_pending: {
    managerNote: 'Kiểm tra hoàn tất ngày 20/05/2026. Phòng nhìn chung sạch sẽ, gọn gàng. Ghi nhận 1 hư hỏng nhỏ cần khấu trừ. Chi tiết quyết toán bên dưới.',
    damages: [
      {
        id: 'dmg-1',
        description: 'Ghế văn phòng — bánh xe bị gãy, không thể sử dụng',
        deductionAmount: 200000,
        note: 'Phát hiện trong quá trình kiểm tra; cần thay bánh xe mới',
      },
    ],
    damageDeduction: 200000,
    finalRefundAmount: 6800000,
  },
  refund_processing: {
    refundStatus: 'processing',
    managerNote: 'Quyết toán được xác nhận. Đang tiến hành chuyển khoản 6.800.000đ về tài khoản đã đăng ký.',
  },
  completed: {
    refundStatus: 'completed',
    managerNote: 'Tiền cọc 6.800.000đ đã được chuyển khoản thành công. Hợp đồng chính thức kết thúc. Cảm ơn bạn đã tin tưởng sử dụng dịch vụ!',
  },
};

export const useCheckoutRequests = (tenantId: string): CheckoutRequest[] => {
  const [items, setItems] = useState<CheckoutRequest[]>(() =>
    checkoutStore.getByTenantId(tenantId)
  );
  useEffect(() => {
    const update = () => setItems(checkoutStore.getByTenantId(tenantId));
    _listeners.add(update);
    return () => {
      _listeners.delete(update);
    };
  }, [tenantId]);
  return items;
};

// Map checkout status → active step index (0-based, 7 steps total)
export const STATUS_TO_STEP: Record<CheckoutStatus, number> = {
  pending_manager_approval: 1,
  scheduled:                2,
  inspecting:               3,
  settlement_pending:       4,
  refund_processing:        5,
  completed:                7,
  disputed:                 4,
  cancelled:               -1,
};

export const STATUS_LABEL: Record<CheckoutStatus, string> = {
  pending_manager_approval: 'Chờ quản lý xác nhận',
  scheduled:                'Đã lên lịch kiểm tra',
  inspecting:               'Đang kiểm tra hiện trạng',
  settlement_pending:       'Đang đối chiếu chi phí',
  refund_processing:        'Đang hoàn cọc',
  completed:                'Hoàn tất trả phòng',
  disputed:                 'Có tranh chấp',
  cancelled:                'Đã hủy',
};

export const STATUS_COLOR: Record<CheckoutStatus, string> = {
  pending_manager_approval: '#F59E0B',
  scheduled:                '#3B82F6',
  inspecting:               '#8B5CF6',
  settlement_pending:       '#F59E0B',
  refund_processing:        '#10B981',
  completed:                '#10B981',
  disputed:                 '#EF4444',
  cancelled:                '#94A3B8',
};

export const REFUND_STATUS_LABEL: Record<RefundStatus, string> = {
  pending:   'Chờ xử lý',
  processing:'Đang chuyển khoản',
  completed: 'Đã hoàn cọc',
  disputed:  'Có tranh chấp',
};

export const REFUND_STATUS_COLOR: Record<RefundStatus, string> = {
  pending:   '#F59E0B',
  processing:'#3B82F6',
  completed: '#10B981',
  disputed:  '#EF4444',
};
