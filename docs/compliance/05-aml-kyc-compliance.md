# 05 — AML / KYC & Compliance Controls

> Describes the controls implemented in the platform plus the policy wrapper.
> Items marked **[policy]** are organisational processes; **[in progress]**
> marks controls planned but not yet fully automated. Be accurate when
> submitting — do not present planned controls as live.

## 1. Customer Due Diligence (KYC) — tiered model
Access and limits scale with the level of identity verification. Limits are
enforced **server-side** on every outbound action (fail-closed on breach).

| Level | Verification | Per-tx | Daily | Unlocks |
|-------|--------------|--------|-------|---------|
| 0 New | Phone number only | $50 | $100 | Send (small) |
| 1 Basic | + full name | $300 | $1,000 | + cross-border send |
| 2 Verified | + government ID (NIDA / passport / voter / licence) | $3,000 | $10,000 | + cash agents, bank withdrawal |
| 3 Enhanced | Admin-granted (business / high-volume) | $25,000 | $100,000 | Highest |

- ID details captured at Level 2: ID type, ID number, legal name.
- A monthly limit also applies per level; usage is measured against rolling
  24h + 30d **confirmed + pending** outflows so in-flight transactions cannot
  bypass caps.
- **ID document verification provider** integration (e.g. Smile Identity):
  **[in progress]** — production approvals must be gated on a real identity
  provider rather than auto-approval.

## 2. Transaction monitoring (automated)
A pre-flight risk screen runs before any value-moving transaction:
- **Hard cap:** single transfers above an absolute ceiling are **blocked**.
- **Review thresholds:** large amounts, high velocity (per-minute / per-hour),
  and new-recipient + large-amount patterns are **scored and flagged** for
  review (logged to a risk-review store).
- **Frozen accounts** are blocked outright.
- Design is fail-open on internal error (a screening bug must not block all
  payments) **except** the hard cap and frozen-account checks, which fail-closed.

## 3. Ongoing / behavioural monitoring (ops monitor, ~20-min cycle)
- **Solvency/reconciliation:** alerts if platform USDC < aggregate user
  liabilities.
- **Security signals:** mass account lockouts (possible credential stuffing),
  IPs with high failed-login counts.
- **Agent network:** low float, abnormal transaction velocity, and high
  failed/abandoned cash-out ratios.
- Alerts are delivered to operators (webhook + super-admin push), throttled.

## 4. Sanctions / PEP screening
- **[in progress / policy]** — name screening against sanctions and PEP lists at
  onboarding and on an ongoing basis. Where the on/off-ramp partner performs
  screening on the fiat leg, OlomiPay relies on and supplements it. State the
  current provider/process here: [ ].

## 5. Record keeping
- All transactions are persisted with type, amount, status, counterparties,
  timestamps, and references (USDC + on-chain tx ids).
- Security events, risk reviews, admin actions, and approvals are logged.
- Retention period: **[policy]** [ e.g. 7 years ] per applicable law.

## 6. Suspicious activity reporting
- **[policy]** A named **MLRO** reviews flagged activity and files STR/SAR with
  the relevant FIU as required. Internal flags (risk reviews, ops alerts) feed
  this process. MLRO: [ name ].

## 7. Account security controls (also AML-relevant)
- **Lockout:** user accounts lock after 5 failed PIN attempts for 30 minutes;
  staff logins lock similarly. Events are logged.
- **Staff governance:** role-based access control; sensitive actions
  (e.g. manual credits, admin sends, refunds, adding staff) require a
  **multi-admin approval** workflow; staff additions are department-scoped.
- Per-user transaction viewing and PDF/Excel report exports for oversight.

## 8. Governance & policy
- **[policy]** Board/management-approved AML/CFT policy, MLRO appointment,
  staff AML training, periodic independent review.
- Attach the signed AML/CFT policy document alongside this technical summary.

## 9. Honest control-maturity summary
| Control | Status |
|---------|--------|
| Tiered KYC + enforced limits | Live |
| Transaction risk screening (velocity/caps/new-recipient) | Live |
| Reconciliation & security/fraud monitoring + alerts | Live |
| Account/staff lockouts + audit logging | Live |
| Staff RBAC + multi-approver workflow | Live |
| Government-ID verification provider | In progress |
| Sanctions/PEP screening | In progress / policy |
| MLRO, STR/SAR process, formal policy & training | Policy — confirm status |
