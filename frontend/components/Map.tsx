'use client';

import { useEffect, useRef } from 'react';
import L from 'leaflet';

export interface MapMarker {
  lat: number;
  lng: number;
  kind: 'rider' | 'dest' | 'vendor' | 'me';
  label?: string;
  id?: string;
}

const EMOJI: Record<MapMarker['kind'], string> = { rider: '🏍️', dest: '📍', vendor: '🏪', me: '🟢' };

function icon(kind: MapMarker['kind']) {
  return L.divIcon({
    className: '',
    html: `<div style="font-size:26px;line-height:1;filter:drop-shadow(0 2px 3px rgba(0,0,0,.45))">${EMOJI[kind]}</div>`,
    iconSize: [26, 26],
    iconAnchor: [13, 24],
  });
}

export default function Map({ markers, height = 200, onMarkerClick }: { markers: MapMarker[]; height?: number; onMarkerClick?: (id: string) => void }) {
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
      const mk = L.marker([m.lat, m.lng], { icon: icon(m.kind) }).addTo(layer);
      if (m.label) mk.bindTooltip(m.label, { direction: 'top', offset: [0, -20] });
      if (m.id && onMarkerClick) mk.on('click', () => onMarkerClick(m.id!));
      pts.push([m.lat, m.lng]);
    }
    if (pts.length === 1) map.setView(pts[0], 15);
    else if (pts.length > 1) map.fitBounds(L.latLngBounds(pts).pad(0.4));
  }, [markers, onMarkerClick]);

  return <div ref={elRef} style={{ height, width: '100%', borderRadius: 16, overflow: 'hidden', zIndex: 0 }} className="border border-black/10" />;
}
