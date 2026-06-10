'use client';

import { useEffect, useRef } from 'react';
import L from 'leaflet';

export interface MapMarker {
  lat: number;
  lng: number;
  kind: 'rider' | 'dest' | 'vendor';
  label?: string;
}

const EMOJI: Record<MapMarker['kind'], string> = { rider: '🏍️', dest: '📍', vendor: '🏪' };

function icon(kind: MapMarker['kind']) {
  return L.divIcon({
    className: '',
    html: `<div style="font-size:24px;line-height:1;filter:drop-shadow(0 2px 3px rgba(0,0,0,.4))">${EMOJI[kind]}</div>`,
    iconSize: [24, 24],
    iconAnchor: [12, 22],
  });
}

export default function Map({ markers, height = 200 }: { markers: MapMarker[]; height?: number }) {
  const elRef    = useRef<HTMLDivElement>(null);
  const mapRef   = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);

  useEffect(() => {
    if (!elRef.current || mapRef.current) return;
    const map = L.map(elRef.current, { zoomControl: false, attributionControl: false });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map);
    layerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;
    map.setView([-6.7924, 39.2083], 13);
    return () => { map.remove(); mapRef.current = null; };
  }, []);

  useEffect(() => {
    const map = mapRef.current, layer = layerRef.current;
    if (!map || !layer) return;
    layer.clearLayers();
    const pts: [number, number][] = [];
    for (const m of markers.filter((x) => typeof x.lat === 'number' && typeof x.lng === 'number')) {
      L.marker([m.lat, m.lng], { icon: icon(m.kind) }).addTo(layer);
      pts.push([m.lat, m.lng]);
    }
    if (pts.length === 1) map.setView(pts[0], 15);
    else if (pts.length > 1) map.fitBounds(L.latLngBounds(pts).pad(0.4));
  }, [markers]);

  return <div ref={elRef} style={{ height, width: '100%', borderRadius: 16, overflow: 'hidden', zIndex: 0 }} className="border border-black/5" />;
}
