import React from 'react';
import { View, Text, TextInput, StyleSheet, TouchableOpacity } from 'react-native';
import { Colors, Spacing, BorderRadius, Shadow } from '../../constants';

interface SearchBarProps {
  mode?: 'compact' | 'active';
  value?: string;
  onChangeText?: (text: string) => void;
  onPress?: () => void;
  placeholder?: string;
  autoFocus?: boolean;
}

export const SearchBar: React.FC<SearchBarProps> = ({
  mode = 'compact',
  value,
  onChangeText,
  onPress,
  placeholder = 'Tìm kiếm...',
  autoFocus = false
}) => {
  const content = (
    <View style={[styles.container, mode === 'active' && styles.activeContainer]}>
      <Text style={styles.icon}>🔍</Text>
      {mode === 'compact' ? (
        <Text style={styles.placeholder}>{placeholder}</Text>
      ) : (
        <TextInput
          style={styles.input}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={Colors.textMuted}
          autoFocus={autoFocus}
          returnKeyType="search"
        />
      )}
      {mode === 'active' && !!value && (
        <TouchableOpacity onPress={() => onChangeText?.('')} style={styles.clearBtn}>
          <Text style={styles.clearIcon}>✕</Text>
        </TouchableOpacity>
      )}
    </View>
  );

  if (mode === 'compact') {
    return <TouchableOpacity activeOpacity={0.8} onPress={onPress}>{content}</TouchableOpacity>;
  }

  return content;
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.white,
    height: 48,
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.base,
    ...Shadow.sm,
  },
  activeContainer: {
    borderWidth: 1,
    borderColor: Colors.border,
  },
  icon: {
    fontSize: 18,
    marginRight: Spacing.sm,
  },
  placeholder: {
    flex: 1,
    fontSize: 14,
    color: Colors.textMuted,
  },
  input: {
    flex: 1,
    fontSize: 14,
    color: Colors.textPrimary,
    height: '100%',
  },
  clearBtn: {
    padding: Spacing.xs,
  },
  clearIcon: {
    fontSize: 14,
    color: Colors.textMuted,
  }
});
