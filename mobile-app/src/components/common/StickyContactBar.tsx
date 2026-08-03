import React from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Linking,
} from 'react-native';
import { showAlert } from '@/utils';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Spacing, Shadow } from '@/constants';

const HOTLINE = '19008386';
const HOTLINE_DISPLAY = '1900 8386';

interface StickyContactBarProps {
  propertyName?: string;
}

export const StickyContactBar: React.FC<StickyContactBarProps> = ({ propertyName }) => {
  const insets = useSafeAreaInsets();
  const bottomPad = Math.max(insets.bottom, Spacing.sm);

  const openCall = () => {
    Linking.openURL(`tel:${HOTLINE}`).catch(() =>
      showAlert('Hotline', `Vui lòng gọi: ${HOTLINE_DISPLAY}`)
    );
  };

  return (
    <View style={[styles.wrapper, { paddingBottom: bottomPad }]}>
      <TouchableOpacity style={[styles.btn, styles.btnCall]} onPress={openCall} activeOpacity={0.85}>
        <Text style={styles.btnIcon}>📞</Text>
        <Text style={styles.btnLabel}>Gọi hotline {HOTLINE_DISPLAY}</Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    flexDirection: 'row',
    backgroundColor: Colors.white,
    paddingHorizontal: Spacing.base,
    paddingTop: Spacing.md,
    gap: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.divider,
    ...Shadow.lg,
  },
  btn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.md,
    borderRadius: 14,
    gap: 3,
  },
  btnCall: { backgroundColor: '#059669' },
  btnIcon:  { fontSize: 18 },
  btnLabel: { fontSize: 11, fontWeight: '700', color: Colors.white },
});
