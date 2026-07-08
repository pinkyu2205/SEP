import React, { useEffect, useState } from 'react';
import { ChevronRight, ChevronDown, MapPin, Plus, Trash2, Building2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { zoneService } from '@/services/zone.service';
import type { ZoneResponse, ZoneRequest } from '@/types/api.types';
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
    if (!isExpanded && children.length === 0) {
      setIsLoading(true);
      try {
        const data = await zoneService.getChildrenZones(zone.id);
        setChildren(data);
      } catch {
        toast.error('Lỗi khi tải khu vực con');
      } finally {
        setIsLoading(false);
      }
    }
    setIsExpanded(v => !v);
  };

  return (
    <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-sm bg-white">
      {/* Level 1 header */}
      <div className="flex items-center gap-4 px-5 py-4 bg-gradient-to-r from-indigo-50 to-white group">
        <button
          onClick={handleToggle}
          className="w-8 h-8 flex items-center justify-center rounded-xl bg-white border border-slate-200 text-indigo-500 hover:bg-indigo-50 hover:border-indigo-300 transition-all shadow-sm shrink-0"
        >
          {isLoading
            ? <div className="w-3.5 h-3.5 rounded-full border-2 border-slate-200 border-t-indigo-500 animate-spin" />
            : isExpanded
              ? <ChevronDown className="w-4 h-4" />
              : <ChevronRight className="w-4 h-4" />}
        </button>

        <div className="w-9 h-9 rounded-xl bg-indigo-100 flex items-center justify-center shrink-0">
          <MapPin className="w-4 h-4 text-indigo-600" />
        </div>

        <div className="flex-1 min-w-0">
          <p className="font-bold text-slate-900 text-base">{zone.name}</p>
          {zone.description && <p className="text-xs text-slate-400 truncate">{zone.description}</p>}
        </div>

        <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
          <button
            onClick={() => onAddChild(zone)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            Thêm Quận/Huyện
          </button>
          <button
            onClick={() => { if (window.confirm(`Xóa ${zone.name}?`)) onDelete(zone.id); }}
            className="w-8 h-8 flex items-center justify-center text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-colors"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Level 2 children grid */}
      {isExpanded && (
        <div className="px-5 py-4 border-t border-slate-100 bg-slate-50/50">
          {children.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-4">Chưa có Quận/Huyện nào</p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
              {children.map(child => (
                <div
                  key={child.id}
                  className="flex items-center justify-between gap-2 px-3 py-2.5 bg-white border border-slate-200 rounded-xl group/child hover:border-cyan-300 hover:shadow-sm transition-all"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-7 h-7 rounded-lg bg-cyan-50 flex items-center justify-center shrink-0">
                      <Building2 className="w-3.5 h-3.5 text-cyan-500" />
                    </div>
                    <span className="text-sm font-medium text-slate-700 truncate">{child.name}</span>
                  </div>
                  <button
                    onClick={() => { if (window.confirm(`Xóa ${child.name}?`)) onDelete(child.id); }}
                    className="opacity-0 group-hover/child:opacity-100 w-6 h-6 flex items-center justify-center text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-md transition-all shrink-0"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export const ZoneManagement = () => {
  const [rootZones, setRootZones] = useState<ZoneResponse[]>([]);
  const [isLoading, setIsLoading] = useState(true);

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
    } catch {
      toast.error('Lỗi khi tải danh sách Tỉnh/Thành phố');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { fetchRootZones(); }, []);

  const handleCreateZone = async (data: ZoneRequest) => {
    try {
      await zoneService.createZone(data);
      toast.success('Thêm khu vực thành công!');
      if (data.level === 1) fetchRootZones();
      else window.location.reload();
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

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Quản lý Khu vực</h1>
          <p className="text-sm text-slate-500 mt-1">
            Thiết lập danh sách Tỉnh/TP và Quận/Huyện cho hệ thống.
          </p>
        </div>
        <button
          onClick={() => { setModalConfig({ level: 1, parentId: null }); setIsModalOpen(true); }}
          className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white text-sm font-semibold rounded-xl shadow-sm shadow-indigo-500/30 transition-all"
        >
          <Plus className="w-4 h-4" />
          Thêm Tỉnh/Thành phố
        </button>
      </div>

      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-20 text-slate-400">
          <div className="w-8 h-8 border-4 border-slate-100 border-t-indigo-500 rounded-full animate-spin mb-4" />
          <p className="text-sm">Đang tải dữ liệu...</p>
        </div>
      ) : rootZones.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-16 h-16 bg-indigo-50 rounded-2xl flex items-center justify-center mb-4">
            <MapPin className="w-8 h-8 text-indigo-300" />
          </div>
          <p className="font-semibold text-slate-600">Chưa có dữ liệu khu vực nào</p>
          <p className="text-sm text-slate-400 mt-1">Hãy bắt đầu bằng cách thêm Tỉnh/Thành phố mới.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {rootZones.map(zone => (
            <ZoneNode
              key={zone.id}
              zone={zone}
              onAddChild={z => { setModalConfig({ level: z.level + 1, parentId: z.id, parentName: z.name }); setIsModalOpen(true); }}
              onDelete={handleDeleteZone}
            />
          ))}
        </div>
      )}

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
