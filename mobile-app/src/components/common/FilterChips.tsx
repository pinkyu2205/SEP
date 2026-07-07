import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { Colors, Spacing, BorderRadius } from '@/constants';

export interface FilterChipOption {
  id: string;
  label: string;
  icon?: string;
}

interface FilterChipsProps {
  options: FilterChipOption[];
  selected: string[];
  onToggle: (id: string) => void;
  multiSelect?: boolean;
  scrollable?: boolean;
}

export const FilterChips: React.FC<FilterChipsProps> = ({
  options,
  selected,
  onToggle,
  multiSelect = true,
  scrollable = false,
}) => {
  const handlePress = (id: string) => {
    onToggle(id);
  };

  const renderChips = () => (
    options.map((opt) => {
      const isSelected = selected.includes(opt.id);
      return (
        <TouchableOpacity
          key={opt.id}
          activeOpacity={0.7}
          onPress={() => handlePress(opt.id)}
          style={[styles.chip, isSelected && styles.chipSelected]}
        >
          {opt.icon && <Text style={styles.icon}>{opt.icon}</Text>}
          <Text style={[styles.label, isSelected && styles.labelSelected]}>
            {opt.label}
          </Text>
        </TouchableOpacity>
      );
    })
  );

  if (scrollable) {
    return (
      <ScrollView 
        horizontal 
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContainer}
      >
        {renderChips()}
      </ScrollView>
    );
  }

  return <View style={styles.wrapContainer}>{renderChips()}</View>;
};

const styles = StyleSheet.create({
  wrapContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  scrollContainer: {
    gap: Spacing.sm,
    paddingHorizontal: Spacing.xs,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  chipSelected: {
    backgroundColor: Colors.primaryBg,
    borderColor: Colors.primary,
  },
  icon: {
    fontSize: 14,
    marginRight: 6,
  },
  label: {
    fontSize: 13,
    color: Colors.textSecondary,
    fontWeight: '500',
  },
  labelSelected: {
    color: Colors.primaryDark,
    fontWeight: '600',
  }
});
