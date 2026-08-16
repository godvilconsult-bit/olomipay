# Universal Marketplace — Target Architecture

> Turning Jiko Connect from an LPG-only, Tanzania-only, single-hop delivery app into a
> **global marketplace for any product**, with a **multi-tier supply chain**
> (manufacturer → wholesaler → shop → consumer), **end-to-end live tracking**, and a
> **freight marketplace** where shippers find transporters and transporters find loads.

**Status:** design, for sign-off. No schema or behaviour changes yet.
**Supersedes:** parts of [`PHASE1-AUDIT.md`](./PHASE1-AUDIT.md) — see §0.

---

## 0. What this changes vs. the earlier audit

The Phase 1 audit was written to make the app *product-agnostic and multi-tenant*.
Two of its conclusions are now reversed:

| Audit said | Now |
|---|---|
| `DistributorProfile`, `RestockOrder`, `RestockItem`, `DistributorStock` are gas-specific — **delete** | **Generalize.** The upstream chain is a headline feature, not gas baggage |
| Introduce `Tenant` + `tenantId` on every model (white-label operators) | **One global marketplace.** Country/currency/locale become *configuration*, not tenancy |

Everything else in the audit still stands, in particular: attributes as JSON on a
category-owned schema, money as integer minor units, and expand/contract migration.

**Decisions taken (2026-08-16):** one global marketplace · generic catalog + order core
first · full freight marketplace with quoting.

---

## 1. The two collapses

The whole refactor rests on noticing that the schema already contains each core concept
**twice** — once for retail, once for wholesale:

```
Order      (household → supplier)      ┐
                                        ├─→  one party-to-party  Order
RestockOrder (supplier → distributor)  ┘

Inventory        (supplier sells product)  ┐
                                            ├─→  one  Offer
DistributorStock (distributor sells product)┘
```

Collapsing these is what makes the chain work: if *any* party can be the buyer and *any*
party the seller on one order model, then manufacturer→wholesaler, wholesaler→shop, and
shop→consumer are all the same transaction at different tiers. No new order type is ever
needed — a pharmacy chain or an agro-dealer network is just different `Organization` kinds
trading on the same edge.

---

## 2. Parties: `User` ≠ trading entity

Today `User.role` is a single enum. That breaks immediately in a multi-tier market,
because **a shop is simultaneously a buyer and a seller**, and a logistics company has many
drivers.

```prisma
model Organization {
  id            String   @id
  name          String
  slug          String   @unique
  kind          OrgKind                  // INDIVIDUAL RETAILER WHOLESALER MANUFACTURER CARRIER
  canBuy        Boolean  @default(true)
  canSell       Boolean  @default(false)
  canCarry      Boolean  @default(false)

  countryCode   String                   // ISO-3166-1 alpha-2
  currency      String                   // ISO-4217
  locale        String   @default("en")
  timezone      String   @default("UTC")

  isVerified    Boolean  @default(false)
  rating        Float    @default(0)
}

enum OrgKind { INDIVIDUAL RETAILER WHOLESALER MANUFACTURER CARRIER PLATFORM }

model Membership {
  userId  String
  orgId   String
  role    MemberRole                     // OWNER MANAGER STAFF DRIVER
  @@unique([userId, orgId])
}
```

A private consumer gets an auto-created `INDIVIDUAL` org on signup, so **orders always link
org→org** and there is no special case anywhere in the order code.

`User` keeps login, KYC and notification concerns. `Role` survives only as a *default UI
hint*; authorization moves to `Membership.role` + `Organization.can*`.

---

## 3. Catalog: attributes, not columns

`Product.brand` / `Product.sizeKg` / `enum ProductType` are gas concepts sitting in typed
columns. They become data:

```prisma
model Category {
  id              String  @id
  parentId        String?                 // tree: Home > Kitchen > Cooking gas
  key             String  @unique         // "lpg_refill", "cement_50kg", "paracetamol_500"
  name            String
  unitType        String                  // piece | kg | litre | m3 | pack
  attributeSchema Json                    // JSON-Schema validated on write
}

model Product {
  id           String  @id
  categoryId   String
  ownerOrgId   String?                    // null = shared global catalog entry
  gtin         String?                    // barcode — the key to a *global* catalog
  name         String
  attributes   Json                       // { brand: "Oryx", sizeKg: 15 }
  images       Json
}

model Offer {                             // replaces Inventory + DistributorStock
  id           String  @id
  productId    String
  sellerOrgId  String
  priceMinor   Int                        // integer minor units
  currency     String
  stock        Int     @default(0)
  moq          Int     @default(1)        // minimum order qty — wholesale tiers
  isAvailable  Boolean @default(true)
  @@unique([sellerOrgId, productId])
}
```

