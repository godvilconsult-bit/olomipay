/**
 * Boot-time secret/config validator.
 *
 * Sensitive money app → a misconfigured secret must NOT boot silently. This runs
 * at startup: on mainnet it HARD-FAILS on any critical problem; on testnet it logs
 * loud warnings. It never prints secret VALUES — only their health.
 *
 * The most important guard is WALLET_DERIVATION_SECRET: it is the backbone of every
 * user's recoverable wallet address. If it is unset it silently falls back to
 * ENCRYPTION_KEY; if either ever CHANGES, every derived address changes and users
 * lose access to their funds. So it must be set explicitly, be strong, and never change.
 */

type Severity = 'critical' | 'warning' | 'ok';
interface Check { key: string; severity: Severity; message: string }

const PLACEHOLDERS = [
  'change_me', 'changeme', 'your_', 'xxxx', 'replace', 'example', 'placeholder',
  'another_random', 'random_64', 'dev-secret', 'secret_here',
];

function isWeak(v: string | undefined, minLen = 24): boolean {
  if (!v) return true;
  if (v.length < minLen) return true;
  if (/^0+$/.test(v)) return true;                       // all-zeros default
  const low = v.toLowerCase();
  return PLACEHOLDERS.some(p => low.includes(p));
}

export interface EnvReport {
  ok: boolean;
  isMainnet: boolean;
  critical: Check[];
  warnings: Check[];
  /** Redacted health for the admin UI — never contains secret values. */
  redacted: Record<string, { set: boolean; healthy: boolean }>;
}

export function validateEnv(): EnvReport {
  const env = process.env;
  // Gate strictly on the Stellar network (real funds) — NOT on NODE_ENV. Railway sets
  // NODE_ENV=production even on testnet, and we must never kill a working testnet deploy.
  const isMainnet = env.STELLAR_NETWORK === 'mainnet';
  const checks: Check[] = [];

  const critical = (key: string, weak: boolean, msg: string) =>
    checks.push({ key, severity: weak ? 'critical' : 'ok', message: weak ? msg : 'set' });
  const warn = (key: string, bad: boolean, msg: string) =>
    checks.push({ key, severity: bad ? 'warning' : 'ok', message: bad ? msg : 'ok' });

  // ── Critical secrets ──────────────────────────────────────────────────────
  critical('DATABASE_URL', !env.DATABASE_URL, 'DATABASE_URL is not set');
  critical('JWT_SECRET', isWeak(env.JWT_SECRET, 32), 'JWT_SECRET missing/weak/placeholder (need ≥32 random chars)');
  critical('JWT_REFRESH_SECRET', isWeak(env.JWT_REFRESH_SECRET, 32), 'JWT_REFRESH_SECRET missing/weak/placeholder');
  critical('ENCRYPTION_KEY', isWeak(env.ENCRYPTION_KEY, 32), 'ENCRYPTION_KEY missing/weak/all-zeros (need a strong 64-hex key)');
  critical('STELLAR_SECRET_KEY', !/^S[A-Z2-7]{55}$/.test(env.STELLAR_SECRET_KEY ?? ''), 'STELLAR_SECRET_KEY missing or malformed');

  // WALLET_DERIVATION_SECRET — the fund-recovery backbone.
  if (!env.WALLET_DERIVATION_SECRET) {
    checks.push({
      key: 'WALLET_DERIVATION_SECRET', severity: isMainnet ? 'critical' : 'warning',
      message: 'NOT SET — falling back to ENCRYPTION_KEY. Set a dedicated, permanent, backed-up value. ' +
               'Changing it later changes every user wallet address (funds become unreachable).',
    });
  } else {
    critical('WALLET_DERIVATION_SECRET', isWeak(env.WALLET_DERIVATION_SECRET, 32), 'WALLET_DERIVATION_SECRET is weak/placeholder');
  }

  // JWT secrets must differ from each other.
  if (env.JWT_SECRET && env.JWT_SECRET === env.JWT_REFRESH_SECRET)
    checks.push({ key: 'JWT_SECRET', severity: 'critical', message: 'JWT_SECRET and JWT_REFRESH_SECRET must be different' });

  // ── Mainnet consistency warnings ──────────────────────────────────────────
  if (isMainnet) {
    warn('STELLAR_HORIZON_URL', (env.STELLAR_HORIZON_URL ?? '').includes('testnet'), 'mainnet but Horizon URL points at testnet');
    warn('YELLOWCARD_ENV', env.YELLOWCARD_ENV !== 'production', 'mainnet but YELLOWCARD_ENV is not "production"');
    warn('MPESA_ENV', env.MPESA_ENV === 'sandbox', 'mainnet but MPESA_ENV is "sandbox"');
    warn('FEE_WALLET_SECRET', !env.FEE_WALLET_SECRET && !env.FEE_ACCOUNT, 'no dedicated fee wallet configured (fees fall back to platform wallet)');
  }
  warn('SELCOM_API_SECRET', !env.SELCOM_API_SECRET, 'SELCOM_API_SECRET unset — bill HMAC uses an insecure dev default');
  warn('ADMIN_PHONE', !env.ADMIN_PHONE, 'ADMIN_PHONE unset — using the hard-coded default owner number');

  const criticalList = checks.filter(c => c.severity === 'critical');
  const warnings     = checks.filter(c => c.severity === 'warning');

  const redacted: EnvReport['redacted'] = {};
  for (const key of ['DATABASE_URL', 'JWT_SECRET', 'JWT_REFRESH_SECRET', 'ENCRYPTION_KEY',
    'WALLET_DERIVATION_SECRET', 'STELLAR_SECRET_KEY', 'FEE_WALLET_SECRET', 'YELLOWCARD_API_KEY']) {
    const set = !!env[key];
    const bad = checks.find(c => c.key === key && c.severity !== 'ok');
    redacted[key] = { set, healthy: set && !bad };
  }

  return { ok: criticalList.length === 0, isMainnet, critical: criticalList, warnings, redacted };
}

/** Run at boot. Throws on mainnet if anything critical is wrong. */
export function assertEnvOrWarn(): EnvReport {
  const r = validateEnv();
  for (const c of r.warnings) console.warn(`[envCheck] ⚠ ${c.key}: ${c.message}`);
  for (const c of r.critical) console.error(`[envCheck] ✖ ${c.key}: ${c.message}`);

  if (!r.ok) {
    if (r.isMainnet) {
      console.error('[envCheck] CRITICAL config problems on mainnet — refusing to start.');
      throw new Error('Critical secret/config validation failed (mainnet). Fix the above and redeploy.');
    }
    console.error('[envCheck] CRITICAL config problems (testnet) — booting anyway; FIX before mainnet.');
  } else {
    console.log(`[envCheck] ✓ secrets OK (${r.isMainnet ? 'mainnet' : 'testnet'} mode)`);
  }
  return r;
}
