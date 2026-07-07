import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Colors, Spacing, BorderRadius, Typography, Shadow } from '@/constants';
import { PropertyCard, FilterChips } from '@/components/common';
import { searchService } from '@/services';
import { PropertyListing } from '@/types';
import { GuestStackParamList } from '@/navigation/GuestStackNavigator';

type NavigationProp = NativeStackNavigationProp<GuestStackParamList, 'SearchResult'>;
type RouteProps = RouteProp<GuestStackParamList, 'SearchResult'>;

const SORT_OPTIONS = [
  { id: 'newest', label: 'Mới nhất' },
  { id: 'price_asc', label: '↑ Giá thấp' },
  { id: 'price_desc', label: '↓ Giá cao' },
];

export const SearchResultScreen: React.FC = () => {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<RouteProps>();
  const filters = route.params.filters;

  const [results, setResults] = useState<PropertyListing[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState('newest');

  useEffect(() => {
    loadResults();
  }, [sortBy, filters]);

  const loadResults = async () => {
    setLoading(true);
    try {
      const data = await searchService.searchProperties({ ...filters, sortBy: sortBy as any });
      setResults(data.properties);
      setTotal(data.total);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const getFilterSummary = () => {
    const parts: string[] = [];
    if (filters.propertyType === 'whole_house') parts.push('🏠 Thuê nguyên căn');
    else if (filters.propertyType === 'apartment') parts.push('🛏 Thuê theo phòng');
    if (filters.cityId) parts.push('Theo thành phố');
    if (filters.priceMax) parts.push('Dưới ' + (filters.priceMax / 1_000_000) + 'tr');
    if (filters.keyword) parts.push(`"${filters.keyword}"`);
    return parts.length > 0 ? parts.join(' · ') : 'Tất cả bất động sản';
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      {/* ── Header ── */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backIcon}>←</Text>
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Kết quả tìm kiếm</Text>
          <Text style={styles.headerSub}>{total} bất động sản</Text>
        </View>
        <TouchableOpacity style={styles.filterIconBtn} onPress={() => navigation.navigate('Search')}>
          <Text style={styles.filterIconText}>⚙️</Text>
        </TouchableOpacity>
      </View>

      {/* ── Filter summary ── */}
      <View style={styles.summaryBar}>
        <Text style={styles.summaryIcon}>🔍</Text>
        <Text style={styles.summaryText} numberOfLines={1}>{getFilterSummary()}</Text>
        <TouchableOpacity style={styles.editBtn} onPress={() => navigation.navigate('Search')}>
          <Text style={styles.editBtnText}>Sửa lọc</Text>
        </TouchableOpacity>
      </View>

      {/* ── Sort bar ── */}
      <View style={styles.sortBar}>
        <FilterChips
          options={SORT_OPTIONS}
          selected={[sortBy]}
          onToggle={setSortBy}
          multiSelect={false}
          scrollable
        />
      </View>

      {/* ── Results ── */}
      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.loadingText}>Đang tìm kiếm...</Text>
        </View>
      ) : results.length === 0 ? (
        <View style={styles.centerContainer}>
          <Text style={styles.emptyIcon}>🏠</Text>
          <Text style={styles.emptyTitle}>Chưa tìm thấy kết quả</Text>
          <Text style={styles.emptySubText}>Hãy thử điều chỉnh lại bộ lọc hoặc mở rộng khu vực tìm kiếm.</Text>
          <TouchableOpacity style={styles.resetBtn} onPress={() => navigation.navigate('Search')}>
            <Text style={styles.resetBtnText}>Tìm kiếm lại</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={results}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => (
            <PropertyCard
              property={item}
              variant="horizontal"
              onPress={() => navigation.navigate('PropertyDetail', { propertyId: item.id })}
            />
          )}
        />
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.background,
  },

  // ── Header ───────────────────────────────────────────────────────────────
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.md,
    backgroundColor: Colors.white,
    borderBottomWidth: 1,
    borderBottomColor: Colors.divider,
    ...Shadow.sm,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backIcon: {
    fontSize: 22,
    color: Colors.textPrimary,
    lineHeight: 26,
  },
  headerCenter: {
    flex: 1,
    marginHorizontal: Spacing.md,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  headerSub: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 1,
  },
  filterIconBtn: {
    width: 40,
    height: 40,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.primaryBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterIconText: {
    fontSize: 18,
  },

  // ── Summary bar ───────────────────────────────────────────────────────────
  summaryBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.sm + 2,
    backgroundColor: Colors.primaryBg,
    borderBottomWidth: 1,
    borderBottomColor: Colors.primaryLight + '40',
  },
  summaryIcon: {
    fontSize: 14,
    marginRight: Spacing.xs,
  },
  summaryText: {
    flex: 1,
    fontSize: 13,
    color: Colors.primaryDark,
    fontWeight: '500',
  },
  editBtn: {
    backgroundColor: Colors.primary,
    paddingHorizontal: Spacing.md,
    paddingVertical: 5,
    borderRadius: BorderRadius.full,
    marginLeft: Spacing.sm,
  },
  editBtnText: {
    fontSize: 12,
    color: Colors.white,
    fontWeight: '600',
  },

  // ── Sort bar ───────────────────────────────────────────────────────────────
  sortBar: {
    backgroundColor: Colors.white,
    paddingVertical: Spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: Colors.divider,
  },

  // ── List ───────────────────────────────────────────────────────────────────
  listContent: {
    padding: Spacing.base,
    paddingBottom: Spacing['4xl'],
  },

  // ── States ─────────────────────────────────────────────────────────────────
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing['2xl'],
  },
  loadingText: {
    marginTop: Spacing.md,
    fontSize: 14,
    color: Colors.textSecondary,
  },
  emptyIcon: {
    fontSize: 56,
    marginBottom: Spacing.md,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.textPrimary,
    textAlign: 'center',
    marginBottom: Spacing.sm,
  },
  emptySubText: {
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: Spacing.xl,
  },
  resetBtn: {
    backgroundColor: Colors.primary,
    paddingHorizontal: Spacing['2xl'],
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.full,
    ...Shadow.sm,
  },
  resetBtnText: {
    color: Colors.white,
    fontSize: 15,
    fontWeight: '700',
  },
});
