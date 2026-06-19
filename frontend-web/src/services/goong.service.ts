// Goong REST services — Autocomplete / Place Detail / Geocode.
// Dùng VITE_GOONG_API_KEY (loại "API Key", KHÔNG phải Maptiles Key).
// Gọi thẳng https://rest.goong.io (domain ngoài, không qua proxy BE).

const REST = 'https://rest.goong.io';
const API_KEY = import.meta.env.VITE_GOONG_API_KEY;

export interface GoongPrediction {
  description: string;
  place_id: string;
  structured_formatting?: {
    main_text: string;
    secondary_text: string;
  };
}

export interface GoongLocation {
  lat: number;
  lng: number;
}

export const goongService = {
  /** Đã cấu hình API key chưa? Dùng để fallback khi thiếu key. */
  hasApiKey: (): boolean => !!API_KEY,

  /**
   * GET /Place/AutoComplete — gợi ý địa chỉ theo từ khoá.
   * @param signal AbortSignal để huỷ request cũ khi gõ tiếp.
   */
  async autocomplete(input: string, signal?: AbortSignal): Promise<GoongPrediction[]> {
    if (!API_KEY || input.trim().length < 2) return [];
    const url = `${REST}/Place/AutoComplete?api_key=${API_KEY}&input=${encodeURIComponent(input)}`;
    const res = await fetch(url, { signal });
    if (!res.ok) throw new Error(`Goong AutoComplete lỗi ${res.status}`);
    const data = await res.json();
    return (data?.predictions as GoongPrediction[]) ?? [];
  },

  /**
   * GET /Place/Detail — lấy địa chỉ đầy đủ + toạ độ từ place_id.
   */
  async placeDetail(placeId: string): Promise<{ address: string; location: GoongLocation } | null> {
    if (!API_KEY) return null;
    const url = `${REST}/Place/Detail?api_key=${API_KEY}&place_id=${encodeURIComponent(placeId)}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Goong Place Detail lỗi ${res.status}`);
    const data = await res.json();
    const r = data?.result;
    if (!r?.geometry?.location) return null;
    return { address: r.formatted_address ?? '', location: r.geometry.location as GoongLocation };
  },

  /**
   * GET /geocode — đổi chuỗi địa chỉ thành toạ độ (lat/lng).
   * Dùng khi DB chưa lưu toạ độ, cần định vị để vẽ bản đồ.
   */
  async geocode(address: string): Promise<GoongLocation | null> {
    if (!API_KEY || !address.trim()) return null;
    const url = `${REST}/geocode?api_key=${API_KEY}&address=${encodeURIComponent(address)}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Goong Geocode lỗi ${res.status}`);
    const data = await res.json();
    const loc = data?.results?.[0]?.geometry?.location;
    return (loc as GoongLocation) ?? null;
  },
};
