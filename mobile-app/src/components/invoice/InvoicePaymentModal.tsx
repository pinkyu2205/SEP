import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Modal, ActivityIndicator, Platform,
} from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as Clipboard from 'expo-clipboard';
import { Colors, Spacing, BorderRadius, Shadow } from '@/constants';
import { billMonthLabel, formatCurrency, formatDate, showAlert } from '@/utils';
import { SharedBill, InvoiceType } from '@/types/bill';
import { realTenantBillingService, toSharedBill } from '@/services/tenant/billingService';

/**
 * Modal thanh toán hoá đơn dùng chung cho InvoiceListScreen (thanh toán ngay từ danh
 * sách) và InvoiceDetailScreen (30/07/2026) — trước đó mỗi màn tự vẽ 1 bản VietQR tĩnh
 * riêng (hardcode 1 tài khoản ngân hàng, không tự xác nhận được). Giờ dùng PayOS thật:
 * payInvoice() tạo link/QR ngay khi mở modal (nếu hoá đơn chưa có sẵn — vd hoá đơn bồi
 * thường bảo trì đã có payosQrCode ngay từ lúc phát hành), checkInvoicePayment() đối
 * chiếu thật với PayOS thay vì tạo claim chờ manager duyệt tay.
 */

const TYPE_LABEL: Record<InvoiceType, { label: string; icon: string; color: string; bg: string }> = {
  rent:        { label: 'Tiền phòng', icon: '🏠', color: '#7C3AED', bg: '#F5F3FF' },
  electricity: { label: 'Tiền điện',  icon: '⚡', color: '#D97706', bg: '#FEF9C3' },
  water:       { label: 'Tiền nước',  icon: '💧', color: '#2563EB', bg: '#DBEAFE' },
  maintenance: { label: 'Phí bảo trì', icon: '🔧', color: '#DC2626', bg: '#FEE2E2' },
  deposit:     { label: 'Tiền cọc',   icon: '🔐', color: '#059669', bg: '#ECFDF5' },
};


interface Props {
  visible: boolean;
  invoice: SharedBill | null;
  onClose: () => void;
  /** Gọi mỗi khi invoice có field mới (payosQrCode lúc tạo, hoặc status đổi sau khi check). */
  onUpdate: (invoice: SharedBill) => void;
}

