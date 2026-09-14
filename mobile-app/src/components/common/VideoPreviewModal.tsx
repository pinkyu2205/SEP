import React from 'react';
import { Modal, Pressable, StyleSheet, Text, TouchableOpacity } from 'react-native';
import { WebView } from 'react-native-webview';
import { Colors } from '@/constants';

/**
 * Xem lại 1 video bằng chứng ĐÃ upload lên server (có URL http thật) — dùng WebView +
 * thẻ HTML <video> thay vì thư viện phát video native (expo-av/expo-video/
 * react-native-video) để KHÔNG cần rebuild native app: team đang tránh mọi thay đổi kéo
 * theo rebuild EAS sau chuỗi build cloud lỗi liên tiếp gần đây (yêu cầu mentor
 * 14/09/2026). react-native-webview đã có sẵn trong package.json, là JS thuần (không có
 * native code mới cần link lại).
 *
 * Video LOCAL vừa chọn/quay (chưa upload, chưa có URL) KHÔNG dùng modal này — chỉ hiện 1
 * tile placeholder (icon phim + thời lượng), xem PhotoEvidenceRow trong TicketDetailScreen.
 */
export const VideoPreviewModal: React.FC<{
  visible: boolean;
  url: string | null;
  onClose: () => void;
}> = ({ visible, url, onClose }) => {
  if (!visible || !url) return null;

  const html = `<!DOCTYPE html><html><head>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  html,body { margin:0; padding:0; background:#000; height:100%; }
  body { display:flex; align-items:center; justify-content:center; }
  video { width:100%; max-height:100vh; background:#000; }
</style>
</head><body>
  <video controls autoplay playsinline src="${url}"></video>
</body></html>`;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={s.backdrop} onPress={onClose}>
        <TouchableOpacity style={s.closeBtn} onPress={onClose}>
          <Text style={s.closeBtnText}>✕</Text>
        </TouchableOpacity>
        <Pressable style={s.wrap} onPress={() => {}}>
          <WebView
            source={{ html }}
            style={s.webview}
            allowsInlineMediaPlayback
            mediaPlaybackRequiresUserAction={false}
            javaScriptEnabled
            domStorageEnabled
            originWhitelist={['*']}
          />
        </Pressable>
      </Pressable>
    </Modal>
  );
};

const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', alignItems: 'center', justifyContent: 'center' },
  wrap: { width: '94%', height: '60%', backgroundColor: '#000', borderRadius: 12, overflow: 'hidden' },
  webview: { flex: 1, backgroundColor: '#000' },
  closeBtn: {
    position: 'absolute', top: 48, right: 20, width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center', zIndex: 2,
  },
  closeBtnText: { color: Colors.white, fontSize: 16, fontWeight: '700' },
});
