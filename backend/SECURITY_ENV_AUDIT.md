# OlomiPay — Production Secret & Config Audit

Date: 2026-06. Scope: backend env/secret handling, git hygiene, boot safety.

## Summary

| Area | Result |
|------|--------|
| Secrets committed to git | ✅ **None** — only `.env.example` templates + a public API URL are tracked |
| `.gitignore` covers `.env*` | ✅ Yes (`.env`, `.env.local`, `*.env`) |
| JWT / encryption secrets fail-closed | ✅ Use `process.env.X!` (no weak inline default) |
| `WALLET_DERIVATION_SECRET` documented | ⚠ → ✅ **Fixed** (was undocumented; now in `.env.example` with warnings) |
| Boot-time secret validation | ❌ → ✅ **Added** (`services/envCheck.ts`, fails closed on mainnet) |
| `.env.example` ships placeholder `ENCRYPTION_KEY` | ⚠ all-zeros — now flagged by the validator + commented |
| Admin visibility of config health | ❌ → ✅ **Added** (`/api/admin/support/config-health` + Ops page) |

No live secret values were exposed in the repo or history.

## Critical secrets (boot validator HARD-FAILS on mainnet if missing/weak)

- `DATABASE_URL`
- `JWT_SECRET`, `JWT_REFRESH_SECRET` — ≥32 chars, must differ from each other
- `ENCRYPTION_KEY` — strong 64-hex; encrypts every user's Stellar secret
- `STELLAR_SECRET_KEY` — platform wallet (`S…`, 56 chars)
- `WALLET_DERIVATION_SECRET` — **the fund-recovery backbone** (see below)

### Why `WALLET_DERIVATION_SECRET` is the most important value
Wallets are derived deterministically: `address = f(HMAC(WALLET_DERIVATION_SECRET, phone))`.
Same phone → same address → recoverable funds. Therefore:
- It must be **set explicitly** (not left to fall back to `ENCRYPTION_KEY`).
- It must be **strong and random** (`openssl rand -hex 32`).
- It must be **backed up** and **never changed**. Changing it (or `ENCRYPTION_KEY` while
  it's the fallback) re-derives every address → **all user funds become unreachable.**

## What was added

1. **`services/envCheck.ts`** — runs at boot. Mainnet → throws + `process.exit(1)` on any
   critical problem. Testnet → loud warnings only. Never logs secret values.
2. **`index.ts`** — calls `assertEnvOrWarn()` first thing on listen.
3. **`/api/admin/support/config-health`** — redacted booleans (`set` / `healthy`) for the
   admin UI. Surfaced on the **Operations** page as a Config-health panel.
4. **`.env.example`** — documented the previously-missing keys: `WALLET_DERIVATION_SECRET`,
   `STELLAR_PUBLIC_KEY`, `FEE_WALLET_PUBLIC/SECRET`, `YELLOWCARD_*`, `VAPID_*`,
   `ADMIN_PHONE/ADMIN_PHONES`, `ACTIVATION_FEE_USD`, with generation commands + warnings.

## Pre-mainnet checklist (set in Railway → Variables)

- [ ] `WALLET_DERIVATION_SECRET` = `openssl rand -hex 32` — **store a backup offline**
- [ ] `ENCRYPTION_KEY` = `openssl rand -hex 32` (replace the all-zeros placeholder)
- [ ] `JWT_SECRET` and `JWT_REFRESH_SECRET` = two *different* `openssl rand -hex 32`
- [ ] `STELLAR_SECRET_KEY` / `STELLAR_PUBLIC_KEY` = funded mainnet platform wallet
- [ ] `FEE_WALLET_PUBLIC` (+ `FEE_WALLET_SECRET`) = dedicated mainnet fee wallet
- [ ] `STELLAR_NETWORK=mainnet`, `STELLAR_HORIZON_URL` = mainnet Horizon
- [ ] `YELLOWCARD_ENV=production` + real `YELLOWCARD_API_KEY` / `YELLOWCARD_SECRET`
- [ ] `MPESA_ENV=production` (if used) + real Daraja creds
- [ ] `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` for web push
- [ ] `ADMIN_PHONE` set to the real owner number
- [ ] Confirm **Operations → Config health** shows "No critical config problems · mainnet"
- [ ] Railway variables are not exposed in build logs; rotate any secret ever pasted in chat/PRs

## Residual notes
- `SELCOM_API_SECRET` falls back to a dev default for bill HMAC — set it if Selcom bills go live.
- `STELLAR_SECRET_KEY` decodes the platform wallet at runtime; keep Railway access tightly scoped.
