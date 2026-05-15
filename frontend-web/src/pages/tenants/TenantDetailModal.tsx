import { X, Phone, CreditCard, Mail, MapPin, DoorOpen, Calendar, Edit2, ShieldAlert } from 'lucide-react';
import type { Tenant } from '../../types';
import { tenantStatusMap } from '../../utils';

interface Props {
  tenant: Tenant;
  onClose: () => void;
  onEdit: () => void;
}

export const TenantDetailModal = ({ tenant, onClose, onEdit }: Props) => {
  const statusInfo = tenantStatusMap[tenant.status];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-xl mx-4 max-h-[90vh] flex flex-col">
        {/* Header (Sticky) */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <h2 className="text-lg font-bold text-slate-900">Chi tiết khách thuê</h2>
          <div className="flex items-center gap-2">
            <button onClick={onEdit} className="p-2 text-primary-600 hover:bg-primary-50 rounded-lg">
              <Edit2 className="w-5 h-5" />
            </button>
            <button onClick={onClose} className="p-2 text-slate-400 hover:bg-slate-100 rounded-lg">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content (Scrollable) */}
        <div className="p-6 overflow-y-auto space-y-6">
          {/* Main Info */}
          <div className="flex items-start gap-4">
            <div className="w-16 h-16 rounded-full bg-primary-100 text-primary-700 flex items-center justify-center text-2xl font-bold">
              {tenant.fullName.charAt(0).toUpperCase()}
            </div>
            <div>
              <h3 className="text-xl font-bold text-slate-900">{tenant.fullName}</h3>
              <div className="flex items-center gap-2 mt-2">
                <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full ${statusInfo.color}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${statusInfo.dot}`} />
                  {statusInfo.label}
                </span>
                {tenant.status === 'pending_activation' && (
                  <span className="text-xs text-amber-600 flex items-center gap-1 bg-amber-50 px-2 py-1 rounded-full">
                    <ShieldAlert className="w-3.5 h-3.5" /> Chờ OTP
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-x-8 gap-y-6 pt-4 border-t border-slate-100">
            <div className="space-y-4">
              <p className="text-sm font-semibold text-slate-400 uppercase tracking-wider">Liên hệ</p>
              <div className="space-y-3">
                <p className="flex items-center gap-2 text-sm text-slate-700">
                  <Phone className="w-4 h-4 text-slate-400" /> {tenant.phone}
                </p>
                <p className="flex items-center gap-2 text-sm text-slate-700">
                  <CreditCard className="w-4 h-4 text-slate-400" /> {tenant.cccd}
                </p>
                <p className="flex items-center gap-2 text-sm text-slate-700">
                  <Mail className="w-4 h-4 text-slate-400" /> {tenant.email || '—'}
                </p>
              </div>
            </div>

            <div className="space-y-4">
              <p className="text-sm font-semibold text-slate-400 uppercase tracking-wider">Thông tin thuê</p>
              <div className="space-y-3">
                <p className="flex items-center gap-2 text-sm font-medium text-primary-700">
                  <DoorOpen className="w-4 h-4 text-primary-500" /> Phòng {tenant.roomCode}
                </p>
                <p className="flex items-center gap-2 text-sm text-slate-700">
                  <MapPin className="w-4 h-4 text-slate-400" /> {tenant.propertyName}
                </p>
                <p className="flex items-center gap-2 text-sm text-slate-700">
                  <Calendar className="w-4 h-4 text-slate-400" /> Vào ở: {tenant.moveInDate}
                </p>
                {tenant.moveOutDate && (
                  <p className="flex items-center gap-2 text-sm text-slate-500">
                    <Calendar className="w-4 h-4 text-slate-400" /> Rời đi: {tenant.moveOutDate}
                  </p>
                )}
              </div>
            </div>
          </div>
          
          <div className="bg-slate-50 rounded-xl p-4 border border-slate-100">
            <p className="text-sm text-slate-500">Ghi chú: Khách hàng được tạo lúc {tenant.createdAt}</p>
          </div>
        </div>
      </div>
    </div>
  );
};
