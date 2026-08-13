import type { EquipmentResponse, InboundContractResponse, PropertyResponse, RenovationResponse } from '@/types/api.types';
import { nowIso } from '@/utils/serverTime';

export interface AdminContractDraft {
  contract?: InboundContractResponse;
  pdfFileName?: string;
}

export interface AdminRenovationBatch {
  id: string;
  title: string;
  startDate: string;
  endDate: string;
  mode: 'replace' | 'append';
  reservePercent: number;
  active: boolean;
  createdAt: string;
  items: RenovationResponse[];
}

export interface AdminAvailabilityDraft {
  available: boolean;
  rentalMode: 'whole_house' | 'by_room';
  assignedToHost: boolean;
  hostName: string;
  activatedAt?: string;
}

const key = (propertyId: number, suffix: string) => `admin-onboarding:${propertyId}:${suffix}`;

const read = <T,>(storageKey: string, fallback: T): T => {
  try {
    const raw = localStorage.getItem(storageKey);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    localStorage.removeItem(storageKey);
    return fallback;
  }
};

const write = <T,>(storageKey: string, value: T) => {
  localStorage.setItem(storageKey, JSON.stringify(value));
  return value;
};

export const adminOnboardingDraftService = {
  getContractDraft(propertyId: number) {
    return read<AdminContractDraft>(key(propertyId, 'contract'), {});
  },

  saveContractDraft(propertyId: number, draft: AdminContractDraft) {
    return write(key(propertyId, 'contract'), draft);
  },

  getEquipmentDraft(propertyId: number) {
    return read<EquipmentResponse[]>(key(propertyId, 'equipments'), []);
  },

  saveEquipmentDraft(propertyId: number, equipments: EquipmentResponse[]) {
    return write(key(propertyId, 'equipments'), equipments);
  },

  getRenovationBatches(propertyId: number) {
    return read<AdminRenovationBatch[]>(key(propertyId, 'renovation-batches'), []);
  },

  saveRenovationBatch(propertyId: number, batch: Omit<AdminRenovationBatch, 'id' | 'createdAt' | 'active'>) {
    const current = this.getRenovationBatches(propertyId).map(item => ({
      ...item,
      active: batch.mode === 'append' ? item.active : false,
    }));

    const next: AdminRenovationBatch = {
      ...batch,
      id: `${Date.now()}`,
      createdAt: nowIso(),
      active: true,
    };

    return write(key(propertyId, 'renovation-batches'), [next, ...current]);
  },

  getAvailability(property: PropertyResponse) {
    return read<AdminAvailabilityDraft>(key(property.id, 'availability'), {
      available: property.status === 'ACTIVE',
      rentalMode: property.wholeHouse ? 'whole_house' : 'by_room',
      assignedToHost: property.status === 'ACTIVE',
      hostName: 'Hoàng Bình Land Host',
      activatedAt: property.status === 'ACTIVE' ? nowIso() : undefined,
    });
  },

  saveAvailability(propertyId: number, draft: AdminAvailabilityDraft) {
    return write(key(propertyId, 'availability'), draft);
  },
};
