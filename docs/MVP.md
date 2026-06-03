# OlomiPay — MVP Document

**Building Trust Through Blockchain**

| | |
|---|---|
| **Product** | OlomiPay — Mobile Money ↔ Stellar payment gateway & wallet |
| **Document version** | 1.0 |
| **Date** | 2026-06-03 |
| **Status** | Testnet MVP (Stellar Testnet + Yellow Card sandbox) |
| **Repository** | github.com/godvilconsult-bit/olomipay |
| **Backend version** | 3.0.0 · **Frontend** 1.1.0 |

---

## 1. Executive Summary

OlomiPay is a Progressive Web App (PWA) that bridges African **mobile money** (M-Pesa, Tigo Pesa, Airtel Money, MTN MoMo) with the **Stellar blockchain**, letting users hold value in **USDC** (a USD-pegged stablecoin) instead of devaluing local currency. Users deposit local currency, receive USDC in a real Stellar wallet, and can send money instantly — peer-to-peer, by phone number, by QR code, or inside a built-in encrypted chat.

The platform earns a transparent **1% fee** on transactions, collected automatically to a dedicated fee wallet. A liquidity provider (**Yellow Card**) handles the local-currency ↔ USDC conversion, so OlomiPay never touches SWIFT and carries minimal float risk.

The MVP is fully functional on **Stellar Testnet** with the Yellow Card **sandbox**, and is architected so that the move to mainnet/production requires **configuration changes only — no code rewrite**.

---

## 2. Problem Statement

1. **Currency devaluation** — Tanzanian Shilling and many African currencies lose value yearly; savings erode.
2. **Expensive, slow transfers** — cross-network and cross-border money movement is costly and slow.
3. **Limited dollar access** — ordinary users cannot easily hold USD; banks require SWIFT and high minimums.
4. **Fragmented experience** — money, chat, and bill payments live in separate apps.

## 3. Solution

A single mobile-first wallet where users:
- Deposit mobile money → instantly receive **USDC** (holds USD value).
- Send money to anyone in seconds via phone, Stellar address, or QR.
- Chat and send/request money inside the conversation.
- Withdraw back to mobile money anytime.

All settlement is on Stellar (3–5 second finality, fractions of a cent in network fees).

---

## 4. Target Users

| Segment | Need |
|---|---|
| **Individuals (TZ/KE/UG)** | Protect savings in USD, send to family, pay bills |
| **Small merchants** | Accept digital payments, QR checkout |
| **Diaspora senders** | Cheap remittance into mobile money |
| **Businesses** | Payroll, bulk disbursement (Phase 2) |

---

## 5. MVP Scope

### ✅ In scope (built and working)

**Core wallet & money movement**
- Phone + 6-digit PIN registration; real Stellar keypair generated per user (secret encrypted with PIN).
- USDC + XLM balances; live balance display with USD/TZS equivalent.
- Send USDC/XLM by Stellar address or phone number.
- **QR receive** (SEP-0007 `web+stellar:pay` URIs) + **QR scanner** (camera-based) for sending.
- Deposit via mobile money (STK Push) → Yellow Card converts → USDC credited.
- Withdraw USDC → mobile money (B2C payout).
- Transaction history (on-chain + internal records).

**Fees & liquidity**
- Transparent **1% platform fee**, collected atomically on every transfer to a dedicated fee wallet.
- Full fee breakdown shown before confirming (mid-rate, Yellow Card spread, platform fee, Stellar network fee, net received).
- Yellow Card liquidity integration (sandbox mode mirrors mainnet fees exactly).

**Encrypted chat + social payments**
- 1-to-1 chat (NaCl keypairs), real-time via Socket.io, delivery/read receipts, typing indicators.
- Send money **inside chat** with PIN auth.
- **Payment requests** with Accept / Decline + full authentication.
- Global push + in-app sound notifications across all pages; unread badges.

**Admin & security**
- Admin dashboard: users, transactions, fees, platform wallet, fee wallet, PDF/CSV reports by date range.
- **RBAC** (Owner / Financial Controller / Developer / Viewer), server-side gated.
- **Maker-checker** approval queue for money-moving actions.
- **TOTP 2FA** + **step-up authentication** for high-risk admin actions.
- **Fail-open fraud gate** (velocity, amount caps, new-recipient, frozen-account) on every send.
- Auto-reconciler for stuck transactions; immutable audit log.

**Platform**
- Installable PWA, route protection (unauthenticated users cannot reach the app shell), profile photos + unique wallet IDs (`OP-XXXX`) instead of exposed phone numbers.

### ❌ Out of scope (post-MVP)
- Real mainnet money movement & production Yellow Card/Daraja credentials.
- Muxed/pooled custodial ledger (requires EMI/PSP license).
- FIDO2 hardware keys, USSD/SMS offline transactions.
- Geographic HA cluster, Couchbase, ML fraud model (≥96% accuracy target).
- Advanced DeFi features (staking, lending, bonds, chama) are scaffolded but not MVP-critical.

---

## 6. Money Flow

```
DEPOSIT
  User → M-Pesa STK Push → Daraja callback
       → Yellow Card converts local → USDC
       → Platform wallet sends NET USDC to user (1% fee retained to fee wallet)
       → Stellar network fee (~0.00001 XLM) paid by platform

SEND (P2P)
  User PIN → fraud gate (fail-open) → atomic Stellar tx:
       99% → recipient  +  1% → fee wallet   (single transaction)

WITHDRAW
  User PIN → USDC pulled to platform → Yellow Card USDC→local → M-Pesa B2C payout
```

