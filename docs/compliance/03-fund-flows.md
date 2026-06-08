# 03 — Fund Flows

This document traces money for each operation: where value enters, where it
sits, who signs, and where it exits. The **local fiat (TZS/M-Pesa) leg is always
executed by the licensed on/off-ramp partner**; OlomiPay holds value as USDC on
Stellar.

Legend: **User wallet** = the user's Stellar USDC account · **Platform wallets**
= gas / fee / savings-vault / treasury accounts controlled by OlomiPay ·
**Partner** = licensed on/off-ramp (Yellow Card).

---

## 1. Add money (deposit) — TZS → USD balance
```
User (M-Pesa, TZS)
   │  1. user requests deposit of X TZS in app
   ▼
Partner (Yellow Card)  — collects TZS via M-Pesa, converts to USDC
   │  2. partner pays out USDC (net of partner fee)
   ▼
User wallet (USDC on Stellar)   — balance shown to user as USD
```
- OlomiPay never touches TZS; the partner performs collection + conversion under
  its licence and confirms via webhook.
- Idempotency: each deposit has an internal reference; the partner order is keyed
  to it.

## 2. Send money (P2P) — user → user
```
Sender wallet (USDC)
   │  1. sender authorises with PIN (signs transfer)
   │  2. AML screen (riskGate) + tier-limit check
   ▼
Platform fee wallet  ← ~1% platform fee
   +
Recipient wallet (USDC)  ← net amount
```
- On-chain transfer on Stellar; gas paid by the platform gas wallet (fee-bump),
  so the user needs no native asset.
- Recipient sees an instant USD credit + notification.

## 3. Withdraw — USD balance → TZS (M-Pesa)
```
User wallet (USDC)
   │  1. user authorises with PIN
   │  2. tier-limit + AML checks
   ▼
Platform (debits user's USDC)
   │  3. instruct partner to pay out
   ▼
Partner (Yellow Card)  — converts USDC → TZS, pays user's M-Pesa
   ▼
User (M-Pesa, TZS)
```

## 4. Cross-border send (remittance)
```
Sender wallet (USDC)  → platform debits  → Partner converts USDC → local currency
                                          → recipient's mobile money (other country)
```
- Same control set as withdrawal (PIN, tier limits incl. a remittance feature
  gate, AML screen). Real payout requires the partner's production corridors.

## 5. Savings / Goals
```
User wallet (USDC)
   │  1. user authorises deposit with PIN
   ▼
Savings vault (platform-controlled wallet)   — accrues interest
   │  2. on withdrawal, platform signs payout
   ▼
User wallet (USDC)
```
- While saved, funds sit in a **platform-controlled vault** → this portion is
  explicitly **custodial** (see Doc 04). Withdrawals are platform-signed.

## 6. Cash agents (cash-in / cash-out)
```
Cash-in  : customer gives agent physical cash → agent wallet → customer wallet (USDC)
Cash-out : customer authorises (PIN) → customer wallet → agent wallet → agent gives cash
```
- Agents are KYC-verified, limit-capped, and monitored for velocity/abandonment
  (see Doc 05). Cash-out uses short-lived confirmation codes.

## 7. Fee handling & treasury
- The ~1% platform fee accrues in a **dedicated fee wallet** (separate from gas).
- Fees can be swept to top up the gas wallet (operational sustainability).
- Platform reserves vs. user liabilities are **reconciled automatically** every
  cycle (alerts if platform USDC < user liabilities). See Doc 05/06.

## 8. Settlement & reconciliation summary
| Operation | Fiat leg (partner) | On-chain leg (OlomiPay) | Signer |
|-----------|--------------------|--------------------------|--------|
| Deposit | TZS→USDC | USDC credited to user | Partner |
| Send | — | USDC user→user (+fee) | User (PIN) |
| Withdraw | USDC→TZS | USDC debited from user | User (PIN) + platform |
| Remittance | USDC→local | USDC debited from user | User (PIN) + platform |
| Savings in/out | — | user↔vault | User (PIN) in; platform out |
| Agent cash-in/out | — | agent↔user | Agent / user (PIN) |
