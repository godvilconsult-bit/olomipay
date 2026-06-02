# OlomiPay Admin (back-office)

A **separate** internal operations console built on [React-Admin](https://marmelab.com/react-admin/).
It is a standalone Vite app — it does **not** ship inside the customer app, so admin
code never reaches users. It talks to the existing OlomiPay API (`/api/admin/*`).

## What it does (Phase 1–2)

- **Dashboard** — users, transactions, volume, fees at a glance
- **Users (Customer 360)** — search by phone/name, open a user to see KYC, wallet
  address, balance, whether the wallet is recoverable (deterministic), recent activity
- **Support actions** (on a user):
  - **Reset PIN** — re-keys deterministically, **wallet & funds preserved** (same address)
  - **Make / revoke admin**
  - **Freeze / unfreeze** account
- **Transactions** — search/filter by date, **resolve stuck PENDING** (mark confirmed/failed)
- **Audit log** — every admin action is recorded immutably (who, what, when, IP)

## Security model

- Login uses an existing OlomiPay account; only accounts with `isAdmin = true` get in.
- Every write action is written to `AdminAuditLog` server-side.
- Deploy this app on a **private URL** (e.g. `admin.olomipay.com`) — ideally behind
  your VPN / IP allow-list. Never expose it on the customer domain.

## Run locally

```bash
cd admin-panel
cp .env.example .env          # set VITE_API_URL to your API
npm install
npm run dev                   # http://localhost:5174
```

Log in with an **admin** phone number + PIN (e.g. the owner account).

## Deploy

Build a static bundle and host it anywhere (Vercel/Netlify/Cloudflare Pages) on a
**separate, private subdomain**:

```bash
npm run build                 # outputs dist/
```

Set `VITE_API_URL` in the host's env to your production API.

## Roadmap (next phases)

- **Maker–checker (4-eyes)** for money-moving actions
- **RBAC roles** (support / compliance / finance / super-admin)
- **KYC review queue** + document viewer
- **Treasury / reconciliation** dashboard (M-Pesa ↔ Stellar)
- **Risk & fraud** rules + alerts queue
- **2FA** on admin login
