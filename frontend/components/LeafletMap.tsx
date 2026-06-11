'use client';

import { useEffect, useRef } from 'react';
import L from 'leaflet';
import { markerSvg, markerSize, infoHtml, hasInfo } from './mapIcons';
import type { MapMarker } from './Map';

function icon(kind: MapMarker['kind']) {
  const { w, h, anchorX, anchorY } = markerSize(kind);
  return L.divIcon({
    className: '',
    html: `<div style="filter:drop-shadow(0 2px 2px rgba(0,0,0,.4))">${markerSvg(kind)}</div>`,
    iconSize: [w, h],
    iconAnchor: [anchorX, anchorY],
  });
}

export default function LeafletMap({ markers, height = 200, onMarkerClick }: { markers: MapMarker[]; height?: number; onMarkerClick?: (id: string) => void }) {
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
      if (onMarkerClick && m.id) mk.on('click', () => onMarkerClick(m.id!));
      else if (hasInfo(m)) mk.bindPopup(infoHtml(m));
      else if (m.label) mk.bindTooltip(m.label, { direction: 'top', offset: [0, -20] });
      pts.push([m.lat, m.lng]);
    }
    if (pts.length === 1) map.setView(pts[0], 15);
    else if (pts.length > 1) map.fitBounds(L.latLngBounds(pts).pad(0.4));
  }, [markers, onMarkerClick]);

  return <div ref={elRef} style={{ height, width: '100%', borderRadius: 16, overflow: 'hidden', zIndex: 0 }} className="border border-black/10" />;
}
