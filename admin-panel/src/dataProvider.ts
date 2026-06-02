import { DataProvider, fetchUtils } from 'react-admin';

const API = import.meta.env.VITE_API_URL ?? 'http://localhost:3001';

function token() { return localStorage.getItem('olomipay_admin_at') ?? ''; }

const http = (url: string, options: any = {}) => {
  options.headers = new Headers({ Accept: 'application/json', ...(options.headers || {}) });
  options.headers.set('Authorization', `Bearer ${token()}`);
  return fetchUtils.fetchJson(url, options);
};

/**
 * Adapts React-Admin's expectations to OlomiPay's existing /api/admin endpoints,
 * which return { success, data: { users|transactions|logs, total, ... } }.
 */
export const dataProvider: DataProvider = {
  getList: async (resource, params) => {
    const { page = 1, perPage = 25 } = params.pagination ?? {};
    const q = new URLSearchParams({ page: String(page), limit: String(perPage) });
    const f = params.filter ?? {};
    if (f.q)    q.set('q', f.q);
    if (f.from) q.set('from', f.from);
    if (f.to)   q.set('to', f.to);

    const path = resource === 'audit' ? '/audit' : `/${resource}`;
    const { json } = await http(`${API}/api/admin${path}?${q}`);
    const d = json.data ?? {};
    const list = d[resource] ?? d.logs ?? d.users ?? d.transactions ?? [];
    return { data: list, total: d.total ?? list.length };
  },

  getOne: async (resource, params) => {
    const { json } = await http(`${API}/api/admin/${resource}/${params.id}`);
    const rec = json.data?.user ?? json.data ?? {};
    return { data: { id: params.id, ...rec, _full: json.data } };
  },

  getMany: async (resource, params) => {
    const results = await Promise.all(
      params.ids.map(id => http(`${API}/api/admin/${resource}/${id}`).then(r => ({ id, ...(r.json.data?.user ?? r.json.data) })).catch(() => ({ id })))
    );
    return { data: results };
  },

  getManyReference: async () => ({ data: [], total: 0 }),

  update: async (resource, params) => {
    // Updates go through dedicated action endpoints (see custom buttons); no-op here.
    return { data: { id: params.id, ...params.data } as any };
  },

  create:        async (_r, params) => ({ data: { id: '', ...params.data } as any }),
  delete:        async (_r, params) => ({ data: { id: params.id } as any }),
  deleteMany:    async (_r, params) => ({ data: params.ids }),
  updateMany:    async (_r, params) => ({ data: params.ids }),
};

/** Helper for custom support actions (POST). */
export async function adminAction(path: string, body?: any) {
  const r = await fetch(`${API}/api/admin${path}`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
    body:    body ? JSON.stringify(body) : undefined,
  });
  const json = await r.json();
  if (!json.success) throw new Error(json.error ?? 'Action failed');
  return json.data;
}
