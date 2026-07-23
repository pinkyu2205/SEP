import { Alert, Platform } from 'react-native';

type AlertButton = { text?: string; onPress?: () => void; style?: 'default' | 'cancel' | 'destructive' };

/**
 * Alert.alert() của react-native-web là no-op (`static alert() {}`) — không hiện gì
 * và không gọi onPress của button nào, kể cả khi chạy thành công. Dùng hàm này thay
 * Alert.alert trực tiếp để có phản hồi trên web (window.alert/confirm), giữ nguyên
 * hành vi native ở app thật.
 */
export function showAlert(title: string, message?: string, buttons?: AlertButton[]) {
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
