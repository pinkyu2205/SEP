import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Building2, CheckCircle2, ChevronLeft } from 'lucide-react';
import type { PropertyResponse } from '../../../../types/api.types';
import { propertyService } from '../../../../services/property.service';
import { StepConfirmPrice } from './StepConfirmPrice';
import { StepPropertyInfo } from './StepPropertyInfo';
import { StepRenovations } from './StepRenovations';

const STEPS = [
  { id: 1, label: 'Thông tin & hợp đồng' },
  { id: 2, label: 'Cải tạo & khấu hao' },
  { id: 3, label: 'Duyệt cho Host' },
];

const statusLabel: Record<string, string> = {
  DRAFT: 'Nháp',
  ACTIVE: 'Available',
  MAINTENANCE: 'Đang cải tạo',
  INACTIVE: 'Ngừng hoạt động',
};

export const PropertyOnboardingWizard = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [currentStep, setCurrentStep] = useState(1);
  const [property, setProperty] = useState<PropertyResponse | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (id && id !== 'new') {
      fetchProperty(Number(id));
    }
  }, [id]);

  const fetchProperty = async (propertyId: number) => {
    setLoading(true);
    try {
      const data = await propertyService.getPropertyById(propertyId);
      setProperty(data);
    } catch (err) {
      console.error(err);
      alert('Không tìm thấy căn nhà này.');
      navigate('/super-admin/buildings');
    } finally {
      setLoading(false);
    }
  };

  const handleNext = () => {
    if (currentStep < STEPS.length) {
      setCurrentStep(prev => prev + 1);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    navigate('/super-admin/buildings');
  };

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep(prev => prev - 1);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    navigate('/super-admin/buildings');
  };

  const progressWidth = `${((currentStep - 1) / (STEPS.length - 1)) * 100}%`;

  return (
    <div className="min-h-screen bg-slate-50 pb-16">
      <div className="sticky top-0 z-10 border-b border-slate-200 bg-white px-6 py-4 shadow-sm">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-4">
            <button onClick={handleBack} className="rounded-xl p-2 text-slate-400 transition hover:bg-slate-100" title="Quay lại">
              <ChevronLeft className="h-6 w-6" />
            </button>
            <div className="min-w-0">
              <h1 className="flex items-center gap-2 truncate text-xl font-black text-slate-900">
                <Building2 className="h-6 w-6 shrink-0 text-indigo-600" />
                {property ? property.propertyName : 'Thêm nhà thuê mới'}
              </h1>
              <p className="mt-1 text-sm font-medium text-slate-500">
                Luồng Admin: nhập hợp đồng gốc, ghi nhận cải tạo, duyệt available để Host tiếp tục vận hành.
              </p>
            </div>
          </div>
          {property && (
            <div className={`shrink-0 rounded-full px-3 py-1 text-sm font-bold ${property.status === 'ACTIVE' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-700'}`}>
              Trạng thái: {statusLabel[property.status] || property.status}
            </div>
          )}
        </div>
      </div>

      <div className="mx-auto mt-8 max-w-6xl px-6">
        <div className="relative flex items-start justify-between">
          <div className="absolute left-0 top-5 z-0 h-1 w-full rounded-full bg-slate-200" />
          <div className="absolute left-0 top-5 z-0 h-1 rounded-full bg-indigo-500 transition-all duration-500" style={{ width: progressWidth }} />

          {STEPS.map(step => {
            const isActive = step.id === currentStep;
            const isCompleted = step.id < currentStep;

            return (
              <div key={step.id} className="relative z-10 flex min-w-0 flex-1 flex-col items-center gap-2">
                <div className={`flex h-10 w-10 items-center justify-center rounded-full text-sm font-bold shadow-sm transition-all ${isActive ? 'bg-indigo-600 text-white ring-4 ring-indigo-100' : isCompleted ? 'bg-indigo-500 text-white' : 'border-2 border-slate-200 bg-white text-slate-400'}`}>
                  {isCompleted ? <CheckCircle2 className="h-5 w-5" /> : step.id}
                </div>
                <span className={`max-w-36 text-center text-xs font-bold ${isActive ? 'text-indigo-900' : isCompleted ? 'text-indigo-600' : 'text-slate-400'}`}>
                  {step.label}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="mx-auto mt-10 max-w-5xl px-6">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm md:p-8">
          {loading ? (
            <div className="py-20 text-center font-semibold text-slate-400">Đang tải dữ liệu...</div>
          ) : (
            <>
              {currentStep === 1 && (
                <StepPropertyInfo
                  property={property}
                  onSaved={(savedProperty) => {
                    setProperty(savedProperty);
                    if (!property) {
                      navigate(`/super-admin/properties/onboarding/${savedProperty.id}`, { replace: true });
                    }
                    handleNext();
                  }}
                />
              )}
              {currentStep === 2 && property && (
                <StepRenovations property={property} onNext={handleNext} onBack={handleBack} />
              )}
              {currentStep === 3 && property && (
                <StepConfirmPrice
                  property={property}
                  onNext={handleNext}
                  onBack={handleBack}
                  onSuccess={() => fetchProperty(property.id)}
                />
              )}
              {currentStep > 1 && !property && (
                <div className="py-16 text-center text-sm font-semibold text-slate-500">
                  Vui lòng lưu thông tin căn nhà trước khi qua bước tiếp theo.
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};
