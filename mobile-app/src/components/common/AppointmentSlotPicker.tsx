import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Colors, Spacing, BorderRadius } from '@/constants';
import { MAINTENANCE_BUSINESS_START_HOUR, MAINTENANCE_BUSINESS_END_HOUR } from '@/constants/maintenance';
import { realMaintenanceService } from '@/services/shared/maintenanceService';
import { serverNow } from '@/utils/serverTime';
import { buildSlotTimes, toLocalDateTime, dayRangeApi } from '@/utils/maintenanceAppointment';
import { DatePickerField } from './DatePickerField';

interface Props {
  /** Nhà cần tra lịch bận của manager phụ trách — không có thì lưới vẫn dùng được, chỉ không tô xám. */
  propertyId?: number;
  /** 30 (VISIT) hoặc 60 (REPAIR) — khớp hằng số phía BE. */
  slotMinutes: number;
  /** Bỏ qua slot của chính phiếu đang đổi lịch (nếu không BE trả về đúng slot cũ của nó là "bận"). */
  excludeRequestId?: number;
  date: string;
  onDateChange: (v: string) => void;
  time: string | null;
  onTimeChange: (v: string | null) => void;
  minDate?: Date;
}

/**
 * Lưới chọn ngày + giờ hẹn dùng chung cho mọi màn đặt/đổi lịch bảo trì (tạo phiếu, đổi
 * lịch xem, đặt/đổi lịch sửa) — xem docs/maintenance-appointment-implementation-spec.md.
 */
export const AppointmentSlotPicker: React.FC<Props> = ({
  propertyId, slotMinutes, excludeRequestId, date, onDateChange, time, onTimeChange, minDate,
}) => {
  const [busySlots, setBusySlots] = useState<{ requestId: number; start: string; end: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const slotTimes = buildSlotTimes(slotMinutes);

  useEffect(() => {
    const range = dayRangeApi(date);
    if (!range || !propertyId) { setBusySlots([]); return; }
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const slots = await realMaintenanceService.getManagerAvailability({ propertyId, ...range });
        if (!cancelled) setBusySlots(slots.filter(s => s.requestId !== excludeRequestId));
      } catch {
        if (!cancelled) setBusySlots([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [date, propertyId, excludeRequestId]);

  const isSlotPast = (t: string): boolean => {
    const slotStart = toLocalDateTime(date, t);
    return !slotStart || slotStart.getTime() <= serverNow().getTime();
  };

  /** Khung giờ đã có người đặt — ẩn hẳn khỏi lưới, không chỉ làm mờ (khác slot quá khứ, vẫn hiện mờ). */
  const isSlotBusy = (t: string): boolean => {
    const slotStart = toLocalDateTime(date, t);
    if (!slotStart) return false;
    const slotEnd = new Date(slotStart.getTime() + slotMinutes * 60000);
    return busySlots.some(b => {
      const bStart = new Date(b.start);
      const bEnd = new Date(b.end);
      return slotStart < bEnd && slotEnd > bStart;
    });
  };

  const visibleSlotTimes = slotTimes.filter(t => !isSlotBusy(t));

  return (
    <View>
      <DatePickerField
        value={date}
        onChange={(v) => { onDateChange(v); onTimeChange(null); }}
        placeholder="Chọn ngày hẹn"
        minDate={minDate ?? serverNow()}
      />
      {!!date && (
        <>
          <Text style={styles.hint}>
            Giờ hành chính {String(MAINTENANCE_BUSINESS_START_HOUR).padStart(2, '0')}:00–
            {String(MAINTENANCE_BUSINESS_END_HOUR).padStart(2, '0')}:00
            {loading ? ' · đang tải khung giờ bận…' : ''}
          </Text>
          {visibleSlotTimes.length === 0 && !loading ? (
            <Text style={styles.hint}>Ngày này đã kín lịch, vui lòng chọn ngày khác.</Text>
          ) : (
            <View style={styles.grid}>
              {visibleSlotTimes.map((t) => {
                const disabled = isSlotPast(t);
                const active = time === t;
                return (
                  <TouchableOpacity
                    key={t}
                    style={[styles.chip, active && styles.chipActive, disabled && styles.chipDisabled]}
                    onPress={() => !disabled && onTimeChange(t)}
                    disabled={disabled}
                    activeOpacity={0.75}
                  >
                    <Text style={[
                      styles.chipText,
                      active && styles.chipTextActive,
                      disabled && styles.chipTextDisabled,
                    ]}>
                      {t}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
        </>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  hint: { fontSize: 11, color: Colors.textMuted, marginBottom: Spacing.sm },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  chip: {
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md, borderWidth: 1, borderColor: Colors.border,
    backgroundColor: Colors.white,
  },
  chipActive: { borderColor: Colors.primary, backgroundColor: Colors.primaryBg },
  chipDisabled: { backgroundColor: '#F3F4F6', borderColor: '#F3F4F6' },
  chipText: { fontSize: 13, fontWeight: '600', color: Colors.textPrimary },
  chipTextActive: { color: Colors.primary, fontWeight: '700' },
  chipTextDisabled: { color: '#D1D5DB' },
});
