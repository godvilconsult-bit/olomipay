'use client';

import { matchRegion } from './tanzania';

export interface GeoResult {
  region: string;      // matched TZ region (or raw)
  district: string;
  ward: string;
  road: string;
  display: string;
}

// Reverse-geocode coordinates → region / district / ward using OpenStreetMap's
// free Nominatim service (no key). Used to auto-fill address fields from GPS.
export async function reverseGeocode(lat: number, lng: number): Promise<GeoResult | null> {
  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&accept-language=en&zoom=14`, {
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return null;
    const d = await res.json();
    const a = d.address ?? {};
    const rawRegion = a.state ?? a.region ?? '';
    return {
      region:   matchRegion(rawRegion) ?? rawRegion,
      district: a.county ?? a.state_district ?? a.city ?? a.town ?? a.municipality ?? '',
      ward:     a.suburb ?? a.neighbourhood ?? a.quarter ?? a.village ?? a.city_district ?? '',
      road:     a.road ?? '',
      display:  d.display_name ?? '',
    };
  } catch {
    return null;
  }
}