No SWIFT. Conversion is handled by the licensed liquidity provider; OlomiPay holds a pre-funded USDC float.

---

## 7. Architecture

```
┌─────────────────┐     HTTPS / WebSocket     ┌──────────────────────────┐
│  Next.js 14 PWA │ ◄───────────────────────► │  Express API (Node 20)   │
│  (Vercel)       │                           │  (Railway)               │
│  - Service Worker (push + offline shell)    │  - REST + Socket.io      │
│  - QR scan/receive, chat, wallet            │  - Prisma ORM            │
└─────────────────┘                           └──────────┬───────────────┘
                                                          │
                    ┌─────────────────────────────────────┼───────────────────────┐
                    ▼                     ▼                ▼                        ▼
            ┌──────────────┐    ┌──────────────┐   ┌──────────────┐      ┌──────────────────┐
            │ PostgreSQL   │    │ Stellar      │   │ Yellow Card  │      │ M-Pesa / Daraja  │
            │ (Railway)    │    │ Horizon+RPC  │   │ (liquidity)  │      │ (mobile money)   │
            │ 36 models    │    │ + Soroban    │   │ local↔USDC   │      │ STK Push / B2C   │
            └──────────────┘    └──────────────┘   └──────────────┘      └──────────────────┘
```

**Resilience built in:**
- DB migrations are idempotent (`prisma migrate deploy` + `ADD COLUMN IF NOT EXISTS`) — **no data loss on deploy**.
- Atomic multi-operation Stellar transactions (all-or-nothing).
- Time bounds on every transaction (no stuck/replayed tx).
- Auto-reconciler self-heals pending transactions; daily compliance checks.

---

## 8. Technology Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 14 (App Router), React 18, TailwindCSS, PWA + Service Worker |
| Backend | Node 20, Express, TypeScript, Socket.io |
| Database | PostgreSQL via Prisma ORM (36 models) |
| Blockchain | Stellar (Horizon + Soroban RPC), `@stellar/stellar-sdk` v12, USDC asset |
| Smart contracts | Soroban (Rust): olomipay, bond, chama, lending, savings_vault, staking_pool |
| Liquidity | Yellow Card Business API (YcHmacV1 auth) |
| Mobile money | Safaricom Daraja (STK Push + B2C) |
| Notifications | Web Push (VAPID) + Web Audio in-app sounds |
| Encryption | tweetnacl (chat E2E keys), AES (Stellar secret at rest) |
| Hosting | Vercel (frontend) + Railway (backend + Postgres) |

---

## 9. Security & Compliance

- **PII off-chain** — names/phones in Postgres; only hashes/memos on-chain.
- **Encrypted secrets** — Stellar secret keys encrypted with the user's PIN.
- **RBAC + Zero-Trust admin** — every admin action checked server-side (prevents BFLA).
- **Step-up auth** — fresh TOTP for high-risk admin actions.
- **Fraud gate** — sub-second pre-flight screen on every transfer.
- **Maker-checker** — two-person rule for sensitive money operations.
- **Audit log** — immutable record of back-office actions.
- **Route protection** — middleware blocks unauthenticated access to the app.

---

## 10. Success Metrics (MVP validation)

| Metric | Target |
|---|---|
| Successful testnet deposit → USDC credit | > 95% completion |
| P2P send confirmation time | < 5 seconds |
| Fee correctly collected to fee wallet | 100% of transfers |
| Chat message delivery (online) | < 1 second |
| Fraud gate latency | < 50 ms (rules tier) |
| Zero data loss across deploys | 100% |
| Registered test users completing a full deposit→send→withdraw loop | ≥ 20 |

---

## 11. Roadmap

**Phase 1 — MVP (current):** testnet wallet, deposit/withdraw, P2P, chat payments, admin, RBAC, fraud gate. ✅

**Phase 2 — Production readiness:**
- Live Yellow Card + Daraja credentials, mainnet USDC, real float management.
- Regulatory: Bank of Tanzania PSP path (or operate under Yellow Card's license initially).
- KYC tiers + limits enforcement.

**Phase 3 — Scale & resilience:**
- Redis-backed fraud feature store + async FinCrime agent.
- Muxed/pooled ledger (if licensed), daily automated reconciliation to zero.
- Multi-region HA, FIDO2 passkeys, USSD/SMS offline rails.

**Phase 4 — Ecosystem:**
- Merchant QR checkout, payroll/bulk disbursement, savings/staking/bonds, developer API.

---

## 12. Key Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Liquidity/float shortfall | Yellow Card provider model; daily reconciliation; float monitoring |
| Regulatory (custody/PSP) | Operate non-custodial + under partner license until BoT approval |
| Stablecoin de-peg | USDC (Circle) — most regulated stablecoin; monitor reserves |
| Fraud / money laundering | Fail-open gate now; ML model + sanctions screening in Phase 3 |
| Connectivity (rural) | PWA offline shell; USSD/SMS fallback in Phase 3 |
| Key loss / account recovery | PIN-encrypted keys; recovery flow to be hardened pre-production |

---

## 13. Go / No-Go for Production

**Before handling real money, the following are mandatory:**
1. Production Yellow Card + Daraja credentials and signed agreements.
2. Legal: PSP license or written partner-license coverage.
3. Separate, funded fee + float wallets on Stellar **mainnet** with monitoring.
4. Rotate all secrets (note: the GitHub access token is currently embedded in the git remote — must be rotated).
5. Penetration test of the admin panel and money endpoints.
6. KYC/AML provider integrated and limits enforced.

---

*Prepared for OlomiPay. This document reflects the actual implemented state of the repository as of 2026-06-03.*
