# USD Savings+ — Tokenized Dollar Yield (RWA) on Stellar

> Architecture + phased build plan for OlomiPay's first real-world-asset (RWA)
> product: an accessible, US-dollar, yield-bearing savings option backed by a
> **licensed tokenized money-market / T-bill issuer**, surfaced inside the
> existing Grow/Savings hub.
>
> Thesis: the #1 financial need of our users is protection from local-currency
> inflation + real yield. "Hold dollars that earn ~4–5%, from $5, withdraw
> anytime" is the most-wanted product on the continent — and it maps directly
> onto the savings UX, tiered KYC, and Stellar rails we already run.

---

## 0. Guiding principles (non-negotiable)

1. **We distribute, we do NOT issue.** The tokenized fund/T-bill is issued by a
   *licensed* partner (e.g. a regulated tokenized money-market issuer on
   Stellar). They carry custody, audits, reserves, redemption. We are the
   accessible front-end. Same pattern as Yellow Card for fiat.
2. **Redemption reliability > everything.** If a user can't get money out fast,
   trust dies. Redemption SLA is the product.
3. **KYC-gated.** Holding an RWA requires a verified identity (Stellar
   authorization flags enforce this). Reuses our `kycTiers` (Level ≥ 2).
4. **Crypto stays invisible.** Users see "USD Savings+ · 4.8% / yr". No token
   tickers, no wallets, no "RWA".
5. **Honest framing.** Real yield, real risk disclosure. No "guaranteed".
6. **Capital-preserving rollout.** Start tiny, single market, single partner,
   hard caps. Expand only after redemption is proven in production.

---

## 1. How it works (mechanics)

```
User USD balance (USDC)                       Partner (licensed issuer)
        │                                              │
        │ 1. Subscribe $50                             │
        ▼                                              ▼
  Debit USDC  ──────────►  OlomiPay treasury  ──────►  Partner mints yToken
  (PIN-signed)             (omnibus / per-user)        (tokenized MMF shares)
        │                                              │
        │ 2. yToken held (per-user ledger)             │ accrues NAV daily
        ▼                                              ▼
  Position shows "USD Savings+ $50.02"          NAV/price feed → our app
        │
        │ 3. Redeem $20
        ▼
  Partner burns yToken ──► USDC to treasury ──► credit user balance (platform-signed)
```

- **Subscription:** user moves USDC from their wallet into our treasury
  (reuse `userSendUsdcToPlatform`); we instruct the partner (or their on-chain
  anchor via SEP-6/24) to mint `yToken` shares; we record the user's share
  balance in our ledger.
- **Yield:** the partner's token is **NAV-accruing** (price rises) or
  **rebasing** (share count rises). We read the partner's price/NAV feed and
  show the user's value growing. We do NOT invent yield.
- **Redemption:** user requests cash-out → partner redeems shares to USDC →
  we credit the user's spendable balance (reuse `platformSendUsdc`).
- **Two custody models** (pick per partner):
  - **Omnibus** (simplest): OlomiPay holds one big `yToken` position; per-user
    balances tracked in our DB ledger. Fast UX, we bear reconciliation duty.
  - **Direct-hold** (more decentralized): each user's Stellar account holds
    `yToken` directly (needs trustline + issuer authorization per user). More
    "self-custody", more on-chain ops + reserves per account.
  - **Recommendation:** launch **omnibus** (matches our gas-abstracted,
    crypto-invisible model), with reconciliation built in from day one.

---

## 2. Where it slots into the existing stack

| Concern | Reuse / extend |
|---|---|
| Move user USDC in | `services/stellar.ts` → `userSendUsdcToPlatform` |
| Pay user out | `services/stellar.ts` → `platformSendUsdc` |
| PIN auth | `services/crypto.ts` → `verifyPin` |
| Identity gate | `services/kycTiers.ts` → require Level ≥ 2; new feature `rwa_invest` |
| Limits | `kycTiers` per-tx / daily / monthly caps (RWA-specific caps too) |
| Fraud screen | `services/riskGate.ts` |
| Savings UX | `app/savings`, `app/grow` — add a "USD Savings+" product card |
| Yield display pattern | existing `savings.ts` accrual UI |
| Ops alerts | `services/opsMonitor.ts` — add NAV-feed + reconciliation checks |
| Reporting/exports | existing admin `/report/*` |
| Bonds groundwork | existing `routes/bonds.ts` (similar position model) |

