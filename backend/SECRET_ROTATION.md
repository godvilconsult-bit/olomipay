# OlomiPay — Secret Generation & Rotation Runbook

How to generate, set, and safely rotate the secrets that protect user funds.
No secret value should ever pass through chat, a PR, or a build log.

---

## 1. Generate secrets (on your own machine)

```bash
cd backend
npm run gen:secrets        # or: node scripts/gen-secrets.mjs
```

Prints four ready-to-paste values. Nothing is written to disk or sent anywhere.
Alternatives if you prefer: `openssl rand -hex 32` (×4), or in PowerShell:
`-join ((1..32) | % { '{0:x2}' -f (Get-Random -Max 256) })`.

## 2. Set them in Railway

Project → **backend service** → **Variables** → add each `KEY=value`. Railway redeploys
on save. After it boots, confirm **Operations → Config health** reads green.

---

## The two tiers of secret

| Secret | Rotatable? | Why |
|--------|-----------|-----|
| `WALLET_DERIVATION_SECRET` | ❌ **Never** (after users exist) | Wallet *addresses* are derived from it. Changing it changes every address → funds stranded. |
| `ENCRYPTION_KEY` | ✅ Yes (with the procedure below) | Encrypts the stored secret blob, which is a recoverable *cache* — not the source of truth. |
| `JWT_SECRET`, `JWT_REFRESH_SECRET` | ✅ Yes (logs everyone out) | Only sign sessions; no fund impact. |

---

## 3. Rotating `JWT_SECRET` / `JWT_REFRESH_SECRET` (easy)

1. Generate a new value, replace the variable in Railway, redeploy.
2. Effect: all existing sessions become invalid — every user/admin signs in again. No data loss.
3. Rotate the two independently if you only suspect one. They must stay different from each other.

---

## 4. Rotating `ENCRYPTION_KEY` (zero-downtime, no user friction)

**Key fact:** we never store user PINs, so we *cannot* bulk re-encrypt. Instead the code
supports a **previous-key fallback** plus **lazy re-key** — old blobs keep decrypting while
new writes use the new key. Because wallets are deterministic, anything that can't be
re-keyed lazily can always be repaired via reset-PIN/reprovision without losing funds.

**Procedure**

1. In Railway, set BOTH:
   - `ENCRYPTION_KEY` = the NEW key
   - `ENCRYPTION_KEY_PREVIOUS` = the OLD key (exactly what `ENCRYPTION_KEY` was)
2. Redeploy. Now `decryptSecret` tries the new key first, then the old one — so every
   existing wallet keeps working immediately. Newly written blobs use the new key.
3. **Lazy re-key window (recommended ~2–4 weeks):** as users sign with their PIN and as
   admins run reset-PIN/reprovision, blobs get re-written under the new key. No action
   needed — it just happens.
4. (Optional) Force-finish for inactive users: from the admin panel, **Customer 360 →
   Reset PIN** re-derives + re-encrypts under the current key (funds preserved). Do this
   for any accounts you want migrated before removing the fallback.
5. After the window, **remove `ENCRYPTION_KEY_PREVIOUS`** from Railway and redeploy. Any
   account still on the old key will simply show the "re-activate wallet" prompt on next
   login (the existing corrupt-wallet flow), which reprovisions deterministically.

> If you skip step 1's fallback and just swap the key, existing users aren't *lost* —
> their funds are safe because addresses are deterministic — but they'll all hit the
> "re-activate wallet" prompt at once. The fallback simply makes the rotation invisible.

---

## 5. Rotating `WALLET_DERIVATION_SECRET` — DON'T (and what it takes if you must)

This changes the derived address for every phone. There is no in-place rotation. A real
rotation is a **funds migration**, run as a deliberate project, never as routine ops:

1. Freeze deposits/withdrawals (maintenance window).
2. For each user: derive OLD address (old secret) and NEW address (new secret); build and
   submit a Stellar payment moving the full USDC/XLM balance old → new, signed with the
   old derived key; add the USDC trustline on the new account first.
3. Update `stellarPubKey`/`stellarSecret` to the new wallet; reconcile the ledger.
4. Only then set the new `WALLET_DERIVATION_SECRET` and unfreeze.

Because this is slow, risky, and user-visible, the correct posture is: **set it once, back
it up in two places (password manager + offline), and never touch it.**

---

## 6. Incident response — a secret leaked

- **`JWT_*` leaked:** rotate immediately (§3). Everyone re-logs-in. Done.
- **`ENCRYPTION_KEY` leaked:** rotate via §4. Note: the key alone can't decrypt wallets
  (PIN also required), so risk is limited, but rotate promptly.
- **`WALLET_DERIVATION_SECRET` leaked:** highest severity. The secret alone still can't
  move funds without each user's PIN-encrypted flow, but plan a funds migration (§5) and
  rotate. Treat as a P1.
- Always rotate any secret that was ever pasted into chat, a ticket, a PR, or a build log.
