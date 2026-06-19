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

/**
 * Bản đồ Goong hiển thị vị trí 1 căn nhà.
 * - Có sẵn lat/lng → vẽ ngay; nếu không → geocode `address` (Goong API key).
 * - Hiển thị bản đồ cần Maptiles Key (VITE_GOONG_MAPTILES_KEY).
 */
export const PropertyMap = ({ address, lat, lng, className, height = 300 }: Props) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const [status, setStatus] = useState<Status>('loading');

  useEffect(() => {
    let cancelled = false;

    const init = async () => {
      if (!MAPTILES_KEY) { setStatus('nokey'); return; }
      setStatus('loading');

      let coords: { lat: number; lng: number } | null =
        lat != null && lng != null ? { lat, lng } : null;

      if (!coords && address) {
        try { coords = await goongService.geocode(address); } catch { coords = null; }
      }
      if (cancelled) return;
      if (!coords || !containerRef.current) { setStatus('error'); return; }

      try {
        goongjs.accessToken = MAPTILES_KEY;
        const map = new goongjs.Map({
          container: containerRef.current,
          style: 'https://tiles.goong.io/assets/goong_map_web.json',
          center: [coords.lng, coords.lat],
          zoom: 15,
        });
        mapRef.current = map;
        new goongjs.Marker({ color: '#4f46e5' })
          .setLngLat([coords.lng, coords.lat])
          .addTo(map);
        map.addControl(new goongjs.NavigationControl(), 'top-right');
        map.on('load', () => { if (!cancelled) setStatus('ready'); });
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
            </>
          )}
        </div>
      )}
    </div>
  );
};
