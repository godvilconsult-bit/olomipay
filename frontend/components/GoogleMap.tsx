'use client';

import { useEffect, useRef, useState } from 'react';
import LeafletMap from './LeafletMap';
import type { MapMarker } from './Map';

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

const COLORS: Record<MapMarker['kind'], string> = { rider: '#F15A24', dest: '#1FA463', vendor: '#1A130E', me: '#2563EB' };
const GLYPH:  Record<MapMarker['kind'], string> = { rider: '🏍️', dest: '📍', vendor: '🏪', me: '●' };

function iconFor(google: any, kind: MapMarker['kind']) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="50" viewBox="0 0 40 50"><path d="M20 0C9 0 0 9 0 20c0 13 20 30 20 30s20-17 20-30C40 9 31 0 20 0z" fill="${COLORS[kind]}"/><circle cx="20" cy="19" r="13" fill="#fff"/><text x="20" y="25" font-size="16" text-anchor="middle">${GLYPH[kind]}</text></svg>`;
  return { url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svg), scaledSize: new google.maps.Size(38, 47), anchor: new google.maps.Point(19, 47) };
}

export default function GoogleMap({ markers, height = 200, onMarkerClick }: { markers: MapMarker[]; height?: number; onMarkerClick?: (id: string) => void }) {
  const elRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const markerRefs = useRef<Map<string, any>>(new Map());
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
      setReady(true);
    }).catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, []);

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
        if (onMarkerClick && m.id) mk.addListener('click', () => onMarkerClick(m.id!));
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

  if (failed || !KEY) return <LeafletMap markers={markers} height={height} onMarkerClick={onMarkerClick} />;
  return <div ref={elRef} style={{ height, width: '100%', borderRadius: 16, overflow: 'hidden' }} className="border border-black/10" />;
}
