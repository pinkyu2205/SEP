import { useState, useEffect, createContext, useContext } from 'react';
import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { User, UserRole } from '@/types';
import { authService } from '@/services/auth/authService';
import { realAuthService } from '@/services/auth/realAuthService';
import { realTenantSelfService } from '@/services/tenant/selfService';
import {
  isTenantAccountEnded, TenantAccountEndedError,
  TENANT_ACCOUNT_ENDED_TITLE, TENANT_ACCOUNT_ENDED_MESSAGE,
} from '@/services/tenant/accountAccess';
import { registerPushToken, unregisterPushToken } from '@/services/core/pushToken';
import {
  SESSION_KEYS, SESSION_IDLE_DAYS, clearSession, registerSessionExpiredHandler,
  touchSession, isSessionIdleExpired,
} from '@/services/core/session';
import { showAlert } from '@/utils';
import { nowIso } from '@/utils/serverTime';

/**
 * Auth Context - Quản lý trạng thái đăng nhập toàn ứng dụng.
 *
 * GIỮ ĐĂNG NHẬP: mỗi lần đăng nhập thành công lưu `user` + `accessToken` xuống máy,
 * mở lại app là khôi phục luôn — chỉ khi bấm Đăng xuất (hoặc BE trả 401 vì token hết
 * hạn) mới xoá phiên. Xem services/core/session.ts.
 */


interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (phone: string, password: string) => Promise<void>;
  // Kích hoạt tài khoản tenant lần đầu (SĐT + OTP + mật khẩu mới) — thành công thì vào
  // thẳng app luôn, giống hệt login (BE trả response cùng shape).
  activateTenant: (phoneNumber: string, otp: string, newPassword: string, confirmPassword: string) => Promise<void>;
  logout: () => Promise<void>;
  updateUser: (data: Partial<User>) => void;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  isLoading: true,
  isAuthenticated: false,
  login: async () => {},
  activateTenant: async () => {},
  logout: async () => {},
  updateUser: () => {},
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  /** Lưu hồ sơ xuống máy để lần mở app sau vào thẳng, không phải đăng nhập lại. */
  const persistUser = async (u: User) => {
    try {
      await AsyncStorage.setItem(SESSION_KEYS.user, JSON.stringify(u));
    } catch {
      // Lưu hỏng thì phiên chỉ sống trong RAM — không chặn đăng nhập.
    }
  };

  /**
   * Khách đã trả phòng xong thì không được ở lại trong app: kiểm tra lại hợp đồng rồi
   * đưa về màn đăng nhập. Chạy lúc mở app và mỗi lần app quay lại foreground — bắt cả
   * trường hợp quản lý bấm "Hoàn tất" trong khi khách đang mở app.
   */
  const enforceTenantAccess = async (u: User | null) => {
    if (!u || u.role !== 'tenant') return false;
    if (!(await isTenantAccountEnded())) return false;
    // Gỡ push token trước khi mất token, kẻo máy này còn nhận thông báo của phòng cũ.
    await unregisterPushToken();
    await clearSession();
    setUser(null);
    showAlert(TENANT_ACCOUNT_ENDED_TITLE, TENANT_ACCOUNT_ENDED_MESSAGE, undefined, '👋');
    return true;
  };

  // Khôi phục phiên lúc mở app.
  useEffect(() => {
    const restoreSession = async () => {
      try {
        const [storedUser, token] = await Promise.all([
          authService.getStoredUser(),
          AsyncStorage.getItem(SESSION_KEYS.accessToken),
        ]);
        if (!storedUser) return;

        // Bỏ app quá lâu → tự đăng xuất cho an toàn (máy thất lạc, máy dùng chung).
        if (await isSessionIdleExpired()) {
          await clearSession();
          showAlert(
            'Đã tự đăng xuất',
            `Bạn không mở app quá ${SESSION_IDLE_DAYS} ngày nên hệ thống đã đăng xuất để bảo vệ tài khoản. Vui lòng đăng nhập lại.`,
          );
          return;
        }

        // Có hồ sơ + còn token → vào thẳng app.
        if (token) {
          setUser(storedUser);
          await touchSession();
          // Token có thể đã đổi/hết hạn sau nhiều ngày; đăng ký lại push token cho
          // chắc chắn máy này vẫn nhận được thông báo.
          registerPushToken();
          // Kiểm tra nền (không chặn màn hình): khách đã trả phòng xong thì đá ra ngay.
          enforceTenantAccess(storedUser);
        } else {
          // Mất token (bị xoá / cài lại) → phiên không dùng được nữa, dọn cho sạch.
          await clearSession();
        }
      } catch (error) {
        console.error('Error checking auth:', error);
      } finally {
        setIsLoading(false);
      }
    };
    restoreSession();
  }, []);

  // App trở lại foreground: gia hạn mốc "vừa dùng"; nếu đã bỏ quá lâu (app nằm nền
  // nhiều ngày, không bị kill) thì đăng xuất ngay tại chỗ.
  useEffect(() => {
    const sub = AppState.addEventListener('change', async (state) => {
      if (state !== 'active') return;
      if (!user) return;
      if (await isSessionIdleExpired()) {
        await clearSession();
        setUser(null);
        showAlert(
          'Đã tự đăng xuất',
          `Bạn không mở app quá ${SESSION_IDLE_DAYS} ngày nên hệ thống đã đăng xuất để bảo vệ tài khoản. Vui lòng đăng nhập lại.`,
        );
        return;
      }
      touchSession();
      // Trả phòng xong trong lúc app nằm nền → mở lại là ra màn đăng nhập luôn.
      enforceTenantAccess(user);
    });
    return () => sub.remove();
  }, [user]);

  // BE trả 401 (token hết hạn) → về màn đăng nhập kèm lời giải thích, thay vì để
  // người dùng bấm quanh trong app mà màn nào cũng lỗi.
  useEffect(() => registerSessionExpiredHandler(() => {
    setUser(null);
    showAlert('Phiên đăng nhập đã hết hạn', 'Vui lòng đăng nhập lại để tiếp tục.');
  }), []);

  // Dùng chung cho cả login() lẫn activateTenant() — cả 2 endpoint BE đều trả cùng
  // shape AuthResponse (token/username/role/firstLogin), nên set user y hệt nhau.
  const applyRealAuthResponse = async (res: { username: string; role: string; firstLogin?: boolean }, phoneFallback: string) => {
    const role: UserRole = res.role && res.role.includes('TENANT') ? 'tenant' : 'manager';

    // CHẶN NGAY TẠI CỔNG: khách đã hoàn tất trả phòng (mọi hợp đồng đã thanh lý) thì
    // không cho vào app nữa — xoá luôn token vừa nhận để không còn gọi API được.
    if (role === 'tenant' && (await isTenantAccountEnded())) {
      await clearSession();
      throw new TenantAccountEndedError();
    }

    // Lấy hồ sơ đầy đủ từ /auth/me (fullName, phone, id thật...) — token đã được lưu trước đó.
    // Nếu /auth/me chưa sẵn sàng thì fallback về dữ liệu tối thiểu từ response.
    let profile: Partial<User> = {};
    try {
      const me = await realTenantSelfService.getMe();
      profile = {
        id: me.id ?? res.username,
        email: me.email ?? '',
        fullName: me.fullName || me.username || res.username,
        phone: me.phone ?? (/^[0-9]{10}$/.test(phoneFallback) ? phoneFallback : ''),
      };
    } catch {
      profile = {
        id: res.username,
        email: '',
        fullName: res.username,
        phone: /^[0-9]{10}$/.test(phoneFallback) ? phoneFallback : '',
      };
    }

    const nextUser: User = {
      id: profile.id!,
      email: profile.email ?? '',
      fullName: profile.fullName!,
      phone: profile.phone ?? '',
      role,
      isFirstLogin: res.firstLogin ?? false,
      createdAt: nowIso(),
    };
    setUser(nextUser);
    // Lưu xuống máy: tắt app mở lại là vào thẳng, khỏi đăng nhập lại.
    await persistUser(nextUser);
    await touchSession();   // mốc đếm 10 ngày không dùng
    // Đăng ký Expo push token để nhận thông báo (cả tenant lẫn manager) — best-effort
    registerPushToken();
  };

  const login = async (identifier: string, password: string) => {
    const id = identifier.trim();

    // Đã bỏ (15/08/2026) 3 tài khoản demo viết cứng tại đây (0909876543/manager123,
    // 0901234567/tenant123, 0888888888/123456). Chúng vào thẳng app với role
    // manager/tenant mà KHÔNG gọi backend, nên không có token — mọi màn gọi API đều
    // 401, và bản release vẫn đăng nhập được bằng mật khẩu nằm trong mã nguồn.
    // Muốn test nhanh thì tạo tài khoản thật trên BE.

    try {
      const res = await realAuthService.login(id, password);
      await applyRealAuthResponse(res, id);
    } catch (err: any) {
      // Đúng mật khẩu nhưng tài khoản đã kết thúc thuê — giữ nguyên lời nhắn tử tế.
      if (err?.accountEnded) throw err;
      const msg =
        err?.response?.data?.error ||
        err?.response?.data?.message ||
        'Sai tài khoản hoặc mật khẩu. Vui lòng thử lại.';
      throw new Error(msg);
    }
  };

  // Kích hoạt tenant lần đầu: SĐT + OTP + mật khẩu mới -> BE trả token luôn (không cần
  // login lại). Lỗi thường gặp: OTP sai/hết hạn, xác nhận mật khẩu không khớp, chưa
  // đủ điều kiện kích hoạt (do check() throw trước) — đều là BusinessException 422.
  const activateTenant = async (
    phoneNumber: string,
    otp: string,
    newPassword: string,
    confirmPassword: string,
  ) => {
    try {
      const res = await realAuthService.tenantActivateConfirm({
        phoneNumber, otp, newPassword, confirmPassword,
      });
      await applyRealAuthResponse(res, phoneNumber);
    } catch (err: any) {
      if (err?.accountEnded) throw err;
      const msg =
        err?.response?.data?.error ||
        err?.response?.data?.message ||
        'Kích hoạt tài khoản thất bại. Vui lòng thử lại.';
      throw new Error(msg);
    }
  };

  const logout = async () => {
    // Gỡ push token TRƯỚC khi xoá accessToken (cần còn auth để gọi BE) — best-effort
    await unregisterPushToken();
    // Xoá SẠCH phiên: token + hồ sơ + lựa chọn "nhà đang thuê" (tránh dính sang tài
    // khoản khác đăng nhập sau trên cùng máy).
    await clearSession();
    setUser(null);
  };

  const updateUser = (data: Partial<User>) => {
    if (user) {
      const next = { ...user, ...data };
      setUser(next);
      persistUser(next);   // đổi tên/ảnh… giữ nguyên sau khi mở lại app
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isAuthenticated: !!user,
        login,
        activateTenant,
        logout,
        updateUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};
