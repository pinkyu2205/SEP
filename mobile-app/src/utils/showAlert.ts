import { Alert, Platform } from 'react-native';

export type AlertButton = {
  text?: string;
  onPress?: () => void;
  style?: 'default' | 'cancel' | 'destructive';
};

export interface AlertRequest {
  title: string;
  message?: string;
  buttons?: AlertButton[];
  /** Emoji hiển thị trong vòng tròn. Bỏ trống thì AlertHost tự đoán theo tiêu đề. */
  icon?: string;
}

type Handler = (req: AlertRequest) => void;
let handler: Handler | null = null;

/**
 * AlertHost gọi hàm này khi mount để nhận thông báo. Trả về hàm gỡ đăng ký.
 * Không export ra ngoài @/utils — chỉ AlertHost dùng.
 */
export function registerAlertHost(fn: Handler): () => void {
  handler = fn;
  return () => { if (handler === fn) handler = null; };
}

/**
 * Hiển thị thông báo của app. Dùng hàm này THAY CHO Alert.alert ở mọi nơi.
 *
 * Vì sao không dùng Alert.alert trực tiếp:
 *   • react-native-web định nghĩa Alert.alert là no-op (`static alert() {}`) — không hiện
 *     gì và KHÔNG gọi onPress của nút nào, nên trên web mọi xác nhận đều chết lặng.
 *   • window.alert/confirm thì chạy được nhưng kèm dòng "localhost:8081 cho biết",
 *     nút OK/Huỷ của trình duyệt, không theo giao diện app.
 *
 * Nên: đẩy vào AlertHost (popup React, đẹp và giống nhau trên mọi nền tảng).
 * Nếu AlertHost chưa mount (hiếm — vd gọi rất sớm lúc khởi động) thì rơi về
 * Alert.alert native / window.confirm để không nuốt mất thông báo.
 */
export function showAlert(title: string, message?: string, buttons?: AlertButton[], icon?: string) {
  if (handler) {
    handler({ title, message, buttons, icon });
    return;
  }

  // ── Fallback khi chưa có host ──
  if (Platform.OS === 'web') {
    const fullMsg = message ? `${title}\n\n${message}` : title;
    if (buttons && buttons.length > 1) {
      const confirmed = window.confirm(fullMsg);
      const chosen = confirmed
        ? buttons.find(b => b.style !== 'cancel') ?? buttons[0]
        : buttons.find(b => b.style === 'cancel') ?? buttons[buttons.length - 1];
      chosen?.onPress?.();
    } else {
      window.alert(fullMsg);
      buttons?.[0]?.onPress?.();
    }
    return;
  }
  Alert.alert(title, message, buttons as any);
}
