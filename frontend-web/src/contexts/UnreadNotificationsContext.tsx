import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { hostService } from '../services/host.service';
import { MOCK_NOTIFICATIONS } from '../utils/mockData';

// Fallback offline: số chưa đọc từ mock (để demo vẫn có badge khi BE chưa bật).
const MOCK_UNREAD = MOCK_NOTIFICATIONS.filter(n => !n.isRead).length;

interface UnreadContextValue {
  count: number;
  /** Gọi lại sau khi đánh dấu đã đọc để badge cập nhật ngay. */
  refresh: () => void;
}

const UnreadContext = createContext<UnreadContextValue>({ count: 0, refresh: () => {} });

export const UnreadNotificationsProvider = ({ children }: { children: React.ReactNode }) => {
  const [count, setCount] = useState(MOCK_UNREAD);

  const refresh = useCallback(() => {
    hostService.getUnreadCount()
      .then(setCount)
      .catch(() => { /* offline: giữ số hiện tại */ });
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  return (
    <UnreadContext.Provider value={{ count, refresh }}>
      {children}
    </UnreadContext.Provider>
  );
};

export const useUnreadNotifications = () => useContext(UnreadContext);
