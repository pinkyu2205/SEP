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
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  isLoading: true,
  isAuthenticated: false,
  login: async () => {},
  logout: async () => {},
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Kiểm tra trạng thái đăng nhập khi app khởi động
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
  // Đặt USE_MOCK = true để xem giao diện mà không cần backend API.
  // Khi backend sẵn sàng, đổi thành false.
  const USE_MOCK = true;

  const MOCK_TENANT: User = {
    id: 'mock-1',
    email: 'tenant@test.com',
    fullName: 'Nguyễn Văn A',
    phone: '0901234567',
    role: 'tenant',
    roomId: 'r1',
    createdAt: '2026-01-01',
  };

  const MOCK_MANAGER: User = {
    id: 'mock-2',
    email: 'manager@test.com',
    fullName: 'Trần Thị B',
    phone: '0909876543',
    role: 'manager',
    createdAt: '2026-01-01',
  };
  // ============================

  const login = async (email: string, password: string) => {
    if (USE_MOCK) {
      // Mock: email chứa "manager" → vào màn Manager, ngược lại → Tenant
      const mockUser = email.toLowerCase().includes('manager') ? MOCK_MANAGER : MOCK_TENANT;
      setUser(mockUser);
      return;
    }
    const result = await authService.login({ email, password });
    setUser(result.user);
  };

  const logout = async () => {
    if (!USE_MOCK) {
      await authService.logout();
    }
    setUser(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isAuthenticated: !!user,
        login,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};
