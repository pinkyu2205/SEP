import React, { useEffect, useState } from 'react';
import { ChevronRight, ChevronDown, MapPin, Plus, Trash2, Layers } from 'lucide-react';
import toast from 'react-hot-toast';
import { zoneService } from '../../../services/zone.service';
import type { ZoneResponse, ZoneRequest } from '../../../types/api.types';
import { ZoneFormModal } from './ZoneFormModal';

const ZoneNode: React.FC<{
  zone: ZoneResponse;
  onAddChild: (zone: ZoneResponse) => void;
  onDelete: (id: string) => void;
}> = ({ zone, onAddChild, onDelete }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [children, setChildren] = useState<ZoneResponse[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const handleToggle = async () => {
    if (zone.level >= 3) return; // Không có con cho cấp Phường/Xã
    
    if (!isExpanded && children.length === 0) {
      setIsLoading(true);
      try {
        const data = await zoneService.getChildrenZones(zone.id);
        setChildren(data);
      } catch (error) {
        toast.error('Lỗi khi tải khu vực con');
      } finally {
        setIsLoading(false);
      }
    }
    setIsExpanded(!isExpanded);
  };

  const isLevel3 = zone.level === 3;

  return (
    <div className="w-full">
      <div 
        className={`flex items-center group py-3 px-4 hover:bg-slate-50 border-b border-slate-100 transition-colors ${
          zone.level === 1 ? 'bg-white' : zone.level === 2 ? 'bg-slate-50/50' : 'bg-slate-50/80'
        }`}
        style={{ paddingLeft: `${(zone.level - 1) * 2 + 1}rem` }}
      >
        <button 
          onClick={handleToggle}
          className={`p-1 mr-2 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-200 transition-colors ${isLevel3 ? 'invisible' : ''}`}
        >
          {isLoading ? (
            <div className="w-4 h-4 rounded-full border-2 border-slate-300 border-t-cyan-600 animate-spin" />
          ) : isExpanded ? (
            <ChevronDown className="w-4 h-4" />
          ) : (
            <ChevronRight className="w-4 h-4" />
          )}
        </button>

        <div className="flex-1 flex items-center gap-3 min-w-0">
          <div className={`p-2 rounded-lg ${zone.level === 1 ? 'bg-indigo-100 text-indigo-600' : zone.level === 2 ? 'bg-cyan-100 text-cyan-600' : 'bg-emerald-100 text-emerald-600'}`}>
            {zone.level === 1 ? <MapPin className="w-4 h-4" /> : <Layers className="w-4 h-4" />}
          </div>
          <div className="truncate">
            <h3 className="text-sm font-semibold text-slate-800 truncate">{zone.name}</h3>
            {zone.description && <p className="text-xs text-slate-500 truncate">{zone.description}</p>}
          </div>
        </div>

        <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
          {!isLevel3 && (
            <button
              onClick={() => onAddChild(zone)}
              className="p-2 text-xs font-medium text-cyan-600 hover:bg-cyan-50 rounded-lg transition-colors flex items-center gap-1"
            >
              <Plus className="w-3.5 h-3.5" />
              Thêm {zone.level === 1 ? 'Quận/Huyện' : 'Phường/Xã'}
            </button>
          )}
          <button
            onClick={() => {
              if (window.confirm(`Bạn có chắc chắn muốn xóa ${zone.name}?`)) {
                onDelete(zone.id);
              }
            }}
            className="p-2 text-rose-500 hover:bg-rose-50 rounded-lg transition-colors"
            title="Xóa khu vực"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {isExpanded && children.length > 0 && (
        <div className="w-full border-l-2 border-slate-100 ml-6">
          {children.map(child => (
            <ZoneNode 
              key={child.id} 
              zone={child} 
              onAddChild={(z) => {
                onAddChild(z);
                // Sau khi thêm, cần reload lại chilren, phần này xử lý đơn giản bằng cách yêu cầu reload cả trang, 
                // hoặc truyền callback xuống. Để tối ưu, ta đẩy state quản lý lên trên.
                // Ở đây ta cứ truyền thẳng onAddChild của cha
              }}
              onDelete={onDelete}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export const ZoneManagement = () => {
  const [rootZones, setRootZones] = useState<ZoneResponse[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalConfig, setModalConfig] = useState<{
    level: number;
    parentId: string | null;
    parentName?: string;
  }>({ level: 1, parentId: null });

  const fetchRootZones = async () => {
    setIsLoading(true);
    try {
      const data = await zoneService.getRootZones();
      setRootZones(data);
    } catch (error) {
      toast.error('Lỗi khi tải danh sách Tỉnh/Thành phố');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchRootZones();
  }, []);

  const handleCreateZone = async (data: ZoneRequest) => {
    try {
      await zoneService.createZone(data);
      toast.success('Thêm khu vực thành công!');
      // Reload lại trang cho nhanh, hoặc reload root
      if (data.level === 1) {
        fetchRootZones();
      } else {
        // Tạm thời reload nguyên trang để update cây
        // TODO: Update state cục bộ để mượt hơn
        window.location.reload();
      }
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Lỗi khi thêm khu vực');
      throw error;
    }
  };

  const handleDeleteZone = async (id: string) => {
    try {
      await zoneService.deleteZone(id);
      toast.success('Xóa khu vực thành công!');
      window.location.reload();
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Không thể xóa khu vực này (có thể đang chứa dữ liệu)');
    }
  };

  const openAddRootModal = () => {
    setModalConfig({ level: 1, parentId: null });
    setIsModalOpen(true);
  };

  const openAddChildModal = (parentZone: ZoneResponse) => {
    setModalConfig({ 
      level: parentZone.level + 1, 
      parentId: parentZone.id,
      parentName: parentZone.name
    });
    setIsModalOpen(true);
  };

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Quản lý Khu vực (Zone)</h1>
          <p className="text-sm text-slate-500 mt-1">
            Thiết lập danh sách Tỉnh/TP, Quận/Huyện, Phường/Xã cho hệ thống.
          </p>
        </div>
        <button
          onClick={openAddRootModal}
          className="flex items-center justify-center gap-2 px-4 py-2.5 bg-cyan-600 hover:bg-cyan-700 text-white text-sm font-semibold rounded-xl shadow-sm shadow-cyan-600/20 transition-all active:scale-95"
        >
          <Plus className="w-4 h-4" />
          Thêm Tỉnh/Thành phố
        </button>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center p-12 text-slate-400">
            <div className="w-8 h-8 border-4 border-slate-100 border-t-cyan-500 rounded-full animate-spin mb-4" />
            <p>Đang tải dữ liệu...</p>
          </div>
        ) : rootZones.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-12 text-slate-400 text-center">
            <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mb-4">
              <MapPin className="w-8 h-8 text-slate-300" />
            </div>
            <p className="text-slate-600 font-medium">Chưa có dữ liệu khu vực nào</p>
            <p className="text-sm mt-1">Hãy bắt đầu bằng cách thêm Tỉnh/Thành phố mới.</p>
          </div>
        ) : (
          <div className="flex flex-col w-full">
            {rootZones.map(zone => (
              <ZoneNode 
                key={zone.id} 
                zone={zone} 
                onAddChild={openAddChildModal} 
                onDelete={handleDeleteZone}
              />
            ))}
          </div>
        )}
      </div>

      <ZoneFormModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSubmit={handleCreateZone}
        level={modalConfig.level}
        parentId={modalConfig.parentId}
        parentName={modalConfig.parentName}
      />
    </div>
  );
};
