import { useState, useEffect, createContext, useContext } from 'react';
import { User, UserRole } from '@/types';
import { authService } from '@/services/auth/authService';
import { realAuthService } from '@/services/auth/realAuthService';
import { realTenantSelfService } from '@/services/tenant/selfService';
import { registerPushToken, unregisterPushToken } from '@/services/core/pushToken';

/**
 * Auth Context - Quản lý trạng thái đăng nhập toàn ứng dụng.
 */

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (phone: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  updateUser: (data: Partial<User>) => void;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  isLoading: true,
  isAuthenticated: false,
  login: async () => {},
  logout: async () => {},
  updateUser: () => {},
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const storedUser = await authService.getStoredUser();
        if (storedUser) {
          setUser(storedUser);
        }
      } catch (error) {
        console.error('Error checking auth:', error);
      } finally {
        setIsLoading(false);
      }
    };
    checkAuth();
  }, []);

  // ======== MOCK MODE ========
  const USE_MOCK = true;

  const MOCK_USERS: Record<string, User> = {
    '0909876543': {
      id: 'mock-manager',
      email: 'manager@test.com',
      fullName: 'Trần Thị B',
      phone: '0909876543',
      role: 'manager',
      createdAt: '2026-01-01',
    },
    '0901234567': {
      id: 'mock-tenant-old',
      email: 'tenant@test.com',
      fullName: 'Nguyễn Văn A',
      phone: '0901234567',
      role: 'tenant',
      roomId: 'r1',
      createdAt: '2026-01-01',
    },
    '0888888888': {
      id: 'mock-tenant-new',
      email: 'newtenant@test.com',
      fullName: 'Lê Văn C',
      phone: '0888888888',
      role: 'tenant',
      roomId: 'r2',
      isFirstLogin: true,
      createdAt: '2026-05-11',
    }
  };
  // ============================

  const login = async (identifier: string, password: string) => {
    const id = identifier.trim();

    // Tài khoản demo MOCK (tenant/guest) — giữ nguyên để test nhanh, không cần backend
    if (USE_MOCK && MOCK_USERS[id]) {
      if (id === '0909876543' && password !== 'manager123') throw new Error('Sai mật khẩu!');
      if (id === '0901234567' && password !== 'tenant123') throw new Error('Sai mật khẩu!');
      if (id === '0888888888' && password !== '123456') throw new Error('Sai mật khẩu!');
      setUser(MOCK_USERS[id]);
      return;
    }

    // Các tài khoản còn lại -> đăng nhập backend Spring THẬT (vd manager "long2")
    try {
      const res = await realAuthService.login(id, password);
      const role: UserRole = res.role && res.role.includes('TENANT') ? 'tenant' : 'manager';

      // Lấy hồ sơ đầy đủ từ /auth/me (fullName, phone, id thật...) — token đã được lưu ở bước login.
      // Nếu /auth/me chưa sẵn sàng thì fallback về dữ liệu tối thiểu từ response login.
      let profile: Partial<User> = {};
      try {
        const me = await realTenantSelfService.getMe();
        profile = {
          id: me.id ?? res.username,
          email: me.email ?? '',
          fullName: me.fullName || me.username || res.username,
          phone: me.phone ?? (/^[0-9]{10}$/.test(id) ? id : ''),
        };
      } catch {
        profile = {
          id: res.username,
          email: '',
          fullName: res.username,
          phone: /^[0-9]{10}$/.test(id) ? id : '',
        };
      }

      setUser({
        id: profile.id!,
        email: profile.email ?? '',
        fullName: profile.fullName!,
        phone: profile.phone ?? '',
        role,
        // Khách vừa được cấp tài khoản (SĐT/123456) -> bắt buộc đổi mật khẩu lần đầu.
        isFirstLogin: res.isFirstLogin ?? false,
        createdAt: new Date().toISOString(),
      });
      // Đăng ký Expo push token để nhận thông báo (cả tenant lẫn manager) — best-effort
      registerPushToken();
    } catch (err: any) {
      const msg =
        err?.response?.data?.error ||
        err?.response?.data?.message ||
        'Sai tài khoản hoặc mật khẩu. Vui lòng thử lại.';
      throw new Error(msg);
    }
  };

  const logout = async () => {
    // Gỡ push token TRƯỚC khi xoá accessToken (cần còn auth để gọi BE) — best-effort
    await unregisterPushToken();
    if (!USE_MOCK) {
      await authService.logout();
    }
    await realAuthService.logout();
    setUser(null);
  };

  const updateUser = (data: Partial<User>) => {
    if (user) {
      setUser({ ...user, ...data });
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isAuthenticated: !!user,
        login,
        logout,
        updateUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};
