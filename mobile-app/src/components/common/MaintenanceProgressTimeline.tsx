import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors } from '@/constants';
import { MAINTENANCE_STATUS_META, StatusMeta } from '@/constants/maintenance';

/** Dùng chung cho tenant (MaintenanceTimeline) và manager (TimelineEntry) — 2 shape giống hệt nhau. */
export interface MaintenanceTimelineEntry {
  status: string;
  note: string;
  updatedBy: string;
  updatedAt: string;
}

const STATUS_CONFIG: Record<string, StatusMeta> = MAINTENANCE_STATUS_META;

/** Sau mỗi trạng thái, các bước "còn lại" hiện dạng placeholder (chưa xảy ra, chưa có ghi chú). */
const NEXT_PLACEHOLDERS: Record<string, string[]> = {
  pending:         ['approved', 'waiting_confirm', 'closed'],
  approved:        ['waiting_confirm', 'closed'],
  waiting_confirm: ['closed'],
  // Chưa biết manager sẽ "sửa lại" (quay lại approved) hay "giữ kết quả" (quay lại waiting_confirm)
  // → chỉ đoán trước bước cuối cùng chắc chắn sẽ tới, bước thật sẽ tự nối thêm khi nó thật sự xảy ra.
  rejected:        ['closed'],
  closed:          [],
  cancelled:       [],
};

/**
 * Timeline dọc, xây trực tiếp từ log `timeline` thật (mỗi lần đổi trạng thái là 1 node cố định,
 * KHÔNG quay lại/ghi đè node cũ) + nối thêm các bước tương lai còn thiếu dạng placeholder xám.
 * Nhờ vậy khi ticket bị từ chối rồi sửa lại, cây tự nối thêm bước "Đang sửa chữa" mới ở cuối
 * thay vì nhảy ngược về node "Đang sửa chữa" ban đầu (yêu cầu 23/07/2026).
 */
export const MaintenanceProgressTimeline: React.FC<{
  timeline: MaintenanceTimelineEntry[];
  currentStatus: string;
}> = ({ timeline, currentStatus }) => {
  const realSteps = timeline.map(entry => ({ status: entry.status, entry, isPlaceholder: false as const }));
  const futureStatuses = NEXT_PLACEHOLDERS[currentStatus] ?? [];
  const steps = [
    ...realSteps,
    ...futureStatuses.map(status => ({ status, entry: undefined, isPlaceholder: true as const })),
  ];
  const lastRealIndex = realSteps.length - 1;

  return (
    <View style={s.container}>
      {steps.map((step, i) => {
        const isCompleted = !step.isPlaceholder && i < lastRealIndex;
        const isActive    = !step.isPlaceholder && i === lastRealIndex;
        return (
          <View key={`${step.status}-${i}`} style={s.step}>
            <View style={s.stepLeft}>
              <View style={[s.dot, isCompleted && s.dotCompleted, isActive && s.dotActive]}>
                {isCompleted && <Text style={s.dotCheck}>✓</Text>}
                {isActive    && <Text style={s.dotActiveText}>{STATUS_CONFIG[step.status]?.icon}</Text>}
                {!isCompleted && !isActive && <Text style={s.dotNum}>{i + 1}</Text>}
              </View>
              {i < steps.length - 1 && (
                <View style={[s.line, isCompleted && s.lineCompleted]} />
              )}
            </View>
            <View style={s.stepBody}>
              <Text style={[s.stepLabel, isActive && s.stepLabelActive, isCompleted && s.stepLabelDone]}>
                {STATUS_CONFIG[step.status]?.label}
              </Text>
              {step.entry && (
                <>
                  <Text style={s.stepNote}>{step.entry.note}</Text>
                  <Text style={s.stepMeta}>{step.entry.updatedBy} · {step.entry.updatedAt}</Text>
                </>
              )}
            </View>
          </View>
        );
      })}
    </View>
  );
};

const s = StyleSheet.create({
  container:       { paddingVertical: 4 },
  step:            { flexDirection: 'row', gap: 12, minHeight: 60 },
  stepLeft:        { alignItems: 'center', width: 32 },
  dot:             { width: 32, height: 32, borderRadius: 16, borderWidth: 2, borderColor: Colors.border, backgroundColor: Colors.white, alignItems: 'center', justifyContent: 'center' },
  dotCompleted:    { backgroundColor: Colors.success, borderColor: Colors.success },
  dotActive:       { backgroundColor: Colors.primary, borderColor: Colors.primary },
  dotCheck:        { fontSize: 14, color: Colors.white, fontWeight: '700' },
  dotActiveText:   { fontSize: 14 },
  dotNum:          { fontSize: 12, color: Colors.textMuted, fontWeight: '600' },
  line:            { width: 2, flex: 1, backgroundColor: Colors.border, marginVertical: 2 },
  lineCompleted:   { backgroundColor: Colors.success },
  stepBody:        { flex: 1, paddingBottom: 16 },
  stepLabel:       { fontSize: 14, fontWeight: '600', color: Colors.textMuted },
  stepLabelActive: { color: Colors.primary, fontWeight: '700' },
  stepLabelDone:   { color: Colors.success },
  stepNote:        { fontSize: 13, color: Colors.textSecondary, marginTop: 2 },
  stepMeta:        { fontSize: 11, color: Colors.textMuted, marginTop: 2 },
});
