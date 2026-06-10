import React from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Image,
} from 'react-native';
import { Colors, Spacing, Shadow } from '../../constants';
import { PropertyListing } from '../../types';
import { formatCurrency } from '../../utils/helpers';

interface PropertyCardProps {
  property: PropertyListing;
  variant?: 'horizontal' | 'vertical';
  isNew?: boolean;
  onPress?: () => void;
}

export const PropertyCard: React.FC<PropertyCardProps> = ({
  property,
  variant = 'horizontal',
  isNew = false,
  onPress,
}) => {
  const isHorizontal = variant === 'horizontal';
  const isWholeHouse = property.propertyType === 'whole_house';
  const typeLabel = isWholeHouse ? 'Thuê nguyên căn' : 'Thuê theo phòng';
  const photo = property.photos?.[0];

  // ─── Image block shared by both variants ───────────────────────────────
  const ImageBlock = ({ height }: { height: number }) => (
    <View style={[styles.imgWrap, { height }]}>
      {photo ? (
        <Image source={{ uri: photo }} style={styles.imgFill} resizeMode="cover" />
      ) : (
        <View style={styles.imgFallback}>
          <Text style={{ fontSize: 44 }}>🏠</Text>
        </View>
      )}
      {/* Bottom scrim */}
      <View style={styles.scrim} />

      {/* Top-left badge row */}
      <View style={styles.badgeRow}>
        <View style={[styles.badge, isWholeHouse && styles.badgeGreen]}>
          <Text style={styles.badgeTxt}>{typeLabel}</Text>
        </View>
        {isNew && (
          <View style={styles.badgeNew}>
            <Text style={styles.badgeNewTxt}>MỚI</Text>
          </View>
        )}
      </View>

      {/* Price bottom-left */}
      <Text style={styles.priceOverlay}>
        {formatCurrency(property.priceFrom)}/tháng
      </Text>
    </View>
  );

  // ─── Vertical card (home horizontal scroll) ────────────────────────────
  if (!isHorizontal) {
    return (
      <TouchableOpacity activeOpacity={0.88} onPress={onPress} style={styles.vCard}>
        <ImageBlock height={158} />
        <View style={styles.vBody}>
          <Text style={styles.vTitle} numberOfLines={2}>{property.name}</Text>
          <Text style={styles.addr} numberOfLines={1}>
            📍 {property.ward}, {property.city}
          </Text>
          {property.availableRooms > 0 && (
            <View style={styles.row}>
              <View style={styles.dotGreen} />
              <Text style={styles.statusTxt}>Còn trống</Text>
            </View>
          )}
        </View>
      </TouchableOpacity>
    );
  }

  // ─── Horizontal card (full-width list) ────────────────────────────────
  return (
    <TouchableOpacity activeOpacity={0.88} onPress={onPress} style={styles.hCard}>
      <ImageBlock height={190} />
      <View style={styles.hBody}>
        <Text style={styles.hTitle} numberOfLines={2}>{property.name}</Text>
        <Text style={styles.addr} numberOfLines={1}>
          📍 {property.ward}, {property.city}
        </Text>

        <View style={styles.metaRow}>
          <Text style={styles.metaTxt}>📐 {property.area}m²</Text>
          {isWholeHouse && (
            <>
              <Text style={styles.metaDot}>·</Text>
              <Text style={styles.metaTxt}>🛏 {property.totalRooms} phòng</Text>
            </>
          )}
        </View>

        {property.amenities.length > 0 && (
          <View style={styles.amenRow}>
            {property.amenities.slice(0, 3).map((am, i) => (
              <View key={i} style={styles.amenPill}>
                <Text style={styles.amenTxt}>{am}</Text>
              </View>
            ))}
            {property.amenities.length > 3 && (
              <View style={styles.amenPill}>
                <Text style={styles.amenTxt}>+{property.amenities.length - 3}</Text>
              </View>
            )}
          </View>
        )}

        {property.availableRooms > 0 && (
          <View style={styles.row}>
            <View style={styles.dotGreen} />
            <Text style={styles.statusTxt}>Còn trống</Text>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
};

// ─── Styles ──────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  // Vertical
  vCard: {
    width: 224,
    backgroundColor: Colors.white,
    borderRadius: 20,
    marginRight: Spacing.md,
    overflow: 'hidden',
    ...Shadow.md,
  },
  vBody: { padding: Spacing.md, paddingTop: Spacing.sm },
  vTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.textPrimary,
    lineHeight: 20,
    marginBottom: 4,
  },

  // Horizontal
  hCard: {
    backgroundColor: Colors.white,
    borderRadius: 20,
    marginBottom: Spacing.md,
    overflow: 'hidden',
    ...Shadow.md,
  },
  hBody: { padding: Spacing.md },
  hTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.textPrimary,
    lineHeight: 22,
    marginBottom: 4,
  },

  // Image block
  imgWrap: { width: '100%', overflow: 'hidden', backgroundColor: Colors.primaryBg },
  imgFill: { width: '100%', height: '100%' },
  imgFallback: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: Colors.primaryBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrim: {
    position: 'absolute',
    bottom: 0, left: 0, right: 0,
    height: 80,
    backgroundColor: 'rgba(0,0,0,0.32)',
  },
  badgeRow: {
    position: 'absolute',
    top: Spacing.sm, left: Spacing.sm,
    flexDirection: 'row', gap: 6,
  },
  badge: {
    backgroundColor: 'rgba(79,70,229,0.9)',
    paddingHorizontal: 9, paddingVertical: 4,
    borderRadius: 99,
  },
  badgeGreen: { backgroundColor: 'rgba(16,185,129,0.9)' },
  badgeTxt: { color: '#fff', fontSize: 10, fontWeight: '700' },
  badgeNew: {
    backgroundColor: '#EF4444',
    paddingHorizontal: 8, paddingVertical: 4,
    borderRadius: 99,
  },
  badgeNewTxt: { color: '#fff', fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },

  priceOverlay: {
    position: 'absolute',
    bottom: Spacing.sm, left: Spacing.sm,
    color: '#fff',
    fontSize: 16, fontWeight: '800',
    textShadowColor: 'rgba(0,0,0,0.7)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },

  // Shared info
  addr: { fontSize: 12, color: Colors.textSecondary, marginBottom: Spacing.sm },
  metaRow: { flexDirection: 'row', alignItems: 'center', marginBottom: Spacing.sm },
  metaTxt: { fontSize: 12, color: Colors.textSecondary },
  metaDot: { marginHorizontal: 6, color: Colors.textMuted, fontSize: 10 },
  amenRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginBottom: Spacing.sm },
  amenPill: {
    backgroundColor: Colors.primaryBg,
    paddingHorizontal: 8, paddingVertical: 3,
    borderRadius: 99,
    borderWidth: 1, borderColor: Colors.primaryLight,
  },
  amenTxt: { fontSize: 10, color: Colors.primary, fontWeight: '500' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  dotGreen: { backgroundColor: Colors.success },
  dotGray:  { backgroundColor: Colors.textMuted },
  statusTxt: { fontSize: 11, color: Colors.textSecondary, fontWeight: '500' },
});
