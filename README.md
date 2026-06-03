# OlomiPay — Design System

> **"Building Trust Through Blockchain."**
> A mobile-money × Stellar super-app for Tanzania. Deposit from M-Pesa, Airtel, MTN or a bank; hold dollars (USDC); send cash *inside a conversation*; earn interest. Settles on-chain in seconds, 24/7.

This folder is a **design system**: brand foundations, color + type tokens, real visual assets, and a high-fidelity UI kit, so a design agent can produce on-brand OlomiPay screens, marketing pages, decks and prototypes without re-deriving the look every time.

---

## What OlomiPay is

OlomiPay is a **PWA "super app"** that fuses three things most apps keep separate:

1. **Money** — a wallet funded by African mobile-money rails (M-Pesa, Airtel Money, MTN MoMo, Tigo Pesa, Vodafone Cash…) and banks. Balances are held as **USDC** on Stellar, shown to users as plain **USD** with a **TZS** equivalent. A flat **1%** fee, shown before you confirm.
2. **Messaging** — end-to-end encrypted chat. The headline differentiator: **you send money inside the chat thread**, as a "money card" bubble, not by typing an account number.
3. **Earning** — savings goals, staking ("Earn"), group savings ("Chama"), bonds, lending, rewards.

The positioning is explicitly **anti-remittance-app**: where transfer apps promise *"98% within 10 minutes,"* OlomiPay claims **100% settled on-chain in 3–5 seconds**, verifiable on a public ledger. The brand narrative: *a transfer is an event; a conversation is a relationship.*

**Audience:** Tanzanian / pan-African mobile-first users. Phone-number identity, 6-digit PIN auth, optional KYC. Swahili appears in live notifications ("Umepokea…", "Amana imefanikiwa!").

### The product surfaces

| Surface | What it is |
|---|---|
| **Marketing landing** (`/`) | Dark, "2030 fintech" hero with aurora gradients, animated headline, rails marquee, Speed/Security/Social pillars, stats, CTA. |
| **Auth** (`/auth/login`, `/register`, `/recover`) | Dark split-screen: brand panel + glass form with phone + PIN. |
| **The App** (authenticated) | Light, airy mobile-first wallet. ~30 routes: dashboard, send, deposit, withdraw, chat, savings, chama, stake, bills, swap, card, payroll, merchant, history, profile, admin… |

There is **one product** (the app) with **two visual skins** — a dark marketing/auth skin and a light in-app skin. The UI kit recreates both.

---

## Sources

Everything here was derived from the project's own source code — not screenshots. Explore these to build richer, more accurate OlomiPay work:

- **GitHub:** https://github.com/godvilconsult-bit/olomipay — monorepo
  - `frontend/` — **Next.js 14 PWA** (the design source of truth): `app/` routes, `components/`, `app/globals.css` (the animation + skin system), `tailwind.config.ts` (color + font tokens).
  - `backend/` — Express + TypeScript anchor API (M-Pesa Daraja + Stellar).
  - `contracts/olomipay/` — Soroban smart contract (Rust).

Key files read to build this system: `frontend/tailwind.config.ts`, `frontend/app/globals.css`, `frontend/app/layout.tsx`, `frontend/app/page.tsx` (landing), `frontend/app/dashboard/page.tsx`, `frontend/app/chat/page.tsx`, `frontend/app/auth/login/page.tsx`, and components `BalanceCard`, `BottomNav`, `QuickActions`, `TransactionItem`, `PinInput`, `StatusBadge`.

> The reader may not have access to the repo, but it is recorded here in case they do.

---

## CONTENT FUNDAMENTALS

How OlomiPay writes.

**Voice — confident challenger, warm and human.** It picks a fight with legacy transfer apps and wins on specifics. Copy is benefit-first, plain-spoken, never corporate.

