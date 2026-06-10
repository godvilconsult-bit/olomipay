# 🔥 JIKO CONNECT

**LPG cooking-gas logistics marketplace for Tanzania.** A logistics-first, three-sided
network that connects **households** (who search for nearby gas vendors with stock),
**suppliers/vendors** (who receive instant order alerts and fulfil from inventory), and
**riders** (the delivery engine — *jiko* = stove in Swahili).

> No blockchain, no crypto. Plain mobile-money fintech (M-Pesa / Tigo Pesa / Airtel Money
> / HaloPesa) + real-time logistics.

---

## The supply-chain loop

```
Household searches  →  sees nearby vendors with LIVE stock + price + ETA
       │
       ▼
Places order  →  Supplier gets an instant ALERT (Socket.io)  →  accepts
       │
       ▼
Order BROADCAST to nearby riders  →  first rider claims it
       │
       ▼
Rider picks up from vendor  →  delivers  →  OTP + photo proof
       │
       ▼
Mobile-money payment auto-splits:  platform commission · supplier payout · rider fee
```

**Middle-mile extension:** vendors get low-stock alerts and fire one-tap **restock requests**
to their distributor/depot — giving the platform visibility one link up the chain.

## Monetization (built-in hooks)

Delivery fee · per-order commission · surge/express · supplier SaaS tier · featured listings ·
middle-mile restock fee · rider tiers · demand-data insights. *(MVP implements delivery fee +
commission; the rest are modelled and stubbed.)*

---

## Tech stack

| Layer | Tech |
|---|---|
| **Backend** | Node + Express + TypeScript, Prisma (PostgreSQL), Socket.io, JWT + bcrypt auth |
| **Frontend** | Next.js 14 (App Router) + Tailwind, PWA, socket.io-client |
| **Payments** | Tanzanian mobile money via one aggregator (AzamPay / Selcom / ClickPesa); `mock` provider for local dev |
| **Realtime** | Socket.io — order alerts, rider job broadcast, live location |

### Monorepo layout
```
backend/    Express API — routes, services, prisma schema, seed
frontend/   Next.js PWA — households + riders + suppliers + admin
admin-panel/  (legacy — repurpose for ops console)
mobile/       (legacy shell — repurpose for native rider app)
```

---

## Local setup

### 1. Backend
```bash
cd backend
npm install
# set DATABASE_URL, JWT_SECRET, JWT_REFRESH_SECRET in .env
npx prisma db push          # create the schema
npm run seed                # demo catalog + price caps + one of each role
npm run dev                 # http://localhost:3001
```

### 2. Frontend
```bash
cd frontend
npm install
# set NEXT_PUBLIC_API_URL=http://localhost:3001 in .env.local
npm run dev                 # http://localhost:3000
```

### Demo logins (PIN `1234`)
| Role | Phone |
|---|---|
| Admin | `+255700000000` |
| Supplier | `+255711111111` |
| Rider | `+255722222222` |
| Household | `+255733333333` |

Open the household login, search for gas, order; the supplier sees the alert; the rider
claims and delivers — all live. In `mock` payment mode the M-Pesa charge settles automatically.

---

## Environment

**Backend** (`backend/.env`)
```
DATABASE_URL=postgresql://...
JWT_SECRET=...
JWT_REFRESH_SECRET=...
JIKO_COMMISSION_PCT=0.07          # platform commission
JIKO_DELIVERY_BASE=2000           # TZS flag-fall
JIKO_DELIVERY_PER_KM=500          # TZS / km
JIKO_PAYMENTS_PROVIDER=mock       # mock | azampay

# AzamPay (only when JIKO_PAYMENTS_PROVIDER=azampay)
AZAMPAY_ENV=sandbox               # sandbox | production
AZAMPAY_APP_NAME=...
AZAMPAY_CLIENT_ID=...
AZAMPAY_CLIENT_SECRET=...
AZAMPAY_API_KEY=...
```

**Frontend** (`frontend/.env.local`)
```
NEXT_PUBLIC_API_URL=http://localhost:3001
```

## Going live with payments
AzamPay is wired in [`backend/src/services/azampay.ts`](backend/src/services/azampay.ts).
Set `JIKO_PAYMENTS_PROVIDER=azampay` + the `AZAMPAY_*` creds, and register your webhook URL
(`POST /api/payments/callback`) in the AzamPay dashboard. The charge then stays `PENDING` until
AzamPay confirms; everything downstream — order lifecycle, payout split, notifications — runs on
the confirmed-payment event. Leave it as `mock` for local dev and it auto-settles.

## Compliance
Tanzania-first: currency **TZS**, Swahili-first copy, EWURA LPG **price caps** enforced per
region (admin-configurable).
