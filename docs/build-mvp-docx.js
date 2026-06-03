const fs = require('fs');
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  Header, Footer, AlignmentType, LevelFormat, TableOfContents, HeadingLevel,
  BorderStyle, WidthType, ShadingType, PageNumber, PageBreak, VerticalAlign,
} = require('docx');

// ── palette ───────────────────────────────────────────────────────────────────
const BLUE = '1A56DB', DARK = '1A3A6B', GREY = '64748B', LIGHT = 'F1F5F9',
      GREEN = '16A34A', AMBER = 'B45309', TEXT = '1E293B';
const CW = 9360; // content width US Letter, 1" margins

// ── helpers ─────────────────────────────────────────────────────────────────
const border = { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' };
const borders = { top: border, bottom: border, left: border, right: border };
const cellMargins = { top: 80, bottom: 80, left: 120, right: 120 };

function h1(text)  { return new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun(text)] }); }
function h2(text)  { return new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun(text)] }); }
function p(text, opts = {}) {
  return new Paragraph({ spacing: { after: 120 }, ...opts,
    children: [new TextRun({ text, ...opts.run })] });
}
function bullet(text) {
  return new Paragraph({ numbering: { reference: 'bul', level: 0 }, spacing: { after: 60 },
    children: typeof text === 'string' ? [new TextRun(text)] : text });
}
function num(text) {
  return new Paragraph({ numbering: { reference: 'ord', level: 0 }, spacing: { after: 60 },
    children: typeof text === 'string' ? [new TextRun(text)] : text });
}
function runs(parts) { // parts: [{t, bold, color}]
  return parts.map(x => new TextRun({ text: x.t, bold: x.bold, color: x.color, italics: x.italics }));
}

function cell(content, { w, fill, bold, color, align } = {}) {
  const children = Array.isArray(content)
    ? content
    : [new Paragraph({ alignment: align, children: [new TextRun({ text: String(content), bold, color })] })];
  return new TableCell({
    borders, width: { size: w, type: WidthType.DXA }, margins: cellMargins,
    verticalAlign: VerticalAlign.CENTER,
    shading: fill ? { fill, type: ShadingType.CLEAR } : undefined,
    children,
  });
}

// Two-column key/value table
function kvTable(rows, widths = [3000, 6360]) {
  return new Table({
    width: { size: CW, type: WidthType.DXA }, columnWidths: widths,
    rows: rows.map(([k, v], i) => new TableRow({ children: [
      cell(k, { w: widths[0], fill: i % 2 ? 'FFFFFF' : LIGHT, bold: true, color: DARK }),
      cell(v, { w: widths[1], fill: i % 2 ? 'FFFFFF' : LIGHT }),
    ]})),
  });
}

// Header-row table
function gridTable(headers, rows, widths) {
  const headRow = new TableRow({ tableHeader: true, children:
    headers.map((hd, i) => cell(hd, { w: widths[i], fill: BLUE, bold: true, color: 'FFFFFF' })) });
  const bodyRows = rows.map((r, ri) => new TableRow({ children:
    r.map((c, i) => cell(c, { w: widths[i], fill: ri % 2 ? 'FFFFFF' : LIGHT })) }));
  return new Table({ width: { size: CW, type: WidthType.DXA }, columnWidths: widths, rows: [headRow, ...bodyRows] });
}

function spacer(after = 160) { return new Paragraph({ spacing: { after }, children: [new TextRun('')] }); }
function rule() {
  return new Paragraph({ spacing: { before: 80, after: 160 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: BLUE, space: 1 } }, children: [new TextRun('')] });
}

