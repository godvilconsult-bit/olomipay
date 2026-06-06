# OlomiPay — Operations, Security & Fraud Playbook

How to keep the business running smoothly: the problems you **will** face, how to
**spot** them in the admin app (`olomipay-admin.vercel.app`), and how to
**respond**. Built around the tooling already in the codebase.

---

## 0. Daily / weekly monitoring routine

**Every day (5 min) — open olomipay-admin:**
- **Operations** → reconciliation shows **healthy** (platform USDC ≥ user liabilities); no critical config problems; risk alerts (24h) empty.
- **Wallets & gas** → gas wallet not low; fees wallet growing as expected.
- **Support** → "Stuck" and "Needs attention" queues are clear.
- **Approvals** → no money-moving requests sitting unactioned.

**Every week (SUPER_ADMIN):**
- **Staff activity** → review each staff member's money/access actions; investigate any 🚩 flags.
- **Audit log** → skim for anything unexpected.
- Confirm **uptime monitor** had no outages (see §6).

---

## 1. Customer problems

| Problem | How to spot | Response |
|---|---|---|
| Deposit didn't arrive | Support → **Stuck** / user → **Diagnose**; Transactions filter PENDING | Run **Reconciler**; if M-Pesa took money but USDC not credited, verify on chain and credit via approval |
| Withdrawal not received | Support → Stuck; check Yellow Card disbursement status | Re-poll status; if failed, **refund** (3-step approval) and retry |
| Sent to wrong person / dispute | Transactions + Audit; chat history | Funds are final on-chain — assist, don't reverse silently; document in **case notes** |
| Can't log in / lost device | Users → **Diagnose** (wallet key valid? recoverable?) | Wallet is phone-derived & recoverable; never expose secrets; guide re-login |
| KYC stuck | **KYC review** queue | Approve/reject with reason; all logged |
| "Wrong balance" | Users → Diagnose (on-chain vs ledger) | Usually a pending/await — explain; only credit via approval if genuinely owed |

**Golden rules:** never move money outside the approval flow; always leave a **case note**; never share a secret key.

---

## 2. System failures

| Failure | How to spot | Response |
|---|---|---|
| Backend down | Uptime monitor on `/health`; app errors | Check Railway logs/deploy; roll back last deploy if needed |
| Database unreachable | `/ready` returns 503; `P1001` in logs | Check Railway Postgres service is running; verify `DATABASE_URL` |
| Stellar/Horizon issues | Sends failing; Operations page | Transient — retry; check status.stellar.org |
| Yellow Card outage | Deposits/withdrawals failing | Check YC status; pause deposits if needed; queue + retry |
| **Gas treasury low** | Wallets & gas → red ⛽ alert | **Top up gas** (auto-refill should handle it; top up manually if needed) |
| **Reconciliation shortfall** | Operations → reconciliation **⚠ shortfall** | STOP crediting; investigate immediately — platform USDC < what you owe users |
| Stuck/auto-reconcile | Support → Reconciler log | Run reconciler; review what it healed |

**Endpoints for external monitoring:** `GET /health` (liveness), `GET /ready` (DB),
`GET /metrics` (latency p50/p95/p99). Point an uptime tool at these (see §6).

---

## 3. External fraud (customers / attackers)

| Pattern | How to spot | Response |
|---|---|---|
| Account takeover | Risk alerts; Diagnose; off-pattern logins | Freeze account (block), reset via verified KYC |
| Money laundering / structuring | Risk alerts (velocity, many small tx); Analytics | File internal report; freeze; escalate to compliance |
| Rapid drain after deposit | Risk alerts; Transactions | Hold large/first-time payouts for review (3-step approval covers payouts) |
| Fake KYC | KYC review | Reject; block; record |

**Controls in place:** per-action rate limits, risk-alerts rules engine, KYC gate on
cash-out, idempotency on chat payments, chain reconciliation. **Tighten limits**
for new/unverified users.

---

## 4. Internal fraud (staff) — the accountability system

This is the area most fintechs underinvest in. Your controls:

