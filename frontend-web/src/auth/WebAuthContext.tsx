import { createContext, useContext, useMemo, useState } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';

export type WebRole = 'super_admin' | 'host';

export interface WebAuthUser {
  id: string;
  fullName: string;
  email: string;
  role: WebRole;
}

interface WebAuthContextValue {
  user: WebAuthUser | null;
  login: (email: string, password: string) => Promise<WebAuthUser>;
  logout: () => void;
}

const STORAGE_KEY = 'roomrent_web_user';

const DEMO_ACCOUNTS: Array<WebAuthUser & { password: string }> = [
  {
    id: 'web-super-admin',
    fullName: 'Super Admin',
    email: 'superadmin@gmail.com',
    password: '123456',
    role: 'super_admin',
  },
  {
    id: 'web-host',
    fullName: 'UrbanNest Host',
    email: 'host@gmail.com',
    password: '123456',
    role: 'host',
  },
];

const WebAuthContext = createContext<WebAuthContextValue | null>(null);

const readStoredUser = (): WebAuthUser | null => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) as WebAuthUser : null;
  } catch {
    localStorage.removeItem(STORAGE_KEY);
    return null;
  }
};

export const WebAuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<WebAuthUser | null>(() => readStoredUser());

  const value = useMemo<WebAuthContextValue>(() => ({
    user,
    login: async (email: string, password: string) => {
      const account = DEMO_ACCOUNTS.find(item =>
        item.email.toLowerCase() === email.trim().toLowerCase() && item.password === password
      );

      if (!account) {
        throw new Error('Email hoặc mật khẩu không đúng.');
      }

      const nextUser: WebAuthUser = {
        id: account.id,
        fullName: account.fullName,
        email: account.email,
        role: account.role,
      };

      localStorage.setItem(STORAGE_KEY, JSON.stringify(nextUser));
      setUser(nextUser);
      return nextUser;
    },
    logout: () => {
      localStorage.removeItem(STORAGE_KEY);
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
  super_admin: '/super-admin',
  host: '/',
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