export const InvoicePaymentModal: React.FC<Props> = ({ visible, invoice, onClose, onUpdate }) => {
  const [creatingPayment, setCreatingPayment] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [downloading, setDownloading] = useState(false);
  /**
   * Bong bóng "Sao chép" hiện lên khi ẤN ĐÈ vào mã QR.
   *
   * `idle` ẩn · `ready` đang mời bấm · `copying` đang chép · `done` vừa chép xong.
   * Bắt chước đúng thói quen sẵn có của điện thoại — ấn đè vào một thứ thì hiện chữ chép.
   */
  const [copyState, setCopyState] = useState<'idle' | 'ready' | 'copying' | 'done'>('idle');
  const qrRef = useRef<any>(null);
  /** Hẹn giờ tự ẩn bong bóng. Giữ ref để mỗi lần ấn đè lại là huỷ hẹn cũ, không chồng. */
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Mở modal → tạo link PayOS ngay nếu hoá đơn chưa có sẵn (vd hoá đơn thường mới tạo).
  useEffect(() => {
    if (!visible || !invoice) return;
    if (invoice.payosQrCode || invoice.payosCheckoutUrl) return;
    setCreatingPayment(true);
    realTenantBillingService.payInvoice(invoice.id)
      .then(updated => onUpdate(toSharedBill(updated)))
      .catch(() => { showAlert('Lỗi', 'Không tạo được liên kết thanh toán. Vui lòng thử lại.'); onClose(); })
      .finally(() => setCreatingPayment(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, invoice?.id]);

  /*
   * Đóng modal thì dọn hẹn giờ và ẩn bong bóng, để lần mở sau bắt đầu từ trạng thái sạch
   * và hẹn giờ không gọi setState trên component đã tháo.
   *
   * PHẢI đứng TRƯỚC `if (!invoice) return null` bên dưới: hook nằm sau một lệnh return
   * có điều kiện là hook bị gọi lúc có lúc không, và React sẽ ném "Rendered fewer hooks
   * than expected" ngay khi `invoice` từ null chuyển sang có giá trị — tức đúng lúc
   * khách bấm mở một hoá đơn.
   */
  useEffect(() => {
    if (visible) return;
    if (hideTimer.current) clearTimeout(hideTimer.current);
    setCopyState('idle');
  }, [visible]);

  if (!invoice) return null;
  const tc = TYPE_LABEL[invoice.invoiceType];

  const handleConfirmPaid = () => {
    if (processing) return;
    setProcessing(true);
    realTenantBillingService.checkInvoicePayment(invoice.id)
      .then(updated => {
        const next = toSharedBill(updated);
        onUpdate(next);
        if (next.status === 'paid') {
          onClose();
        } else {
          showAlert('Chưa nhận được thanh toán', 'PayOS chưa ghi nhận giao dịch. Thử lại sau vài giây.');
        }
      })
      .catch(() => showAlert('Lỗi', 'Không kiểm tra được trạng thái thanh toán. Vui lòng thử lại.'))
      .finally(() => setProcessing(false));
  };

  /** Đặt lịch tự ẩn bong bóng, huỷ lịch cũ trước — tránh hai hẹn giờ đá nhau. */
  const scheduleHide = (ms: number) => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setCopyState('idle'), ms);
  };

  const showCopyBubble = () => {
    setCopyState('ready');
    scheduleHide(5000);
  };

  /**
   * CHÉP ẢNH MÃ QR vào bộ nhớ tạm.
   *
   * `toDataURL` của react-native-qrcode-svg trả base64 THÔ (không có tiền tố `data:`),
   * đúng thứ `Clipboard.setImageAsync` nhận — cùng chuỗi mà `handleDownloadQr` đang ghi
   * ra file, nên hai đường cho ra đúng một tấm ảnh.
   */
  const copyQrImage = () => {
    if (!qrRef.current || copyState !== 'ready') return;
    setCopyState('copying');
    qrRef.current.toDataURL((base64: string) => {
      Clipboard.setImageAsync(base64)
        .then(() => {
          setCopyState('done');
          scheduleHide(1600);
        })
        .catch(() => {
          setCopyState('idle');
          // Máy/trình duyệt không cho chép ảnh (web thiếu ngữ cảnh bảo mật, máy cũ…).
          // Chỉ đường lui thay vì báo lỗi cụt: nút "Tải mã QR" ngay bên dưới vẫn chạy.
          showAlert(
            'Không chép được ảnh',
            'Thiết bị không cho phép chép ảnh vào bộ nhớ tạm. Dùng nút "Tải mã QR" bên dưới để lưu hoặc gửi ảnh.',
          );
        });
    });
  };

  // Tải QR kèm nội dung thanh toán (số tiền, mã hoá đơn, hạn TT) thành 1 ảnh.
  // Web: ghép QR + chữ lên canvas rồi tải file .png. Native: chưa ghép được chữ vào
  // ảnh (không có canvas) nên chia sẻ thẳng ảnh QR qua share sheet của máy.
  const handleDownloadQr = () => {
    if (!qrRef.current || downloading) return;
    setDownloading(true);
    qrRef.current.toDataURL((base64: string) => {
      if (Platform.OS === 'web') {
        downloadQrWeb(base64, invoice, tc.label);
        setDownloading(false);
        return;
      }
      (async () => {
        try {
          const uri = `${FileSystem.cacheDirectory}QR-${invoice.code}.png`;
          await FileSystem.writeAsStringAsync(uri, base64, { encoding: FileSystem.EncodingType.Base64 });
          if (await Sharing.isAvailableAsync()) {
            await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: `QR thanh toán ${invoice.code}` });
          } else {
            showAlert('Lỗi', 'Thiết bị không hỗ trợ chia sẻ/lưu file.');
          }
        } catch {
          showAlert('Lỗi', 'Không tải được mã QR. Vui lòng thử lại.');
        } finally {
          setDownloading(false);
        }
      })();
    });
  };

  return (
    <Modal visible={visible} transparent animationType="slide">
      <View style={s.overlay}>
        <View style={s.modal}>
          <TouchableOpacity style={s.modalClose} onPress={onClose}>
            <Text style={{ fontSize: 15, color: Colors.textMuted }}>✕</Text>
          </TouchableOpacity>

          <Text style={s.modalTitle}>Thanh toán hóa đơn</Text>

          <View style={[s.modalTypeBadge, { backgroundColor: tc.bg }]}>
            {/* Hoá đơn không thuộc kỳ nào (thu lúc nhận phòng) thì billMonthLabel trả
                null — bỏ luôn phần kỳ, đừng ghép ra "Tnull/undefined". */}
            <Text style={[s.modalTypeText, { color: tc.color }]}>
              {tc.icon} {tc.label}{billMonthLabel(invoice) ? ` · ${billMonthLabel(invoice)}` : ''}
            </Text>
          </View>

          {creatingPayment ? (
            <View style={s.creatingBox}>
              <ActivityIndicator size="large" color={Colors.primary} />
              <Text style={s.creatingText}>Đang tạo mã thanh toán...</Text>
            </View>
          ) : (
            <>
              {!!invoice.payosQrCode && (
                <View style={s.qrBox}>
                  <Text style={s.qrAmount}>{formatCurrency(invoice.grandTotal)}</Text>
                  {/* Ấn đè vào mã → hiện bong bóng "Sao chép" → bấm là chép ảnh QR. */}
                  <TouchableOpacity
                    style={s.qrWrap}
                    activeOpacity={1}
                    onLongPress={showCopyBubble}
                    delayLongPress={350}
                  >
                    <QRCode value={invoice.payosQrCode} size={220} getRef={(c) => { qrRef.current = c; }} />
                    {copyState !== 'idle' && (
                      <TouchableOpacity
                        style={s.copyBubble}
                        activeOpacity={0.85}
                        onPress={copyQrImage}
                        disabled={copyState !== 'ready'}
                      >
                        <Text style={s.copyBubbleText}>
                          {copyState === 'ready' ? '📋  Sao chép'
                            : copyState === 'copying' ? 'Đang chép…'
                            : '✓  Đã sao chép'}
                        </Text>
                      </TouchableOpacity>
                    )}
                  </TouchableOpacity>
                  <Text style={s.qrHint}>Mở app Ngân hàng bất kỳ → Quét mã VietQR để thanh toán.</Text>

                  <TouchableOpacity
                    style={[s.downloadBtn, downloading && { opacity: 0.6 }]}
                    onPress={handleDownloadQr}
                    disabled={downloading}
                  >
                    <Text style={s.downloadBtnText}>
                      {downloading ? 'Đang tạo ảnh...' : '⬇️ Tải mã QR'}
                    </Text>
                  </TouchableOpacity>
                </View>
              )}

              {/*
                ĐÃ BỎ nút "Mở trang thanh toán PayOS" và khối WebView đi kèm (02/09/2026).

                Khách quét mã VietQR bằng app ngân hàng CỦA HỌ — đó là đường đi vừa quen
                vừa an toàn, và nó đã nằm ngay trên cùng màn này. Cái nút kia dẫn sang một
                trang web mở trong WebView để gõ thông tin thẻ: chậm hơn, dễ hỏng hơn, và
                là đúng hình dạng của một trang lừa đảo — người dùng được dạy là đừng gõ
                thông tin thẻ vào WebView lạ trong app.

                Hai lối trả tiền cho cùng một hoá đơn còn khiến khách phải chọn, mà chọn
                sai thì hoặc trả hai lần hoặc bỏ dở giữa chừng. Màn đón khách của quản lý
                đã bỏ nút này từ trước vì cùng lý do (`ResumeContractScreen`) — giờ khách
                thuê đi cùng một đường: quét QR, rồi bấm nút xác nhận bên dưới.
              */}
              {(invoice.lateFee ?? 0) > 0 && (
                <View style={s.lateFeeBox}>
                  <Text style={s.lateFeeBoxText}>
                    Bao gồm phí trả chậm: {formatCurrency(invoice.lateFee)}
                  </Text>
                </View>
              )}

              <TouchableOpacity
                style={[s.confirmBtn, processing && { backgroundColor: Colors.textSecondary }]}
                onPress={handleConfirmPaid}
                disabled={processing}
              >
                {processing ? (
                  <>
                    <ActivityIndicator size="small" color={Colors.white} style={{ marginRight: 8 }} />
                    <Text style={s.confirmBtnText}>Đang kiểm tra giao dịch...</Text>
                  </>
                ) : (
                  <Text style={s.confirmBtnText}>Tôi đã chuyển khoản — Kiểm tra</Text>
                )}
              </TouchableOpacity>

              {!processing && (
                <TouchableOpacity style={s.cancelBtn} onPress={onClose}>
                  <Text style={s.cancelBtnText}>Để sau</Text>
                </TouchableOpacity>
              )}
            </>
          )}
        </View>
      </View>
    </Modal>
  );
};

