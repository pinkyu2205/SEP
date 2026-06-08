import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ChevronLeft, Building2, CheckCircle2 } from 'lucide-react';
import type { PropertyResponse } from '../../../../types/api.types';
import { propertyService } from '../../../../services/property.service';

import { StepPropertyInfo } from './StepPropertyInfo';
import { StepRooms } from './StepRooms';
import { StepEquipments } from './StepEquipments';
import { StepRenovations } from './StepRenovations';
import { StepInboundContract } from './StepInboundContract';
import { StepDepreciation } from './StepDepreciation';
import { StepConfirmPrice } from './StepConfirmPrice';

const STEPS = [
  { id: 1, label: 'Thông tin cơ bản' },
  { id: 2, label: 'Danh sách phòng' },
  { id: 3, label: 'Thiết bị' },
  { id: 4, label: 'Cải tạo' },
  { id: 5, label: 'Hợp đồng gốc' },
  { id: 6, label: 'Tính khấu hao' },
  { id: 7, label: 'Kích hoạt Giá' },
];

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

  const fetchProperty = async (propId: number) => {
    setLoading(true);
    try {
      const data = await propertyService.getPropertyById(propId);
      setProperty(data);
    } catch (err) {
      console.error(err);
      alert('Không tìm thấy Tòa nhà');
      navigate('/super-admin/buildings');
    } finally {
      setLoading(false);
    }
  };

  const handleNext = () => {
    if (currentStep === 1 && property?.wholeHouse) {
      // Bỏ qua bước Phòng nếu là nhà nguyên căn
      setCurrentStep(3);
    } else if (currentStep < 7) {
      setCurrentStep(prev => prev + 1);
    } else {
      navigate('/super-admin/buildings');
    }
  };

  const handleBack = () => {
    if (currentStep === 3 && property?.wholeHouse) {
      setCurrentStep(1);
    } else if (currentStep > 1) {
      setCurrentStep(prev => prev - 1);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 pb-20">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-6 py-4 sticky top-0 z-10 shadow-sm">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button onClick={() => navigate('/super-admin/buildings')} className="p-2 text-slate-400 hover:bg-slate-100 rounded-xl transition">
              <ChevronLeft className="w-6 h-6" />
            </button>
            <div>
              <h1 className="text-xl font-black text-slate-900 flex items-center gap-2">
                <Building2 className="w-6 h-6 text-indigo-600" />
                {property ? property.propertyName : 'Tạo mới Tòa nhà (Onboarding)'}
              </h1>
              <p className="text-sm text-slate-500 font-medium">Quy trình thiết lập & cấu hình chi tiết trước khi cho thuê</p>
            </div>
          </div>
          {property && (
            <div className={`px-3 py-1 rounded-full text-sm font-bold ${property.status === 'ACTIVE' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-700'}`}>
              Trạng thái: {property.status}
            </div>
          )}
        </div>
      </div>

      {/* Progress Bar */}
      <div className="max-w-5xl mx-auto mt-8 px-6">
        <div className="flex items-center justify-between relative">
          <div className="absolute left-0 top-1/2 -translate-y-1/2 w-full h-1 bg-slate-200 rounded-full z-0"></div>
          <div className="absolute left-0 top-1/2 -translate-y-1/2 h-1 bg-indigo-500 rounded-full z-0 transition-all duration-500" style={{ width: `${((currentStep - 1) / (7 - 1)) * 100}%` }}></div>
          
          {STEPS.map(step => {
            const isHidden = property?.wholeHouse && step.id === 2;
            if (isHidden) return null;

            const isActive = step.id === currentStep;
            const isCompleted = step.id < currentStep;

            return (
              <div key={step.id} className="relative z-10 flex flex-col items-center gap-2">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm transition-all shadow-sm ${isActive ? 'bg-indigo-600 text-white ring-4 ring-indigo-100' : isCompleted ? 'bg-indigo-500 text-white' : 'bg-white text-slate-400 border-2 border-slate-200'}`}>
                  {isCompleted ? <CheckCircle2 className="w-5 h-5" /> : step.id}
                </div>
                <span className={`text-xs font-bold absolute -bottom-6 w-24 text-center ${isActive ? 'text-indigo-900' : isCompleted ? 'text-indigo-600' : 'text-slate-400'}`}>{step.label}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Content Area */}
      <div className="max-w-4xl mx-auto mt-16 px-6">
        {loading ? (
          <div className="text-center py-20 text-slate-400 font-semibold">Đang tải dữ liệu...</div>
        ) : (
          <div className="bg-white rounded-3xl shadow-sm border border-slate-200 p-8">
            {currentStep === 1 && (
              <StepPropertyInfo 
                property={property} 
                onSaved={(p) => { 
                  setProperty(p); 
                  if (!property) navigate(`/super-admin/properties/onboarding/${p.id}`, { replace: true });
                  handleNext(); 
                }} 
              />
            )}
            {currentStep === 2 && !property?.wholeHouse && property && <StepRooms property={property} onNext={handleNext} onBack={handleBack} />}
            {currentStep === 3 && property && <StepEquipments property={property} onNext={handleNext} onBack={handleBack} />}
            {currentStep === 4 && property && <StepRenovations property={property} onNext={handleNext} onBack={handleBack} />}
            {currentStep === 5 && property && <StepInboundContract property={property} onNext={handleNext} onBack={handleBack} />}
            {currentStep === 6 && property && <StepDepreciation property={property} onNext={handleNext} onBack={handleBack} />}
            {currentStep === 7 && property && <StepConfirmPrice property={property} onNext={handleNext} onBack={handleBack} onSuccess={() => fetchProperty(property.id)} />}
          </div>
        )}
      </div>
    </div>
  );
};
