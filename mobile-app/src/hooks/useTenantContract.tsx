import React, { createContext, useContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from './useAuth';
import { SESSION_KEYS } from '@/services/core/session';

/**
 * 1 tài khoản tenant giờ có thể gắn NHIỀU hợp đồng ACTIVE (nhà/phòng khác nhau) —
 * xem docs/FE-multi-contract-per-phone.md (repo BE, 27/07/2026). Context này chỉ
 * giữ đúng 1 việc: HĐ nào đang được chọn làm "primary" (selectedContractId), để
 * mọi màn hình (dashboard, biên bản bàn giao, thiết bị, tạo bảo trì...) truyền
 * cùng 1 contractId — tránh mỗi màn tự chọn 1 kiểu.
 *
 * KHÔNG cache list hợp đồng ở đây — mỗi màn vẫn tự gọi API của nó (dashboard,
 * equipments...), context chỉ nhớ "đang chọn nhà nào" xuyên suốt phiên dùng app.
 *
 * LỰA CHỌN GẮN VỚI TÀI KHOẢN: lưu kèm id chủ nhân và đọc lại theo `user.id`. Trước
 * đây chỉ đọc storage đúng 1 lần lúc mở app và không reset khi đăng xuất, nên đổi
 * sang tài khoản tenant khác trên cùng máy là dashboard vẫn hỏi HĐ của người cũ →
 * BE 403/404 → trang chủ báo "Không tải được dữ liệu" dù tài khoản có nhà.
 */
const STORAGE_KEY = SESSION_KEYS.selectedContract;
const OWNER_KEY = SESSION_KEYS.selectedContractOwner;

interface TenantContractContextValue {
  selectedContractId: number | null;
  /** Set + persist lựa chọn hiện tại (gọi khi user đổi nhà trong picker, hoặc lần đầu biết primary). */
  setSelectedContractId: (id: number | null) => void;
  /** true trong lúc đọc lựa chọn cũ từ AsyncStorage lúc app khởi động. */
  restoring: boolean;
}

const TenantContractContext = createContext<TenantContractContextValue>({
  selectedContractId: null,
  setSelectedContractId: () => {},
  restoring: true,
});

export const useTenantContract = () => useContext(TenantContractContext);

export const TenantContractProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const [selectedContractId, setSelectedContractIdState] = useState<number | null>(null);
  const [restoring, setRestoring] = useState(true);

  // Đọc lại lựa chọn mỗi khi đổi tài khoản (kể cả đăng xuất → đăng nhập lại trong
  // cùng lần chạy app). Chỉ nhận lại nếu lựa chọn cũ đúng của tài khoản này.
  useEffect(() => {
    let active = true;
    setRestoring(true);

    const restore = async () => {
      if (!userId) {                      // chưa đăng nhập / vừa đăng xuất → quên luôn
        if (active) setSelectedContractIdState(null);
        return;
      }
      const [raw, owner] = await Promise.all([
        AsyncStorage.getItem(STORAGE_KEY),
        AsyncStorage.getItem(OWNER_KEY),
      ]);
      const id = raw ? Number(raw) : NaN;
      const isMine = owner === userId && Number.isFinite(id);
      // Của tài khoản khác (hoặc bản cũ chưa lưu chủ nhân) → dọn, để BE tự chọn HĐ mới nhất.
      if (!isMine) await AsyncStorage.multiRemove([STORAGE_KEY, OWNER_KEY]);
      if (active) setSelectedContractIdState(isMine ? id : null);
    };

    restore()
      .catch(() => { if (active) setSelectedContractIdState(null); })
      .finally(() => { if (active) setRestoring(false); });

    return () => { active = false; };
  }, [userId]);

  const setSelectedContractId = (id: number | null) => {
    setSelectedContractIdState(id);
    if (id == null || !userId) AsyncStorage.multiRemove([STORAGE_KEY, OWNER_KEY]);
    else AsyncStorage.multiSet([[STORAGE_KEY, String(id)], [OWNER_KEY, userId]]);
  };

  return (
    <TenantContractContext.Provider value={{ selectedContractId, setSelectedContractId, restoring }}>
      {children}
    </TenantContractContext.Provider>
  );
};
