'use client';

import dynamic from 'next/dynamic';

// Lazy-load ONLY the map engine actually in use — webpack splits each into its
// own chunk, so we never download Leaflet (+CSS) when Google Maps is configured,
// or the Google loader when it isn't. Big bundle/startup win on mobile.
const GoogleMap  = dynamic(() => import('./GoogleMap'),  { ssr: false });
const LeafletMap = dynamic(() => import('./LeafletMap'), { ssr: false });

export interface MapMarker {
  lat: number;
  lng: number;
  kind: 'rider' | 'dest' | 'vendor' | 'me';
  label?: string;
  id?: string;
  // Contact details shown when the marker is tapped
  name?: string;
  phone?: string;
  photo?: string;
  plate?: string;
  shop?: string;
}

export interface MapProps {
  markers: MapMarker[];
  height?: number;
  onMarkerClick?: (id: string) => void;
}

// Real Google Maps when NEXT_PUBLIC_GOOGLE_MAPS_API_KEY is configured (Uber/Bolt
// style, live markers); otherwise a free OpenStreetMap/Leaflet fallback so the
// app always works.
const HAS_GOOGLE = !!process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

export default function Map(props: MapProps) {
  return HAS_GOOGLE ? <GoogleMap {...props} /> : <LeafletMap {...props} />;
}
