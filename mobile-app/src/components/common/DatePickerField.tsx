import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, Modal, StyleSheet,
} from 'react-native';
import { Colors, Spacing, BorderRadius, Shadow } from '../../constants';

interface Props {
  label?: string;
  value: string; // DD/MM/YYYY
  onChange: (v: string) => void;
  placeholder?: string;
  minDate?: Date;
}

const DAYS = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
const MONTHS = ['Tháng 1','Tháng 2','Tháng 3','Tháng 4','Tháng 5','Tháng 6',
                'Tháng 7','Tháng 8','Tháng 9','Tháng 10','Tháng 11','Tháng 12'];

const parseDate = (str: string): Date | null => {
  if (!str || str.length !== 10) return null;
  const [d, m, y] = str.split('/').map(Number);
  if (!d || !m || !y) return null;
  const dt = new Date(y, m - 1, d);
  return isNaN(dt.getTime()) ? null : dt;
};

const fmt = (d: Date) =>
  `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;

export const DatePickerField: React.FC<Props> = ({
  label, value, onChange, placeholder = 'DD/MM/YYYY', minDate,
}) => {
  const parsed = parseDate(value);
  const today = new Date();
  const initial = parsed || today;

  const [open, setOpen] = useState(false);
  const [viewYear, setViewYear] = useState(initial.getFullYear());
  const [viewMonth, setViewMonth] = useState(initial.getMonth());
  const [selected, setSelected] = useState<Date | null>(parsed);

  const openPicker = () => {
    const base = parsed || today;
    setViewYear(base.getFullYear());
    setViewMonth(base.getMonth());
    setSelected(parsed);
    setOpen(true);
  };

  const prevMonth = () => {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1); }
    else setViewMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1); }
    else setViewMonth(m => m + 1);
  };

  const buildCells = () => {
    const first = new Date(viewYear, viewMonth, 1).getDay();
    const days = new Date(viewYear, viewMonth + 1, 0).getDate();
    const cells: (number | null)[] = Array(first).fill(null);
    for (let i = 1; i <= days; i++) cells.push(i);
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  };

  const isDisabled = (day: number) => {
    if (!minDate) return false;
    const d = new Date(viewYear, viewMonth, day);
    return d < new Date(minDate.getFullYear(), minDate.getMonth(), minDate.getDate());
  };

  const isSelected = (day: number) =>
    selected?.getFullYear() === viewYear &&
    selected?.getMonth() === viewMonth &&
    selected?.getDate() === day;

  const isToday = (day: number) =>
    today.getFullYear() === viewYear &&
    today.getMonth() === viewMonth &&
    today.getDate() === day;

  const handleSelect = (day: number) => {
    if (isDisabled(day)) return;
    setSelected(new Date(viewYear, viewMonth, day));
  };

  const handleConfirm = () => {
    if (selected) onChange(fmt(selected));
    setOpen(false);
  };

  const cells = buildCells();

  return (
    <>
      <TouchableOpacity style={styles.field} onPress={openPicker} activeOpacity={0.7}>
        <Text style={value ? styles.fieldVal : styles.fieldPlaceholder}>
          {value || placeholder}
        </Text>
        <Text style={styles.calIcon}>📅</Text>
      </TouchableOpacity>

      <Modal visible={open} transparent animationType="fade">
        <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={() => setOpen(false)} />
        <View style={styles.sheet}>
          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity style={styles.navBtn} onPress={prevMonth}>
              <Text style={styles.navBtnText}>‹</Text>
            </TouchableOpacity>
            <Text style={styles.monthLabel}>{MONTHS[viewMonth]} {viewYear}</Text>
            <TouchableOpacity style={styles.navBtn} onPress={nextMonth}>
              <Text style={styles.navBtnText}>›</Text>
            </TouchableOpacity>
          </View>

          {/* Day names */}
          <View style={styles.dayNames}>
            {DAYS.map(d => (
              <Text key={d} style={[styles.dayName, d === 'CN' && { color: Colors.error }]}>{d}</Text>
            ))}
          </View>

          {/* Grid */}
          <View style={styles.grid}>
            {cells.map((day, i) => {
              if (!day) return <View key={i} style={styles.cell} />;
              const sel = isSelected(day);
              const dis = isDisabled(day);
              const tod = isToday(day);
              const isSun = i % 7 === 0;
              return (
                <TouchableOpacity
                  key={i}
                  style={[styles.cell, sel && styles.cellSelected, tod && !sel && styles.cellToday]}
                  onPress={() => handleSelect(day)}
                  activeOpacity={dis ? 1 : 0.7}
                >
                  <Text style={[
                    styles.cellText,
                    isSun && styles.cellSun,
                    sel && styles.cellTextSelected,
                    dis && styles.cellDisabled,
                    tod && !sel && styles.cellTextToday,
                  ]}>
                    {day}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Footer */}
          <View style={styles.footer}>
            <TouchableOpacity style={styles.cancelBtn} onPress={() => setOpen(false)}>
              <Text style={styles.cancelText}>Hủy</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.confirmBtn, !selected && styles.confirmBtnDisabled]}
              onPress={handleConfirm}
              disabled={!selected}
            >
              <Text style={styles.confirmText}>
                {selected ? `Chọn ${fmt(selected)}` : 'Chọn ngày'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </>
  );
};

const styles = StyleSheet.create({
  field: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#F9FAFB', borderWidth: 1, borderColor: '#E5E7EB',
    borderRadius: BorderRadius.md, paddingHorizontal: Spacing.md, paddingVertical: 12,
    marginBottom: Spacing.sm,
  },
  fieldVal: { fontSize: 14, color: '#111827', fontWeight: '500', flex: 1 },
  fieldPlaceholder: { fontSize: 14, color: '#9CA3AF', flex: 1 },
  calIcon: { fontSize: 16 },

  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: Colors.white, borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: Spacing.lg, paddingBottom: 36,
  },

  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: Spacing.md },
  navBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 20, backgroundColor: '#F3F4F6' },
  navBtnText: { fontSize: 22, color: Colors.textPrimary, fontWeight: '600', lineHeight: 28 },
  monthLabel: { fontSize: 17, fontWeight: '700', color: Colors.textPrimary },

  dayNames: { flexDirection: 'row', marginBottom: Spacing.sm },
  dayName: { flex: 1, textAlign: 'center', fontSize: 12, fontWeight: '700', color: Colors.textMuted },

  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: `${100/7}%`, aspectRatio: 1, alignItems: 'center', justifyContent: 'center' },
  cellSelected: { backgroundColor: Colors.primary, borderRadius: 100 },
  cellToday: { borderWidth: 1.5, borderColor: Colors.primary, borderRadius: 100 },
  cellText: { fontSize: 14, color: Colors.textPrimary },
  cellTextSelected: { color: Colors.white, fontWeight: '700' },
  cellTextToday: { color: Colors.primary, fontWeight: '700' },
  cellSun: { color: Colors.error },
  cellDisabled: { color: '#D1D5DB' },

  footer: { flexDirection: 'row', gap: Spacing.md, marginTop: Spacing.lg },
  cancelBtn: { flex: 1, paddingVertical: Spacing.md, borderRadius: BorderRadius.lg, borderWidth: 1, borderColor: '#E5E7EB', alignItems: 'center' },
  cancelText: { fontSize: 15, fontWeight: '600', color: Colors.textSecondary },
  confirmBtn: { flex: 2, paddingVertical: Spacing.md, borderRadius: BorderRadius.lg, backgroundColor: Colors.primary, alignItems: 'center' },
  confirmBtnDisabled: { backgroundColor: Colors.textMuted },
  confirmText: { fontSize: 15, fontWeight: '700', color: Colors.white },
});
