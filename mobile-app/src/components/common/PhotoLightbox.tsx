import React from 'react';
import { View, Text, StyleSheet, Modal, Image, TouchableOpacity, Pressable, Dimensions } from 'react-native';
import { Colors } from '@/constants';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

/**
 * Xem ảnh toàn màn hình — dùng chung cho mọi nơi có ảnh bảo trì (tenant lẫn manager):
 * ảnh đính kèm lúc tạo yêu cầu, ảnh trước/sau sửa chữa, ảnh hoá đơn, ảnh bằng chứng lỗi,
 * ảnh tự sửa... Bấm vào ảnh nhỏ để phóng to thay vì chỉ nhìn thumbnail 72-120px.
 *
 * State `{ uris, index }` do màn cha giữ (không tự quản lý danh sách ảnh) — cùng một
 * component phục vụ được cả gallery nhiều ảnh (có nút lướt trái/phải) lẫn 1 ảnh đơn.
 */
export interface LightboxState { uris: string[]; index: number }

export const PhotoLightbox: React.FC<{
  state: LightboxState | null;
  onChange: (state: LightboxState | null) => void;
}> = ({ state, onChange }) => {
  if (!state) return null;
  const { uris, index } = state;
  const go = (delta: number) => onChange({ uris, index: (index + delta + uris.length) % uris.length });

  return (
    <Modal visible transparent animationType="fade" onRequestClose={() => onChange(null)}>
      <Pressable style={ls.backdrop} onPress={() => onChange(null)}>
        <TouchableOpacity style={ls.closeBtn} onPress={() => onChange(null)}>
          <Text style={ls.closeBtnText}>✕</Text>
        </TouchableOpacity>
        <Pressable style={ls.imageWrap} onPress={() => {}}>
          <Image source={{ uri: uris[index] }} style={ls.image} resizeMode="contain" />
        </Pressable>
        {uris.length > 1 && (
          <>
            <TouchableOpacity style={[ls.navBtn, ls.navLeft]} onPress={() => go(-1)}>
              <Text style={ls.navBtnText}>‹</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[ls.navBtn, ls.navRight]} onPress={() => go(1)}>
              <Text style={ls.navBtnText}>›</Text>
            </TouchableOpacity>
            <View style={ls.counter}>
              <Text style={ls.counterText}>{index + 1} / {uris.length}</Text>
            </View>
          </>
        )}
      </Pressable>
    </Modal>
  );
};

const ls = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', alignItems: 'center', justifyContent: 'center' },
  /**
   * `Pressable`/`Image` con dùng % chiều cao trước đây (`height:'80%'`) nhưng cha
   * (`Pressable` không có style) lại không có kích thước cố định — % của 1 kích thước
   * chưa xác định bị Yoga coi là 0, ảnh co về 0px và "biến mất" dù thumbnail vẫn hiện
   * bình thường. Đổi sang kích thước px tuyệt đối (tính từ Dimensions) để tránh vòng
   * lặp phụ thuộc kích thước cha-con.
   */
  imageWrap: { width: SCREEN_W * 0.94, height: SCREEN_H * 0.8 },
  image: { width: '100%', height: '100%' },
  closeBtn: {
    position: 'absolute', top: 48, right: 20, width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center', zIndex: 2,
  },
  closeBtnText: { color: Colors.white, fontSize: 16, fontWeight: '700' },
  navBtn: {
    position: 'absolute', top: '50%', marginTop: -22, width: 44, height: 44, borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center',
  },
  navLeft:  { left: 12 },
  navRight: { right: 12 },
  navBtnText: { color: Colors.white, fontSize: 26, fontWeight: '700', marginTop: -2 },
  counter: {
    position: 'absolute', bottom: 40, alignSelf: 'center',
    backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 4,
  },
  counterText: { color: Colors.white, fontSize: 12, fontWeight: '700' },
});