**Net new:** a `rwa` service + route, one DB table (`RwaPosition`), a partner
adapter, an admin oversight panel, and one frontend product screen.

---

## 3. Data model (new)

```prisma
model RwaProduct {                 // catalog of available tokenized assets
  id            String   @id @default(cuid())
  code          String   @unique   // "USDY", "BENJI", ...
  name          String              // "USD Savings+"
  assetCode     String              // Stellar asset code of the yToken
  issuerPubKey  String              // partner issuer account
  custodyModel  String   @default("omnibus") // omnibus | direct
  apyEstimate   Float               // display only; real value from NAV
  minUsdc       Float    @default(5)
  status        String   @default("active") // active | paused | closed
  createdAt     DateTime @default(now())
}

model RwaPosition {                // a user's holding in a product
  id            String   @id @default(cuid())
  userId        String
  productId     String
  shares        Float    @default(0)   // yToken units held (omnibus ledger)
  costBasisUsdc Float    @default(0)   // net invested (for P/L)
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
  @@unique([userId, productId])
  @@index([userId])
}

model RwaOrder {                   // subscribe / redeem audit trail
  id            String   @id @default(cuid())
  userId        String
  productId     String
  type          String              // SUBSCRIBE | REDEEM
  amountUsdc    Float
  shares        Float?
  navAtOrder    Float?
  status        String   @default("PENDING") // PENDING|SETTLED|FAILED
  partnerRef    String?             // partner/anchor order id
  stellarTxId   String?
  createdAt     DateTime @default(now())
  @@index([userId])
}

model RwaNavSnapshot {             // price feed history for value + audit
  id         String   @id @default(cuid())
  productId  String
  nav        Float               // USDC per share
  source     String              // partner feed id
  capturedAt DateTime @default(now())
  @@index([productId, capturedAt])
}
```

All created idempotently in `dbSetup` (CREATE TABLE IF NOT EXISTS), same as
`SavingsGoal`/`Agent`.

---

## 4. API surface (new `routes/rwa.ts`)

User:
- `GET  /api/rwa/products` — catalog (name, est. APY, min, current NAV).
- `GET  /api/rwa/positions` — user's holdings + current value + P/L.
- `POST /api/rwa/subscribe` — `{ productId, amountUsdc, pin }` → KYC+limits+
  riskGate checks → debit USDC → place partner subscribe order → record.
- `POST /api/rwa/redeem` — `{ productId, amountUsdc, pin }` → place redeem
  order → credit balance on settle.
- `GET  /api/rwa/orders` — order history.

Webhook:
- `POST /api/rwa/partner/webhook` — partner notifies mint/redeem settled +
  NAV updates (verify signature). Moves orders PENDING→SETTLED, updates shares.

Admin (gated `FINANCE_HEAD`/`SUPER_ADMIN`):
- `GET  /api/rwa/admin/reconciliation` — sum(user shares) vs treasury yToken
  balance; flags drift.
- `POST /api/rwa/admin/products` — add/pause a product, set caps.

---

## 5. Partner adapter (the integration boundary)

Isolate ALL partner specifics behind one interface so we can swap issuers /
add products without touching business logic:

```ts
interface RwaPartner {
  subscribe(p: { userRef: string; amountUsdc: number; ref: string }):
    Promise<{ partnerRef: string; shares?: number; nav?: number; status: string }>;
  redeem(p: { userRef: string; shares?: number; amountUsdc?: number; ref: string }):
    Promise<{ partnerRef: string; usdcOut?: number; status: string }>;
  getNav(productCode: string): Promise<number>;        // USDC per share
  verifyWebhook(body: string, sig: string): boolean;
}
```

