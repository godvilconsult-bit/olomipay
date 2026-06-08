/**
 * Central secrets provider — the single place the app obtains its most sensitive
 * values (WALLET_DERIVATION_SECRET, ENCRYPTION_KEY, …).
 *
 * It loads them ONCE at startup from a managed secrets store (Infisical) when
 * configured, and ALWAYS falls back to process.env so existing deployments keep
 * working unchanged. `getSecret()` is synchronous (reads a warm cache) so the
 * crypto/signing layer stays simple and unchanged in shape.
 *
 * ── Moving a secret out of plain env into Infisical (free tier) ───────────────
 *   1. In Infisical, create a project and add WALLET_DERIVATION_SECRET /
 *      ENCRYPTION_KEY (and any others) to its `prod` environment.
 *   2. Create a Machine Identity (Universal Auth) with read access to it.
 *   3. Set on the backend:
 *        INFISICAL_CLIENT_ID, INFISICAL_CLIENT_SECRET, INFISICAL_PROJECT_ID,
 *        INFISICAL_ENV   (default "prod"),
 *        INFISICAL_API_URL (only for self-hosted),
 *        INFISICAL_PATH    (default "/").
 *   4. Once verified, REMOVE the raw secrets from the platform env — the app
 *      now reads them from Infisical, with access logged there.
 *
 * If Infisical is not configured, this is a transparent no-op and the app uses
 * environment variables exactly as before.
 */

const cache: Record<string, string> = {};
let loaded = false;

/** Synchronous read: managed store first, then process.env fallback. */
export function getSecret(name: string): string | undefined {
  return cache[name] ?? process.env[name];
}

/** True once a secret has been sourced from the managed store (not env). */
export function isFromVault(name: string): boolean {
  return Object.prototype.hasOwnProperty.call(cache, name);
}

/** Merged view (env + managed store) — for config validation that historically
 *  read process.env directly, so vault-sourced secrets validate correctly. */
export function secretsSnapshot(): Record<string, string | undefined> {
  return { ...process.env, ...cache };
}

/** Load secrets from the managed store into the cache. Safe to call once at boot. */
export async function loadSecrets(): Promise<void> {
  if (loaded) return;
  loaded = true;

  const clientId     = process.env.INFISICAL_CLIENT_ID;
  const clientSecret = process.env.INFISICAL_CLIENT_SECRET;
  const projectId    = process.env.INFISICAL_PROJECT_ID;
  if (!clientId || !clientSecret || !projectId) {
    console.log('[secrets] managed store not configured — using environment variables');
    return;
  }

  const base = (process.env.INFISICAL_API_URL ?? 'https://app.infisical.com').replace(/\/$/, '');
  const env  = process.env.INFISICAL_ENV  ?? 'prod';
  const path = process.env.INFISICAL_PATH ?? '/';

  try {
    // 1) Authenticate (Universal Auth machine identity)
    const auth: any = await fetch(`${base}/api/v1/auth/universal-auth/login`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ clientId, clientSecret }),
    }).then(r => r.json());
    const token = auth?.accessToken;
    if (!token) throw new Error('authentication returned no access token');

    // 2) Fetch the project's secrets for the environment
    const url = `${base}/api/v3/secrets/raw`
      + `?workspaceId=${encodeURIComponent(projectId)}`
      + `&environment=${encodeURIComponent(env)}`
      + `&secretPath=${encodeURIComponent(path)}`;
    const data: any = await fetch(url, { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json());

    let n = 0;
    for (const s of (data?.secrets ?? [])) {
      if (s?.secretKey && typeof s.secretValue === 'string') { cache[s.secretKey] = s.secretValue; n++; }
    }
    console.log(`[secrets] loaded ${n} secret(s) from managed store (${env})`);
  } catch (e: any) {
    // Never crash the boot over the secrets store — fall back to env so the app
    // still runs (e.g. during the migration window when env still holds them).
    console.error('[secrets] managed-store load FAILED — falling back to env vars:', e?.message);
  }
}
