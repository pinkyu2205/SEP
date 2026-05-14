import React, { useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Dimensions, ScrollView, NativeSyntheticEvent, NativeScrollEvent } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors, Spacing, BorderRadius } from '../../constants';
import { useAuth } from '../../hooks';

const { width } = Dimensions.get('window');

const TUTORIAL_DATA = [
  {
    emoji: '🧾',
    title: 'Hóa Đơn & Thanh Toán',
    desc: 'Theo dõi chi tiết tiền phòng, điện nước hàng tháng. Thanh toán nhanh chóng và chính xác 100% bằng cách quét mã VietQR.',
  },
  {
    emoji: '🔧',
    title: 'Báo Cáo Sự Cố Dễ Dàng',
    desc: 'Hỏng máy lạnh? Vòi nước rỉ? Chỉ cần quét mã QR trên thiết bị, chụp ảnh và gửi yêu cầu sửa chữa ngay trên ứng dụng.',
  },
  {
    emoji: '📝',
    title: 'Hợp Đồng Điện Tử',
    desc: 'Tra cứu thông tin hợp đồng, tiền cọc và lịch sử đóng tiền bất cứ lúc nào, bất cứ nơi đâu. An toàn, minh bạch.',
  },
];

export const TutorialScreen: React.FC = () => {
  const { updateUser } = useAuth();
  const scrollRef = useRef<ScrollView>(null);
  const [currentPage, setCurrentPage] = useState(0);

  const handleNext = () => {
    if (currentPage < TUTORIAL_DATA.length - 1) {
      const nextPage = currentPage + 1;
      scrollRef.current?.scrollTo({ x: nextPage * width, animated: true });
      setCurrentPage(nextPage);
    } else {
      // Hoàn tất Tutorial, update isFirstLogin = false để vào Home
      updateUser({ isFirstLogin: false });
    }
  };

  const handleSkip = () => {
    updateUser({ isFirstLogin: false });
  };

  const onScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const x = event.nativeEvent.contentOffset.x;
    const page = Math.round(x / width);
    if (page !== currentPage) {
      setCurrentPage(page);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <TouchableOpacity onPress={handleSkip}>
          <Text style={styles.skipText}>Bỏ qua</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onScroll}
        style={styles.pagerView}
      >
        {TUTORIAL_DATA.map((item, index) => (
          <View key={index} style={[styles.page, { width }]}>
            <View style={styles.emojiContainer}>
              <Text style={styles.emoji}>{item.emoji}</Text>
            </View>
            <Text style={styles.title}>{item.title}</Text>
            <Text style={styles.desc}>{item.desc}</Text>
          </View>
        ))}
      </ScrollView>

      <View style={styles.footer}>
        <View style={styles.dotsContainer}>
          {TUTORIAL_DATA.map((_, index) => (
            <View
              key={index}
              style={[
                styles.dot,
                currentPage === index && styles.dotActive,
              ]}
            />
          ))}
        </View>

        <TouchableOpacity style={styles.button} onPress={handleNext}>
          <Text style={styles.buttonText}>
            {currentPage === TUTORIAL_DATA.length - 1 ? 'Bắt Đầu Sử Dụng' : 'Tiếp Theo'}
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: Colors.white },
  header: { alignItems: 'flex-end', padding: Spacing.lg },
  skipText: { fontSize: 16, color: Colors.textSecondary, fontWeight: '600' },
  
  pagerView: { flex: 1 },
  page: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: Spacing['2xl'] },
  
  emojiContainer: {
    width: 150, height: 150,
    backgroundColor: Colors.primaryBg,
    borderRadius: 75,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing['2xl'],
  },
  emoji: { fontSize: 80 },
  title: { fontSize: 26, fontWeight: '800', color: Colors.textPrimary, marginBottom: Spacing.lg, textAlign: 'center' },
  desc: { fontSize: 16, color: Colors.textSecondary, textAlign: 'center', lineHeight: 24 },

  footer: { padding: Spacing['2xl'] },
  dotsContainer: { flexDirection: 'row', justifyContent: 'center', marginBottom: Spacing['2xl'] },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.divider, marginHorizontal: 4 },
  dotActive: { width: 24, backgroundColor: Colors.primary },
  
  button: {
    backgroundColor: Colors.primary,
    paddingVertical: Spacing.lg,
    borderRadius: BorderRadius.xl,
    alignItems: 'center',
  },
  buttonText: { color: Colors.white, fontSize: 18, fontWeight: '700' },
});
