import { describe, it, expect } from 'vitest';
import { encodePolyline } from './routing';

describe('encodePolyline', () => {
  it('matches the reference output from Google\'s algorithm spec', () => {
    // The canonical example from the Encoded Polyline Algorithm Format docs.
    const points = [
      { lat: 38.5,  lng: -120.2 },
      { lat: 40.7,  lng: -120.95 },
      { lat: 43.252, lng: -126.453 },
    ];
    expect(encodePolyline(points)).toBe('_p~iF~ps|U_ulLnnqC_mqNvxq`@');
  });

  it('encodes a single point', () => {
    expect(encodePolyline([{ lat: 38.5, lng: -120.2 }])).toBe('_p~iF~ps|U');
  });

  it('returns empty for no points rather than throwing', () => {
    expect(encodePolyline([])).toBe('');
  });

  it('handles both hemispheres', () => {
    // Dar es Salaam to Mwanza: negative latitude, positive longitude.
    const encoded = encodePolyline([{ lat: -6.79, lng: 39.21 }, { lat: -2.52, lng: 32.9 }]);
    expect(encoded.length).toBeGreaterThan(0);
    expect(typeof encoded).toBe('string');
  });
});