// ── document ──────────────────────────────────────────────────────────────────
const doc = new Document({
  creator: 'OlomiPay',
  title: 'OlomiPay — MVP Document',
  styles: {
    default: { document: { run: { font: 'Arial', size: 21, color: TEXT } } },
    paragraphStyles: [
      { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { size: 30, bold: true, font: 'Arial', color: BLUE },
        paragraph: { spacing: { before: 320, after: 160 }, outlineLevel: 0 } },
      { id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { size: 24, bold: true, font: 'Arial', color: DARK },
        paragraph: { spacing: { before: 200, after: 100 }, outlineLevel: 1 } },
    ],
  },
  numbering: { config: [
    { reference: 'bul', levels: [{ level: 0, format: LevelFormat.BULLET, text: '•', alignment: AlignmentType.LEFT,
      style: { paragraph: { indent: { left: 600, hanging: 280 } } } }] },
    { reference: 'ord', levels: [{ level: 0, format: LevelFormat.DECIMAL, text: '%1.', alignment: AlignmentType.LEFT,
      style: { paragraph: { indent: { left: 600, hanging: 280 } } } }] },
  ]},
  sections: [{
    properties: { page: {
      size: { width: 12240, height: 15840 },
      margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
    }},
    headers: { default: new Header({ children: [ new Paragraph({
      border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: 'E2E8F0', space: 4 } },
      children: [
        new TextRun({ text: 'OlomiPay', bold: true, color: BLUE, size: 18 }),
        new TextRun({ text: '\tMVP Document — Confidential', color: GREY, size: 16 }),
      ],
      tabStops: [{ type: 'right', position: CW }],
    }) ]}) },
    footers: { default: new Footer({ children: [ new Paragraph({
      children: [
        new TextRun({ text: 'OlomiPay · Building Trust Through Blockchain', color: GREY, size: 16 }),
        new TextRun({ text: '\tPage ', color: GREY, size: 16 }),
        new TextRun({ children: [PageNumber.CURRENT], color: GREY, size: 16 }),
        new TextRun({ text: ' of ', color: GREY, size: 16 }),
        new TextRun({ children: [PageNumber.TOTAL_PAGES], color: GREY, size: 16 }),
      ],
      tabStops: [{ type: 'right', position: CW }],
    }) ]}) },
    children: [
      // ── COVER ───────────────────────────────────────────────────────────────
      new Paragraph({ spacing: { before: 1800, after: 0 }, alignment: AlignmentType.CENTER,
        children: [new TextRun({ text: 'OlomiPay', bold: true, size: 72, color: BLUE })] }),
      new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 80 },
        children: [new TextRun({ text: 'Building Trust Through Blockchain', italics: true, size: 26, color: DARK })] }),
      new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 600, after: 40 },
        children: [new TextRun({ text: 'Minimum Viable Product (MVP) Document', bold: true, size: 32, color: TEXT })] }),
      new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 600 },
        children: [new TextRun({ text: 'Mobile Money ↔ Stellar Payment Gateway & Wallet', size: 24, color: GREY })] }),
      new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 1200 },
        children: [new TextRun({ text: 'Prepared for Investors & Regulators', size: 22, color: TEXT })] }),
      new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 40 },
        children: [new TextRun({ text: 'Document v1.0  ·  3 June 2026  ·  Status: Testnet MVP', size: 20, color: GREY })] }),
      new Paragraph({ alignment: AlignmentType.CENTER,
        children: [new TextRun({ text: 'CONFIDENTIAL', bold: true, size: 18, color: AMBER })] }),
      new Paragraph({ children: [new PageBreak()] }),

      // ── TOC ─────────────────────────────────────────────────────────────────
      new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun('Table of Contents')] }),
      new TableOfContents('Table of Contents', { hyperlink: true, headingStyleRange: '1-1' }),
      new Paragraph({ children: [new PageBreak()] }),

      // ── 1. EXECUTIVE SUMMARY ─────────────────────────────────────────────────
      h1('1. Executive Summary'),
      p('OlomiPay is a Progressive Web App (PWA) that bridges African mobile money (M-Pesa, Tigo Pesa, Airtel Money, MTN MoMo) with the Stellar blockchain, allowing users to hold value in USDC — a US-dollar-pegged stablecoin — instead of devaluing local currency.'),
      p('Users deposit local currency, instantly receive USDC in a real Stellar wallet, and send money peer-to-peer, by phone number, by QR code, or inside a built-in encrypted chat. The platform earns a transparent 1% fee, collected automatically to a dedicated fee wallet.'),
      p('A licensed liquidity provider (Yellow Card) handles local-currency ↔ USDC conversion, so OlomiPay never touches SWIFT and carries minimal float risk. The MVP is fully functional on Stellar Testnet with the Yellow Card sandbox, and is architected so the move to production requires configuration changes only — no code rewrite.'),
      kvTable([
        ['Product', 'OlomiPay — Mobile Money ↔ Stellar payment gateway & wallet'],
        ['Status', 'Testnet MVP (Stellar Testnet + Yellow Card sandbox)'],
        ['Backend / Frontend', 'v3.0.0 / v1.1.0'],
        ['Settlement', 'Stellar (3–5 second finality, sub-cent network fees)'],
        ['Stablecoin', 'USDC (Circle)'],
        ['Markets', 'Tanzania (launch), Kenya, Uganda, +20 Yellow Card countries'],
      ]),
      spacer(),

      // ── 2. PROBLEM & SOLUTION ────────────────────────────────────────────────
      h1('2. Problem & Solution'),
      h2('The Problem'),
      num('Currency devaluation — the Tanzanian Shilling and many African currencies lose value yearly; ordinary savings erode.'),
      num('Expensive, slow transfers — cross-network and cross-border money movement is costly and slow.'),
      num('Limited dollar access — ordinary users cannot easily hold USD; banks require SWIFT and high minimums.'),
      num('Fragmented experience — money, chat, and bill payments live in separate apps.'),
      h2('The Solution'),
      p('A single mobile-first wallet where users:'),
      bullet('Deposit mobile money and instantly receive USDC that holds its USD value.'),
      bullet('Send money to anyone in seconds — by phone, Stellar address, or QR code.'),
      bullet('Chat, and send or request money directly inside the conversation.'),
      bullet('Withdraw back to mobile money at any time.'),
      p('All settlement is on Stellar: 3–5 second finality and fractions of a cent in network fees.'),
      spacer(),

      // ── 3. TARGET USERS ──────────────────────────────────────────────────────
      h1('3. Target Users'),
      gridTable(['Segment', 'Primary Need'], [
        ['Individuals (TZ / KE / UG)', 'Protect savings in USD, send to family, pay bills'],
        ['Small merchants', 'Accept digital payments, QR checkout'],
        ['Diaspora senders', 'Low-cost remittance into mobile money'],
        ['Businesses', 'Payroll and bulk disbursement (Phase 2)'],
      ], [3000, 6360]),
      spacer(),

      // ── 4. MVP SCOPE ─────────────────────────────────────────────────────────
      h1('4. MVP Scope'),
      h2('In Scope — Built and Working'),
      p('Core wallet & money movement', { run: { bold: true, color: DARK } }),
      bullet('Phone + 6-digit PIN registration; a real Stellar keypair is generated per user (secret encrypted with the PIN).'),
      bullet('USDC + XLM balances with live USD/TZS equivalents.'),
      bullet('Send USDC/XLM by Stellar address or phone number.'),
      bullet('QR receive (SEP-0007 URIs) and camera-based QR scanner for sending.'),
      bullet('Deposit via mobile money (STK Push) → Yellow Card conversion → USDC credited.'),
      bullet('Withdraw USDC → mobile money (B2C payout); full transaction history.'),
      p('Fees & liquidity', { run: { bold: true, color: DARK } }),
      bullet('Transparent 1% platform fee, collected atomically on every transfer to a dedicated fee wallet.'),
      bullet('Full fee breakdown shown before confirming (mid-rate, provider spread, platform fee, network fee, net received).'),
      bullet('Yellow Card liquidity integration; sandbox mirrors mainnet fees exactly.'),
      p('Encrypted chat & social payments', { run: { bold: true, color: DARK } }),
      bullet('1-to-1 encrypted chat (NaCl keys), real-time delivery/read receipts, typing indicators.'),
      bullet('Send money inside chat with PIN authentication; payment requests with Accept / Decline.'),
      bullet('Global push + in-app sound notifications across all pages, with unread badges.'),
      p('Admin & security', { run: { bold: true, color: DARK } }),
      bullet('Admin dashboard: users, transactions, fees, platform & fee wallets, PDF/CSV reports by date range.'),
      bullet('Role-based access control (Owner / Financial Controller / Developer / Viewer), enforced server-side.'),
      bullet('Maker-checker approval queue, TOTP 2FA, and step-up authentication for high-risk actions.'),
      bullet('Fail-open fraud gate on every send; auto-reconciler for stuck transactions; immutable audit log.'),
      h2('Out of Scope — Post-MVP'),
      bullet('Live mainnet money movement and production Yellow Card / Daraja credentials.'),
      bullet('Muxed/pooled custodial ledger (requires EMI/PSP license).'),
      bullet('FIDO2 hardware keys, USSD/SMS offline transactions, geographic HA cluster, ML fraud model.'),
      spacer(),

      // ── 5. MONEY FLOW ────────────────────────────────────────────────────────
      h1('5. How the Money Flows'),
      gridTable(['Flow', 'Steps'], [
        ['Deposit', 'M-Pesa STK Push → Daraja callback → Yellow Card converts local→USDC → platform sends NET USDC to user (1% retained to fee wallet); network fee paid by platform.'],
        ['Send (P2P)', 'User PIN → fraud gate (fail-open) → one atomic Stellar transaction: 99% to recipient + 1% to fee wallet.'],
        ['Withdraw', 'User PIN → USDC pulled to platform → Yellow Card converts USDC→local → M-Pesa B2C payout to phone.'],
      ], [1800, 7560]),
      p('No SWIFT is involved. Conversion is handled by the licensed liquidity provider; OlomiPay holds a pre-funded USDC float.',
        { run: { italics: true, color: GREY } }),
      spacer(),

      // ── 6. ARCHITECTURE & STACK ──────────────────────────────────────────────
      h1('6. Architecture & Technology'),
      h2('Resilience Built In'),
      bullet('Idempotent database migrations — no data loss on deploy.'),
      bullet('Atomic multi-operation Stellar transactions (all-or-nothing).'),
      bullet('Time bounds on every transaction — no stuck or replayed transactions.'),
      bullet('Auto-reconciler self-heals pending transactions; daily compliance checks toward a zero balance.'),
      h2('Technology Stack'),
      gridTable(['Layer', 'Technology'], [
        ['Frontend', 'Next.js 14 (App Router), React 18, Tailwind CSS, PWA + Service Worker'],
        ['Backend', 'Node 20, Express, TypeScript, Socket.io'],
        ['Database', 'PostgreSQL via Prisma ORM (36 data models)'],
        ['Blockchain', 'Stellar (Horizon + Soroban RPC), USDC asset, stellar-sdk v12'],
        ['Smart contracts', 'Soroban (Rust): payments, bonds, chama, lending, savings, staking'],
        ['Liquidity', 'Yellow Card Business API (local ↔ USDC)'],
        ['Mobile money', 'Safaricom Daraja (STK Push + B2C)'],
        ['Notifications', 'Web Push (VAPID) + in-app Web Audio'],
        ['Hosting', 'Vercel (frontend) + Railway (backend + PostgreSQL)'],
      ], [2400, 6960]),
      spacer(),

      // ── 7. SECURITY ──────────────────────────────────────────────────────────
      h1('7. Security & Compliance'),
      gridTable(['Control', 'Implementation'], [
        ['PII off-chain', 'Names/phones in PostgreSQL; only hashes/memos on-chain'],
        ['Encrypted secrets', 'Stellar secret keys encrypted with the user’s PIN'],
        ['RBAC / Zero-Trust', 'Every admin action checked server-side (prevents BFLA)'],
        ['Step-up auth', 'Fresh TOTP required for high-risk admin actions'],
        ['Fraud gate', 'Sub-second pre-flight screen on every transfer (fail-open)'],
        ['Maker-checker', 'Two-person rule for sensitive money operations'],
        ['Audit log', 'Immutable record of all back-office actions'],
        ['Route protection', 'Middleware blocks unauthenticated access to the app'],
      ], [2600, 6760]),
      spacer(),

      // ── 8. SUCCESS METRICS ───────────────────────────────────────────────────
      h1('8. Success Metrics (MVP Validation)'),
      gridTable(['Metric', 'Target'], [
        ['Testnet deposit → USDC credit completion', '> 95%'],
        ['P2P send confirmation time', '< 5 seconds'],
        ['Fee correctly collected to fee wallet', '100% of transfers'],
        ['Chat message delivery (online)', '< 1 second'],
        ['Fraud gate latency (rules tier)', '< 50 ms'],
        ['Data loss across deployments', '0 (zero)'],
        ['Users completing deposit → send → withdraw loop', '≥ 20'],
      ], [6360, 3000]),
      spacer(),

      // ── 9. ROADMAP ───────────────────────────────────────────────────────────
      h1('9. Roadmap'),
      gridTable(['Phase', 'Focus'], [
        ['Phase 1 — MVP (current)', 'Testnet wallet, deposit/withdraw, P2P, chat payments, admin, RBAC, fraud gate'],
        ['Phase 2 — Production', 'Live Yellow Card + Daraja, mainnet USDC, float management, KYC tiers & limits, regulatory path'],
        ['Phase 3 — Scale', 'Redis fraud store + async FinCrime agent, muxed ledger, daily auto-reconciliation, multi-region HA, passkeys, USSD/SMS'],
        ['Phase 4 — Ecosystem', 'Merchant QR checkout, payroll/bulk disbursement, savings/staking/bonds, developer API'],
      ], [2600, 6760]),
      spacer(),

      // ── 10. RISKS ────────────────────────────────────────────────────────────
      h1('10. Key Risks & Mitigations'),
      gridTable(['Risk', 'Mitigation'], [
        ['Liquidity / float shortfall', 'Provider model; daily reconciliation; float monitoring'],
        ['Regulatory (custody / PSP)', 'Operate under partner license until Bank of Tanzania approval'],
        ['Stablecoin de-peg', 'USDC (Circle) — most regulated stablecoin; monitor reserves'],
        ['Fraud / money laundering', 'Fail-open gate now; ML model + sanctions screening in Phase 3'],
        ['Rural connectivity', 'PWA offline shell now; USSD/SMS fallback in Phase 3'],
        ['Key loss / recovery', 'PIN-encrypted keys; recovery flow hardened before production'],
      ], [3000, 6360]),
      spacer(),

      // ── 11. GO/NO-GO ─────────────────────────────────────────────────────────
      h1('11. Go / No-Go for Production'),
      p('Before handling real money, the following are mandatory:', { run: { bold: true } }),
      num('Production Yellow Card + Daraja credentials and signed agreements.'),
      num('Legal: a PSP license or written partner-license coverage.'),
      num('Separate, funded fee and float wallets on Stellar mainnet, with monitoring.'),
      num('Rotation of all secrets and access tokens.'),
      num('Penetration test of the admin panel and money-movement endpoints.'),
      num('A KYC/AML provider integrated and transaction limits enforced.'),
      rule(),
      new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 200 },
        children: [new TextRun({ text: 'This document reflects the actual implemented state of the OlomiPay repository as of 3 June 2026.',
          italics: true, color: GREY, size: 18 })] }),
    ],
  }],
});

Packer.toBuffer(doc).then(buf => {
  fs.writeFileSync('OlomiPay-MVP.docx', buf);
  console.log('WROTE OlomiPay-MVP.docx (' + buf.length + ' bytes)');
});
