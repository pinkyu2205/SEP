import React from 'react';
import { Modal, Pressable, StyleSheet, Text, TouchableOpacity } from 'react-native';
import { Colors } from '@/constants';

/**
 * Bản Web của VideoPreviewModal — react-native-webview KHÔNG có bản build cho web (chỉ
 * ship native iOS/Android/macOS/Windows, xem node_modules/react-native-webview, không có
 * biến thể .web.*), nên dùng thẳng thẻ <video> HTML thật ở đây thay vì WebView. Metro/
 * Expo tự chọn file .web.tsx này khi bundle cho web, chọn VideoPreviewModal.tsx (native)
 * khi build iOS/Android — không cần Platform.select trong code gọi.
 */
export const VideoPreviewModal: React.FC<{
  visible: boolean;
  url: string | null;
  onClose: () => void;
}> = ({ visible, url, onClose }) => {
  if (!visible || !url) return null;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={s.backdrop} onPress={onClose}>
        <TouchableOpacity style={s.closeBtn} onPress={onClose}>
          <Text style={s.closeBtnText}>✕</Text>
        </TouchableOpacity>
        <Pressable style={s.wrap} onPress={() => {}}>
          {/* Thẻ DOM thật — file này chỉ chạy trên web (react-native-web render qua react-dom). */}
          <video
            src={url}
            controls
            autoPlay
            playsInline
            style={{ width: '100%', height: '100%', background: '#000' }}
          />
        </Pressable>
      </Pressable>
    </Modal>
  );
};

const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', alignItems: 'center', justifyContent: 'center' },
  wrap: { width: '94%', height: '60%', backgroundColor: '#000', borderRadius: 12, overflow: 'hidden' },
  closeBtn: {
    position: 'absolute', top: 48, right: 20, width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center', zIndex: 2,
  },
  closeBtnText: { color: Colors.white, fontSize: 16, fontWeight: '700' },
});
