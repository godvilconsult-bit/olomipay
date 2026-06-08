# 07 — Yellow Card (On/Off-Ramp Partner) Integration

> How OlomiPay uses the partner's API. Confirms the division of responsibility:
> **the partner performs all local fiat (TZS / M-Pesa) collection, conversion,
> and payout under its licences**; OlomiPay orchestrates the user experience and
> holds value as USDC on Stellar.

## 1. Division of responsibility
| Responsibility | OlomiPay | Partner (Yellow Card) |
|----------------|:--------:|:---------------------:|
| User app, UX, support | ✓ | |
| KYC of end users + limits | ✓ | (partner may also screen) |
| Holding USD value (USDC on Stellar) | ✓ (custodial) | |
| Local fiat collection (M-Pesa, TZS) | | ✓ |
| Fiat ↔ USDC conversion & FX | | ✓ |
| Local payout to mobile money | | ✓ |
| Licensing for the fiat leg | | ✓ |

## 2. Operations used (partner API)
| Flow | Partner capability used | Trigger |
|------|-------------------------|---------|
| Channels / rates | List active channels, FX rates | App displays options |
| Fee/quote | Calculate fees & local payout | Before confirm |
| Deposit (collection) | Collect TZS via M-Pesa → USDC to OlomiPay/user | User adds money |
| Withdraw (payout) | USDC → TZS to user's M-Pesa | User withdraws |
| Cross-border payout | USDC → local currency in other markets | Remittance |
| Webhooks | Async status updates (settled/failed) | Partner → OlomiPay |

## 3. Deposit sequence
```
1. User requests deposit of X TZS
2. OlomiPay → Partner: create deposit/collection order (internal ref = idempotency key)
3. Partner collects TZS from user via M-Pesa, converts to USDC
4. Partner → OlomiPay webhook: order completed
5. OlomiPay credits the user's USD (USDC) balance; notifies the user
```

## 4. Withdrawal / remittance sequence
```
1. User authorises withdrawal with PIN; OlomiPay runs tier-limit + AML checks
2. OlomiPay debits the user's USDC
3. OlomiPay → Partner: create payout order (USDC → local currency, recipient MSISDN)
4. Partner pays out to mobile money; → OlomiPay webhook with final status
5. OlomiPay marks the transaction settled/failed; notifies the user
```

## 5. Security of the integration
- Partner API credentials stored as restricted environment secrets (Doc 06).
- **Webhook authenticity** verified (signature/secret) before acting on a status.
- Every order carries an **idempotency reference** to prevent double-processing.
- Sandbox/testnet configuration supported for partner certification before go-live.

## 6. Settlement & reconciliation
- OlomiPay reconciles partner order outcomes against internal transaction
  records; mismatches are flagged to operators.
- Platform USDC vs. user liabilities reconciled automatically each cycle.

## 7. Information OlomiPay can share with the partner
- End-user KYC level and (on lawful request) identity details for a transaction.
- Transaction references, amounts, and status for dispute/AML cooperation.
- This technical pack + AML/KYC policy (Docs 04–06).

## 8. Open items to confirm with the partner
1. Written confirmation that OlomiPay's **custodial** use case is covered under
   the partner's licences for **Tanzania**.
2. Division of AML responsibility (who screens whom) documented.
3. Supported channels, limits, settlement timing, and webhook spec for go-live.
4. Production credentials + certification steps.
