import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Modal, ActivityIndicator, Platform, Alert,
} from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { WebView } from 'react-native-webview';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { Colors, Spacing, BorderRadius, Shadow, PAY_SUCCESS_URL, PAY_CANCEL_URL } from '@/constants';
import { formatCurrency, formatDate } from '@/utils';
import { SharedBill, InvoiceType } from '@/store/billsStore';
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
  const [showWebView, setShowWebView] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const qrRef = useRef<any>(null);

  // Mở modal → tạo link PayOS ngay nếu hoá đơn chưa có sẵn (vd hoá đơn thường mới tạo).
  useEffect(() => {
    if (!visible || !invoice) return;
    setShowWebView(false);
    if (invoice.payosQrCode || invoice.payosCheckoutUrl) return;
    setCreatingPayment(true);
    realTenantBillingService.payInvoice(invoice.id)
      .then(updated => onUpdate(toSharedBill(updated)))
      .catch(() => { Alert.alert('Lỗi', 'Không tạo được liên kết thanh toán. Vui lòng thử lại.'); onClose(); })
      .finally(() => setCreatingPayment(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, invoice?.id]);

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
          setShowWebView(false);
          onClose();
        } else {
          Alert.alert('Chưa nhận được thanh toán', 'PayOS chưa ghi nhận giao dịch. Thử lại sau vài giây.');
        }
      })
      .catch(() => Alert.alert('Lỗi', 'Không kiểm tra được trạng thái thanh toán. Vui lòng thử lại.'))
      .finally(() => setProcessing(false));
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
            Alert.alert('Lỗi', 'Thiết bị không hỗ trợ chia sẻ/lưu file.');
          }
        } catch {
          Alert.alert('Lỗi', 'Không tải được mã QR. Vui lòng thử lại.');
        } finally {
          setDownloading(false);
        }
      })();
    });
  };

  return (
    <Modal visible={visible} transparent animationType="slide">
      <View style={s.overlay}>
        <View style={[s.modal, showWebView && s.modalWebview]}>
          <TouchableOpacity style={s.modalClose} onPress={() => { setShowWebView(false); onClose(); }}>
            <Text style={{ fontSize: 15, color: Colors.textMuted }}>✕</Text>
          </TouchableOpacity>

          <Text style={s.modalTitle}>Thanh toán hóa đơn</Text>

          <View style={[s.modalTypeBadge, { backgroundColor: tc.bg }]}>
            <Text style={[s.modalTypeText, { color: tc.color }]}>
              {tc.icon} {tc.label} · T{String(invoice.month).padStart(2, '0')}/{invoice.year}
            </Text>
          </View>

          {creatingPayment ? (
            <View style={s.creatingBox}>
              <ActivityIndicator size="large" color={Colors.primary} />
              <Text style={s.creatingText}>Đang tạo mã thanh toán...</Text>
            </View>
          ) : (
            <>
              {!!invoice.payosQrCode && !showWebView && (
                <View style={s.qrBox}>
                  <Text style={s.qrAmount}>{formatCurrency(invoice.grandTotal)}</Text>
                  <View style={s.qrWrap}>
                    <QRCode value={invoice.payosQrCode} size={220} getRef={(c) => { qrRef.current = c; }} />
                  </View>
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

              {!!invoice.payosCheckoutUrl && !showWebView && (
                <TouchableOpacity style={s.checkoutBtn} onPress={() => setShowWebView(true)}>
                  <Text style={s.checkoutBtnText}>💳 Mở trang thanh toán PayOS</Text>
                </TouchableOpacity>
              )}

              {showWebView && !!invoice.payosCheckoutUrl && (
                <View style={s.webviewBox}>
                  <WebView
                    source={{ uri: invoice.payosCheckoutUrl }}
                    onNavigationStateChange={(nav) => {
                      if (nav.url?.startsWith(PAY_SUCCESS_URL)) {
                        setShowWebView(false);
                        handleConfirmPaid();
                      } else if (nav.url?.startsWith(PAY_CANCEL_URL)) {
                        setShowWebView(false);
                      }
                    }}
                  />
                </View>
              )}

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
                <TouchableOpacity style={s.cancelBtn} onPress={() => { setShowWebView(false); onClose(); }}>
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
    ctx.fillText(`${typeLabel} · T${String(invoice.month).padStart(2, '0')}/${invoice.year}`, W / 2, 72);

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
  modalWebview: { height: '90%' },
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
  qrHint: { fontSize: 12, color: Colors.textMuted, textAlign: 'center', marginBottom: Spacing.md, fontStyle: 'italic' },

  downloadBtn: {
    borderRadius: BorderRadius.md, borderWidth: 1, borderColor: Colors.primary,
    paddingVertical: Spacing.sm, paddingHorizontal: Spacing.lg, marginBottom: Spacing.md,
  },
  downloadBtnText: { fontSize: 13, fontWeight: '700', color: Colors.primary },

  checkoutBtn: {
    backgroundColor: Colors.primary, borderRadius: BorderRadius.lg,
    paddingVertical: Spacing.base, alignItems: 'center', marginBottom: Spacing.md,
  },
  checkoutBtnText: { fontSize: 14, fontWeight: '700', color: Colors.white },
  webviewBox: { height: 420, borderRadius: BorderRadius.lg, overflow: 'hidden', marginBottom: Spacing.md },

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
