# Khana Bridge

Khana Bridge is a local, database-backed platform with two connected services:

- **A · Supermarket marketplace.** Supermarkets list batches that have expiry dates. Restaurants and the public buy them at prices set by a seller-defined, deterministic discount rule.
- **B · Surplus donation network.** Verified organisations raise food-need tickets. Restaurants announce expected surplus and then confirm what is actually ready. A deterministic matcher pairs food with needs. Reservations are atomic. Logistics is dispatched manually, and receipts record accepted and rejected quantities.

It needs no paid APIs, SMS, email, payment gateway, AI model or logistics account.

## Stack

Next.js 16.4 (App Router, server actions, Cache Components **off** because every page is per-user) · React 19 · TypeScript · Tailwind CSS 4 · Prisma 6.19 + SQLite · Zod 4 · bcryptjs · Vitest 4. Versions are pinned in `package.json`, and `package-lock.json` is committed.

## UI kits

| Kit | How it's wired | Use |
|---|---|---|
| **shadcn/ui** (radix-nova style) | `components.json`; tokens in `globals.css` mapped to the Khana Bridge palette | `npx shadcn add button dialog …` → `src/components/ui/*` |
| **Radix UI** | `radix-ui` package (what shadcn components build on) | `import { Dialog } from "radix-ui"` |
| **React Bits** | registered as `@react-bits` in `components.json` (copy-in components; there is no npm package) | `npx shadcn add @react-bits/SplitText-TS-TW` |
| **daisyUI 5** | `@plugin "daisyui"` in `globals.css`, **prefixed `d-`** so it doesn't restyle the app's own `.btn`/`.input` | `className="d-btn d-btn-primary"` |

Grey secondary text uses shadcn's `text-muted-foreground`. Fonts stay on the system stack, so builds need no network access.

## Photos

Supermarkets add up to 6 photos per product. Restaurants add up to 6 per surplus batch, either while listing it or later from the batch page. The first photo is the cover, and staff can reorder or remove photos. Files are PNG, JPEG or WebP, up to 5 MB each, checked by content rather than file name, and stored privately in `UPLOAD_DIR`. They are served at original quality through `/api/files/[id]`:

- **Product photos** are public, so shoppers, restaurants and organisations all see them.
- **Surplus photos** are visible to signed-in members of approved organisations (and admins), never to anonymous visitors or personal buyers.
- Photos never establish food safety; the handling declaration does.

The seed gives every demo product and surplus batch a matching photo from `prisma/demo-photos/`, picked by keyword in its name (milk, paneer, biryani…). On an already-seeded database, run `npx tsx prisma/demo-photos.ts`. The photos come from Wikimedia Commons under their own licences; see `prisma/demo-photos/CREDITS.md`.

## Setup

```bash
npm install
cp .env.example .env
npm run setup        # prisma migrate deploy + seed
npm run dev          # http://localhost:3000
npm run worker       # separate terminal: background sweeps every 60 s
```

Other commands:

| Command | What it does |
|---|---|
| `npm test` | Vitest suite (builds a throwaway `prisma/test.db` from migrations each run) |
| `npm run typecheck` / `npm run lint` / `npm run build` | Type check, ESLint, production build |
| `npm run worker:once` | One worker sweep, then exit |
| `npm run db:reset` | Drop and rebuild the dev DB and reseed (`prisma migrate reset`; dev only) |
| `npm run db:seed` | Seed (skips if already seeded) |
| `ADMIN_PASSWORD='…' npm run admin:create -- +91XXXXXXXXXX "Name"` | Controlled platform-admin bootstrap (CLI only, never over HTTP) |

## Demo access (local only)

With `DEMO_MODE="true"` and `NODE_ENV` not production, **/demo** lists the seeded fictional accounts with an "Enter as this user" button. Every seeded account uses the password `demo-password-123`. Demo sign-in only works for users flagged `isDemo`, so it cannot impersonate real accounts, and it disappears outside demo mode.

| Phone | Who |
|---|---|
| +919000000001 | Platform admin (use the "Platform admin" context) |
| +919000000011 / 12 | GreenBasket Mart owner / operator |
| +919000000013 | Daily Fresh Stores owner |
| +919000000021 / 22 / 23 | Restaurants: Spice Route, Annapoorna, Coastal Curry (approved) |
| +919000000024 | Little Tiffin (restaurant, pending) |
| +919000000031 / 32 / 33 / 34 | Hope Shelter: POC / coordinator / viewer / driver |
| +919000000035 | Sunrise Children's Home (approved, restricted to complete meals, excludes peanut) |
| +919000000036 | Community Kitchen Collective (component request) |
| +919000000037 / 38 / 39 | Hospital programme (submitted), New Leaf (changes requested), Riverbank (suspended) |
| +919000000041 / 42 | Logistics dispatcher / driver |
| +919000000051 | Personal buyer |

Seed highlights: the 80-plate ticket filled 50 + 30 from two restaurants; a component ticket (rice kg, dal litres, roti pieces) that is partly covered and shown honestly as an incomplete bundle; a failed delivery awaiting resolution; an expired hold; expected surplus; a lot with unknown allergens that must not match; a recurring Mon–Sat lunch; a recalled and an expired grocery batch; a manual-reported payment. Seed times are relative to "now". Set `KHANA_BRIDGE_CLOCK_OFFSET_MIN` to shift the app clock.

## Architecture