- **"You", not "we"-centric.** Addresses the user directly: *"Send money the way you chat."* *"Your money, your conversation."* *"Lost your phone? Recover your wallet."*
- **Casing:** Sentence case almost everywhere — headings, buttons, labels. Reserve **UPPERCASE** for small eyebrows/tags only (`SPEED`, `SECURITY`, `SOCIAL`, `One wallet · every rail`), with wide letter-spacing.
- **Concrete > vague.** Numbers do the talking: *"100% in seconds,"* *"settles on-chain in 0.8s,"* *"1% flat, no hidden fees,"* *"3–5 seconds, even at 3AM on a Sunday."* Avoid "fast" — say how fast.
- **Them-vs-us framing.** Marketing repeatedly contrasts "Transfer apps" (a red ✕) with "OlomiPay" (a green ✓). Honest about what the alternative does, then beats it.
- **Aspirational one-liners / punchlines:** *"A transfer is an event. A conversation is a relationship."* *"The future of money is a conversation."* Often the keyword (`chat`, `relationship`, `core`) is set in the animated gradient.
- **Trust language is everywhere** — "verifiable," "provable, not promised," "on-chain," "end-to-end encrypted," "see the exact fee before you confirm." The whole brand rests on the tagline **"Building Trust Through Blockchain."**
- **Crypto is hidden, not flaunted.** Users see **USD / TZS / "coins"**, *"Olomi Wallet,"* *"Settled on-chain"* — never "Stellar," "Soroban," "XLM" in the main UI (XLM is shown as "coins"). Blockchain is a trust mechanism, not jargon.
- **Microcopy is friendly + action-led.** Buttons: *"Create free account," "Start free — it takes 60 seconds," "I have an account," "Find People," "Send invite link."* Empty states are encouraging: *"No transactions yet · Deposit TZS to get started."*
- **Emoji:** used sparingly for warmth and status — 💸 (sent), 💚 / ✅ (success), 🔒 (encrypted), ⚠️ (warning), 🟢 (online), 📭 / 📱 (empty/device). Never decorative spam. One per message, functional.
- **Swahili** surfaces in real-time toasts for local warmth: *"Umepokea $8.00 kutoka Amina,"* *"Amana imefanikiwa!"* English is the default UI language.
- **Numbers & money:** USD with 2 decimals and `$` (`$1,284.50`); TZS with thousands separators, no decimals (`TZS 3,339,700`); phone as `+255 712 345 678`; addresses truncated `GABC…WXYZ`.

---

## VISUAL FOUNDATIONS

OlomiPay runs **two coordinated skins** off one token set.

### The two skins
- **Dark "2030 fintech"** (landing + auth): near-black canvas `#060b18`, huge soft **aurora orbs** (blue / emerald / cyan) blurred at `120px` drifting slowly, a faint 48px grid at 4% opacity, and **glass cards** floating over it. Premium, futuristic, confident.
- **Light "airy app"** (authenticated): a fixed **gradient-mesh backdrop** (`#f5f8ff → #eef2fb` with blue/emerald/violet radial washes), translucent **glassy cards** and **frosted sticky headers**, a floating glass bottom-nav. Clean, calm, trustworthy.

### Color
- **Primary brand blue `#1a56db`** (also the PWA theme color) with light `#3b82f6` / dark `#1e40af`.
- **The signature gradient is blue → emerald** (`#3b82f6 → #22c55e`): primary buttons, active nav, the "money" motif, brand tiles. The animated **headline gradient** adds cyan: `#3b82f6 · #22d3ee · #22c55e`.
- Semantic: success `#16a34a`, warning `#d97706`, danger `#dc2626` — each used at **10% tint** for badges (`bg-success/10 text-success`).
- A full **slate** ramp (50→900) carries text, surfaces and borders. Light text: `#0f172a / #334155 / #64748b / #94a3b8`.
- Imagery/illustration is **cool and digital** — blue/emerald/cyan light, glow and blur. No warm photography, no grain. Decoration is generated (gradients, orbs, rings), not photographic.

### Type
- **Inter** only, weights 400–800 (Google Fonts). Body locked to **16px minimum** (prevents iOS input zoom).
- Display headings are **extra-bold (800), tight tracking (-0.02 to -0.03em)**, and **fluid** (`clamp`) so they never overflow on mobile. Eyebrows are 12px, bold, UPPERCASE, wide tracking.
- Money/numerals: bold, **tabular-nums**, USD leads with a muted TZS line beneath.

### Shape, depth & borders
- **Rounded, friendly.** Cards = `rounded-3xl` (24px). Buttons/inputs/PIN = `rounded-2xl` (16px). Sheets, modals & hero glass = `rounded-[2rem]` (32px). Pills, avatars, FABs = full. Tiny chips = 8–12px.
- **Cards:** soft, glassy, low-contrast. Light app card = `rgba(255,255,255,.72)` + `blur(12px)` + 1px white border + a **blue-tinted shadow** `0 8px 30px -12px rgba(30,58,138,.18)`. Dark glass = `rgba(255,255,255,.06)` + `blur(14px)` + `rgba(255,255,255,.12)` border. **No hard 1px-grey-box cards; no colored-left-border cards.**
- **Borders** are hairline `#e2e8f0` (light) / `rgba(255,255,255,.1)` (dark); row dividers `#f1f5f9`.
- **Transparency + blur** is core: frosted sticky headers (`blur(16px)`), backdrop-blurred bottom nav (`blur(20px)`), glass cards, modal scrims `bg-black/50 backdrop-blur-sm`. Used to layer over the animated backdrops.
- **Shadows are soft and blue-tinted**, never harsh black. Primary buttons get a colored glow (`shadow-blue-500/25`); CTAs on dark get a blurred gradient halo behind them (`cta-glow`).

