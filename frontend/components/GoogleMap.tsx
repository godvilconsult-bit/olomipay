'use client';

import { useEffect, useRef, useState } from 'react';
import LeafletMap from './LeafletMap';
import { markerSvg, markerSize, infoHtml, hasInfo } from './mapIcons';
import type { MapMarker, MapProps } from './Map';
import { decodePolyline } from '../lib/polyline';

const KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

let loaderPromise: Promise<any> | null = null;
function loadGoogle(): Promise<any> {
  if (typeof window === 'undefined') return Promise.reject();
  const w = window as any;
  if (w.google?.maps) return Promise.resolve(w.google);
  if (loaderPromise) return loaderPromise;
  loaderPromise = new Promise((resolve, reject) => {
    w.__gmapsCb = () => resolve(w.google);
    const s = document.createElement('script');
    s.src = `https://maps.googleapis.com/maps/api/js?key=${KEY}&callback=__gmapsCb&loading=async`;
    s.async = true;
    s.onerror = reject;
    document.head.appendChild(s);
  });
  return loaderPromise;
}

function iconFor(google: any, kind: MapMarker['kind']) {
  const { w, h, anchorX, anchorY } = markerSize(kind);
  return {
    url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(markerSvg(kind)),
    scaledSize: new google.maps.Size(w, h),
    anchor: new google.maps.Point(anchorX, anchorY),
  };
}

/** Same progress colours as the Leaflet engine, so the two look alike. */
const LEG_STYLE: Record<string, { strokeColor: string; strokeWeight: number; strokeOpacity: number }> = {
  DONE:    { strokeColor: '#8A8580', strokeWeight: 4, strokeOpacity: 0.55 },
  ACTIVE:  { strokeColor: '#F15A24', strokeWeight: 6, strokeOpacity: 0.95 },
  PENDING: { strokeColor: '#F15A24', strokeWeight: 4, strokeOpacity: 0.40 },
};

export default function GoogleMap({ markers, height = 200, onMarkerClick, routes }: MapProps) {
  const elRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const infoRef = useRef<any>(null);
  const markerRefs = useRef<Map<string, any>>(new Map());
  const legRefs = useRef<any[]>([]);
  const prevKeys = useRef<string>('');
  const [failed, setFailed] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let alive = true;
    loadGoogle().then((google) => {
      if (!alive || !elRef.current) return;
      mapRef.current = new google.maps.Map(elRef.current, {
        center: { lat: -6.7924, lng: 39.2083 }, zoom: 13,
        disableDefaultUI: true, zoomControl: true, gestureHandling: 'greedy', clickableIcons: false,
      });
      infoRef.current = new google.maps.InfoWindow();
      setReady(true);
    }).catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, []);

  /**
   * Journey legs. This engine previously drew no route at all — only Leaflet
   * did — so a Google-key deployment showed bare pins with no path between them.
   */
  useEffect(() => {
    const google = (window as any).google;
    const map = mapRef.current;
    if (!ready || !google || !map) return;

    legRefs.current.forEach(l => l.setMap(null));
    legRefs.current = [];
    if (!routes?.length) return;

    const bounds = new google.maps.LatLngBounds();
    let any = false;
    for (const leg of routes) {
      const path = decodePolyline(leg.polyline);
      if (path.length < 2) continue;
      legRefs.current.push(new google.maps.Polyline({
        path, map, ...(LEG_STYLE[leg.status ?? 'PENDING'] ?? LEG_STYLE.PENDING),
      }));
      path.forEach(p => bounds.extend(p));
      any = true;
    }
    // Let the marker effect own the camera when a rider is being followed.
    if (any && !markers.some(m => m.kind === 'rider')) map.fitBounds(bounds, 40);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routes, ready]);

  useEffect(() => {
    const google = (window as any).google;
    const map = mapRef.current;
    if (!ready || !google || !map) return;
    const valid = markers.filter((m) => typeof m.lat === 'number' && typeof m.lng === 'number');
    const seen = new Set<string>();
    const bounds = new google.maps.LatLngBounds();
    valid.forEach((m, i) => {
      const key = m.id || m.kind || `m${i}`;
      seen.add(key);
      const pos = { lat: m.lat, lng: m.lng };
      let mk = markerRefs.current.get(key);
      if (mk) { mk.setPosition(pos); }
      else {
        mk = new google.maps.Marker({ position: pos, map, icon: iconFor(google, m.kind), title: m.label });
        mk.addListener('click', () => {
          if (onMarkerClick && m.id) { onMarkerClick(m.id); return; }
          if (hasInfo(m)) { infoRef.current.setContent(infoHtml(m)); infoRef.current.open({ anchor: mk, map }); }
        });
        markerRefs.current.set(key, mk);
      }
      bounds.extend(pos);
    });
    for (const [k, mk] of markerRefs.current) if (!seen.has(k)) { mk.setMap(null); markerRefs.current.delete(k); }
    const keysStr = [...seen].sort().join(',');
    if (keysStr !== prevKeys.current) {
      prevKeys.current = keysStr;
      if (valid.length === 1) { map.setCenter(bounds.getCenter()); map.setZoom(15); }
      else if (valid.length > 1) map.fitBounds(bounds, 48);
    }
  }, [markers, ready, onMarkerClick]);

  // `routes` must be forwarded: without it a failed Google load would silently
  // drop the journey lines rather than degrading to the Leaflet rendering.
  if (failed || !KEY) return <LeafletMap markers={markers} height={height} onMarkerClick={onMarkerClick} routes={routes} />;
  return <div ref={elRef} style={{ height, width: '100%', borderRadius: 16, overflow: 'hidden' }} className="border border-black/10" />;
}
