import { useState, useEffect, createContext, useContext } from 'react';
import { User } from '../types';
import { authService } from '../services/authService';

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

  const login = async (phone: string, password: string) => {
    if (USE_MOCK) {
      const mockUser = MOCK_USERS[phone];
      if (!mockUser) {
        throw new Error('Số điện thoại không tồn tại (Mock: 0909876543, 0901234567, 0888888888)');
      }
      if (phone === '0909876543' && password !== 'manager123') throw new Error('Sai mật khẩu!');
      if (phone === '0901234567' && password !== 'tenant123') throw new Error('Sai mật khẩu!');
      if (phone === '0888888888' && password !== '123456') throw new Error('Sai mật khẩu!');

      setUser(mockUser);
      return;
    }
    // TODO: implement actual authService.login(phone, password)
  };

  const logout = async () => {
    if (!USE_MOCK) {
      await authService.logout();
    }
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