/** Ghép QR (base64 PNG thô) + nội dung thanh toán lên 1 canvas rồi tải file .png (chỉ web). */
function downloadQrWeb(qrBase64: string, invoice: SharedBill, typeLabel: string) {
  const doc = (globalThis as any).document;
  const win = (globalThis as any).window;
  if (!doc || !win) return;

  const img = new win.Image();
  img.onload = () => {
    const W = 480, QR = 300;
    const canvas = doc.createElement('canvas');
    canvas.width = W;
    canvas.height = 200 + QR + 160;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#111827';
    ctx.font = 'bold 26px Arial, sans-serif';
    ctx.fillText('Thanh toán hóa đơn', W / 2, 44);
    ctx.font = '16px Arial, sans-serif';
    ctx.fillStyle = '#6B7280';
    const periodText = billMonthLabel(invoice);
    ctx.fillText(periodText ? `${typeLabel} · ${periodText}` : typeLabel, W / 2, 72);

    ctx.drawImage(img, (W - QR) / 2, 100, QR, QR);

    let y = 100 + QR + 44;
    ctx.font = 'bold 30px Arial, sans-serif';
    ctx.fillStyle = '#4F46E5';
    ctx.fillText(formatCurrency(invoice.grandTotal), W / 2, y);
    y += 34;
    ctx.font = '15px Arial, sans-serif';
    ctx.fillStyle = '#374151';
    ctx.fillText(`Mã hóa đơn: ${invoice.code}`, W / 2, y);
    y += 24;
    ctx.fillText(`Hạn thanh toán: ${formatDate(invoice.dueDate)}`, W / 2, y);
    y += 28;
    ctx.font = 'italic 13px Arial, sans-serif';
    ctx.fillStyle = '#9CA3AF';
    ctx.fillText('Quét mã QR bằng app Ngân hàng bất kỳ để thanh toán qua PayOS', W / 2, y);

    const a = doc.createElement('a');
    a.href = canvas.toDataURL('image/png');
    a.download = `QR-thanh-toan-${invoice.code}.png`;
    doc.body.appendChild(a);
    a.click();
    doc.body.removeChild(a);
  };
  img.src = `data:image/png;base64,${qrBase64}`;
}

