# OlomiPay — Customer Support Playbook & Admin Capability Map

> Grounded in the actual OlomiPay codebase (backend routes, Stellar service, Yellow Card
> deposit/withdraw flow, deterministic wallets). This is the reference for what can go
> wrong, why, how a customer reports it, and exactly which admin tool resolves it.

We move **real money** between mobile-money/banks and on-chain USDC/XLM. That makes us
sensitive on three axes: **(1) funds correctness** (a user must never lose money), **(2)
irreversibility** (on-chain sends can't be clawed back), and **(3) custody** (we hold the
encryption that protects user keys). Every support tool below is designed around those.

---

## 1. The failure surface (where tickets actually come from)

| # | Flow | What breaks | Money at risk? |
|---|------|-------------|----------------|
| F1 | **Deposit** (momo → USDC) | STK approved but callback throws before on-chain credit → tx stuck `PENDING` forever | **YES — user paid, got nothing** |
| F2 | **Deposit** | Platform float too low → tx `FAILED` after money taken | **YES** |
| F3 | **Deposit** | STK push never sent ("Mobile money initiation failed") → `FAILED`, no money taken | No |
| F4 | **Withdraw** (USDC → bank/momo) | Payout provider webhook never confirms → stuck `PENDING` | **YES — USDC debited** |
| F5 | **Wallet** | Encrypted key corrupt → "invalid initialization vector" / `WALLET_KEY` error; can't sign | Funds locked, not lost |
| F6 | **Wallet** | Account never activated (no XLM / no USDC trustline) → balance shows 0, sends fail | Funds locked |
| F7 | **Chat payment** | Send/request stuck `PENDING` (recipient unfunded, reserve too low) | Possibly |
| F8 | **PIN** | User forgot PIN → locked out entirely | Funds locked |
| F9 | **Fraud / dispute** | "Not me", account takeover, scam recipient | **YES** |
| F10 | **KYC** | Submitted but never reviewed → can't withdraw to bank/issue card | No |
| F11 | **Wrong recipient** | User sent to wrong person; on-chain = irreversible | **YES, lost** |
| F12 | **Balance mismatch** | App balance ≠ chain balance (cache/trustline) | No (display) |

---

## 2. Query → Cause → Admin tool → Resolution

### F1 · "I paid but I didn't receive my money" (the #1 ticket)
- **Cause:** mobile-money debited the customer, but the deposit callback failed *after* the
  STK confirmation and *before* the Stellar credit (Yellow Card order error, float check,
  network blip). The `Transaction` sits `PENDING` (or `FAILED` with `Float too low`).
- **Tool:** **Support → Stuck transactions** lists every deposit `PENDING > 10 min`.
  **Customer 360 → Diagnose** confirms "deposit stuck, no on-chain credit".
- **Resolution:**
  1. Verify the customer was charged (their momo SMS / Yellow Card order id in `metadata`).
  2. **Credit (maker-checker):** propose a manual credit for the owed USDC — a *second*
     admin approves and the platform sends it on-chain. Fully audited.
  3. If they were **not** charged → mark the tx `FAILED` (Resolve) and ask them to retry.

### F2 · Deposit failed with "Float too low"
- **Cause:** platform USDC wallet didn't have enough to cover the credit at callback time.
- **Tool:** **Support → Needs attention** flags `FAILED` deposits whose error contains float.
  **Operations → Treasury** shows the current float vs. liabilities.
- **Resolution:** top up the platform wallet, then **manual credit** the affected user
  (maker-checker). Set a float alert threshold so it doesn't recur.

### F3 · "The prompt never came to my phone"
- **Cause:** STK initiation failed (provider/MNO down, wrong number format). No money taken.
- **Tool:** Diagnose shows the `FAILED` deposit with `errorMsg`.
- **Resolution:** reassure (no charge), ask to retry; if persistent, check phone/network prefix.

### F4 · "My withdrawal is stuck / I didn't get it in my bank"
- **Cause:** USDC debited on-chain, payout provider hasn't sent the webhook back.
- **Tool:** **Support → Stuck transactions** (withdrawals `PENDING`).
- **Resolution:** check provider dashboard; if truly failed, **refund** the user
  (records a reversing entry) — or mark `CONFIRMED` once the payout lands.

