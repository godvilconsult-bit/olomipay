import type { MapMarker } from './Map';

const PIN: Record<string, { color: string; glyph: string }> = {
  dest:   { color: '#1FA463', glyph: '📍' },
  vendor: { color: '#1A130E', glyph: '🏪' },
  me:     { color: '#2563EB', glyph: '●' },
};

const MOTORBIKE = `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="36" viewBox="0 0 70 50">
  <circle cx="15" cy="38" r="9" fill="#fff" stroke="#1A130E" stroke-width="4"/>
  <circle cx="55" cy="38" r="9" fill="#fff" stroke="#1A130E" stroke-width="4"/>
  <path d="M15 38 L30 23 L44 23 L55 38" fill="none" stroke="#F15A24" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M28 23 L46 23 L44 16 L31 16 Z" fill="#F15A24"/>
  <path d="M44 23 L52 13 L59 15" fill="none" stroke="#1A130E" stroke-width="3.5" stroke-linecap="round"/>
  <path d="M55 38 L52 23" stroke="#1A130E" stroke-width="3.5" stroke-linecap="round"/>
  <circle cx="59" cy="15" r="2.6" fill="#FFB100"/>
</svg>`;

/** SVG string for a marker. Riders are drawn as a small motorbike, everyone else as a pin. */
export function markerSvg(kind: MapMarker['kind']): string {
  if (kind === 'rider') return MOTORBIKE;
  const p = PIN[kind] ?? PIN.me;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="38" height="47" viewBox="0 0 40 50"><path d="M20 0C9 0 0 9 0 20c0 13 20 30 20 30s20-17 20-30C40 9 31 0 20 0z" fill="${p.color}"/><circle cx="20" cy="19" r="13" fill="#fff"/><text x="20" y="25" font-size="16" text-anchor="middle">${p.glyph}</text></svg>`;
}

export function markerSize(kind: MapMarker['kind']): { w: number; h: number; anchorX: number; anchorY: number } {
  return kind === 'rider' ? { w: 48, h: 36, anchorX: 24, anchorY: 26 } : { w: 38, h: 47, anchorX: 19, anchorY: 47 };
}

function esc(s?: string): string {
  return (s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
}

/** Contact card HTML shown when a marker is tapped. */
export function infoHtml(m: MapMarker): string {
  const title = esc(m.name || m.shop || m.label || '');
  const rows: string[] = [];
  if (m.kind === 'rider' && m.plate) rows.push(`<div style="font-size:12px;color:#555">🏍️ ${esc(m.plate)}</div>`);
  if (m.kind === 'vendor' && m.shop) rows.push(`<div style="font-size:12px;color:#555">🏪 ${esc(m.shop)}</div>`);
  if (m.phone) rows.push(`<a href="tel:${esc(m.phone)}" style="font-size:13px;color:#F15A24;font-weight:600;text-decoration:none">📞 ${esc(m.phone)}</a>`);
  const photo = m.photo ? `<img src="${esc(m.photo)}" style="width:46px;height:46px;border-radius:50%;object-fit:cover;flex:0 0 auto"/>` : '';
  return `<div style="display:flex;gap:10px;align-items:center;font-family:Inter,system-ui,sans-serif;min-width:140px;padding:2px">
    ${photo}<div><div style="font-weight:700;color:#1A130E;font-size:14px">${title}</div>${rows.join('')}</div>
  </div>`;
}

export function hasInfo(m: MapMarker): boolean {
  return !!(m.phone || m.plate || (m.shop && m.kind === 'vendor') || m.photo);
}
