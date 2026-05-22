import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Colors, Spacing, BorderRadius, Shadow } from '../../constants';
import { District } from '../../types';

interface DistrictCardProps {
  district: District;
  onPress?: () => void;
}

export const DistrictCard: React.FC<DistrictCardProps> = ({ district, onPress }) => {
  return (
    <TouchableOpacity 
      activeOpacity={0.8} 
      onPress={onPress}
      style={styles.container}
    >
      <View style={styles.iconContainer}>
        <Text style={styles.icon}>📍</Text>
      </View>
      <View style={styles.content}>
        <Text style={styles.name} numberOfLines={1}>{district.name}</Text>
        <Text style={styles.rooms}>{district.availableRooms} phòng trống</Text>
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.primaryBg,
    borderRadius: BorderRadius.lg,
    padding: Spacing.sm,
    margin: Spacing.xs,
    borderWidth: 1,
    borderColor: Colors.primaryLight,
    ...Shadow.sm,
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Spacing.sm,
  },
  icon: {
    fontSize: 20,
  },
  content: {
    flex: 1,
  },
  name: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.primaryDark,
    marginBottom: 2,
  },
  rooms: {
    fontSize: 11,
    color: Colors.primary,
    fontWeight: '500',
  }
});
