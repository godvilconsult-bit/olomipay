---
name: olomipay-design
description: Use this skill to generate well-branded interfaces and assets for OlomiPay, either for production or throwaway prototypes/mocks/etc. Contains essential design guidelines, colors, type, fonts, assets, and UI kit components for prototyping. OlomiPay is a mobile-money × Stellar super-app for Tanzania ("Building Trust Through Blockchain") — wallet, encrypted chat-with-payments, and earning.
user-invocable: true
---

# OlomiPay Design Skill

Read **`README.md`** in this skill first — it covers the product, content/voice rules, visual foundations, and iconography. Then explore the other files as needed:

- **`colors_and_type.css`** — all design tokens (color, gradients, surfaces, radii, shadows, motion) as CSS vars + semantic type classes. Import or copy these; don't invent new colors.
- **`assets/`** — brand assets: `logo.svg`, app icons, `manifest.json`. Never redraw the logo.
- **`preview/`** — reference specimens for colors, type, spacing, components, brand.
- **`ui_kits/app/`** — a high-fidelity interactive recreation of the OlomiPay app (landing, login, dashboard, chat-with-payments, send). Lift its JSX components for new screens.

## Working rules
- **Two skins, one token set:** dark "2030 fintech" (aurora orbs + glass) for marketing/auth; light "airy" (gradient-mesh + glass cards) for the in-app experience.
- **Font:** Inter (Google Fonts), 400–800. Body 16px minimum. Display headings extra-bold, tight tracking, fluid.
- **Signature gradient:** blue `#3b82f6` → emerald `#22c55e` for primary actions, active nav, and the "money" motif.
- **Icons:** Lucide, ~1.8 stroke. Don't swap families or hand-draw replacements.
- **Voice:** confident challenger, "you"-first, sentence case, concrete numbers, trust language. Hide the crypto (USD/TZS/"coins", "Olomi Wallet", "settled on-chain" — never "Stellar/XLM"). Emoji used sparingly as status.
- **Shape & depth:** rounded-3xl cards (24px), rounded-2xl buttons/inputs (16px), soft blue-tinted shadows, frosted/glass surfaces, 48px touch targets, spring-out easing `cubic-bezier(.22,1,.36,1)`, `active:scale-95` press.
- **Animation safety:** make the visible end-state the base style; never reveal content via opacity-from-0 animation (gate entrances on transform + `prefers-reduced-motion`).

## If creating visual artifacts (slides, mocks, throwaway prototypes)
Copy the assets you need out of this skill and produce static/self-contained HTML files for the user to view. Use the tokens and UI-kit components for fidelity.

## If working on production code
Copy assets and read the rules here to become an expert in designing with the OlomiPay brand; match the codebase's Tailwind tokens and component patterns.

## If invoked with no specific guidance
Ask the user what they want to build or design, ask a few focused questions (surface, audience, dark vs light skin, scope), then act as an expert OlomiPay designer who outputs either HTML artifacts or production code, depending on the need.
