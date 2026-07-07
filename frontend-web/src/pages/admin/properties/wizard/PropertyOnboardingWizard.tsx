import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Building, Settings2, Send } from 'lucide-react';
import { propertyService } from '@/services/property.service';
import type { PropertyResponse } from '@/types/api.types';
import { StepPropertyInfo } from './StepPropertyInfo';
import { StepOnboardingOptions } from './StepOnboardingOptions';
import { StepSubmitToHost } from './StepSubmitToHost';

const steps = [
  { id: 1, title: 'Thông tin & Hợp đồng', icon: Building },
  { id: 2, title: 'Cấu hình chi tiết', icon: Settings2 },
  { id: 3, title: 'Xem giá & Gửi Host', icon: Send },
];

export const PropertyOnboardingWizard = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  
  const [currentStep, setCurrentStep] = useState(1);
  const [property, setProperty] = useState<PropertyResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchProperty = async () => {
      setLoading(true);
      try {
        const data = await propertyService.getPropertyById(Number(id));
        setProperty(data);
        
        // Auto-advance logic based on what's already completed
        // This makes resuming onboarding easier
        if (data.status !== 'DRAFT') {
          setCurrentStep(3); // Already submitted or active
        } else if (data.wholeHouse !== null) {
          setCurrentStep(2); // Options were set, likely resuming step 2
        }
      } catch (err: any) {
        setError('Không thể tải dữ liệu tòa nhà');
      } finally {
        setLoading(false);
      }
    };

    if (id) fetchProperty();
  }, [id]);

  const handleNext = () => setCurrentStep(prev => Math.min(steps.length, prev + 1));
  const handleBack = () => setCurrentStep(prev => Math.max(1, prev - 1));

  if (loading) return <div className="py-32 text-center text-slate-500 font-semibold">Đang tải cấu hình tòa nhà...</div>;
  if (error || !property) return <div className="py-32 text-center text-rose-500 font-bold">{error}</div>;

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      {/* Header & Navigation */}
      <div className="mb-10">
        <button 
          onClick={() => navigate('/admin/buildings')}
          className="mb-6 flex items-center gap-2 text-sm font-semibold text-slate-500 hover:text-indigo-600 transition"
        >
          <ArrowLeft className="h-4 w-4" /> Quay về danh sách Tòa nhà
        </button>
        
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-black text-slate-900 tracking-tight">Onboarding Tòa nhà mới</h1>
            <p className="text-slate-500 mt-1 font-medium">{property.propertyName} • {property.fullAddress || property.shortAddress}</p>
          </div>
          <span className="bg-indigo-50 text-indigo-700 px-4 py-1.5 rounded-full text-sm font-bold">
            Trạng thái: {property.status}
          </span>
        </div>

        {/* Progress Bar */}
        <div className="relative">
          <div className="absolute top-1/2 left-0 right-0 h-1 bg-slate-100 -translate-y-1/2 rounded-full overflow-hidden">
            <div 
              className="h-full bg-indigo-500 transition-all duration-500 ease-out"
              style={{ width: `${((currentStep - 1) / (steps.length - 1)) * 100}%` }}
            />
          </div>
          <div className="relative flex justify-between">
            {steps.map((step) => {
              const Icon = step.icon;
              const isActive = currentStep === step.id;
              const isCompleted = currentStep > step.id;
              
              return (
                <div key={step.id} className="flex flex-col items-center gap-3">
                  <div className={`
                    w-12 h-12 rounded-full flex items-center justify-center border-4 shadow-sm transition-all duration-300
                    ${isActive ? 'bg-indigo-600 border-indigo-100 text-white shadow-indigo-200' : 
                      isCompleted ? 'bg-emerald-500 border-emerald-100 text-white' : 
                      'bg-white border-slate-100 text-slate-400'}
                  `}>
                    <Icon className="w-5 h-5" />
                  </div>
                  <span className={`text-sm font-bold ${isActive ? 'text-indigo-900' : isCompleted ? 'text-slate-700' : 'text-slate-400'}`}>
                    Bước {step.id}: {step.title}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Step Content */}
      <div className="min-h-[500px]">
        {currentStep === 1 && (
          <StepPropertyInfo 
            property={property} 
            onNext={handleNext} 
          />
        )}
        
        {currentStep === 2 && (
          <StepOnboardingOptions 
            property={property} 
            onNext={handleNext} 
            onBack={handleBack} 
            onPropertyUpdated={setProperty}
          />
        )}
        
        {currentStep === 3 && (
          <StepSubmitToHost 
            property={property} 
            onBack={handleBack}
            onSuccess={() => navigate('/admin/buildings')}
          />
        )}
      </div>
    </div>
  );
};
