import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Colors, Spacing, BorderRadius, Shadow } from '../../constants';
import { PropertyListing } from '../../types';
import { formatCurrency } from '../../utils/helpers';

interface PropertyCardProps {
  property: PropertyListing;
  variant?: 'horizontal' | 'vertical';
  onPress?: () => void;
}

export const PropertyCard: React.FC<PropertyCardProps> = ({
  property,
  variant = 'horizontal',
  onPress
}) => {
  const isHorizontal = variant === 'horizontal';

  return (
    <TouchableOpacity 
      activeOpacity={0.8} 
      onPress={onPress}
      style={[styles.container, isHorizontal ? styles.horizontalContainer : styles.verticalContainer]}
    >
      <View style={[styles.imagePlaceholder, isHorizontal ? styles.horizontalImage : styles.verticalImage]}>
        <Text style={styles.imageIcon}>🏠</Text>
      </View>
      
      <View style={styles.content}>
        <Text style={styles.name} numberOfLines={1}>{property.name}</Text>
        <Text style={styles.address} numberOfLines={1}>📍 {property.ward}, {property.district}</Text>
        
        <View style={styles.priceRow}>
          <Text style={styles.price}>{formatCurrency(property.priceFrom)}</Text>
          <Text style={styles.priceLabel}>/tháng</Text>
        </View>

        <View style={styles.amenities}>
          {property.amenities.slice(0, 3).map((am, i) => (
            <View key={i} style={styles.amenityChip}>
              <Text style={styles.amenityText}>{am}</Text>
            </View>
          ))}
          {property.amenities.length > 3 && (
            <View style={styles.amenityChip}>
              <Text style={styles.amenityText}>+{property.amenities.length - 3}</Text>
            </View>
          )}
        </View>

        <View style={styles.footer}>
          <View style={[styles.statusDot, property.availableRooms > 0 ? styles.statusAvailable : styles.statusFull]} />
          <Text style={styles.statusText}>
            {property.availableRooms > 0 ? `${property.availableRooms} phòng trống` : 'Đã hết phòng'}
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.lg,
    ...Shadow.md,
    overflow: 'hidden',
  },
  horizontalContainer: {
    flexDirection: 'row',
    marginBottom: Spacing.md,
  },
  verticalContainer: {
    width: 220,
    marginRight: Spacing.md,
  },
  imagePlaceholder: {
    backgroundColor: Colors.primaryBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  horizontalImage: {
    width: 110,
    height: '100%',
  },
  verticalImage: {
    width: '100%',
    height: 140,
  },
  imageIcon: {
    fontSize: 40,
  },
  content: {
    flex: 1,
    padding: Spacing.md,
  },
  name: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: 4,
  },
  address: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginBottom: Spacing.sm,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginBottom: Spacing.sm,
  },
  price: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.error,
  },
  priceLabel: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginLeft: 2,
  },
  amenities: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    marginBottom: Spacing.sm,
  },
  amenityChip: {
    backgroundColor: Colors.background,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  amenityText: {
    fontSize: 10,
    color: Colors.textSecondary,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 'auto',
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  statusAvailable: {
    backgroundColor: Colors.success,
  },
  statusFull: {
    backgroundColor: Colors.textMuted,
  },
  statusText: {
    fontSize: 12,
    color: Colors.textSecondary,
    fontWeight: '500',
  }
});
