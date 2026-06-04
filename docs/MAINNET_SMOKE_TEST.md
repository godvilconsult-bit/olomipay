# OlomiPay — Mainnet Smoke Test Checklist

Run this **once on mainnet, with tiny real amounts**, before opening to users.
Everything below exercises code paths that **cannot** run on testnet (Friendbot
gives free XLM, so sponsorship / fee-bump / DEX refill never actually fire).

> Use small amounts throughout (e.g. TSh 2,000–5,000 / ~$1–2). Total real cost
> of this whole test is a few dollars plus ~10–15 XLM of gas treasury.

Legend: **VERIFY** = stop and confirm before moving on.
Check balances/tx on stellar.expert → `https://stellar.expert/explorer/public/account/<ADDRESS>`.

---

## 0. Pre-flight — environment & funding

- [ ] `STELLAR_NETWORK=mainnet` in Railway (backend).
- [ ] `STELLAR_SECRET_KEY` / `STELLAR_PUBLIC_KEY` = the **gas wallet** (treasury).
- [ ] `USDC_ISSUER` = Circle mainnet USDC issuer `GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN`.
- [ ] `YELLOWCARD_ENV=production` + real Yellow Card API keys set.
- [ ] Gas wallet funded with **~15–20 XLM** (covers sponsorship + gas + buffer).
- [ ] Gas wallet has a **USDC trustline** and some **USDC float** (e.g. $20–50) so it can credit deposits.
- [ ] **VERIFY** on stellar.expert: gas wallet shows the XLM balance and a `USDC` trustline.

---

## 1. Wallet separation (gas ≠ fees)

- [ ] In Admin → **Platform Wallets**, click **Generate fee wallet**; copy both values.
- [ ] Set `FEE_WALLET_PUBLIC` + `FEE_WALLET_SECRET` in Railway → **redeploy**.
- [ ] Send the new fee wallet **~2 XLM**.
- [ ] On the **Fee Wallet** card tap **Setup** to add its USDC trustline.
- [ ] **VERIFY** the Platform Wallets widget now shows **Separated ✓** and **Auto-refill ON**.

---

## 2. New user → sponsored account (user holds 0 XLM)

- [ ] Register a brand-new user (real phone you control).
- [ ] Find the user's Stellar address (Admin → Users, or `/auth/me`).
- [ ] **VERIFY** on stellar.expert, the new user account:
  - exists on-ledger,
  - **XLM balance = 0** (reserves are *sponsored*, shown as "sponsored" entries),
  - has a **USDC trustline**.
- [ ] **VERIFY** the gas wallet's "sponsoring" count went up (it locked the reserve).

❌ If the account has 2.5 XLM instead of 0 → sponsorship didn't apply; stop and check `activateUserWallet` mainnet branch.

---

## 3. Deposit (M-Pesa → USDC) + one-time activation recovery

- [ ] From the new user, deposit a small amount via M-Pesa (real STK push).
- [ ] Approve the prompt on the phone.
- [ ] **VERIFY** in-app: balance shows the USD amount (single balance, no XLM/coins wording).
- [ ] **VERIFY** the **activation fee** was deducted once (first deposit only) — check the fee preview showed it and the credited net is `gross − 1% − activationFee`.
- [ ] **VERIFY** `activationFeePaid = true` on the user (Admin → Users), and a 2nd deposit does **not** deduct it again.
- [ ] **VERIFY** the 1% fee + activation USDC landed in the **fees wallet** (stellar.expert).

---

## 4. Send user → user (gas paid by treasury, user holds 0 XLM)

- [ ] Register a 2nd user (or use an existing one); send a small amount between them in-app (PIN auth).
- [ ] **VERIFY** the recipient's USD balance increased by net (gross − 1%).
- [ ] **VERIFY** the sender still holds **0 XLM** afterwards (fee-bump paid the gas, not the user).
- [ ] **VERIFY** on stellar.expert the payment tx is a **fee-bump** transaction whose *fee source* is the gas wallet.

❌ If the send fails with "insufficient balance for fee" / "tx_insufficient_fee" → fee-bump isn't firing; check `submitWithPlatformFee`.

---

## 5. Withdraw (USDC → M-Pesa)

- [ ] Withdraw a small amount from a user to their M-Pesa.
- [ ] **VERIFY** the off-ramp (Yellow Card disbursement) reaches the phone, and the user's USD balance dropped by the right amount + fee.
- [ ] **VERIFY** the user still holds **0 XLM** (gas was fee-bumped again).

---

## 6. Treasury auto-refill (fees → gas)

This runs automatically after deposits, but force it once to confirm.

- [ ] In Admin → Platform Wallets, click **Top up gas now** (forces a refill).
- [ ] **VERIFY** the response: `refilled: true`, with `usdcSpent` and a positive XLM delta.
- [ ] **VERIFY** on stellar.expert: a `fees → gas refill` USDC transfer and a `treasury gas refill` USDC→XLM swap on the gas wallet.
- [ ] **VERIFY** the gas wallet XLM went up and the fees wallet USDC went down.

❌ If it says "no USDC in gas/fees wallet to convert" → the fees wallet has no USDC yet (do a deposit first) or the secret isn't set (step 1).

---

## 7. 3-step admin approval + super-admin override

Needs at least 2 non-super admins to fully test the chain (otherwise it
auto-scales down — note the required number shown).

- [ ] As the **super-admin** (`+255752401012`): propose a tiny manual credit → **VERIFY** it executes immediately ("super-admin override") and the user is credited.
- [ ] As a **regular FINANCE admin**: propose a tiny manual credit → **VERIFY** it is **queued** ("needs N approvals"), NOT executed.
- [ ] As a **different** admin: approve it → **VERIFY** progress shows `1/3`, still pending.
- [ ] Approve with more admins until the threshold → **VERIFY** it flips to **APPROVED** and the credit executes.
- [ ] **VERIFY** the maker **cannot** approve their own request, and no admin can approve twice.
- [ ] Repeat the queued→approved check for a small **payout** (`send-stellar`) and a **refund**.

---

## 8. Reconciliation sanity

- [ ] In olomipay-admin → **Operations**, **VERIFY** the page loads (not blank) and reconciliation shows **healthy** (platform USDC ≥ user liabilities).

---

## Rollback / safety notes

- If anything money-moving misbehaves, **pause new registrations/deposits** first
  (so no new users are affected) while you investigate — funds already credited
  are safe USDC on-ledger.
- Keep the gas treasury above ~20 XLM during the test; the admin widget warns when low.
- The fee-bump path **falls back** to direct submit if the treasury can't pay —
  so a momentary gas issue degrades gracefully rather than blocking transfers,
  but a user with 0 XLM will then fail. Keep gas funded.
- Do **not** commit any secret keys; the generated fee secret lives only in Railway.

---

### Done?
When every **VERIFY** passes, the gas/treasury/approval/wallet-separation stack
is proven on mainnet and you can open up to real users.
