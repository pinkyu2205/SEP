export interface ZoneResponse {
  id: string; // UUID
  name: string;
  description?: string;
  level: number;
  parentId?: string;
  parentName?: string;
  fullName: string;
}

export interface ZoneRequest {
  name: string;
  description?: string;
  level: number;
  parentId?: string | null;
}
