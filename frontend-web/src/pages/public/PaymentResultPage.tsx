import { useSearchParams } from 'react-router-dom';

/**
 * Trang PayOS redirect về sau khi thanh toán xong / huỷ.
 *
 * ⚠️ Đường dẫn `/payment-success` và `/payment-cancel` PHẢI khớp returnUrl/cancelUrl
 * mà BE cấu hình cho PayOS (xem docs/BE-HANDOFF-https-payos-ready-2026-08-06.md),
 * và khớp PAY_SUCCESS_URL/PAY_CANCEL_URL trong mobile-app/src/constants/api.ts —
 * mobile bắt sự kiện điều hướng WebView theo đúng 2 chuỗi này để đóng modal.
 * Đổi path ở đây là phải báo BE + sửa mobile, nếu không luồng thanh toán đứt.
 *
 * Trang cố ý đứng độc lập (không nằm trong PublicLayout): người dùng tới đây từ
 * cổng thanh toán, không phải đang duyệt web — hiện lại menu điều hướng chỉ gây nhiễu.
 *
 * PayOS gắn sẵn query param khi redirect: code, id, cancel, status, orderCode.
 */

type PaymentResultProps = {
  variant: 'success' | 'cancel';
};

const PaymentResult = ({ variant }: PaymentResultProps) => {
  const [searchParams] = useSearchParams();
  const orderCode = searchParams.get('orderCode');
  const isSuccess = variant === 'success';

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-12">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 text-center shadow-lg ring-1 ring-slate-200">
        <div
          className={`mx-auto flex h-16 w-16 items-center justify-center rounded-full ${
            isSuccess ? 'bg-emerald-100' : 'bg-amber-100'
          }`}
        >
          {isSuccess ? (
            <svg
              className="h-8 w-8 text-emerald-600"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2.5}
              stroke="currentColor"
              aria-hidden="true"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
            </svg>
          ) : (
            <svg
              className="h-8 w-8 text-amber-600"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2.5}
              stroke="currentColor"
              aria-hidden="true"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          )}
        </div>

        <h1 className="mt-6 text-2xl font-bold text-slate-900">
          {isSuccess ? 'Thanh toán thành công' : 'Đã huỷ thanh toán'}
        </h1>

        <p className="mt-3 text-slate-600">
          {isSuccess
            ? 'Cảm ơn bạn. Hoá đơn sẽ được cập nhật trạng thái đã thanh toán trong ít phút.'
            : 'Giao dịch chưa được thực hiện. Bạn có thể quay lại ứng dụng và thanh toán lại bất cứ lúc nào.'}
        </p>

        {orderCode && (
          <div className="mt-6 rounded-lg bg-slate-50 px-4 py-3 text-sm ring-1 ring-slate-200">
            <span className="text-slate-500">Mã đơn: </span>
            <span className="font-semibold text-slate-900">{orderCode}</span>
          </div>
        )}

        <p className="mt-6 text-sm text-slate-500">
          Bạn có thể đóng trang này và quay lại ứng dụng Onion Home.
        </p>

        <a
          href="/"
          className="mt-6 inline-block rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-700"
        >
          Về trang chủ
        </a>
      </div>
    </div>
  );
};

export const PaymentSuccessPage = () => <PaymentResult variant="success" />;
export const PaymentCancelPage = () => <PaymentResult variant="cancel" />;

export default PaymentResult;
