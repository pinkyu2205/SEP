import React, { useCallback, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput,
  ActivityIndicator, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { Colors, Spacing, BorderRadius, Shadow } from '@/constants';
import { showAlert, formatDate } from '@/utils';
import {
  extensionService, EXTENSION_STATUS_META,
  type ExtensionRequest, type ExtensionRequestStatus,
} from '@/services/shared/extensionService';

/**
 * ĐƠN XIN GIA HẠN — hàng chờ của quản lý.
 *
 * ─── Quản lý XEM và GÓP Ý, không duyệt ───────────────────────────────────────
 * Người bấm duyệt là ADMIN, vì thứ quyết định gia hạn được hay không là hợp đồng của
 * công ty với chủ nhà còn bao lâu — quan hệ đó quản lý không nắm. Gia hạn cũng là cam kết
 * thương mại, mà theo luật chốt 07/08/2026 quản lý bị giữ ngoài mọi chuyện tiền bạc
 * của hợp đồng.
 *
 * Nhưng quản lý nắm thứ admin KHÔNG có: khách này trả tiền đúng hạn không, phòng có bị
 * phàn nàn gì không, có nợ treo không. Admin duyệt mù thì gia hạn cho cả khách đang có
 * vấn đề. Nên màn này có đúng một hành động: **ghi ý kiến** để admin đọc trước khi quyết.
 *
 * Ghi chú đó là NỘI BỘ — máy chủ xoá nó khỏi bản trả cho khách
 * (`listRequestsForTenant` → `res.setManagerNote(null)`), nên viết thẳng được.
 */

const TABS: { key: ExtensionRequestStatus | 'ALL'; label: string }[] = [
  { key: 'PENDING', label: 'Chờ duyệt' },
  { key: 'APPROVED', label: 'Đã duyệt' },
  { key: 'REJECTED', label: 'Từ chối' },
  { key: 'ALL', label: 'Tất cả' },
];

export const ExtensionRequestsScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const [tab, setTab] = useState<ExtensionRequestStatus | 'ALL'>('PENDING');
  const [rows, setRows] = useState<ExtensionRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState(false);
  /** Đơn đang mở ô ghi ý kiến — mở từng cái một, không mở hết cùng lúc. */
  const [noteFor, setNoteFor] = useState<number | null>(null);
  const [noteText, setNoteText] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      setRows(await extensionService.listForManager(tab === 'ALL' ? undefined : tab));
      setLoadError(false);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [tab]);

  // Nạp lại mỗi lần quay về màn: admin có thể vừa duyệt xong ở nơi khác.
  useFocusEffect(useCallback(() => { setLoading(true); void load(); }, [load]));

  const saveNote = async (id: number) => {
    if (!noteText.trim()) return showAlert('Chưa nhập', 'Ghi vài dòng để quản trị viên nắm được tình hình.');
    setSaving(true);
    try {
      await extensionService.addManagerNote(id, noteText);
      setNoteFor(null);
      setNoteText('');
      await load();
    } catch (e: any) {
      showAlert('Lỗi', e?.response?.data?.message || 'Không lưu được ý kiến.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
          <Text style={s.backArrow}>←</Text>
        </TouchableOpacity>
        <Text style={s.headerTitle}>
          Đơn xin gia hạn{rows.length > 0 ? ` (${rows.length})` : ''}
        </Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Nói thẳng vai của mình ngay đầu màn, để quản lý không đi tìm nút duyệt. */}
      <View style={s.roleBar}>
        <Text style={s.roleText}>
          Quản trị viên là người duyệt. Bạn ghi ý kiến để họ nắm được khách này thế nào.
        </Text>
      </View>

      <View style={s.tabs}>
        {TABS.map(t => (
          <TouchableOpacity
            key={t.key}
            style={[s.tab, tab === t.key && s.tabOn]}
            onPress={() => setTab(t.key)}
          >
            <Text style={[s.tabText, tab === t.key && s.tabTextOn]}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <View style={s.center}><ActivityIndicator size="large" color={Colors.primary} /></View>
      ) : (
        <ScrollView
          contentContainerStyle={s.body}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => { setRefreshing(true); void load(); }}
            />
          }
        >
          {loadError ? (
            <View style={s.emptyBox}>
              <Text style={s.emptyIcon}>⚠️</Text>
              <Text style={s.emptyTitle}>Không tải được danh sách</Text>
              <Text style={s.emptyText}>Kéo xuống để thử lại.</Text>
            </View>
          ) : rows.length === 0 ? (
            <View style={s.emptyBox}>
              <Text style={s.emptyIcon}>📄</Text>
              <Text style={s.emptyTitle}>Không có đơn nào</Text>
              <Text style={s.emptyText}>
                {tab === 'PENDING'
                  ? 'Chưa có khách nào xin gia hạn.'
                  : 'Không có đơn nào ở trạng thái này.'}
              </Text>
            </View>
          ) : rows.map(r => {
            const meta = EXTENSION_STATUS_META[r.status];
            const open = noteFor === r.id;
            return (
              <View key={r.id} style={s.card}>
                <View style={s.cardTop}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.tenant} numberOfLines={1}>
                      {r.tenantFullName ?? '(chưa có tên)'}
                    </Text>
                    <Text style={s.place} numberOfLines={1}>
                      {[r.propertyName, r.roomNumber ? `Phòng ${r.roomNumber}` : 'Nguyên căn']
                        .filter(Boolean).join(' · ')}
                    </Text>
                  </View>
                  <View style={[s.pill, { backgroundColor: meta.bg }]}>
                    <Text style={[s.pillText, { color: meta.color }]}>{meta.label}</Text>
                  </View>
                </View>

                <View style={s.figures}>
                  <Text style={s.months}>Xin thêm {r.months} tháng</Text>
                  {!!r.newEndDate && (
                    <Text style={s.newEnd}>→ {formatDate(r.newEndDate)}</Text>
                  )}
                </View>

                {!!r.note && (
                  <View style={s.quote}>
                    <Text style={s.quoteLabel}>Khách nhắn</Text>
                    <Text style={s.quoteText}>{r.note}</Text>
                  </View>
                )}

                {!!r.rejectReason && (
                  <View style={[s.quote, s.quoteBad]}>
                    <Text style={s.quoteLabel}>Lý do từ chối</Text>
                    <Text style={s.quoteText}>{r.rejectReason}</Text>
                  </View>
                )}

                {/* Ý kiến quản lý — chỉ sửa được khi đơn còn chờ duyệt. Đơn đã khép thì
                    ghi thêm cũng không ai đọc, mà lại làm sai lệch hồ sơ đã chốt. */}
                {!!r.managerNote && !open && (
                  <View style={[s.quote, s.quoteMine]}>
                    <Text style={s.quoteLabel}>Ý kiến của bạn</Text>
                    <Text style={s.quoteText}>{r.managerNote}</Text>
                  </View>
                )}

                {r.status === 'PENDING' && (
                  open ? (
                    <>
                      <TextInput
                        style={s.input}
                        value={noteText}
                        onChangeText={setNoteText}
                        placeholder="VD: Khách ở 2 năm, trả tiền đúng hạn, phòng giữ sạch. Nên gia hạn."
                        multiline
                        autoFocus
                      />
                      <View style={s.row}>
                        <TouchableOpacity
                          style={s.ghostBtn}
                          onPress={() => { setNoteFor(null); setNoteText(''); }}
                          disabled={saving}
                        >
                          <Text style={s.ghostBtnText}>Huỷ</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[s.primaryBtn, saving && s.disabled]}
                          onPress={() => saveNote(r.id)}
                          disabled={saving}
                        >
                          {saving
                            ? <ActivityIndicator color={Colors.white} />
                            : <Text style={s.primaryBtnText}>Gửi ý kiến</Text>}
                        </TouchableOpacity>
                      </View>
                    </>
                  ) : (
                    <TouchableOpacity
                      style={s.noteBtn}
                      onPress={() => { setNoteFor(r.id); setNoteText(r.managerNote ?? ''); }}
                    >
                      <Text style={s.noteBtnText}>
                        {r.managerNote ? 'Sửa ý kiến' : '✍️ Ghi ý kiến cho quản trị viên'}
                      </Text>
                    </TouchableOpacity>
                  )
                )}
              </View>
            );
          })}
        </ScrollView>
      )}
    </SafeAreaView>
  );
};

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.base, paddingVertical: Spacing.sm,
    backgroundColor: Colors.white,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  backArrow: { fontSize: 22, color: Colors.primary },
  headerTitle: { flex: 1, fontSize: 16, fontWeight: '800', color: Colors.textPrimary, textAlign: 'center' },

  roleBar: {
    backgroundColor: Colors.infoLight, paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm,
  },
  roleText: { fontSize: 12.5, color: Colors.info, lineHeight: 18 },

  tabs: {
    flexDirection: 'row', gap: Spacing.xs,
    paddingHorizontal: Spacing.base, paddingVertical: Spacing.sm,
    backgroundColor: Colors.white,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  tab: {
    flex: 1, paddingVertical: Spacing.sm, borderRadius: BorderRadius.md,
    alignItems: 'center', backgroundColor: Colors.background,
  },
  tabOn: { backgroundColor: Colors.primary },
  tabText: { fontSize: 12.5, fontWeight: '700', color: Colors.textSecondary },
  tabTextOn: { color: Colors.white },

  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  body: { padding: Spacing.base, gap: Spacing.base, paddingBottom: 40 },

  card: {
    backgroundColor: Colors.white, borderRadius: BorderRadius.lg,
    padding: Spacing.lg, gap: Spacing.sm, ...Shadow.sm,
  },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm },
  tenant: { fontSize: 15, fontWeight: '800', color: Colors.textPrimary },
  place: { fontSize: 12.5, color: Colors.textMuted, marginTop: 1 },
  pill: { borderRadius: BorderRadius.full, paddingHorizontal: 10, paddingVertical: 3 },
  pillText: { fontSize: 11, fontWeight: '800' },

  figures: { flexDirection: 'row', alignItems: 'baseline', gap: Spacing.sm },
  months: { fontSize: 17, fontWeight: '800', color: Colors.textPrimary },
  newEnd: { fontSize: 13, color: Colors.textSecondary },

  quote: { backgroundColor: Colors.background, borderRadius: BorderRadius.md, padding: Spacing.base, gap: 2 },
  quoteBad: { backgroundColor: Colors.errorLight },
  quoteMine: { backgroundColor: Colors.infoLight },
  quoteLabel: {
    fontSize: 10.5, fontWeight: '800', color: Colors.textMuted,
    textTransform: 'uppercase', letterSpacing: 0.4,
  },
  quoteText: { fontSize: 13.5, color: Colors.textPrimary, lineHeight: 19 },

  input: {
    borderWidth: 1, borderColor: Colors.border, borderRadius: BorderRadius.md,
    padding: Spacing.base, fontSize: 14, color: Colors.textPrimary,
    minHeight: 80, textAlignVertical: 'top',
  },
  row: { flexDirection: 'row', gap: Spacing.sm },
  primaryBtn: {
    flex: 1, backgroundColor: Colors.primary, borderRadius: BorderRadius.md,
    paddingVertical: Spacing.base, alignItems: 'center',
  },
  primaryBtnText: { color: Colors.white, fontSize: 14, fontWeight: '800' },
  disabled: { opacity: 0.6 },
  ghostBtn: {
    borderWidth: 1, borderColor: Colors.border, borderRadius: BorderRadius.md,
    paddingVertical: Spacing.base, paddingHorizontal: Spacing.lg, alignItems: 'center',
  },
  ghostBtnText: { color: Colors.textSecondary, fontSize: 14, fontWeight: '700' },
  noteBtn: {
    borderWidth: 1, borderColor: Colors.primary, borderRadius: BorderRadius.md,
    paddingVertical: Spacing.sm + 2, alignItems: 'center',
  },
  noteBtnText: { color: Colors.primary, fontSize: 13.5, fontWeight: '700' },

  emptyBox: { alignItems: 'center', paddingVertical: 60, gap: Spacing.xs },
  emptyIcon: { fontSize: 40 },
  emptyTitle: { fontSize: 15, fontWeight: '800', color: Colors.textPrimary },
  emptyText: { fontSize: 13, color: Colors.textMuted, textAlign: 'center' },
});
