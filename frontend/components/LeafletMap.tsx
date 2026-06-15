'use client';

import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { Maximize2, Minimize2, LocateFixed } from 'lucide-react';
import { markerSvg, markerSize, infoHtml, hasInfo } from './mapIcons';
import type { MapMarker } from './Map';

function makeIcon(m: MapMarker) {
  const { w, h, anchorX, anchorY } = markerSize(m.kind);
  return L.divIcon({
    className: '',
    html: `<div style="filter:drop-shadow(0 2px 3px rgba(0,0,0,.35))">${markerSvg(m.kind, m.vehicle)}</div>`,
    iconSize: [w, h],
    iconAnchor: [anchorX, anchorY],
  });
}

const easeInOut = (k: number) => (k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2);

export default function LeafletMap({ markers, height = 200, onMarkerClick }: { markers: MapMarker[]; height?: number; onMarkerClick?: (id: string) => void }) {
  const elRef    = useRef<HTMLDivElement>(null);
  const mapRef   = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);   // static markers (dest/vendor/me)
  const riderRef = useRef<L.Marker | null>(null);       // persistent, smoothly animated
  const routeRef = useRef<L.Polyline | null>(null);
  const animRef  = useRef<number | null>(null);
  const followRef = useRef(true);                        // camera follows the rider (Uber-style)
  const fittedRef = useRef(false);
  const [full, setFull]   = useState(false);
  const [offCenter, setOffCenter] = useState(false);     // user panned away → show "recenter"

  useEffect(() => {
    if (!elRef.current || mapRef.current) return;
    const map = L.map(elRef.current, { zoomControl: false, attributionControl: false });
    // Carto Voyager — clean, muted, "premium" basemap (vs raw OSM clutter).
    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', { maxZoom: 20, subdomains: 'abcd' }).addTo(map);
    layerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;
    map.setView([-6.7924, 39.2083], 14);
    map.on('dragstart', () => { followRef.current = false; setOffCenter(true); });
    return () => { if (animRef.current) cancelAnimationFrame(animRef.current); map.remove(); mapRef.current = null; riderRef.current = null; routeRef.current = null; };
  }, []);

  // fullscreen → the container resized, tell Leaflet to recompute.
  useEffect(() => { const m = mapRef.current; if (m) setTimeout(() => m.invalidateSize(), 180); }, [full]);

  function animateRider(target: L.LatLng) {
    const marker = riderRef.current; if (!marker) return;
    if (animRef.current) cancelAnimationFrame(animRef.current);
    const start = marker.getLatLng();
    if (start.distanceTo(target) < 1) { marker.setLatLng(target); return; }
    const t0 = performance.now(), dur = 900;
    const step = (now: number) => {
      const k = Math.min(1, (now - t0) / dur), e = easeInOut(k);
      marker.setLatLng(L.latLng(start.lat + (target.lat - start.lat) * e, start.lng + (target.lng - start.lng) * e));
      if (k < 1) animRef.current = requestAnimationFrame(step);
    };
    animRef.current = requestAnimationFrame(step);
  }

  useEffect(() => {
    const map = mapRef.current, layer = layerRef.current;
    if (!map || !layer) return;
    const valid  = markers.filter((x) => typeof x.lat === 'number' && typeof x.lng === 'number');
    const rider  = valid.find((m) => m.kind === 'rider');
    const others = valid.filter((m) => m.kind !== 'rider');

    // Static markers (don't move) — rebuild each render.
    layer.clearLayers();
    const pts: [number, number][] = [];
    for (const m of others) {
      const mk = L.marker([m.lat, m.lng], { icon: makeIcon(m) }).addTo(layer);
      if (onMarkerClick && m.id) mk.on('click', () => onMarkerClick(m.id!));
      else if (hasInfo(m)) mk.bindPopup(infoHtml(m));
      else if (m.label) mk.bindTooltip(m.label, { direction: 'top', offset: [0, -20] });
      pts.push([m.lat, m.lng]);
    }

    if (rider) {
      const target = L.latLng(rider.lat, rider.lng);
      const dest = others.find((m) => m.kind === 'dest') ?? others.find((m) => m.kind === 'me');
      if (!riderRef.current) {
        riderRef.current = L.marker(target, { icon: makeIcon(rider), zIndexOffset: 1000 }).addTo(map);
        if (hasInfo(rider)) riderRef.current.bindPopup(infoHtml(rider));
      } else {
        riderRef.current.setIcon(makeIcon(rider));
        animateRider(target);
      }
      // Route line rider → destination.
      const line: [number, number][] = dest ? [[rider.lat, rider.lng], [dest.lat, dest.lng]] : [];
      if (line.length) {
        if (!routeRef.current) routeRef.current = L.polyline(line, { color: '#F15A24', weight: 4, opacity: 0.65, dashArray: '1 9', lineCap: 'round' }).addTo(map);
        else routeRef.current.setLatLngs(line);
      }
      // Follow-camera: frame rider + dest once, then track the rider.
      if (followRef.current) {
        if (!fittedRef.current && dest) { map.fitBounds(L.latLngBounds([[rider.lat, rider.lng], [dest.lat, dest.lng]]).pad(0.5), { maxZoom: 16 }); fittedRef.current = true; }
        else map.panTo(target, { animate: true, duration: 0.6 });
      }
    } else {
      if (riderRef.current) { map.removeLayer(riderRef.current); riderRef.current = null; }
      if (routeRef.current) { map.removeLayer(routeRef.current); routeRef.current = null; }
      fittedRef.current = false;
      if (pts.length === 1) map.setView(pts[0], 15);
      else if (pts.length > 1) map.fitBounds(L.latLngBounds(pts).pad(0.4));
    }
  }, [markers, onMarkerClick]);

  function recenter() {
    followRef.current = true; fittedRef.current = false; setOffCenter(false);
    const map = mapRef.current, r = riderRef.current;
    if (map && r) map.panTo(r.getLatLng(), { animate: true });
  }

  return (
    <div className={full ? 'fixed inset-0 z-[100] bg-white' : 'relative'}>
      <div ref={elRef} style={{ height: full ? '100%' : height, width: '100%', borderRadius: full ? 0 : 16, overflow: 'hidden', zIndex: 0 }} className={full ? '' : 'border border-black/10'} />
      <button onClick={() => setFull((f) => !f)} aria-label="Fullscreen map" className="absolute right-2 top-2 z-[110] grid h-9 w-9 place-items-center rounded-xl bg-white text-ink/70 shadow-ds-card active:scale-95">{full ? <Minimize2 size={17} /> : <Maximize2 size={17} />}</button>
      {offCenter && riderRef.current && <button onClick={recenter} aria-label="Recenter on rider" className="absolute bottom-2 right-2 z-[110] grid h-9 w-9 place-items-center rounded-xl bg-white text-flame shadow-ds-card active:scale-95"><LocateFixed size={17} /></button>}
    </div>
  );
}
