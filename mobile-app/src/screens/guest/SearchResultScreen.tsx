import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Colors, Spacing, Typography } from '../../constants';
import { PropertyCard, FilterChips } from '../../components/common';
import { searchService } from '../../services';
import { PropertyListing } from '../../types';
import { GuestStackParamList } from '../../navigation/GuestStackNavigator';

type NavigationProp = NativeStackNavigationProp<GuestStackParamList, 'SearchResult'>;
type RouteProps = RouteProp<GuestStackParamList, 'SearchResult'>;

const SORT_OPTIONS = [
  { id: 'newest', label: 'Mới nhất' },
  { id: 'price_asc', label: 'Giá thấp nhất' },
  { id: 'price_desc', label: 'Giá cao nhất' },
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
      const data = await searchService.searchProperties({
        ...filters,
        sortBy: sortBy as any,
      });
      setResults(data.properties);
      setTotal(data.total);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const getFilterSummary = () => {
    const parts = [];
    if (filters.cityId) parts.push('Thành phố');
    if (filters.priceMax) parts.push('Dưới ' + (filters.priceMax / 1000000) + 'tr');
    if (filters.keyword) parts.push(`"${filters.keyword}"`);
    return parts.length > 0 ? parts.join(' • ') : 'Tất cả';
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backIcon}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Kết quả ({total})</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.filterSummaryBar}>
        <Text style={styles.filterSummaryText} numberOfLines={1}>
          Lọc: {getFilterSummary()}
        </Text>
        <TouchableOpacity 
          style={styles.editFilterBtn}
          onPress={() => navigation.navigate('Search')}
        >
          <Text style={styles.editFilterText}>Sửa lọc ⚙</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.sortBar}>
        <FilterChips
          options={SORT_OPTIONS}
          selected={[sortBy]}
          onToggle={setSortBy}
          multiSelect={false}
          scrollable={true}
        />
      </View>

      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      ) : results.length === 0 ? (
        <View style={styles.centerContainer}>
          <Text style={styles.emptyIcon}>🔍</Text>
          <Text style={styles.emptyText}>Không tìm thấy phòng trọ phù hợp.</Text>
          <Text style={styles.emptySubText}>Vui lòng thử điều chỉnh lại bộ lọc.</Text>
        </View>
      ) : (
        <FlatList
          data={results}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.listContent}
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: Spacing.base,
    backgroundColor: Colors.white,
  },
  backBtn: {
    padding: Spacing.xs,
    width: 40,
  },
  backIcon: {
    fontSize: 24,
    color: Colors.textPrimary,
  },
  headerTitle: {
    ...Typography.h3,
  },
  filterSummaryBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.sm,
    backgroundColor: Colors.primaryBg,
  },
  filterSummaryText: {
    flex: 1,
    fontSize: 13,
    color: Colors.primaryDark,
    fontWeight: '500',
  },
  editFilterBtn: {
    marginLeft: Spacing.sm,
  },
  editFilterText: {
    fontSize: 13,
    color: Colors.primary,
    fontWeight: '700',
  },
  sortBar: {
    backgroundColor: Colors.white,
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.divider,
  },
  listContent: {
    padding: Spacing.base,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.xl,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: Spacing.md,
  },
  emptyText: {
    ...Typography.h4,
    color: Colors.textPrimary,
    textAlign: 'center',
  },
  emptySubText: {
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginTop: Spacing.sm,
  }
});
