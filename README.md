# OlomiPay — App UI Kit

A high-fidelity, interactive recreation of the **OlomiPay** PWA. Open `index.html` to use it as a clickable prototype inside a phone frame.

> Recreated from the codebase (`github.com/godvilconsult-bit/olomipay`, `frontend/`) — **not** from screenshots. Components are cosmetic recreations of the real ones; networking, encryption and Stellar/M-Pesa calls are faked.

## The flow

`index.html` boots on the **dark marketing landing** and walks the full happy path:

1. **Landing** → tap *Create free account* / *Sign in*
2. **Login** (dark glass form, phone + 6-digit PIN keypad) → *Sign in*
3. **Dashboard** — Olomi Wallet balance card, quick actions, recent transactions, KYC banner; the bell opens **Notifications**
4. **Chat list** → open a conversation
5. **Chat thread** — type a message, then tap the **$** button: a money panel lets you pick a quick amount **or type a custom amount** to send inside the chat (the signature money-card bubble + an on-chain "settled in 0.8s" toast; balance updates live). The panel is a full-width bar on phones and a compact bottom-left popover on tablet/desktop.
6. Every other surface is a real, faithful screen — reached from the quick actions, the bottom nav, or the **More** sheet.

## Screens included

All recreated from the codebase, with multi-step flows and PIN confirmation where the real app has them:

| Group | Screens |
|---|---|
| **Core** | Landing · Login · Dashboard · Chat list · Chat thread (with in-chat pay) · Send |
| **Money** | Deposit (Receive QR / Mobile Money / Bank) · Withdraw / Cash Out · Swap · Pay Bills |
| **Grow** | Savings (4.5% vault) · Staking (locked pools) · Bonds & Investment · Rewards (tiers + referral) |
| **Account** | Transaction History · Profile · Notifications · Virtual Card · Credit Score · Merchant QR · Chama groups · Payroll · Chama |

The four **More**-sheet finance flows (Deposit, Withdraw, Swap, Bills) hide the bottom nav while active, matching the focused-task pattern in the source app.

## Files

| File | What's in it |
|---|---|
| `index.html` | Phone frame, animation CSS, app router + state (balance, unread, toasts, More-sheet). Loads everything below. |
| `icons.jsx` | `<Icon name size stroke />` — the Lucide glyphs used across the app, inline. |
| `components.jsx` | `Logo, Button, Card, StatusBadge, Avatar, BalanceCard, QuickActions, TransactionItem, BottomNav`. Mirrors `frontend/components/*`. |
| `screen-kit.jsx` | Shared screen primitives: `ScreenHeader, Pill, Panel, SuccessState, Segmented, Chips, Field, PinEntry, ConfirmCard`. |
| `marketing.jsx` | `Landing`, `Login`, `Aurora` — the dark "2030" skin. |
| `app-screens.jsx` | `Dashboard, ChatList, ChatThread, SendScreen` — the light "airy" core. |
| `screens-money.jsx` | `DepositScreen, WithdrawScreen, SwapScreen, BillsScreen`. |
| `screens-grow.jsx` | `SavingsScreen, StakeScreen, InvestScreen, RewardsScreen`. |
| `screens-account.jsx` | `HistoryScreen, ProfileScreen, NotificationsScreen, CardScreen, CreditScreen, MerchantScreen, ChamaScreen, PayrollScreen`. |

## How it mirrors the source

- **Tokens & skins** follow `frontend/app/globals.css` + `tailwind.config.ts`: primary `#1a56db`, the blue→emerald money gradient, glass cards (`rgba(255,255,255,.72)` + blur), the gradient wallet card (`#1a3a6b → #1a56db`), 24px card radius, 48px touch targets, the floating glass bottom-nav with a gradient active pill.
- **Components** are simplified ports of the real ones — `BalanceCard` (hide/refresh, watermark, USD-led + TZS), `TransactionItem` (confirmed/pending/failed, line-through on failed), `QuickActions`, `BottomNav` (active = bold-stroke icon on gradient), `StatusBadge`, `Avatar` (deterministic color + presence dot).
- **Icons** are Lucide, the production set.

## Reuse

Each component exports to `window`, so you can lift them into a new OlomiPay design. Keep the load order in `index.html` (React → Babel → `icons` → `components` → `marketing`/`app-screens`). Give any new global style object a unique name (e.g. `myThingStyles`) — never a bare `styles`.

## Known gaps

- All primary flows are built out and faithful to the source. A few deeper sub-flows are represented at one level of depth (e.g. KYC and Support open from Profile but aren't full screens; Deposit's bank tab is intentionally "coming soon" as in the real app).
- No real auth/encryption/blockchain — all data is mocked in-file.