The existing gas catalog becomes categories `lpg_refill` / `lpg_cylinder` /
`lpg_accessory` whose `attributeSchema` declares `brand` and `sizeKg` — reproducing
today's behaviour exactly, with zero gas-specific code left in the engine.

---

## 4. Orders: one model, any tier

```prisma
model Order {
  id             String   @id
  orderNo        String   @unique
  buyerOrgId     String
  sellerOrgId    String
  channel        Channel                  // RETAIL | WHOLESALE (derived, for reporting)
  status         OrderStatus

  currency       String
  itemsTotalMinor      Int
  deliveryFeeMinor     Int
  serviceFeeMinor      Int
  commissionMinor      Int
  totalMinor           Int

  parentOrderId  String?                  // ← the chain link
  shipmentId     String?
}
```

`parentOrderId` is what makes the supply chain visible. When a shop's stock is drawn down
by a consumer order it can raise a restock order upstream **linked to the order that caused
it**. Walking `parentOrderId` yields the full provenance:

```
consumer order  ←  shop's restock from wholesaler  ←  wholesaler's order from manufacturer
```

That chain is exactly what §6 renders on the map.

---

## 5. Logistics: shipments with legs

Today `Delivery` is one rider, one hop, one order. A chain needs many hops, and freight
needs hops with no product order behind them at all.

```prisma
model Shipment {
  id            String  @id
  orderId       String?                   // null ⇒ pure freight job from the load board
  shipperOrgId  String
  carrierOrgId  String?
  status        ShipmentStatus
  legs          ShipmentLeg[]
}

model ShipmentLeg {
  id            String  @id
  shipmentId    String
  seq           Int                       // 0,1,2… manufacturer→wholesaler→shop→consumer
  originLat     Float
  originLng     Float
  destLat       Float
  destLng       Float
  vehicleId     String?
  driverUserId  String?
  status        LegStatus
  plannedRoute  String?                   // encoded polyline, computed server-side once
  distanceM     Int?
  durationS     Int?
  startedAt     DateTime?
  completedAt   DateTime?
}

model TrackingPing {
  legId  String
  lat    Float
  lng    Float
  at     DateTime
  @@index([legId, at])
}
```

`Delivery` becomes a single-leg `Shipment` — the migration is mechanical, and the existing
socket spine in [`socket/index.ts`](../../backend/src/socket/index.ts) keeps working
with `deliveryId` swapped for `legId`.

---

## 6. The map: from one pin to the whole chain

Current state is thinner than the audit suggests. OSRM routing exists **only** inside
[`LeafletMap.tsx`](../../frontend/components/LeafletMap.tsx) — client-side, against the
public `router.project-osrm.org` demo server. The Google engine has no routing at all, and
the shared `MapProps` is markers-only.

**Blocker for worldwide use:** the public OSRM demo server is rate-limited, has no SLA and
forbids production use. It must go behind a provider interface before any scale claim.

Target:

| Now | Target |
|---|---|
| Route fetched in the browser, per rider move | Computed **server-side once per leg**, cached on `ShipmentLeg.plannedRoute` |
| Route only on Leaflet | Shared `MapProps.routes[]` — both engines render polylines |
| One rider pin | Every leg drawn, coloured by status: done / active / pending |
| Public OSRM demo | `RoutingProvider` interface — self-hosted OSRM, Valhalla or Mapbox per region |
| Straight-line ETA (`etaMinutes`, 24 km/h) | Real road duration per leg, summed across remaining legs |

The consumer opening their order sees the *whole* journey — the manufacturer→wholesaler leg
greyed out as completed, the shop→door leg animating live — which is the "see the
distribution of the product" ask, made literal.

---

## 7. Freight marketplace

Two-sided, and it must work from **both** directions.

```prisma
model Load {                              // a shipper posting cargo
  id             String  @id
  shipperOrgId   String
  originLat/Lng, destLat/Lng, originAddressId, destAddressId
  pickupFrom     DateTime
  pickupTo       DateTime
  weightKg       Float
  volumeM3       Float?
  cargoType      String
  isHazmat       Boolean @default(false)
  needsRefrigeration Boolean @default(false)
  budgetMinor    Int?
  currency       String
  status         LoadStatus               // OPEN QUOTED AWARDED IN_TRANSIT DELIVERED CANCELLED
  shipmentId     String?                  // created on award
}

model Quote {                             // a transporter bidding
  id             String  @id
  loadId         String
  carrierOrgId   String
  amountMinor    Int
  currency       String
  etaPickup      DateTime
  etaDrop        DateTime
  status         QuoteStatus              // PENDING ACCEPTED REJECTED WITHDRAWN
  @@unique([loadId, carrierOrgId])
}

model Vehicle {
  id             String  @id
  orgId          String
  type           VehicleType              // + VAN LORRY TRAILER TANKER REEFER
  plateNo        String?
  capacityKg     Float
  capacityM3     Float?
  isRefrigerated Boolean @default(false)
  currentLat/Lng Float?
}

model CarrierRoute {                      // "I run Dar→Mwanza Fridays, 2t spare"
  id             String  @id
  carrierOrgId   String
  vehicleId      String?
  originLat/Lng, destLat/Lng
  corridorKm     Float   @default(50)     // detour tolerance for matching
  departsAt      DateTime
  recurrence     String?                  // RRULE
  capacityKgFree Float
}
```

