import React, { createContext, useContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * 1 tài khoản tenant giờ có thể gắn NHIỀU hợp đồng ACTIVE (nhà/phòng khác nhau) —
 * xem docs/FE-multi-contract-per-phone.md (repo BE, 27/07/2026). Context này chỉ
 * giữ đúng 1 việc: HĐ nào đang được chọn làm "primary" (selectedContractId), để
 * mọi màn hình (dashboard, biên bản bàn giao, thiết bị, tạo bảo trì...) truyền
 * cùng 1 contractId — tránh mỗi màn tự chọn 1 kiểu.
 *
 * KHÔNG cache list hợp đồng ở đây — mỗi màn vẫn tự gọi API của nó (dashboard,
 * equipments...), context chỉ nhớ "đang chọn nhà nào" xuyên suốt phiên dùng app.
 */
const STORAGE_KEY = 'tenant_selected_contract_id';

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
  const [selectedContractId, setSelectedContractIdState] = useState<number | null>(null);
  const [restoring, setRestoring] = useState(true);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        const id = raw ? Number(raw) : NaN;
        if (Number.isFinite(id)) setSelectedContractIdState(id);
      })
      .finally(() => setRestoring(false));
  }, []);

  const setSelectedContractId = (id: number | null) => {
    setSelectedContractIdState(id);
    if (id == null) AsyncStorage.removeItem(STORAGE_KEY);
    else AsyncStorage.setItem(STORAGE_KEY, String(id));
  };

  return (
    <TenantContractContext.Provider value={{ selectedContractId, setSelectedContractId, restoring }}>
      {children}
    </TenantContractContext.Provider>
  );
};
