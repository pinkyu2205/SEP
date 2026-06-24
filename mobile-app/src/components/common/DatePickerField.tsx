import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, Modal, StyleSheet, ScrollView,
} from 'react-native';
import { Colors, Spacing, BorderRadius, Shadow } from '../../constants';

interface Props {
  label?: string;
  value: string; // DD/MM/YYYY
  onChange: (v: string) => void;
  placeholder?: string;
  minDate?: Date;
  maxDate?: Date;
}

const DAYS = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
const MONTHS = ['Tháng 1','Tháng 2','Tháng 3','Tháng 4','Tháng 5','Tháng 6',
                'Tháng 7','Tháng 8','Tháng 9','Tháng 10','Tháng 11','Tháng 12'];
const MONTHS_SHORT = ['Th 1','Th 2','Th 3','Th 4','Th 5','Th 6',
                      'Th 7','Th 8','Th 9','Th 10','Th 11','Th 12'];

type PickerMode = 'days' | 'months' | 'years';

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
  label, value, onChange, placeholder = 'DD/MM/YYYY', minDate, maxDate,
}) => {
  const parsed = parseDate(value);
  const today = new Date();
  const initial = parsed || today;

  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<PickerMode>('days');
  const [viewYear, setViewYear] = useState(initial.getFullYear());
  const [viewMonth, setViewMonth] = useState(initial.getMonth());
  const [selected, setSelected] = useState<Date | null>(parsed);

  // Khoảng năm cho phép chọn (bám theo minDate/maxDate nếu có)
  const minYear = minDate ? minDate.getFullYear() : today.getFullYear() - 100;
  const maxYear = maxDate ? maxDate.getFullYear() : today.getFullYear() + 10;
  const YEARS_PER_PAGE = 12;
  // Trang lưới năm đang xem (mỗi trang 12 năm)
  const [yearPageStart, setYearPageStart] = useState(initial.getFullYear());

  const openPicker = () => {
    const base = parsed || today;
    setViewYear(base.getFullYear());
    setViewMonth(base.getMonth());
    setYearPageStart(base.getFullYear() - (base.getFullYear() % YEARS_PER_PAGE));
    setSelected(parsed);
    setMode('days');
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

  // Điều hướng theo từng chế độ: ngày -> đổi tháng, tháng -> đổi năm, năm -> đổi trang 12 năm
  const goPrev = () => {
    if (mode === 'days') prevMonth();
    else if (mode === 'months') setViewYear(y => Math.max(minYear, y - 1));
    else setYearPageStart(s => Math.max(minYear, s - YEARS_PER_PAGE));
  };
  const goNext = () => {
    if (mode === 'days') nextMonth();
    else if (mode === 'months') setViewYear(y => Math.min(maxYear, y + 1));
    else setYearPageStart(s => Math.min(maxYear, s + YEARS_PER_PAGE));
  };

  const headerLabel =
    mode === 'years'
      ? `${yearPageStart} - ${Math.min(maxYear, yearPageStart + YEARS_PER_PAGE - 1)}`
      : mode === 'months'
      ? `${viewYear}`
      : `${MONTHS[viewMonth]} ${viewYear}`;

  // Bấm tiêu đề để mở chế độ chọn năm/tháng (ngày -> tháng -> năm)
  const cycleMode = () => {
    if (mode === 'days') setMode('months');
    else if (mode === 'months') {
      setYearPageStart(viewYear - (viewYear % YEARS_PER_PAGE));
      setMode('years');
    } else setMode('days');
  };

  const monthDisabled = (m: number) => {
    const first = new Date(viewYear, m, 1);
    const last = new Date(viewYear, m + 1, 0);
    if (minDate && last < new Date(minDate.getFullYear(), minDate.getMonth(), minDate.getDate())) return true;
    if (maxDate && first > new Date(maxDate.getFullYear(), maxDate.getMonth(), maxDate.getDate())) return true;
    return false;
  };

  const pickYear = (y: number) => {
    setViewYear(y);
    setMode('months');
  };
  const pickMonth = (m: number) => {
    if (monthDisabled(m)) return;
    setViewMonth(m);
    setMode('days');
  };

  const yearCells = Array.from(
    { length: YEARS_PER_PAGE },
    (_, i) => yearPageStart + i,
  ).filter(y => y >= minYear && y <= maxYear);

  const buildCells = () => {
    const first = new Date(viewYear, viewMonth, 1).getDay();
    const days = new Date(viewYear, viewMonth + 1, 0).getDate();
    const cells: (number | null)[] = Array(first).fill(null);
    for (let i = 1; i <= days; i++) cells.push(i);
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  };

  const isDisabled = (day: number) => {
    const d = new Date(viewYear, viewMonth, day);
    if (minDate && d < new Date(minDate.getFullYear(), minDate.getMonth(), minDate.getDate())) return true;
    if (maxDate && d > new Date(maxDate.getFullYear(), maxDate.getMonth(), maxDate.getDate())) return true;
    return false;
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
            <TouchableOpacity style={styles.navBtn} onPress={goPrev}>
              <Text style={styles.navBtnText}>‹</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.headerLabelBtn} onPress={cycleMode} activeOpacity={0.7}>
              <Text style={styles.monthLabel}>{headerLabel}</Text>
              <Text style={styles.headerCaret}>{mode === 'days' ? '▾' : '▴'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.navBtn} onPress={goNext}>
              <Text style={styles.navBtnText}>›</Text>
            </TouchableOpacity>
          </View>

          {/* Chọn năm */}
          {mode === 'years' && (
            <ScrollView style={styles.pickerScroll} contentContainerStyle={styles.pickerGrid}>
              {yearCells.map(y => {
                const sel = selected?.getFullYear() === y;
                const cur = viewYear === y;
                return (
                  <TouchableOpacity
                    key={y}
                    style={[styles.pickerCell, sel && styles.pickerCellSelected, cur && !sel && styles.pickerCellCurrent]}
                    onPress={() => pickYear(y)}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.pickerCellText, sel && styles.pickerCellTextSelected]}>{y}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          )}

          {/* Chọn tháng */}
          {mode === 'months' && (
            <View style={styles.pickerGrid}>
              {MONTHS_SHORT.map((label, m) => {
                const dis = monthDisabled(m);
                const sel = selected?.getFullYear() === viewYear && selected?.getMonth() === m;
                const cur = viewMonth === m;
                return (
                  <TouchableOpacity
                    key={m}
                    style={[styles.pickerCell, sel && styles.pickerCellSelected, cur && !sel && styles.pickerCellCurrent]}
                    onPress={() => pickMonth(m)}
                    activeOpacity={dis ? 1 : 0.7}
                  >
                    <Text style={[
                      styles.pickerCellText,
                      sel && styles.pickerCellTextSelected,
                      dis && styles.cellDisabled,
                    ]}>
                      {label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}

          {/* Day names */}
          {mode === 'days' && (
            <View style={styles.dayNames}>
              {DAYS.map(d => (
                <Text key={d} style={[styles.dayName, d === 'CN' && { color: Colors.error }]}>{d}</Text>
              ))}
            </View>
          )}

          {/* Grid ngày */}
          {mode === 'days' && (
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
          )}

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
  headerLabelBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: Spacing.md, paddingVertical: 6, borderRadius: BorderRadius.md, backgroundColor: '#F3F4F6' },
  monthLabel: { fontSize: 17, fontWeight: '700', color: Colors.textPrimary },
  headerCaret: { fontSize: 12, color: Colors.primary, fontWeight: '700' },

  pickerScroll: { maxHeight: 260 },
  pickerGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  pickerCell: { width: `${100/3}%`, paddingVertical: 16, alignItems: 'center', justifyContent: 'center' },
  pickerCellSelected: { backgroundColor: Colors.primary, borderRadius: BorderRadius.lg },
  pickerCellCurrent: { borderWidth: 1.5, borderColor: Colors.primary, borderRadius: BorderRadius.lg },
  pickerCellText: { fontSize: 15, fontWeight: '600', color: Colors.textPrimary },
  pickerCellTextSelected: { color: Colors.white, fontWeight: '700' },

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
