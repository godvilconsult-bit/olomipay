# 02 — Technical Architecture

## 1. High-level overview
OlomiPay is a three-tier system: a client (web PWA + native mobile shell), a
backend API + realtime service, and a settlement layer on the Stellar network.
The local fiat (M-Pesa) leg is handled entirely by the **licensed on/off-ramp
partner**; OlomiPay never directly touches the mobile-money rails.

```
┌──────────────────────────────────────────────────────────────────────────┐
│                              END USERS                                     │
│   PWA (browser / installed)        Native app (Capacitor, Android/iOS)     │
└───────────────┬───────────────────────────────┬──────────────────────────┘
                │ HTTPS / WSS                    │ HTTPS / WSS  + FCM/APNs push
                ▼                                ▼
┌──────────────────────────────────────────────────────────────────────────┐
│  FRONTEND (Next.js)            — static/SSR hosting (Vercel)               │
│  • UI, client-side validation, push subscription                          │
└───────────────┬───────────────────────────────────────────────────────────┘
                │ REST + Socket.io
                ▼
┌──────────────────────────────────────────────────────────────────────────┐
│  BACKEND (Node.js / Express + Socket.io)  — hosted on Railway              │
│  • Auth (phone + PIN, JWT)        • Chat realtime + push                   │
│  • Wallet / send / withdraw       • Savings / goals / agents              │
│  • AML risk screening (riskGate)  • Tiered KYC + limits                    │
│  • Ops monitor (reconciliation, security, fraud)                          │
│  • Admin / staff RBAC + approvals                                         │
└───┬───────────────┬───────────────────┬───────────────────┬───────────────┘
    │ Prisma        │ web-push / FCM     │ HTTPS             │ Horizon / Soroban RPC
    ▼               ▼                    ▼                   ▼
┌─────────┐  ┌────────────┐   ┌────────────────────┐  ┌───────────────────────┐
│Postgres │  │Push (VAPID/ │   │  ON/OFF-RAMP        │  │  STELLAR NETWORK       │
│(Railway)│  │ FCM/APNs)   │   │  PARTNER API        │  │  • User USDC wallets   │
│         │  │            │   │  (Yellow Card)      │  │  • Gas wallet (sponsor)│
│ users,  │  └────────────┘   │  TZS ↔ USDC via     │  │  • Fee wallet          │
│ txns,   │                   │  M-Pesa             │  │  • Savings vault       │
│ chat …  │                   └────────────────────┘  └───────────────────────┘
└─────────┘
```

## 2. Components & technology
| Layer | Technology | Hosting |
|-------|------------|---------|
| Web frontend | Next.js 14 (App Router), React, TypeScript | Vercel |
| Native apps | Capacitor (Android/iOS) loading the live web app | App stores / APK |
| Backend API | Node.js, Express, TypeScript | Railway |
| Realtime | Socket.io (WebSocket + long-polling, optional Redis adapter) | Railway |
| Database | PostgreSQL via Prisma ORM | Railway (managed) |
| Settlement | Stellar (USDC asset); Soroban for token transfers | Public Stellar network |
| Push | Web Push (VAPID) + FCM (Android) / APNs (iOS) | Google/Apple |
| Error/uptime | Sentry; internal ops monitor + alerting | — |

## 3. Settlement layer (Stellar)
- Users hold **USDC** in individual Stellar accounts.
- A **gas wallet** sponsors account reserves and pays network fees via
  fee-bump transactions, so users never need to hold the native asset (XLM).
- A **dedicated fee wallet** (separate from the gas wallet) collects the
  platform fee with its own USDC trustline.
- A **savings vault** address holds funds placed into savings/goals.
- Outbound user→user transfers are signed with the user's key (PIN-authorised);
  platform-originated movements (e.g. savings withdrawal payout) are signed by
  platform-controlled wallets. See Doc 04 for the key model.

## 4. Authentication & sessions
- **End users:** phone number + 6-digit PIN → JWT access token (+ long-lived
  refresh token). PINs are stored only as **bcrypt** hashes.
- **Staff/admin:** separate username + password identities with **role-based
  access control** (super-admin, department heads, department staff) and a
  **multi-approver workflow** for sensitive actions.
- Account lockout after repeated failed attempts (see Doc 05/06).

## 5. Integrations
| Integration | Purpose | Direction |
|-------------|---------|-----------|
| On/off-ramp partner (Yellow Card) | TZS ↔ USDC via M-Pesa (deposit/withdraw/remit) | OlomiPay → partner API + partner webhooks |
| Circle (optional/treasury) | USD ↔ USDC treasury; bank payouts | OlomiPay → Circle API |
| Stellar Horizon / Soroban RPC | On-chain balances, transfers | OlomiPay → network |
| FCM / APNs / Web Push | Notifications | OlomiPay → device |

## 6. Environments & deployment
- Source control: Git (GitHub). CI/CD via Vercel (frontend) and Railway (backend).
- Secrets are held as platform environment variables (see Doc 06 for handling).
- Separate testnet/sandbox configuration is supported for partner sandbox testing.

## 7. Data stored (high level)
- User: phone, name, KYC level/details, encrypted wallet key, Stellar public key.
- Transactions: type, amount (USDC), status, counterparties, timestamps, refs.
- Chat: conversations, messages (see Doc 06 re content handling), receipts.
- Compliance: security events, risk reviews, admin audit log, approvals.
- Full schema available to the partner on request under NDA.
