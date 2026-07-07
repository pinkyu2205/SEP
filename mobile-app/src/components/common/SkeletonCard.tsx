import React, { useEffect, useRef } from 'react';
import { View, Animated, StyleSheet } from 'react-native';
import { Colors, Spacing, Shadow } from '@/constants';

const BONE = '#E2E8F0';

const usePulse = () => {
  const opacity = useRef(new Animated.Value(0.45)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 750, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.45, duration: 750, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, []);
  return opacity;
};

interface SkeletonCardProps {
  variant?: 'vertical' | 'horizontal';
}

export const SkeletonCard: React.FC<SkeletonCardProps> = ({ variant = 'horizontal' }) => {
  const opacity = usePulse();

  if (variant === 'vertical') {
    return (
      <Animated.View style={[styles.vCard, { opacity }]}>
        <View style={styles.vImg} />
        <View style={styles.body}>
          <View style={[styles.bar, { width: '75%', height: 14 }]} />
          <View style={[styles.bar, { width: '55%', height: 11, marginTop: 8 }]} />
          <View style={[styles.bar, { width: '40%', height: 11, marginTop: 6 }]} />
        </View>
      </Animated.View>
    );
  }

  return (
    <Animated.View style={[styles.hCard, { opacity }]}>
      <View style={styles.hImg} />
      <View style={styles.body}>
        <View style={[styles.bar, { width: '80%', height: 16 }]} />
        <View style={[styles.bar, { width: '60%', height: 12, marginTop: 8 }]} />
        <View style={[styles.bar, { width: '45%', height: 12, marginTop: 6 }]} />
        <View style={{ flexDirection: 'row', gap: 6, marginTop: 12 }}>
          <View style={[styles.pill, { width: 60 }]} />
          <View style={[styles.pill, { width: 50 }]} />
          <View style={[styles.pill, { width: 55 }]} />
        </View>
      </View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  vCard: {
    width: 220,
    backgroundColor: Colors.white,
    borderRadius: 20,
    marginRight: Spacing.md,
    overflow: 'hidden',
    ...Shadow.md,
  },
  vImg: { width: '100%', height: 155, backgroundColor: BONE },

  hCard: {
    backgroundColor: Colors.white,
    borderRadius: 20,
    marginBottom: Spacing.md,
    overflow: 'hidden',
    ...Shadow.md,
  },
  hImg: { width: '100%', height: 185, backgroundColor: BONE },

  body: { padding: Spacing.md },
  bar:  { backgroundColor: BONE, borderRadius: 4 },
  pill: { height: 22, backgroundColor: BONE, borderRadius: 99 },
});