### F5 · "Re-activate your wallet" loop / can't send ("invalid initialization vector")
- **Cause:** stored encrypted secret is corrupt/legacy and won't decrypt.
- **Tool:** Diagnose flags `walletKeyValid=false`. Wallets are **deterministic** (same phone →
  same address), so we can rebuild the key without losing funds.
- **Resolution:** **Reset PIN** re-derives the secret from the phone, re-encrypts under a fresh
  PIN — **same address, funds intact** — then share the temporary PIN securely.

### F6 · "My balance is 0 but I deposited" / "sending fails"
- **Cause:** account not activated — unfunded XLM or missing USDC trustline.
- **Tool:** Diagnose reports `funded`, `hasUsdcTrustline`, `xlm`, `usdc`.
- **Resolution:** trigger activation (fund + trustline). On mainnet a one-time $0.50
  activation fee is auto-collected on first deposit.

### F7 · In-chat payment stuck "pending"
- **Cause:** recipient account unfunded (XLM `createAccount` needs ≥1 XLM) or reserve buffer.
- **Tool:** Stuck transactions + Diagnose on both parties.
- **Resolution:** activate recipient; resolve the message tx; re-send.

### F8 · "I forgot my PIN"
- **Resolution:** identity-verify, then **Reset PIN** (deterministic, funds preserved).

### F9 · Fraud / "this wasn't me" / account takeover
- **Tool:** **Freeze account** (block) immediately; **Operations → Risk alerts**
  (large amount / failed bursts / high velocity); audit log.
- **Resolution:** freeze, investigate via Customer 360 + risk, escalate to COMPLIANCE,
  unfreeze or keep frozen. Every action is audited.

### F10 · "I can't withdraw to my bank / card declined — KYC"
- **Tool:** **KYC review** queue.
- **Resolution:** review submitted ID, approve/reject with reason.

### F11 · "I sent to the wrong number/person"
- **Reality:** on-chain transfers are **irreversible**. We cannot claw back.
- **Resolution:** log a support note; if the recipient is also our user, we may *request*
  (never force) a return. Set expectations clearly. Strong candidate for a future
  "confirm recipient name before send" UX guard.

### F12 · "App shows the wrong balance"
- **Tool:** Diagnose shows **chain-truth** balance next to what we stored.
- **Resolution:** usually a stale cache or missing trustline; reconcile / re-activate.

---

## 3. What we built into the admin app for this

**Support console (`/support`)**
- **Stuck transactions** — every money tx `PENDING` past a threshold, with one-click
  *Resolve (confirm/fail)*, *Refund*, or *jump to user for a maker-checker credit*.
- **Needs attention** — recent `FAILED` deposits/withdrawals (incl. "Float too low").
- **Live metrics** — stuck count, failed-24h, pending KYC, open approvals.

**Customer 360 (`/users/:id`)**
- **Diagnose** — one button runs an automated health check and returns a list of detected
  problems + the recommended fix (wallet key, activation, trustline, stuck deposits, frozen).
- **Case notes** — append-only support notes so context carries across shifts/agents.
- Existing: Reset PIN, Freeze/Unfreeze, role, balance, recent transactions.

**Money-moving safety**
- **Maker-checker** on every manual credit (4-eyes; a different FINANCE/SUPER_ADMIN approves).
- **Immutable audit log** of every back-office action (who, what, target, IP, when).
- **RBAC**: SUPPORT (read + soft actions) · COMPLIANCE (KYC/freeze) · FINANCE (money) · SUPER_ADMIN.

**Operations (`/ops`)** — treasury reconciliation, risk alerts, analytics.

---

## 4. Roadmap (highest value next)

1. **Auto-reconciler job** — a scheduler that re-checks Yellow Card order status for stuck
   deposits and self-heals (credit or fail) without an agent, so F1 rarely reaches a human.
2. **Confirm-recipient-name guard** before sends — kills most of F11.
3. **In-app support inbox** — let users open a ticket that lands in this console (close the loop).
4. **Float low-balance alert** + auto-pause deposits — prevents F2 entirely.
5. **2FA enforced** on admin login (backend ready) before any money action.
