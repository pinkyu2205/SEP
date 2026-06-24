import { useEffect, useRef, useState } from 'react';
// @ts-ignore — goong-js không kèm type definitions (xem src/types/goong-js.d.ts)
import goongjs from '@goongmaps/goong-js';
import '@goongmaps/goong-js/dist/goong-js.css';
import { MapPin, Loader2 } from 'lucide-react';
import { goongService } from '../services/goong.service';

interface Props {
  /** Địa chỉ để geocode (dùng khi chưa có sẵn toạ độ). */
  address?: string;
  /** Toạ độ có sẵn — nếu truyền sẽ bỏ qua geocode. */
  lat?: number;
  lng?: number;
  className?: string;
  height?: number;
}

type Status = 'loading' | 'ready' | 'error' | 'nokey';

const MAPTILES_KEY = import.meta.env.VITE_GOONG_MAPTILES_KEY;

// ─── Giới hạn vùng Việt Nam ──────────────────────────────────────────────────
// Khung chặn kéo map ra ngoài VN [ [Tây, Nam], [Đông, Bắc] ] (lng, lat).
const VN_BOUNDS: [[number, number], [number, number]] = [[102.0, 8.0], [110.0, 23.5]];

// Vòng phủ toàn cầu (góc ngoài) — dùng để "đục lỗ" chừa ra đất liền VN.
const WORLD_RING: [number, number][] = [[-180, -85], [180, -85], [180, 85], [-180, 85], [-180, -85]];

// Ranh giới thô đất liền VN [lng, lat] — đã lọc biển đảo, dùng làm lỗ của mask.
const VN_MAINLAND: [number, number][] = [
  [105.15, 22.82], [105.29, 23.39], [105.35, 23.37], [105.73, 23.12],
  [105.89, 22.56], [106.63, 22.61], [106.72, 22.12], [108.05, 21.53],
  [106.75, 20.85], [106.25, 20.25], [106.01, 19.92], [105.77, 18.73],
  [106.45, 17.80], [107.05, 17.15], [108.20, 16.20], [108.95, 15.25],
  [109.25, 14.15], [109.43, 12.91], [109.30, 11.95], [108.25, 10.95],
  [107.11, 10.29], [106.25, 10.25], [106.50, 9.60], [105.25, 9.15],
  [104.81, 8.56], [103.95, 9.25], [104.05, 10.15], [104.51, 10.55],
  [105.15, 10.99], [105.85, 11.35], [105.99, 11.99], [107.55, 12.95],
  [107.51, 14.35], [107.55, 14.65], [107.41, 15.25], [107.35, 16.15],
  [106.65, 16.55], [106.21, 17.15], [105.71, 18.15], [105.15, 18.45],
  [104.11, 19.01], [104.01, 20.25], [103.11, 20.65], [102.75, 21.21],
  [102.15, 22.15], [102.11, 22.51], [102.95, 22.42], [103.55, 22.85],
  [104.55, 22.89], [105.15, 22.82],
];

/**
 * Bản đồ Goong hiển thị vị trí 1 căn nhà.
 * - Có sẵn lat/lng → vẽ ngay; nếu không → geocode `address` (Goong API key).
 * - Hiển thị bản đồ cần Maptiles Key (VITE_GOONG_MAPTILES_KEY).
 */
export const PropertyMap = ({ address, lat, lng, className, height = 300 }: Props) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const [status, setStatus] = useState<Status>('loading');
  const [errMsg, setErrMsg] = useState('');

  useEffect(() => {
    let cancelled = false;

    const init = async () => {
      if (!MAPTILES_KEY) { setStatus('nokey'); return; }
      setStatus('loading');
      setErrMsg('');

      let coords: { lat: number; lng: number } | null =
        lat != null && lng != null ? { lat, lng } : null;
      let failReason = '';

      if (!coords && address) {
        // 1) Thử geocode trực tiếp
        try { coords = await goongService.geocode(address); }
        catch (e: any) { failReason = `Geocode: ${e?.message ?? e}`; }
        // 2) Geocode fail (địa chỉ tự do không chuẩn) → Autocomplete lấy place_id → Place Detail
        if (!coords) {
          try {
            const preds = await goongService.autocomplete(address);
            if (preds[0]) {
              const detail = await goongService.placeDetail(preds[0].place_id);
              if (detail?.location) coords = detail.location;
              else failReason = 'Place Detail không có toạ độ';
            } else {
              failReason = failReason || 'Goong trả 0 kết quả cho địa chỉ này (key OK nhưng địa chỉ khó đọc)';
            }
          } catch (e: any) { failReason = `Autocomplete: ${e?.message ?? e}`; }
        }
      }
      if (cancelled) return;
      if (!coords || !containerRef.current) {
        if (failReason) console.warn('[PropertyMap]', failReason, '| address:', address);
        setErrMsg(failReason);
        setStatus('error');
        return;
      }

      try {
        goongjs.accessToken = MAPTILES_KEY;
        const map = new goongjs.Map({
          container: containerRef.current,
          style: 'https://tiles.goong.io/assets/goong_map_web.json',
          center: [coords.lng, coords.lat],
          zoom: 15,
          minZoom: 5,            // không zoom ra xa thấy cả thế giới
          maxZoom: 18,
          maxBounds: VN_BOUNDS,  // chặn kéo map ra ngoài Việt Nam
        });
        mapRef.current = map;
        new goongjs.Marker({ color: '#4f46e5' })
          .setLngLat([coords.lng, coords.lat])
          .addTo(map);
        map.addControl(new goongjs.NavigationControl(), 'top-right');
        map.on('load', () => {
          if (cancelled) return;
          // Inverted polygon: phủ xám toàn cầu, đục lỗ theo đất liền VN → ẩn biển & nước khác
          try {
            map.addSource('vn-mask', {
              type: 'geojson',
              data: {
                type: 'Feature',
                properties: {},
                geometry: { type: 'Polygon', coordinates: [WORLD_RING, VN_MAINLAND] },
              },
            });
            map.addLayer({
              id: 'vn-mask',
              type: 'fill',
              source: 'vn-mask',
              paint: { 'fill-color': '#e5e7eb', 'fill-opacity': 1 },
            });
          } catch { /* không thêm được mask thì bỏ qua, map vẫn hiện */ }
          setStatus('ready');
        });
      } catch {
        setStatus('error');
      }
    };

    init();
    return () => {
      cancelled = true;
      if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; }
    };
  }, [address, lat, lng]);

  return (
    <div className={className} style={{ position: 'relative', height }}>
      <div
        ref={containerRef}
        style={{ position: 'absolute', inset: 0, borderRadius: 16, overflow: 'hidden' }}
      />
      {status !== 'ready' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-slate-200 bg-slate-50 text-center">
          {status === 'loading' && (
            <>
              <Loader2 className="h-6 w-6 animate-spin text-indigo-400" />
              <p className="text-sm font-semibold text-slate-500">Đang tải bản đồ...</p>
            </>
          )}
          {status === 'nokey' && (
            <>
              <MapPin className="h-6 w-6 text-amber-400" />
              <p className="px-4 text-sm font-semibold text-amber-600">
                Chưa cấu hình <code>VITE_GOONG_MAPTILES_KEY</code>
              </p>
            </>
          )}
          {status === 'error' && (
            <>
              <MapPin className="h-6 w-6 text-slate-300" />
              <p className="px-4 text-sm font-semibold text-slate-500">
                Không định vị được địa chỉ trên bản đồ
              </p>
              {errMsg && (
                <p className="px-4 text-xs font-medium text-rose-500 mt-1 max-w-md break-words">
                  {errMsg}
                </p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
};
