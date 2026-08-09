# Phase 1 Audit — Multi-Tenant, Product-Agnostic Refactor

> Where gas-cylinder, single-tenant, and TZS assumptions are hardcoded today, and
> the proposed generic model + migration. **No production schema changes made
> yet** — this is for sign-off before we touch the DB.

## 0. What's already in good shape (don't rebuild)
- **OSRM road-snapped routing** is already integrated (commit `8652601`) — Phase 2's
  "add a routing engine" is largely done; the remaining Phase 2 work is offline
  tile caching, multi-stop optimization, and polygon zones.
- **Test suite + CI** (vitest, `f9738c8`) — the "every change needs tests" constraint
  has infrastructure to build on.
- **`Payment.currency`** already exists (defaults `"TZS"`) — currency is partly modelled.
- **i18n EN/SW** exists — Phase 3 language abstraction is partly satisfied.

## 1. Gas-specific hardcoding (must become configurable)
| Location | Hardcoded thing |
|---|---|
| `enum ProductType` | `REFILL / CYLINDER / ACCESSORY` — gas-only concepts |
| `Product.brand`, `Product.sizeKg` | Cylinder brand (Taifa/Oryx/…) + kg size as first-class columns |
| `OrderItem.brand`, `OrderItem.sizeKg` | Same, snapshotted onto every order line |
| `enum CylinderStatus` + `model Cylinder` | Cylinder deposit/return lifecycle |
| `RestockStatus`, `DistributorProfile`, `DistributorStock`, `RestockOrder`, `RestockItem` | Gas wholesale supply chain (distributor → shop) |
| `model PriceCap` | EWURA (TZ gas regulator) price ceilings |
| `BrandProfile`, `BrandAd`, `AdLead` | Gas-brand advertising module |
| `SupplierTier` | Gas-supplier tiering |

**Verdict:** product identity lives in typed columns + enums. It must move to a
generic `Product` with a **configurable attribute set** (brand/size/unit are just
attributes) owned by a `ProductCategory`, so water/agro/pharmacy tenants define
their own attributes without a schema change.

## 2. Single-tenant assumptions
- **No `Tenant` model and no `tenantId` anywhere.** Every user, supplier, rider,
  product, order, zone, price rule is implicitly one operator.
- Vendor search, order matching, ads, price caps — all global.
- **Verdict:** introduce `Tenant`; add `tenantId` to every tenant-scoped model;
  enforce isolation in every query (middleware + row-level checks + tests).

## 3. Currency / TZS
- Order money fields (`itemsTotal`, `deliveryFee`, `serviceFee`, `commissionAmount`,
  `total`, …) are **`Float`** with **no currency code** — TZS assumed.
- `Inventory.price` comment: `// TZS`. `fees.ts`: "All amounts are TZS integers."
- **Two issues:** (a) no explicit currency on orders/inventory/wallet; (b) money as
  `Float` (rounding risk — should be integer minor units).
- **Verdict:** add `currency` (ISO-4217) to money-bearing rows (Order, Inventory,
  Wallet, Payout), sourced from the tenant. Standardize on **integer minor units**.

## 4. Pricing / fees in code
- `lib/fees.ts` computes delivery fee, service fee, commission, surge, margins from
  **global env constants** (`JIKO_SERVICE_FEE`, `DELIVERY_BASE`, `DELIVERY_PER_KM`,
  `DELIVERY_MARGIN_PCT`, …). One pricing model for everyone.
- **Verdict:** move to a **per-tenant `PricingConfig`** (flat / tiered / per-unit /
  subscription), read at order time. `fees.ts` becomes a pure function of
  `(pricingConfig, order)`.

## 5. Address / zones
- `Address` uses `region / district / ward` (TZ admin divisions).
- Delivery matching is **radius/distance** based; no polygon zones.
- **Verdict:** generic address (structured lines + optional admin levels + geo);
  add tenant-configurable **polygon `DeliveryZone`** (Phase 2).

---

## 6. Proposed generic model (Phase 1 target)
```
Tenant
  id, name, slug, defaultCurrency, defaultLocale, status
  ThemeConfig (logo, palette, notification copy EN/SW)  ← configurable, no redeploy
  PricingConfig (model: FLAT|TIERED|PER_UNIT|SUBSCRIPTION, params JSON)

ProductCategory (tenantId)
  key ("gas_refill", "water_20l", …), name, unitType, attributeSchema (JSON)

Product (tenantId, categoryId)
  name, attributes (JSON: {brand, sizeKg} for gas; {volumeL} for water), imageUrl
  pricingOverride? (per-product)

DeliveryZone (tenantId)  ← Phase 2 (polygon), Phase 1 keeps radius
Order / OrderItem / Rider / Supplier  ← all gain tenantId; product-type-agnostic
Payment  ← currency already present; provider goes behind a PaymentProvider interface (Phase 3)
```
The current gas tenant becomes **Tenant #1** — its `ProductCategory`/attribute
schema reproduces today's `ProductType` + `brand` + `sizeKg` exactly, so behaviour
is identical.

## 7. Migration strategy (no downtime — expand/contract)
1. **Expand:** add `Tenant` + nullable `tenantId` columns + new config tables.
   Deploy — old code ignores them.
2. **Backfill:** create "Tenant #1 (Jiko Gas TZ)"; set `tenantId` on all existing
   rows; build its `ProductCategory`/attributeSchema from current `ProductType`,
   and copy `brand`/`sizeKg` into `Product.attributes`.
3. **Enforce:** make `tenantId` non-null; add tenant-scoping middleware + query
   guards; keep `brand`/`sizeKg` columns temporarily (dual-read) so nothing breaks.
4. **Contract:** once all reads use `attributes`, drop the legacy typed columns.
- Each step is independently deployable and reversible. Gas tenant is the
  regression baseline at every step.

## 8. Decisions that need your sign-off BEFORE I touch the schema
1. **Attributes storage:** flexible **JSON `attributes`** per product (fast, schema-light,
   less type-safety) vs. a normalized `AttributeDefinition`/`AttributeValue` pair
   (more tables, stronger validation). *Recommendation: JSON + a validated
   `attributeSchema` on the category — pragmatic for the pilot.*
2. **Money representation:** migrate `Float` → **integer minor units** now (correct,
   but touches every money path + tests) or defer to a later hardening pass?
   *Recommendation: do it in Phase 1 while we're already migrating money rows.*
3. **Migration cadence:** big-bang (one release) vs. the **expand/contract** above
   over several releases. *Recommendation: expand/contract — safest for production.*
4. **Scope guard:** this is a multi-week refactor of a now-substantial app (40+
   models, live users). Confirm we proceed **phase-by-phase with a green test
   suite and the gas tenant as regression baseline at every step**, and that I
   pause for sign-off at each phase boundary (per your prompt).

## 9. What I will NOT do until sign-off
- No schema edits, no migrations, no data backfill.
- No changes to `fees.ts`, order flow, or routing.
Once you approve §8, I start with the **expand** step (additive `Tenant` +
`tenantId` + config tables) + tenant-isolation tests — zero behaviour change.