### Motion
- **Signature easing: `cubic-bezier(.22, 1, .36, 1)`** — a gentle spring-out used for entrances and reveals.
- **Press feedback: `active:scale-95`** at ~100ms on nearly every tappable element (buttons, tiles, rows, nav).
- **Hover (desktop):** subtle lift (`translateY(-4px)`), border brightens to blue, a one-shot shimmer sweep on glass; CTAs intensify their glow. Links lighten in color/opacity.
- **Ambient loops** (landing): `float` / `floatSlow` (cards, logo, 6–9s), `auroraDrift` (orbs, 18–22s), `gradientShift` (headline, 6s), `marquee` (rails ticker), `glowPulse`, `spinSlow`, `shimmer`.
- **Entrances:** `fadeUp` on scroll (IntersectionObserver, staggered 80ms delays), `popIn` for stats/count-ups, `msgInLeft/Right` for chat bubbles, `presencePulse` ring for online dots.
- **Everything respects `prefers-reduced-motion`** — animations are disabled and content shown in its end state.

### Layout rules
- **Mobile-first single column**, `max-w-md` (448px) centered; widens to 38rem/44rem on tablet/desktop. Auth becomes a 2-column split on `lg`.
- **48px minimum touch targets** throughout; safe-area insets honored (notches, home indicator).
- **Fixed chrome:** a sticky frosted page header at top, a floating glass bottom-nav (4 tabs + "More" sheet) at the bottom on mobile; a sidebar on larger screens.
- Global overflow protection: nothing escapes the viewport; long addresses wrap.

---

## ICONOGRAPHY

- **Primary icon set: [Lucide](https://lucide.dev)** (`lucide-react`), used consistently across the entire app and marketing site. **Outline style, ~1.8 stroke width**, bumped to **2.4 when a nav item is active**. Sizes typically 14–24px. The preview cards and UI kit reproduce these as inline Lucide SVGs (same path data, same stroke).
  - Common glyphs: `Home, Send, MessageCircle, PiggyBank, MoreHorizontal, Wallet, TrendingUp, ShieldCheck, Zap, Globe2, ArrowRight, ArrowUpRight, ArrowDownLeft, RefreshCw, Eye/EyeOff, Bell, QrCode, CreditCard, Users, Receipt, Check, X, Clock, Phone, Search`.
- **The OlomiPay logo** (`assets/logo.svg`) is the one bespoke mark: concentric arcs in dark-blue `#1a3a6b` and brand-blue `#1a56db`, crossed by an **emerald `#10b981` swoosh arrow** — reads as motion + upward growth. On dark surfaces it's knocked out white onto a blue→emerald rounded tile with a glow. A watermark version sits at 10% opacity on the wallet card. App icons (`assets/icon-192.svg`, `icon-512.svg`) are maskable variants.
- **Emoji** act as lightweight status icons inside copy (💸 💚 🔒 ⚠️ 🟢 ✅ 📭 📱) — functional, one at a time, never decorative filler.
- **No custom icon font, no PNG icon sprites, no Unicode-glyph icons.** If you need a glyph that isn't in `assets/`, pull it from Lucide at matching stroke weight rather than drawing a new one.

> When building OlomiPay artifacts, **use Lucide** (CDN `lucide@latest` or inline the SVG). Don't hand-draw replacement icons or swap in a different family — it breaks the system's consistency.

---

## Index — what's in this folder

| Path | What it is |
|---|---|
| `README.md` | This file — brand, content, visual & icon foundations. |
| `colors_and_type.css` | All design tokens as CSS vars (color, gradients, surfaces, radii, shadows, motion) + semantic type classes. Import this. |
| `SKILL.md` | Agent-Skill manifest so this system works as a downloadable Claude skill. |
| `assets/` | Brand assets: `logo.svg`, `icon-192.svg`, `icon-512.svg`, `manifest.json`. |
| `preview/` | The Design System tab cards (colors, type, spacing, components, brand). Small reference specimens. |
| `ui_kits/app/` | **High-fidelity interactive recreation of the OlomiPay app** — `index.html` (clickable prototype: landing → login → dashboard → chat → send), JSX components, and its own README. |

### Using the system
1. **Tokens:** `<link rel="stylesheet" href="colors_and_type.css">` then use the CSS vars / `.ds-*` classes.
2. **Icons:** Lucide (CDN or inline), 1.8 stroke.
3. **Brand:** pull from `assets/`. Never redraw the logo.
4. **Components / screens:** lift from `ui_kits/app/` — it mirrors the real components.
5. **Pick a skin:** dark "2030" for marketing/auth, light "airy" for in-app.

---

*Recreated from the OlomiPay codebase. Fonts are loaded from Google Fonts (Inter) — the exact family used in production. Icons are Lucide, the production icon set. No substitutions were required.*