const s = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modal: {
    backgroundColor: Colors.white, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: Spacing.lg, paddingBottom: 40, maxHeight: '95%',
  },
  modalClose: {
    position: 'absolute', top: 16, right: 16, zIndex: 10,
    width: 32, height: 32, borderRadius: 16, backgroundColor: Colors.divider,
    alignItems: 'center', justifyContent: 'center',
  },
  modalTitle: { fontSize: 20, fontWeight: '800', color: Colors.textPrimary, textAlign: 'center', marginTop: 4, marginBottom: 12 },
  modalTypeBadge: { borderRadius: BorderRadius.full, paddingHorizontal: Spacing.md, paddingVertical: 6, alignSelf: 'center', marginBottom: Spacing.md },
  modalTypeText: { fontSize: 13, fontWeight: '700' },

  creatingBox: { alignItems: 'center', paddingVertical: Spacing['2xl'], gap: Spacing.md },
  creatingText: { fontSize: 14, color: Colors.textMuted },

  qrBox: { alignItems: 'center' },
  qrAmount: { fontSize: 22, fontWeight: '900', color: Colors.primary, marginBottom: Spacing.sm },
  qrWrap: {
    alignSelf: 'center', backgroundColor: Colors.white,
    padding: Spacing.md, borderRadius: BorderRadius.lg,
    borderWidth: 2, borderColor: Colors.divider, marginBottom: Spacing.md,
  },
  /* Bong bóng nổi ĐÈ LÊN mã, không đẩy bố cục: hiện/ẩn mà mã QR nhảy lên nhảy xuống thì
     ngón tay đang giữ trên đó sẽ trỏ vào chỗ khác. Nền tối đặc để nổi trên mã đen trắng. */
  copyBubble: {
    position: 'absolute', alignSelf: 'center', bottom: 14,
    backgroundColor: 'rgba(15, 23, 42, 0.92)',
    borderRadius: BorderRadius.full,
    paddingVertical: Spacing.sm, paddingHorizontal: Spacing.lg,
  },
  copyBubbleText: { fontSize: 13, fontWeight: '800', color: Colors.white },

  qrHint: { fontSize: 12, color: Colors.textMuted, textAlign: 'center', marginBottom: Spacing.md, fontStyle: 'italic' },

  downloadBtn: {
    borderRadius: BorderRadius.md, borderWidth: 1, borderColor: Colors.primary,
    paddingVertical: Spacing.sm, paddingHorizontal: Spacing.lg, marginBottom: Spacing.md,
  },
  downloadBtnText: { fontSize: 13, fontWeight: '700', color: Colors.primary },


  lateFeeBox: { backgroundColor: Colors.errorLight, borderRadius: BorderRadius.md, padding: Spacing.sm, marginBottom: Spacing.md },
  lateFeeBoxText: { fontSize: 13, fontWeight: '600', color: Colors.error, textAlign: 'center' },

  confirmBtn: {
    backgroundColor: Colors.success, borderRadius: BorderRadius.lg,
    paddingVertical: Spacing.base, flexDirection: 'row',
    justifyContent: 'center', alignItems: 'center', ...Shadow.sm, marginBottom: Spacing.md,
  },
  confirmBtnText: { fontSize: 14, fontWeight: '700', color: Colors.white, flexShrink: 1, textAlign: 'center' },
  cancelBtn: { alignItems: 'center', paddingVertical: Spacing.sm },
  cancelBtnText: { fontSize: 14, fontWeight: '600', color: Colors.textMuted },
});