| Control | What it does |
|---|---|
| **3-step approvals** | Money-moving actions (credit, payout, refund) need **3 distinct admin sign-offs**; the maker can't approve their own. A SUPER_ADMIN can override. |
| **RBAC roles** | SUPPORT / COMPLIANCE / FINANCE / SUPER_ADMIN — least privilege. Only SUPER_ADMIN assigns roles. |
| **Immutable audit log** | Every back-office action is recorded (who, what, target, IP, time) and never editable. |
| **Step-up TOTP** | High-risk actions require a fresh 2FA code. |
| **Staff Activity monitor** | (new) SUPER_ADMIN view: per-staff money/access action counts + 🚩 flags (high volume, off-hours, many IPs) + a feed of recent sensitive actions. |

**How to spot staff fraud:** olomipay-admin → **Staff activity** →
- a staff member with **high "money/access" counts** relative to peers,
- **off-hours** spikes,
- **many IP addresses** (shared/leaked credentials),
- repeated actions on the same customer.
Cross-check against the **Audit log** and **Approvals** history.

**Response:** revoke the staff member's role immediately (Users → set role → none),
review every action they took (Audit log filtered by them), reverse what's reversible
via approvals, rotate any shared secrets.

**Hard rules to enforce operationally:**
- No single person can move money (enforced by 3-step approvals).
- Each staff member has their **own** login (never shared) — shared logins defeat the audit trail.
- Production secrets live only in Railway, never in chat/email/screenshots.

---

## 5. Security baseline (keep these true)

- **Rotate any leaked secret immediately** (DB URL, keys, service accounts).
- **Separate wallets**: gas ≠ fees (done) so revenue and operating funds don't mix.
- **Users hold zero XLM**; the platform sponsors reserves + fee-bumps gas.
- **Least privilege** RBAC; SUPER_ADMIN reserved for the owner.
- **HTTPS only**; tokens in the device keystore; 180-day refresh with rotation.
- Keep the **GitHub token** out of the git remote URL (rotate it).

---

## 6. Monitoring — built in, just add the env vars

**Auto-alerts (built in):** the backend runs an **ops monitor** every 20 min that
raises an alert when the **gas treasury is low** or there's a **reconciliation
shortfall**. Alerts go to a webhook + the super-admin's device, throttled. Enable by setting:
- `SLACK_ALERT_WEBHOOK` = a Slack/Discord incoming webhook URL (alerts post there).
- (Push to the super-admin works automatically once FCM is configured.)

**Error tracking (built in):** Sentry initialises automatically when the DSN is set:
- Backend: `SENTRY_DSN`
- Frontend: `NEXT_PUBLIC_SENTRY_DSN`
Both are no-ops if unset. Create a free Sentry project → paste the DSNs into Railway/Vercel.

**Uptime (set up once):** create a free **UptimeRobot** (or BetterStack) monitor:
- `https://olomipay-production.up.railway.app/health` → expect 200, every 1–5 min.
- `https://olomipay-production.up.railway.app/ready` → expect 200 (catches DB outages).
- Alert to email/SMS/Slack.

**Daily eyeball:** still check Operations + Wallets; auto-alerts are the safety net, not a replacement.

---

## 7. Incident response (when something breaks)

1. **Assess** — customer-only, or systemic? (one user vs reconciliation shortfall).
2. **Contain** — if money integrity is at risk, **pause deposits/new registrations** before anything else (existing USDC on-ledger is safe).
3. **Communicate** — tell affected users honestly via in-app support.
4. **Fix** — root cause; use approvals for any corrective money movement.
5. **Record** — case notes + audit; write a short post-mortem.
6. **Prevent** — add a rule/limit/check so it can't recur.

---

## TL;DR for the owner
Open olomipay-admin daily: **Operations** (reconciliation healthy?), **Wallets & gas**
(funded?), **Support** (queues clear?), **Approvals** (pending?). Weekly: **Staff
activity** + **Audit log**. Keep money movement behind **3-step approvals**, give every
staffer their **own** least-privilege login, and **rotate any exposed secret** the moment
it leaks.