- Real partners expose this via **SEP-6/SEP-24 anchors** + a NAV feed, or a
  REST API. Start with whichever a licensed Stellar RWA issuer offers in our
  launch market.
- Ship a `MockRwaPartner` (deterministic NAV that accrues ~4.8%/yr) so the
  entire flow is buildable + testable **today** with zero partner dependency —
  exactly how Yellow Card sandbox let us build remittance before go-live.

---

## 6. Risk, compliance & ops controls

- **KYC:** holding gated to `kycLevel ≥ 2`; new `Feature: 'rwa_invest'`.
- **Caps (launch):** e.g. max $1,000/user, program-wide cap (e.g. $50k) so
  blast radius is bounded while proving redemption.
- **Suitability/disclosure:** one-screen plain-language risk disclosure +
  explicit consent, recorded, before first subscription. "Value can change;
  not a bank deposit; yield not guaranteed."
- **Reconciliation (critical):** ops monitor compares `Σ user shares × NAV`
  vs our treasury `yToken` balance every cycle; alert on drift (reuse
  `sendOpsAlert`). Same discipline as the existing USDC reconciliation check.
- **NAV-feed health:** alert if NAV is stale (> N hours) or moves > X% (feed
  glitch / depeg) → auto-pause subscriptions.
- **Redemption SLA monitor:** alert if a REDEEM order is PENDING beyond the
  partner's SLA.
- **Clawback / authorization:** if the partner asset uses SEP-8 / auth flags,
  surface "approval pending" states gracefully.
- **No commingling:** RWA treasury accounting kept distinct from gas + fee
  wallets (we already separated fee from gas — extend the discipline).

---

## 7. Phased build plan

**Phase 0 — Foundation (build now, no partner needed)**
- DB tables + `routes/rwa.ts` + `services/rwa.ts` + `RwaPartner` interface.
- `MockRwaPartner` with accruing NAV.
- Frontend "USD Savings+" product card in Grow/Savings; subscribe/redeem flow
  reusing PIN + tier checks.
- Reconciliation + NAV-staleness checks in ops monitor (against mock).
- **Outcome:** end-to-end product demoable + testable; ready for a real partner.

**Phase 1 — One real partner, one market, capped pilot**
- Implement the real partner adapter (SEP-6/24 or REST) + webhook verify.
- Hard caps, disclosure screen, admin reconciliation panel.
- Closed beta with small per-user + program caps; watch redemption SLA daily.
- **Outcome:** real tokenized dollar yield, live, low blast radius.

**Phase 2 — Scale + product depth**
- Raise caps as redemption proves out; add auto-invest (sweep idle balance,
  reminder-based like our auto-save — no silent debit).
- Tie into Smart Insights ("your idle $120 could earn ~$5.76/yr").
- Add a 2nd product (tokenized local bond / gold) via another partner.

**Phase 3 — Broader RWA**
- Fractional real estate / invoice financing once custody + liquidity proven.
- Multi-currency NAV display, more markets.

---

## 8. Open decisions (need input before Phase 1)

1. **Launch market** (Tanzania first, or a market where a licensed Stellar RWA
   issuer already operates?).
2. **Partner** — which licensed issuer (drives the adapter + SEP vs REST).
3. **Custody model** — omnibus (recommended) vs direct-hold.
4. **Caps** — initial per-user and program-wide limits.
5. **Branding** — "USD Savings+" vs "Dollar Vault" vs "Earn USD".

---

## 9. Bottom line

Technically low-risk on Stellar (purpose-built for this; Franklin Templeton et
al. already issue RWA here). Operationally it lives or dies on **licensing +
redemption reliability**, both of which we de-risk by **distributing a licensed
partner's token** and building **reconciliation + redemption monitoring** in
from day one. It deepens — not distracts from — the payments→savings→yield
ladder we're already climbing.

Phase 0 is fully buildable now with a mock partner. Say the word and I'll
scaffold it.