```
src/
  lib/        db (Prisma + retrying tx), auth (phone/password, sessions), authz (actor + tenant context),
              session (HttpOnly cookie), policy (versioned settings), audit+notify, geo, time (UTC↔IST), validate (zod)
  services/   business rules — orgs, tickets, surplus, matching, offers, logistics, marketplace, reports, admin, worker, files
  app/        pages (server components) + app/actions/* (server actions → services) + api/files, api/export
  components/ UI kit, shell, forms (useActionState; values survive validation errors)
prisma/       schema, migrations, seed
scripts/      worker.ts, create-admin.ts
tests/        service-level tests against a real SQLite DB
```

Key rules:

- **Tenant scope comes from the server.** The session stores the active membership. Every action reloads the user and membership from the DB, so a client-sent tenant or role is never trusted. Cross-tenant reads return 404.
- **No overselling.** Quantity changes are conditional SQL updates (`allocatedQty + q <= quantity`, `reservedQty + q <= quantity`, and the batch equivalent) inside transactions. Offer acceptance is an exactly-once `PROPOSED → ACCEPTED` flip. Idempotency keys cover offers, reservations and checkout.
- **Units are never converted.** Requirements and food items each carry a unit. Matching requires the same kind and unit (and, for components, the same name). Reports group by unit.
- **Matching** (`services/matching.ts`): hard filters first (verification, stage READY, deadlines, diet, reviewer food-type restrictions, allergens where unknown never satisfies an exclusion, units, distance, arrival/serving feasibility, partial/minimum rules), then a transparent score (urgency, distance, quantity fit, serving soon, fairness penalty). Both "why" and "why not" are shown.
- **Pricing** (`services/marketplace.ts#quote`): `1 − (1 − time%)(1 − volume%)`, capped by both the rule and the platform, with a floor. Buying more never raises the unit price; rules that would do so are rejected. Orders snapshot the breakdown and rule version.
- **Worker** (`npm run worker`): expires offers, releases expired holds (holds on an active job alert ops instead), expires lots past pickup deadline with a recorded reason, sends escalation waves, expires tickets and grocery reservations, and generates recurring occurrences (idempotent `scheduleId:date`, never in the past). Each task is claimed once per minute bucket in the `JobTask` table, so overlapping workers or retries are safe.
- **Uploads** live in `UPLOAD_DIR` (outside `/public`) and are served only through `/api/files/[id]` after an authorisation check. They are limited to 5 MB and to PDF/PNG/JPEG/WebP checked by magic bytes; PDFs with JS, launch actions or embedded files are rejected. **No malware scanning.**
- **CSRF:** server actions are POST-only with Next's built-in origin check. Cookies are HttpOnly and SameSite=Lax (Secure in production) and expire after 7 days. Login and registration are rate-limited.

## What is verified

- `npm test`: 24 tests, all passing. They cover onboarding/verification gating and the no-self-approval rule, invitation/coordinator/viewer/buyer permissions, 50 + 30 = 80 plates, components staying in their own units, two concurrent reservations of one lot, double-accepting one offer, unknown allergens, unit mismatch, impossible timing, expired and expected lots, recurring generation retried (sequential and concurrent), hold expiry, the receiver/funding/collector dispatch gates, partial pickup and receipt, failure after collection, the pricing formula and floor/cap, concurrent checkout oversell, repricing and expiry at checkout, offline payment rules and recall, all-or-nothing CSV import, cross-tenant tickets, files, jobs, orders and exports, and CSV formula escaping.
- Manual browser smoke runs on the dev server. Donation: raise ticket → restaurant confirms surplus → offer → accept → dispatcher creates a 2-pickup job → receiver confirms and funds → collector assigned → pickups (one short) → transit → receipts (one partial rejection). Ticket quantities, notifications and reports updated correctly. Grocery: buyer reserves 10 kg → seller records cash → collection → admin confirms payment. Every role's pages and cross-tenant URLs were also checked.

## Not implemented / genuine production dependencies

- **Messaging:** in-app only. Email/SMS/OTP providers are not connected, phone ownership is not verified, and password reset is admin-assisted (one-time temporary password).
- **Payments:** offline recording only. Any gateway, webhooks and reconciliation still have to be built.
- **Logistics providers:** manual booking only. Distances are straight-line; there is no road routing, traffic or live tracking.
- **Rate limiting:** in-memory per process (`shortcut:` comment in `lib/auth.ts`). Needs a shared store for multiple instances.
- **File storage:** local disk adapter (`services/files.ts`). Move to object storage for multi-instance or serverless hosting. Add malware scanning before accepting public uploads.
- **Database:** SQLite. Statuses are strings validated in code. PostgreSQL needs a provider change, fresh migrations and a data migration. The raw SQL uses quoted identifiers that work in both.
- **Weights for vehicle capacity** are per-unit estimates (`shortcut:` in `services/logistics.ts`).
- Organisation timezone is selectable but only `Asia/Kolkata` is offered. Food deadline policy defaults are illustrative and need review by a food-safety professional.

## Deploying

Needs a **persistent** disk for the SQLite file and `UPLOAD_DIR`, plus a **long-running worker process**. An ephemeral serverless filesystem will lose both, so don't use one.

1. On a VM or container host with a persistent volume: `npm ci && npm run build && npx prisma migrate deploy`.
2. Set `DATABASE_URL="file:/data/khana-bridge.db"`, `UPLOAD_DIR=/data/uploads` and `NODE_ENV=production`. **Leave `DEMO_MODE` unset.** Don't run the seed.
3. Create the first admin with `npm run admin:create`.
4. Run `npm start` behind HTTPS (secure cookies), and run `npm run worker` as a separate supervised process (systemd/pm2/container).
5. Back up the database file and uploads directory.

For multiple app instances, first move to PostgreSQL, object storage and a shared rate limiter.
#   H U N T E R  
 