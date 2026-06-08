# OlomiPay — Partner Onboarding & Compliance Document Pack

This folder contains the documents a licensed infrastructure partner (e.g.
Yellow Card) or a regulator typically requests during **KYB + technical due
diligence**. They describe OlomiPay's business, architecture, money flows,
custody model, and compliance controls — accurately and without overstatement.

> Prepared for partner onboarding. Markdown source is version-controlled; export
> to PDF/Word for submission (e.g. `pandoc 0X-file.md -o 0X-file.pdf`).

| # | Document | What it answers |
|---|----------|-----------------|
| 00 | [Company & KYB Summary](00-company-kyb-summary.md) | Who we are, ownership, registration, contacts (you fill the legal blanks). |
| 01 | [Business Overview](01-business-overview.md) | What the product does, markets, users, revenue model. |
| 02 | [Technical Architecture](02-technical-architecture.md) | Stack, components, infrastructure, integrations, diagram. |
| 03 | [Fund Flows](03-fund-flows.md) | How money moves for each operation; where funds sit; settlement. |
| 04 | [Custody & Key Management](04-custody-key-management.md) | Honest custody position, wallet key model, signing, reserves. |
| 05 | [AML / KYC & Compliance Controls](05-aml-kyc-compliance.md) | Identity tiers, limits, transaction monitoring, reporting, lockouts. |
| 06 | [Security & Data Protection](06-security.md) | Encryption, access control, infra security, incident response, audit. |
| 07 | [Yellow Card Integration](07-yellowcard-integration.md) | Exactly how we use the partner API; the on/off-ramp flows. |
| 08 | [Wallet Key Hardening Plan](08-key-hardening-plan.md) | KMS/HSM-backed signer plan — removes the single-master-key risk. |

## PDF versions
Ready-to-send PDFs are in [`pdf/`](pdf/): one per document plus a combined
**`OlomiPay-Compliance-Pack.pdf`**. Regenerate after edits with:
```
python docs/compliance/build_pdfs.py   # needs: pip install markdown xhtml2pdf
```

## How to use this pack
1. Fill the **[ ]** placeholders (legal entity name, registration numbers,
   directors, addresses, named compliance officer, provider names) — these are
   facts only you have.
2. Review each doc against your current production configuration before sending.
3. Keep the **custody** and **AML/KYC** docs especially accurate — those are the
   two a compliance reviewer scrutinises hardest.

## Document control
- Owner: [Name], [Title] — OlomiPay
- Version: 1.0 (draft for partner review)
- Last updated: [date]
- Classification: Confidential — for partner/regulator review only
