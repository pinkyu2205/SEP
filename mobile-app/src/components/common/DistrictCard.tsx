import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { BorderRadius, Shadow, Spacing } from '../../constants';
import { City, District } from '../../types';

interface DistrictCardProps {
  district: City | District;
  onPress?: () => void;
  colorIndex?: number;
}

const PALETTE = [
  { bg: '#EEF2FF', iconBg: '#C7D2FE', text: '#3730A3', sub: '#4F46E5' },
  { bg: '#FFF7ED', iconBg: '#FED7AA', text: '#9A3412', sub: '#EA580C' },
  { bg: '#F0FDF4', iconBg: '#A7F3D0', text: '#065F46', sub: '#059669' },
  { bg: '#FDF4FF', iconBg: '#E9D5FF', text: '#6B21A8', sub: '#9333EA' },
  { bg: '#FFF1F2', iconBg: '#FECDD3', text: '#9F1239', sub: '#E11D48' },
  { bg: '#FFFBEB', iconBg: '#FDE68A', text: '#92400E', sub: '#D97706' },
];

export const DistrictCard: React.FC<DistrictCardProps> = ({
  district,
  onPress,
  colorIndex = 0,
}) => {
  const p = PALETTE[colorIndex % PALETTE.length];

  return (
    <TouchableOpacity
      activeOpacity={0.8}
      onPress={onPress}
      style={[styles.container, { backgroundColor: p.bg }]}
    >
      <View style={[styles.iconBox, { backgroundColor: p.iconBg }]}>
        <Text style={styles.icon}>📍</Text>
      </View>
      <View style={styles.content}>
        <Text style={[styles.name, { color: p.text }]} numberOfLines={1}>
          {district.name}
        </Text>
        <Text style={[styles.count, { color: p.sub }]}>
          {district.availableRooms} căn hộ trống
        </Text>
      </View>
      <Text style={[styles.arrow, { color: p.sub }]}>›</Text>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    margin: Spacing.xs,
    ...Shadow.sm,
  },
  iconBox: {
    width: 38,
    height: 38,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Spacing.sm,
  },
  icon: {
    fontSize: 18,
  },
  content: {
    flex: 1,
  },
  name: {
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 2,
  },
  count: {
    fontSize: 11,
    fontWeight: '600',
  },
  arrow: {
    fontSize: 22,
    fontWeight: '300',
    marginLeft: 2,
    lineHeight: 26,
  },
});