- **Shipper → transporter:** post a `Load`, receive `Quote`s, accept one → a `Shipment` is
  created and tracking begins on the same spine as product orders.
- **Transporter → shipper:** post a `CarrierRoute`; the matcher surfaces `OPEN` loads whose
  origin *and* destination fall within `corridorKm` of the lane and whose weight fits
  `capacityKgFree`. This is backhaul matching — the feature that makes a load board pay for
  itself, since empty return trips are the industry's main waste.

Product orders can also spill onto the load board: an order too heavy for the local rider
pool becomes a `Load` automatically, so the two sides feed each other.

---

## 8. Going global

| Concern | Today | Target |
|---|---|---|
| Money | `Float`, TZS assumed | `Int` minor units + ISO-4217 on every money row |
| Address | `region/district/ward` (TZ) | `line1/line2/city/state/postalCode/countryCode` + `adminLevels Json` |
| Phone | `+255` assumed | E.164 with country detection |
| Payments | 4 TZ mobile-money providers hardcoded | `PaymentProvider` interface; mobile money, card, bank, COD as impls |
| Pricing | global env constants in `fees.ts` | `PricingConfig` per market, `fees.ts` a pure function |
| Locale | EN/SW | ICU message catalogues, RTL-capable |
| Routing | public OSRM demo | pluggable, self-hosted per region |
| Regulation | `PriceCap` (EWURA) | generic `PriceRule` scoped by country/category |

**Money is the one I would not defer.** `Float` for money is already a rounding bug; with
FX across markets it becomes a reconciliation problem. It is far cheaper to fix while the
money rows are being migrated anyway.

---

## 9. Migration — expand / contract

Each step is independently deployable and reversible. **The gas flow is the regression
baseline at every step**: if a household in Dar can still order a 15 kg Oryx refill and
watch the rider arrive, the step is green.

| Phase | Work | Risk |
|---|---|---|
| **1. Expand** | Add `Organization`, `Membership`, `Category`, `Offer`, `Shipment`, `ShipmentLeg` alongside existing tables. Nothing reads them yet | none — additive |
| **2. Backfill** | Auto-create an org per user; map `SupplierProfile`→RETAILER, `DistributorProfile`→WHOLESALER; `Inventory`+`DistributorStock`→`Offer`; gas products → categories + attributes | reversible |
| **3. Dual-read** | Order/catalog code reads new models, writes both. Money migrates to minor units behind helpers | medium — full test pass |
| **4. Cut over** | `Order` becomes party-to-party; `RestockOrder` folds in with `parentOrderId`; `Delivery`→single-leg `Shipment` | highest — feature-flagged |
| **5. Freight** | `Load`, `Quote`, `Vehicle`, `CarrierRoute` + matcher + screens | additive, new surface |
| **6. Map** | `RoutingProvider`, server-side route caching, multi-leg chain rendering on both engines | additive |
| **7. Contract** | Drop `brand`/`sizeKg`/`ProductType`/`Cylinder`/`PriceCap`/restock tables | cleanup |

Phases 5 and 6 are independent of each other and can run in parallel once 4 lands.

---

## 10. Explicitly not in scope

Cylinder deposit tracking stays as a gas-category plugin rather than core (`Cylinder` is a
returnable-container concept — worth generalizing later as `ReturnableAsset`, not now).
Brand ads (`BrandAd`/`AdLead`) stay as-is; they are orthogonal to the chain work.
Cross-border customs, duties and multi-currency settlement are **not** modelled in these
phases — international *listing* is supported, international *clearing* is not.

---

## 11. Sign-off needed

1. **`Organization` as the trading party** — bigger than the audit's plan, but without it
   "a shop that buys and sells" has no clean representation. Confirm.
2. **Money → integer minor units in phase 3.** Touches every money path and its tests.
3. **Routing provider** — self-hosted OSRM (free, ops burden) vs. Mapbox/Google (paid, no
   ops). Needed before phase 6; affects cost model.
4. **Consumer-visible provenance** — should a consumer see the *upstream* legs of their
   product's chain, or only their own delivery leg? Full visibility is the headline feature
   but exposes supplier relationships between businesses.
