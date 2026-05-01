import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors, Spacing } from '../../constants';
import { useAuth } from '../../hooks';
import { Button } from '../../components/common';

export const ProfileScreen: React.FC = () => {
  const { user, logout } = useAuth();

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        {/* Avatar */}
        <View style={styles.avatarContainer}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>
              {user?.fullName?.charAt(0)?.toUpperCase() || '?'}
            </Text>
          </View>
          <Text style={styles.name}>{user?.fullName || 'Người dùng'}</Text>
          <Text style={styles.role}>
            {user?.role === 'tenant' ? 'Khách thuê' : user?.role === 'manager' ? 'Quản lý' : 'Admin'}
          </Text>
        </View>

        {/* Info */}
        <View style={styles.infoSection}>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>📧 Email</Text>
            <Text style={styles.infoValue}>{user?.email || '—'}</Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>📞 Điện thoại</Text>
            <Text style={styles.infoValue}>{user?.phone || '—'}</Text>
          </View>
        </View>

        {/* Logout */}
        <Button title="Đăng xuất" variant="danger" onPress={logout} style={styles.logoutBtn} />
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  container: { flex: 1, paddingHorizontal: Spacing.lg, paddingTop: Spacing['2xl'] },
  avatarContainer: { alignItems: 'center', marginBottom: Spacing['2xl'] },
  avatar: { width: 80, height: 80, borderRadius: 40, backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center', marginBottom: Spacing.md },
  avatarText: { fontSize: 32, fontWeight: '700', color: Colors.white },
  name: { fontSize: 22, fontWeight: '700', color: Colors.textPrimary },
  role: { fontSize: 14, color: Colors.textSecondary, marginTop: 4 },
  infoSection: { backgroundColor: Colors.white, borderRadius: 14, padding: Spacing.base, marginBottom: Spacing['2xl'] },
  infoRow: { paddingVertical: Spacing.md },
  infoLabel: { fontSize: 13, color: Colors.textSecondary, marginBottom: 4 },
  infoValue: { fontSize: 15, fontWeight: '500', color: Colors.textPrimary },
  divider: { height: 1, backgroundColor: Colors.divider },
  logoutBtn: { marginTop: 'auto', marginBottom: Spacing['2xl'] },
});
