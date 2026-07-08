import { createContext, useContext, useMemo, useState } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import api from '@/services/api';

// Web chỉ phục vụ host (ROLE_OWNER) và admin (ROLE_ADMIN).
// Manager là mobile-only — không có không gian làm việc trên web.
export type WebRole = 'admin' | 'host';

const MANAGER_WEB_BLOCK_MSG = 'Tài khoản Quản lý vận hành vui lòng sử dụng ứng dụng di động.';

export interface WebAuthUser {
  id: string;
  fullName: string;
  username: string;
  role: WebRole;
}

interface WebAuthContextValue {
  user: WebAuthUser | null;
  login: (username: string, password: string) => Promise<WebAuthUser>;
  logout: () => void;
}

const STORAGE_KEY = 'urbannest_web_user';

const storage = sessionStorage;

const DEMO_ACCOUNTS: Array<WebAuthUser & { password: string }> = [
  {
    id: 'web-admin',
    fullName: 'Admin',
    username: 'admin',
    password: '123456',
    role: 'admin',
  },
  {
    id: 'web-host',
    fullName: 'Hoàng Bình Land',
    username: 'hoangge',
    password: 'mysecretpassword',
    role: 'host',
  },
];

const WebAuthContext = createContext<WebAuthContextValue | null>(null);

const readStoredUser = (): WebAuthUser | null => {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as WebAuthUser;
    // Migrate stale 'super_admin' role from before the rename
    if ((parsed.role as string) === 'super_admin') {
      const migrated: WebAuthUser = { ...parsed, role: 'admin' };
      storage.setItem(STORAGE_KEY, JSON.stringify(migrated));
      return migrated;
    }
    // Chỉ chấp nhận host & admin; mọi role khác (kể cả manager) bị loại bỏ.
    if (parsed.role !== 'admin' && parsed.role !== 'host') {
      storage.removeItem(STORAGE_KEY);
      return null;
    }
    return parsed;
  } catch {
    storage.removeItem(STORAGE_KEY);
    return null;
  }
};

export const WebAuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<WebAuthUser | null>(() => readStoredUser());

  const value = useMemo<WebAuthContextValue>(() => ({
    user,
    login: async (username: string, password: string) => {
      try {
        // 1. Thử đăng nhập thông qua Backend API thực tế
        const response: any = await api.post('/api/v1/auth/login', {
          username: username.trim(),
          password: password,
        });

        if (response && response.token) {
          // Lưu JWT Token thực tế vào localStorage để API interceptor tự động đính kèm Bearer token
          localStorage.setItem('access_token', response.token);

          // Ánh xạ Role từ Backend sang Frontend WebRole
          const backendRole = response.role; // e.g., 'ROLE_ADMIN', 'ROLE_OWNER', 'ROLE_MANAGER'
          const webRole: WebRole | null =
            backendRole === 'ROLE_ADMIN' ? 'admin' :
            backendRole === 'ROLE_OWNER' ? 'host'  : null;

          // Manager (và mọi role khác) không được phép vào web — chặn ngay, không tạo session.
          if (!webRole) {
            localStorage.removeItem('access_token');
            throw new Error(MANAGER_WEB_BLOCK_MSG);
          }

          const nextUser: WebAuthUser = {
            id: response.username || username,
            fullName: response.username || 'User',
            username: username,
            role: webRole,
          };

          storage.setItem(STORAGE_KEY, JSON.stringify(nextUser));
          setUser(nextUser);
          return nextUser;
        }
        throw new Error('Không nhận được JWT Token từ máy chủ.');
      } catch (backendError: any) {
        // Manager đăng nhập đúng nhưng bị chặn vào web → không thử demo, trả message rõ ràng.
        if (backendError instanceof Error && backendError.message === MANAGER_WEB_BLOCK_MSG) {
          throw backendError;
        }
        console.warn('Đăng nhập qua Backend thất bại, thử kiểm tra tài khoản Demo...', backendError);

        // 2. Fallback: Nếu backend lỗi hoặc không chạy, kiểm tra tài khoản DEMO để dev offline mượt mà
        const account = DEMO_ACCOUNTS.find(item =>
          item.username.toLowerCase() === username.trim().toLowerCase() && item.password === password
        );

        if (!account) {
          // Nếu cả hai đều sai, ném lỗi thực tế
          const errorMsg = backendError.response?.data?.message || 'Tên đăng nhập hoặc mật khẩu không đúng.';
          throw new Error(errorMsg);
        }

        // Tạo JWT Token giả để pass các kiểm thử cục bộ nếu xài demo account
        localStorage.setItem('access_token', 'mock-jwt-token-demo');

        const nextUser: WebAuthUser = {
          id: account.id,
          fullName: account.fullName,
          username: account.username,
          role: account.role,
        };

        storage.setItem(STORAGE_KEY, JSON.stringify(nextUser));
        setUser(nextUser);
        return nextUser;
      }
    },
    logout: () => {
      storage.removeItem(STORAGE_KEY);
      localStorage.removeItem('access_token'); // Xóa JWT Token khi đăng xuất
      setUser(null);
    },
  }), [user]);

  return (
    <WebAuthContext.Provider value={value}>
      {children}
    </WebAuthContext.Provider>
  );
};

export const useWebAuth = () => {
  const context = useContext(WebAuthContext);
  if (!context) {
    throw new Error('useWebAuth must be used inside WebAuthProvider');
  }
  return context;
};

const defaultPathByRole: Record<WebRole, string> = {
  admin: '/admin',
  host: '/host',
};

export const ProtectedRoute = ({ allowedRoles }: { allowedRoles: WebRole[] }) => {
  const { user } = useWebAuth();
  const location = useLocation();

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  if (!allowedRoles.includes(user.role)) {
    return <Navigate to={defaultPathByRole[user.role]} replace />;
  }

  return <Outlet />;
};

export const PublicOnlyRoute = () => {
  const { user } = useWebAuth();

  if (user) {
    return <Navigate to={defaultPathByRole[user.role]} replace />;
  }

  return <Outlet />;
};
