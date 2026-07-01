# Self-Measurement & Cloud Import (Wave 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add two new sources of activity data that feed the existing `logActivity` pipeline — free in-app duration timers, and Pro-gated provider-agnostic cloud import (Strava reference connector) with a review queue.

**Architecture:** Both features converge on the existing `logActivity` service. Timers are pure frontend (wall-clock from a stored start timestamp, localStorage-persisted) and submit a normal log. Cloud import adds a `Connector` interface (Strava impl), a mapping layer, two tables (`provider_connections`, `imported_activities` review queue), connection/sync services, and integrations/imports routes. The only pipeline change is an optional `occurredAt` so accepted imports backdate to when the activity happened.

**Tech Stack:** Fastify 5, Drizzle ORM (`drizzle-kit push`), PostgreSQL, TypeScript (ESM, `"type": "module"`), Vitest (newly added to the API), React 18 + Vite + TanStack Query + React Router, Node `crypto` (AES-256-GCM).

## Global Constraints

- **Wave 1 scope only:** timers (free) + cloud import (Pro-gated), Strava only. No GPS, no Apple Health / Google Fit, no webhooks, no scheduled polling, no Fitbit/Garmin impls, no admin CRUD for the mapping table. (Spec §1 Non-goals.)
- **Pipeline is sacred:** no change to XP/level/perk/streak/cap *math*. The only edit to `logActivity` is adding an optional `occurredAt`. (Spec §5.)
- **Import → XP via review queue:** imported activities are never auto-logged; the user accepts them. (Spec §2.)
- **Sync is manual only.** (Spec §2.)
- **First sync window:** `last_synced_at ?? (now − 30 days)`. (Spec §2.)
- **Tokens server-side only, encrypted at rest** with AES-256-GCM, key from env `INTEGRATION_ENC_KEY`. Never returned to the client. (Spec §7.)
- **Entitlement split:** data-acquiring routes (`/integrations/:provider/connect`, `/callback`, `/sync`) are gated by `requireEntitlement("CLOUD_IMPORT")`; the review inbox (`GET /imports`, accept, bulk-accept, dismiss) and disconnect are **free**. Timers require no entitlement. (Spec §10.)
- **Dedup:** `imported_activities` unique on `(provider, external_id)`; sync upserts. Accept is idempotent. (Spec §3, §8.)
- **Code style:** snake_case DB columns (matching existing schema), camelCase TS, ESM imports with explicit relative paths, `import * as schema from "../db/schema"`.
- **No live provider API in tests.** Connector normalize tested against recorded fixtures; flows use a `FakeConnector`. (Spec §9.)

---

## File Structure

**API — new files**
- `apps/api/vitest.config.ts` — Vitest config (node env).
- `apps/api/src/lib/crypto.ts` — `encryptSecret` / `decryptSecret` (AES-256-GCM).
- `apps/api/src/lib/crypto.test.ts`
- `apps/api/src/connectors/types.ts` — `ActivityConnector`, `TokenSet`, `NormalizedActivity`, `RawConnection`.
- `apps/api/src/connectors/mapping.ts` — `mapNormalized()` + the provider-type table.
- `apps/api/src/connectors/mapping.test.ts`
- `apps/api/src/connectors/strava.ts` — `StravaConnector`.
- `apps/api/src/connectors/strava.test.ts` + `apps/api/src/connectors/__fixtures__/strava-activities.json`
- `apps/api/src/connectors/fake.ts` — `FakeConnector` (test/dev double).
- `apps/api/src/connectors/registry.ts` — `getConnector(provider)`.
- `apps/api/src/services/integrationService.ts` — connection store + token refresh + sync.
- `apps/api/src/services/integrationService.test.ts`
- `apps/api/src/routes/integrations.ts` — connect / callback / sync (Pro-gated).
- `apps/api/src/routes/imports.ts` — list / accept / bulk-accept / dismiss (free).

**API — modified files**
- `packages/types/src/index.ts` — add `CLOUD_IMPORT` to `Feature` + `FEATURE_GATES`; add import/integration response types.
- `apps/api/src/db/schema.ts` — `providerEnum`, `importStatusEnum`, `connectionStatusEnum`, `provider_connections`, `imported_activities`.
- `apps/api/src/services/logService.ts` — optional `occurredAt`.
- `apps/api/src/index.ts` — register `integrationsRoutes`, `importsRoutes`.
- `apps/api/package.json` — add `vitest` devDep + `test` script.
- `apps/api/.env.example` — `INTEGRATION_ENC_KEY`, `STRAVA_CLIENT_ID`, `STRAVA_CLIENT_SECRET`, `STRAVA_REDIRECT_URI`, `APP_WEB_URL`.

**Web — new files**
- `apps/web/src/lib/useTimer.ts` — refresh-proof timer hook.
- `apps/web/src/components/TimerBanner.tsx` — global running banner.
- `apps/web/src/pages/Integrations.tsx`
- `apps/web/src/pages/Imports.tsx`

**Web — modified files**
- `apps/web/src/lib/api.ts` — integration/import client methods + types; `createLog` unchanged.
- `apps/web/src/pages/LogActivity.tsx` — timer UI for duration activities.
- `apps/web/src/App.tsx` — `/integrations`, `/imports` routes + global banner.
- `apps/web/src/components/AppBar.tsx` — nav entries + pending-count badge.

---

## Phase 1 — Backend foundation

### Task 1: Vitest setup + encryption helper

**Files:**
- Modify: `apps/api/package.json` (add devDep + script)
- Create: `apps/api/vitest.config.ts`
- Create: `apps/api/src/lib/crypto.ts`
- Test: `apps/api/src/lib/crypto.test.ts`

**Interfaces:**
- Produces:
  - `encryptSecret(plaintext: string): string` — returns `"<ivB64>:<tagB64>:<cipherB64>"`.
  - `decryptSecret(blob: string): string` — inverse; throws on tamper.
  - Key source: `process.env.INTEGRATION_ENC_KEY` (64 hex chars → 32 bytes). In tests, set it in the test file.

- [ ] **Step 1: Add Vitest to the API package**

In `apps/api/package.json`, add to `scripts`:
```json
"test": "vitest run",
"test:watch": "vitest"
```
Add to `devDependencies`:
```json
"vitest": "^2.1.8"
```
Then install from the repo root:
```bash
pnpm install
```

- [ ] **Step 2: Create the Vitest config**

`apps/api/vitest.config.ts`:
```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
```

- [ ] **Step 3: Write the failing test**

`apps/api/src/lib/crypto.test.ts`:
```ts
import { describe, it, expect, beforeAll } from "vitest";
import { randomBytes } from "node:crypto";

beforeAll(() => {
  process.env.INTEGRATION_ENC_KEY = randomBytes(32).toString("hex");
});

import { encryptSecret, decryptSecret } from "./crypto";

describe("crypto", () => {
  it("round-trips a secret", () => {
    const secret = "strava-access-token-abc123";
    const blob = encryptSecret(secret);
    expect(blob).not.toContain(secret);
    expect(decryptSecret(blob)).toBe(secret);
  });

  it("produces a different ciphertext each call (random IV)", () => {
    expect(encryptSecret("same")).not.toBe(encryptSecret("same"));
  });

  it("throws when the ciphertext is tampered", () => {
    const blob = encryptSecret("token");
    const [iv, tag, cipher] = blob.split(":");
    const tampered = [iv, tag, Buffer.from("garbage").toString("base64")].join(":");
    expect(() => decryptSecret(tampered)).toThrow();
  });
});
```

- [ ] **Step 4: Run the test, verify it fails**

Run: `pnpm --filter @lifexp/api test`
Expected: FAIL — cannot find module `./crypto`.

- [ ] **Step 5: Implement the helper**

`apps/api/src/lib/crypto.ts`:
```ts
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGO = "aes-256-gcm";

function key(): Buffer {
  const hex = process.env.INTEGRATION_ENC_KEY;
  if (!hex || hex.length !== 64) {
    throw new Error("INTEGRATION_ENC_KEY must be 64 hex chars (32 bytes)");
  }
  return Buffer.from(hex, "hex");
}

/** Returns "<ivB64>:<tagB64>:<cipherB64>". */
export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, key(), iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString("base64"), tag.toString("base64"), enc.toString("base64")].join(":");
}

export function decryptSecret(blob: string): string {
  const [ivB64, tagB64, cipherB64] = blob.split(":");
  if (!ivB64 || !tagB64 || !cipherB64) throw new Error("malformed ciphertext");
  const decipher = createDecipheriv(ALGO, key(), Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(cipherB64, "base64")),
    decipher.final(),
  ]).toString("utf8");
}
```

- [ ] **Step 6: Run the test, verify it passes**

Run: `pnpm --filter @lifexp/api test`
Expected: PASS (3 tests).

- [ ] **Step 7: Commit**

```bash
git add apps/api/package.json apps/api/vitest.config.ts apps/api/src/lib/crypto.ts apps/api/src/lib/crypto.test.ts pnpm-lock.yaml
git commit -m "feat(api): add Vitest + AES-256-GCM secret encryption helper"
```

---

### Task 2: Add `CLOUD_IMPORT` feature gate

**Files:**
- Modify: `packages/types/src/index.ts:220-233`

**Interfaces:**
- Produces: `Feature` now includes `"CLOUD_IMPORT"`; `FEATURE_GATES.CLOUD_IMPORT = ["pro", "team"]`. Consumed by `requireEntitlement` in Task 8.

- [ ] **Step 1: Extend the `Feature` union**

In `packages/types/src/index.ts`, change the `Feature` type (currently lines 220-225) to add the member:
```ts
export type Feature =
  | "PRIVATE_EVENTS"
  | "GROUP_EVENTS"
  | "MULTIPLE_SHARED_GOALS"
  | "ADVANCED_ANALYTICS"
  | "TEAM_FEATURES"
  | "CLOUD_IMPORT";
```

- [ ] **Step 2: Add the gate**

In the `FEATURE_GATES` object (currently lines 227-233), add:
```ts
  CLOUD_IMPORT: ["pro", "team"],
```

- [ ] **Step 3: Typecheck the types package**

Run: `pnpm --filter @lifexp/types build`
Expected: PASS — `FEATURE_GATES` satisfies `Record<Feature, …>` with the new key (a missing key would be a compile error, which is the guard).

- [ ] **Step 4: Commit**

```bash
git add packages/types/src/index.ts
git commit -m "feat(types): add CLOUD_IMPORT feature gate (pro/team)"
```

---

### Task 3: Schema — connections + import queue tables

**Files:**
- Modify: `apps/api/src/db/schema.ts` (add enums after line 22; add tables near the end of the file)

**Interfaces:**
- Produces (Drizzle tables, consumed by Tasks 7/9):
  - `provider_connections`: `id, user_id, provider, access_token, refresh_token, token_expires_at, scopes, external_athlete_id, status, connected_at, last_synced_at`. Unique `(user_id, provider)`.
  - `imported_activities`: `id, user_id, provider, external_id, raw_payload, occurred_at, provider_type, mapped_activity_slug, value, intensity_inputs, status, log_id, created_at, updated_at`. Unique `(provider, external_id)`.
  - Enums: `providerEnum(["strava"])`, `connectionStatusEnum(["active","needs_reauth"])`, `importStatusEnum(["pending","accepted","dismissed"])`.

- [ ] **Step 1: Add the enums**

In `apps/api/src/db/schema.ts`, after the existing enum block (after line 22), add:
```ts
export const providerEnum = pgEnum("provider", ["strava"]);
export const connectionStatusEnum = pgEnum("connection_status", ["active", "needs_reauth"]);
export const importStatusEnum = pgEnum("import_status", ["pending", "accepted", "dismissed"]);
```

- [ ] **Step 2: Add the tables**

At the end of `apps/api/src/db/schema.ts`, add:
```ts
export const provider_connections = pgTable(
  "provider_connections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    user_id: uuid("user_id").notNull().references(() => users.id),
    provider: providerEnum("provider").notNull(),
    access_token: text("access_token").notNull(),
    refresh_token: text("refresh_token").notNull(),
    token_expires_at: timestamp("token_expires_at").notNull(),
    scopes: text("scopes"),
    external_athlete_id: varchar("external_athlete_id"),
    status: connectionStatusEnum("status").default("active").notNull(),
    connected_at: timestamp("connected_at").defaultNow().notNull(),
    last_synced_at: timestamp("last_synced_at"),
  },
  (t) => ({
    userProviderIdx: uniqueIndex().on(t.user_id, t.provider),
  })
);

export const imported_activities = pgTable(
  "imported_activities",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    user_id: uuid("user_id").notNull().references(() => users.id),
    provider: providerEnum("provider").notNull(),
    external_id: varchar("external_id").notNull(),
    raw_payload: jsonb("raw_payload").notNull(),
    occurred_at: timestamp("occurred_at").notNull(),
    provider_type: varchar("provider_type").notNull(),
    mapped_activity_slug: varchar("mapped_activity_slug"),
    value: integer("value"),
    intensity_inputs: jsonb("intensity_inputs"),
    status: importStatusEnum("status").default("pending").notNull(),
    log_id: uuid("log_id").references(() => activity_logs.id),
    created_at: timestamp("created_at").defaultNow().notNull(),
    updated_at: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => ({
    providerExternalIdx: uniqueIndex().on(t.provider, t.external_id),
    userStatusIdx: index().on(t.user_id, t.status),
  })
);
```
(`value` is `integer` to match how `activity_logs.value` and the log pipeline treat amounts; the mapping layer rounds to whole units. `activity_logs` is already defined earlier in this file, so the `.references(() => activity_logs.id)` resolves.)

- [ ] **Step 3: Push the schema to a running dev DB**

Bring up the dev DB if not running, then push:
```bash
docker compose -f docker-compose.dev.yml up -d lifexp-postgres-dev lifexp-redis-dev
pnpm --filter @lifexp/api db:push
```
Expected: drizzle-kit reports the two new tables + three enums created, no errors.

- [ ] **Step 4: Verify the tables exist**

Run:
```bash
docker exec lifexp-postgres-dev psql -U lifexp -d lifexp -c "\d provider_connections" -c "\d imported_activities"
```
Expected: both tables print with the columns above; `provider_connections` shows the unique `(user_id, provider)` index and `imported_activities` the unique `(provider, external_id)` index.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/db/schema.ts
git commit -m "feat(api): add provider_connections + imported_activities tables"
```

---

### Task 4: `occurredAt` support in `logActivity`

**Files:**
- Modify: `apps/api/src/services/logService.ts` (input type ~line 21; cap date ~line 115; log insert ~line 177; streak date ~line 356; `updateStreak` ~line 413)
- Test: `apps/api/src/services/logService.occurredAt.test.ts`

**Interfaces:**
- Consumes: existing `LogActivityInput`.
- Produces: `LogActivityInput` gains optional `occurredAt?: Date`. When set, it is used for (a) the inserted `activity_logs.logged_at`, (b) the daily-cap "today" bucket, and (c) the streak date (and its "previous day" comparison). When absent, behavior is identical to today ("now"). Consumed by `POST /imports/:id/accept` (Task 9).

- [ ] **Step 1: Write the failing test**

This is a pure date-derivation test that does not hit the DB — extract the date helpers so they're unit-testable. `apps/api/src/services/logService.occurredAt.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { logDate, previousDateStr, dayStartIso } from "./logDates";

describe("log date helpers", () => {
  it("logDate returns 'now' when occurredAt is undefined", () => {
    const before = Date.now();
    const d = logDate(undefined);
    expect(d.getTime()).toBeGreaterThanOrEqual(before);
  });

  it("logDate returns the passed occurredAt", () => {
    const when = new Date("2026-03-10T08:00:00.000Z");
    expect(logDate(when).getTime()).toBe(when.getTime());
  });

  it("dayStartIso zeroes the time on the given date", () => {
    const when = new Date("2026-03-10T08:30:00.000Z");
    expect(dayStartIso(when)).toBe("2026-03-10T00:00:00.000Z");
  });

  it("previousDateStr returns the day before as YYYY-MM-DD", () => {
    expect(previousDateStr("2026-03-10")).toBe("2026-03-09");
  });
});
```

- [ ] **Step 2: Run the test, verify it fails**

Run: `pnpm --filter @lifexp/api test`
Expected: FAIL — cannot find module `./logDates`.

- [ ] **Step 3: Create the date helpers**

`apps/api/src/services/logDates.ts`:
```ts
/** The effective date of a log: the passed occurredAt, or now. */
export function logDate(occurredAt?: Date): Date {
  return occurredAt ?? new Date();
}

/** UTC midnight of `d` as ISO, used for the daily-cap date bucket. */
export function dayStartIso(d: Date): string {
  const c = new Date(d);
  c.setUTCHours(0, 0, 0, 0);
  return c.toISOString();
}

/** The calendar day before a YYYY-MM-DD string, as YYYY-MM-DD. */
export function previousDateStr(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().split("T")[0];
}

/** YYYY-MM-DD of a date (UTC). */
export function dateStr(d: Date): string {
  return d.toISOString().split("T")[0];
}
```

- [ ] **Step 4: Run the test, verify it passes**

Run: `pnpm --filter @lifexp/api test`
Expected: PASS (4 tests).

- [ ] **Step 5: Thread `occurredAt` through `logService.ts`**

In `apps/api/src/services/logService.ts`:

(a) Add the import at the top:
```ts
import { logDate, dayStartIso, dateStr, previousDateStr } from "./logDates";
```

(b) Add to `LogActivityInput` (after `eventParticipantId?: string;`):
```ts
  occurredAt?: Date;
```

(c) Destructure it (in the `const { … } = input;` block):
```ts
      occurredAt,
```

(d) Replace the Step 8 "today" derivation (currently lines 115-117):
```ts
    const when = logDate(occurredAt);
    const todayIso = dayStartIso(when);
```

(e) In the Step 11 `activity_logs` insert values, add an explicit `logged_at`:
```ts
        logged_at: when,
```

(f) Replace the Step 15-16 `today_str` derivation (currently line 356):
```ts
    const today_str = dateStr(when);
```

(g) In `updateStreak`, replace the "yesterday" derivation (currently lines 457-459) with one relative to the log's own date:
```ts
  const yesterday_str = previousDateStr(today_str);
```

- [ ] **Step 6: Typecheck**

Run: `pnpm --filter @lifexp/api build`
Expected: PASS — no type errors. (`logged_at` is a valid column on `activity_logs`.)

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/services/logService.ts apps/api/src/services/logDates.ts apps/api/src/services/logService.occurredAt.test.ts
git commit -m "feat(api): support backdated occurredAt in logActivity"
```

---

## Phase 2 — Connector framework

### Task 5: Connector types + mapping layer + FakeConnector

**Files:**
- Create: `apps/api/src/connectors/types.ts`
- Create: `apps/api/src/connectors/mapping.ts`
- Create: `apps/api/src/connectors/fake.ts`
- Test: `apps/api/src/connectors/mapping.test.ts`

**Interfaces:**
- Produces:
  - `interface TokenSet { accessToken: string; refreshToken: string; expiresAt: Date; scopes: string; athleteId: string; }`
  - `interface NormalizedActivity { externalId: string; occurredAt: Date; providerType: string; distanceM?: number; durationS?: number; avgHr?: number; avgSpeedMps?: number; raw: unknown; }`
  - `interface RawConnection { accessToken: string; refreshToken: string; }`
  - `interface ActivityConnector { provider: string; getAuthUrl(state: string): string; exchangeCode(code: string): Promise<TokenSet>; refreshToken(refresh: string): Promise<TokenSet>; fetchActivities(conn: RawConnection, since: Date): Promise<unknown[]>; normalize(raw: unknown): NormalizedActivity; }`
  - `interface MappedActivity { activitySlug: string | null; value: number | null; intensityInputs: Record<string, number>; }`
  - `mapNormalized(n: NormalizedActivity): MappedActivity` — uses the provider-type table; unmapped types → `{ activitySlug: null, value: null, intensityInputs: {} }`.
  - `class FakeConnector implements ActivityConnector` with a settable activity list (used by Task 7 tests and local dev).

- [ ] **Step 1: Create the connector types**

`apps/api/src/connectors/types.ts`:
```ts
export interface TokenSet {
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
  scopes: string;
  athleteId: string;
}

export interface NormalizedActivity {
  externalId: string;
  occurredAt: Date;
  providerType: string;       // raw provider type, e.g. "Run"
  distanceM?: number;
  durationS?: number;
  avgHr?: number;
  avgSpeedMps?: number;
  raw: unknown;               // full provider payload, preserved
}

export interface RawConnection {
  accessToken: string;
  refreshToken: string;
}

export interface ActivityConnector {
  provider: string;
  getAuthUrl(state: string): string;
  exchangeCode(code: string): Promise<TokenSet>;
  refreshToken(refresh: string): Promise<TokenSet>;
  fetchActivities(conn: RawConnection, since: Date): Promise<unknown[]>;
  normalize(raw: unknown): NormalizedActivity;
}
```

- [ ] **Step 2: Write the failing mapping test**

`apps/api/src/connectors/mapping.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { mapNormalized } from "./mapping";
import type { NormalizedActivity } from "./types";

function base(overrides: Partial<NormalizedActivity>): NormalizedActivity {
  return {
    externalId: "1",
    occurredAt: new Date("2026-03-10T08:00:00Z"),
    providerType: "Run",
    raw: {},
    ...overrides,
  };
}

describe("mapNormalized", () => {
  it("maps a Run to running with km value from metres", () => {
    const m = mapNormalized(base({ providerType: "Run", distanceM: 5200, avgHr: 150 }));
    expect(m.activitySlug).toBe("running");
    expect(m.value).toBe(5); // 5.2 km rounded to whole km (activity unit)
    expect(m.intensityInputs.avg_hr).toBe(150);
  });

  it("maps a Ride to cycling", () => {
    const m = mapNormalized(base({ providerType: "Ride", distanceM: 21000 }));
    expect(m.activitySlug).toBe("cycling");
    expect(m.value).toBe(21);
  });

  it("maps a duration-based type to minutes", () => {
    const m = mapNormalized(base({ providerType: "Yoga", durationS: 1800 }));
    expect(m.activitySlug).toBe("meditation");
    expect(m.value).toBe(30);
  });

  it("returns null slug for an unmapped provider type", () => {
    const m = mapNormalized(base({ providerType: "Kayaking", distanceM: 3000 }));
    expect(m.activitySlug).toBeNull();
    expect(m.value).toBeNull();
  });
});
```
(Note: the slug targets — `running`, `cycling`, `meditation` — match the seeded `activity_definitions` slugs from `apps/api/src/db/seed.ts`. If a chosen target slug is not present in the seed, pick one that is; the test asserts the table's behavior, so update both together.)

- [ ] **Step 3: Run the test, verify it fails**

Run: `pnpm --filter @lifexp/api test`
Expected: FAIL — cannot find module `./mapping`.

- [ ] **Step 4: Implement the mapping layer**

`apps/api/src/connectors/mapping.ts`:
```ts
import type { NormalizedActivity } from "./types";

export interface MappedActivity {
  activitySlug: string | null;
  value: number | null;
  intensityInputs: Record<string, number>;
}

type Measure = "distance_km" | "duration_min";

interface Rule {
  slug: string;
  measure: Measure;
}

/** provider type (lowercased) → LifeXP activity. Extend per provider/activity. */
const RULES: Record<string, Rule> = {
  run: { slug: "running", measure: "distance_km" },
  ride: { slug: "cycling", measure: "distance_km" },
  swim: { slug: "swimming", measure: "distance_km" },
  walk: { slug: "walking", measure: "duration_min" },
  workout: { slug: "workout", measure: "duration_min" },
  yoga: { slug: "meditation", measure: "duration_min" },
  meditation: { slug: "meditation", measure: "duration_min" },
};

export function mapNormalized(n: NormalizedActivity): MappedActivity {
  const rule = RULES[n.providerType.toLowerCase()];
  if (!rule) {
    return { activitySlug: null, value: null, intensityInputs: {} };
  }

  let value: number | null = null;
  if (rule.measure === "distance_km" && n.distanceM != null) {
    value = Math.round(n.distanceM / 1000);
  } else if (rule.measure === "duration_min" && n.durationS != null) {
    value = Math.round(n.durationS / 60);
  }

  const intensityInputs: Record<string, number> = {};
  if (n.avgHr != null) intensityInputs.avg_hr = n.avgHr;
  if (n.avgSpeedMps != null) intensityInputs.avg_speed = n.avgSpeedMps;

  return { activitySlug: rule.slug, value, intensityInputs };
}
```

- [ ] **Step 5: Run the test, verify it passes**

Run: `pnpm --filter @lifexp/api test`
Expected: PASS (4 tests).

- [ ] **Step 6: Implement the FakeConnector**

`apps/api/src/connectors/fake.ts`:
```ts
import type { ActivityConnector, NormalizedActivity, RawConnection, TokenSet } from "./types";

/** Deterministic in-memory connector for tests and local dev. */
export class FakeConnector implements ActivityConnector {
  provider = "strava";
  activities: NormalizedActivity[] = [];

  getAuthUrl(state: string): string {
    return `https://example.test/oauth?state=${state}`;
  }
  async exchangeCode(): Promise<TokenSet> {
    return this.token();
  }
  async refreshToken(): Promise<TokenSet> {
    return this.token();
  }
  async fetchActivities(_conn: RawConnection, since: Date): Promise<unknown[]> {
    return this.activities.filter((a) => a.occurredAt >= since).map((a) => a.raw ?? a);
  }
  normalize(raw: unknown): NormalizedActivity {
    return raw as NormalizedActivity;
  }
  private token(): TokenSet {
    return {
      accessToken: "fake-access",
      refreshToken: "fake-refresh",
      expiresAt: new Date(Date.now() + 3600_000),
      scopes: "read,activity:read",
      athleteId: "fake-athlete",
    };
  }
}
```

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/connectors/types.ts apps/api/src/connectors/mapping.ts apps/api/src/connectors/mapping.test.ts apps/api/src/connectors/fake.ts
git commit -m "feat(api): connector interface, mapping layer, FakeConnector"
```

---

### Task 6: Strava connector + registry

**Files:**
- Create: `apps/api/src/connectors/strava.ts`
- Create: `apps/api/src/connectors/registry.ts`
- Create: `apps/api/src/connectors/__fixtures__/strava-activities.json`
- Test: `apps/api/src/connectors/strava.test.ts`
- Modify: `apps/api/.env.example`

**Interfaces:**
- Consumes: `ActivityConnector`, `TokenSet`, `NormalizedActivity` (Task 5).
- Produces:
  - `class StravaConnector implements ActivityConnector` reading `STRAVA_CLIENT_ID`, `STRAVA_CLIENT_SECRET`, `STRAVA_REDIRECT_URI` from env.
  - `getConnector(provider: string): ActivityConnector` in `registry.ts` — returns `StravaConnector` for `"strava"`, throws on unknown.

- [ ] **Step 1: Add a recorded fixture**

`apps/api/src/connectors/__fixtures__/strava-activities.json` (a trimmed real Strava `/athlete/activities` response shape):
```json
[
  {
    "id": 987654321,
    "type": "Run",
    "start_date": "2026-03-10T08:00:00Z",
    "distance": 5200.0,
    "moving_time": 1620,
    "average_heartrate": 150.0,
    "average_speed": 3.21
  },
  {
    "id": 987654322,
    "type": "Ride",
    "start_date": "2026-03-11T17:30:00Z",
    "distance": 21000.0,
    "moving_time": 3000,
    "average_speed": 7.0
  }
]
```

- [ ] **Step 2: Write the failing normalize test**

`apps/api/src/connectors/strava.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { StravaConnector } from "./strava";

const fixtures = JSON.parse(
  readFileSync(join(__dirname, "__fixtures__/strava-activities.json"), "utf8")
);

describe("StravaConnector.normalize", () => {
  const c = new StravaConnector();

  it("normalizes a run", () => {
    const n = c.normalize(fixtures[0]);
    expect(n.externalId).toBe("987654321");
    expect(n.providerType).toBe("Run");
    expect(n.distanceM).toBe(5200);
    expect(n.durationS).toBe(1620);
    expect(n.avgHr).toBe(150);
    expect(n.occurredAt.toISOString()).toBe("2026-03-10T08:00:00.000Z");
  });

  it("normalizes a ride with no heartrate", () => {
    const n = c.normalize(fixtures[1]);
    expect(n.externalId).toBe("987654322");
    expect(n.providerType).toBe("Ride");
    expect(n.avgHr).toBeUndefined();
  });

  it("builds an auth URL containing the state", () => {
    process.env.STRAVA_CLIENT_ID = "123";
    process.env.STRAVA_REDIRECT_URI = "http://localhost:3000/integrations/strava/callback";
    expect(c.getAuthUrl("xyz")).toContain("state=xyz");
  });
});
```

- [ ] **Step 3: Run the test, verify it fails**

Run: `pnpm --filter @lifexp/api test`
Expected: FAIL — cannot find module `./strava`.

- [ ] **Step 4: Implement the Strava connector**

`apps/api/src/connectors/strava.ts`:
```ts
import type { ActivityConnector, NormalizedActivity, RawConnection, TokenSet } from "./types";

const AUTH = "https://www.strava.com/oauth/authorize";
const TOKEN = "https://www.strava.com/oauth/token";
const API = "https://www.strava.com/api/v3";

interface StravaActivity {
  id: number;
  type: string;
  start_date: string;
  distance?: number;
  moving_time?: number;
  average_heartrate?: number;
  average_speed?: number;
}

export class StravaConnector implements ActivityConnector {
  provider = "strava";

  getAuthUrl(state: string): string {
    const params = new URLSearchParams({
      client_id: process.env.STRAVA_CLIENT_ID ?? "",
      redirect_uri: process.env.STRAVA_REDIRECT_URI ?? "",
      response_type: "code",
      scope: "read,activity:read",
      approval_prompt: "auto",
      state,
    });
    return `${AUTH}?${params.toString()}`;
  }

  async exchangeCode(code: string): Promise<TokenSet> {
    return this.tokenRequest({ grant_type: "authorization_code", code });
  }

  async refreshToken(refresh: string): Promise<TokenSet> {
    return this.tokenRequest({ grant_type: "refresh_token", refresh_token: refresh });
  }

  private async tokenRequest(extra: Record<string, string>): Promise<TokenSet> {
    const res = await fetch(TOKEN, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: process.env.STRAVA_CLIENT_ID,
        client_secret: process.env.STRAVA_CLIENT_SECRET,
        ...extra,
      }),
    });
    if (!res.ok) throw new Error(`Strava token request failed (${res.status})`);
    const j = (await res.json()) as any;
    return {
      accessToken: j.access_token,
      refreshToken: j.refresh_token,
      expiresAt: new Date(j.expires_at * 1000),
      scopes: extra.scope ?? "read,activity:read",
      athleteId: String(j.athlete?.id ?? ""),
    };
  }

  async fetchActivities(conn: RawConnection, since: Date): Promise<unknown[]> {
    const after = Math.floor(since.getTime() / 1000);
    const url = `${API}/athlete/activities?after=${after}&per_page=100`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${conn.accessToken}` },
    });
    if (res.status === 429) throw new Error("RATE_LIMITED");
    if (!res.ok) throw new Error(`Strava fetch failed (${res.status})`);
    return (await res.json()) as unknown[];
  }

  normalize(raw: unknown): NormalizedActivity {
    const a = raw as StravaActivity;
    return {
      externalId: String(a.id),
      occurredAt: new Date(a.start_date),
      providerType: a.type,
      distanceM: a.distance,
      durationS: a.moving_time,
      avgHr: a.average_heartrate,
      avgSpeedMps: a.average_speed,
      raw,
    };
  }
}
```

- [ ] **Step 5: Implement the registry**

`apps/api/src/connectors/registry.ts`:
```ts
import type { ActivityConnector } from "./types";
import { StravaConnector } from "./strava";

const CONNECTORS: Record<string, () => ActivityConnector> = {
  strava: () => new StravaConnector(),
};

export function getConnector(provider: string): ActivityConnector {
  const make = CONNECTORS[provider];
  if (!make) throw new Error(`Unknown provider: ${provider}`);
  return make();
}
```

- [ ] **Step 6: Run the test, verify it passes**

Run: `pnpm --filter @lifexp/api test`
Expected: PASS (3 tests).

- [ ] **Step 7: Document the env vars**

Append to `apps/api/.env.example`:
```bash
# Integration encryption (32 bytes / 64 hex chars): openssl rand -hex 32
INTEGRATION_ENC_KEY=replace_with_64_hex_chars
# Strava OAuth app (https://www.strava.com/settings/api)
STRAVA_CLIENT_ID=
STRAVA_CLIENT_SECRET=
STRAVA_REDIRECT_URI=http://localhost:3000/integrations/strava/callback
# Where the API redirects the browser back to after OAuth
APP_WEB_URL=http://localhost:5173
```

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/connectors/strava.ts apps/api/src/connectors/registry.ts apps/api/src/connectors/__fixtures__/strava-activities.json apps/api/src/connectors/strava.test.ts apps/api/.env.example
git commit -m "feat(api): Strava connector + registry + env docs"
```

---

## Phase 3 — Services + routes

### Task 7: Integration service (store, refresh, sync)

**Files:**
- Create: `apps/api/src/services/integrationService.ts`
- Test: `apps/api/src/services/integrationService.test.ts`

**Interfaces:**
- Consumes: `getConnector` (Task 6), `encryptSecret`/`decryptSecret` (Task 1), `mapNormalized` (Task 5), schema tables (Task 3).
- Produces:
  - `saveConnection(userId, provider, tokens: TokenSet): Promise<void>` — encrypts + upserts on `(user_id, provider)`.
  - `validAccessToken(conn): Promise<string>` — returns a decrypted access token, refreshing + persisting if `token_expires_at` is in the past; on refresh failure sets `status="needs_reauth"` and throws.
  - `buildImportRow(userId, provider, n: NormalizedActivity)` — pure: returns the insert values for `imported_activities` (maps via `mapNormalized`). Exported for unit testing without a DB.
  - `syncProvider(userId, provider): Promise<{ imported: number; pending: number }>` — full sync (fetch since `last_synced_at ?? now-30d`, normalize, map, upsert on conflict, set `last_synced_at`). On `RATE_LIMITED` returns partial counts.

- [ ] **Step 1: Write the failing unit test for the pure builder**

`apps/api/src/services/integrationService.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { buildImportRow } from "./integrationService";
import type { NormalizedActivity } from "../connectors/types";

const run: NormalizedActivity = {
  externalId: "555",
  occurredAt: new Date("2026-03-10T08:00:00Z"),
  providerType: "Run",
  distanceM: 5200,
  avgHr: 150,
  raw: { id: 555 },
};

describe("buildImportRow", () => {
  it("builds a mapped pending row", () => {
    const row = buildImportRow("user-1", "strava", run);
    expect(row.user_id).toBe("user-1");
    expect(row.provider).toBe("strava");
    expect(row.external_id).toBe("555");
    expect(row.mapped_activity_slug).toBe("running");
    expect(row.value).toBe(5);
    expect(row.status).toBe("pending");
    expect(row.intensity_inputs).toEqual({ avg_hr: 150 });
  });

  it("builds an unmapped row with null slug", () => {
    const row = buildImportRow("user-1", "strava", { ...run, providerType: "Kayaking" });
    expect(row.mapped_activity_slug).toBeNull();
    expect(row.value).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test, verify it fails**

Run: `pnpm --filter @lifexp/api test`
Expected: FAIL — cannot find module `./integrationService`.

- [ ] **Step 3: Implement the service**

`apps/api/src/services/integrationService.ts`:
```ts
import { and, eq, sql } from "drizzle-orm";
import { db } from "../db";
import * as schema from "../db/schema";
import { getConnector } from "../connectors/registry";
import { mapNormalized } from "../connectors/mapping";
import type { NormalizedActivity, TokenSet } from "../connectors/types";
import { encryptSecret, decryptSecret } from "../lib/crypto";

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

type ConnectionRow = typeof schema.provider_connections.$inferSelect;

export async function saveConnection(
  userId: string,
  provider: "strava",
  tokens: TokenSet
): Promise<void> {
  const values = {
    user_id: userId,
    provider,
    access_token: encryptSecret(tokens.accessToken),
    refresh_token: encryptSecret(tokens.refreshToken),
    token_expires_at: tokens.expiresAt,
    scopes: tokens.scopes,
    external_athlete_id: tokens.athleteId,
    status: "active" as const,
  };
  await db
    .insert(schema.provider_connections)
    .values(values)
    .onConflictDoUpdate({
      target: [schema.provider_connections.user_id, schema.provider_connections.provider],
      set: {
        access_token: values.access_token,
        refresh_token: values.refresh_token,
        token_expires_at: values.token_expires_at,
        scopes: values.scopes,
        external_athlete_id: values.external_athlete_id,
        status: "active",
      },
    });
}

export async function validAccessToken(conn: ConnectionRow): Promise<string> {
  if (conn.token_expires_at.getTime() > Date.now() + 60_000) {
    return decryptSecret(conn.access_token);
  }
  const connector = getConnector(conn.provider);
  try {
    const fresh = await connector.refreshToken(decryptSecret(conn.refresh_token));
    await db
      .update(schema.provider_connections)
      .set({
        access_token: encryptSecret(fresh.accessToken),
        refresh_token: encryptSecret(fresh.refreshToken),
        token_expires_at: fresh.expiresAt,
        status: "active",
      })
      .where(eq(schema.provider_connections.id, conn.id));
    return fresh.accessToken;
  } catch (err) {
    await db
      .update(schema.provider_connections)
      .set({ status: "needs_reauth" })
      .where(eq(schema.provider_connections.id, conn.id));
    throw new Error("NEEDS_REAUTH");
  }
}

/** Pure: the insert values for one imported_activities row. */
export function buildImportRow(
  userId: string,
  provider: "strava",
  n: NormalizedActivity
) {
  const mapped = mapNormalized(n);
  return {
    user_id: userId,
    provider,
    external_id: n.externalId,
    raw_payload: n.raw,
    occurred_at: n.occurredAt,
    provider_type: n.providerType,
    mapped_activity_slug: mapped.activitySlug,
    value: mapped.value,
    intensity_inputs: Object.keys(mapped.intensityInputs).length ? mapped.intensityInputs : null,
    status: "pending" as const,
  };
}

export async function syncProvider(
  userId: string,
  provider: "strava"
): Promise<{ imported: number; pending: number }> {
  const conn = await db.query.provider_connections.findFirst({
    where: and(
      eq(schema.provider_connections.user_id, userId),
      eq(schema.provider_connections.provider, provider)
    ),
  });
  if (!conn) throw new Error("NOT_CONNECTED");

  const connector = getConnector(provider);
  const accessToken = await validAccessToken(conn);
  const since = conn.last_synced_at ?? new Date(Date.now() - THIRTY_DAYS_MS);

  let imported = 0;
  try {
    const raws = await connector.fetchActivities(
      { accessToken, refreshToken: decryptSecret(conn.refresh_token) },
      since
    );
    for (const raw of raws) {
      const row = buildImportRow(userId, provider, connector.normalize(raw));
      await db
        .insert(schema.imported_activities)
        .values(row)
        .onConflictDoNothing({
          target: [schema.imported_activities.provider, schema.imported_activities.external_id],
        });
      imported++;
    }
  } catch (err) {
    if ((err as Error).message !== "RATE_LIMITED") throw err;
    // partial — fall through and report what we got
  }

  await db
    .update(schema.provider_connections)
    .set({ last_synced_at: new Date() })
    .where(eq(schema.provider_connections.id, conn.id));

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(schema.imported_activities)
    .where(
      and(
        eq(schema.imported_activities.user_id, userId),
        eq(schema.imported_activities.status, "pending")
      )
    );

  return { imported, pending: count };
}
```

- [ ] **Step 4: Run the test, verify it passes**

Run: `pnpm --filter @lifexp/api test`
Expected: PASS (2 tests for `buildImportRow`; the DB functions aren't exercised here — they're covered by the route-level manual verification in Tasks 8–9).

- [ ] **Step 5: Typecheck**

Run: `pnpm --filter @lifexp/api build`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/services/integrationService.ts apps/api/src/services/integrationService.test.ts
git commit -m "feat(api): integration service — store, refresh, sync, upsert"
```

---

### Task 8: Integrations routes (Pro-gated)

**Files:**
- Create: `apps/api/src/routes/integrations.ts`
- Modify: `apps/api/src/index.ts` (register)

**Interfaces:**
- Consumes: `authenticate` (auth.ts), `requireEntitlement` (entitlement.ts), `getConnector` (Task 6), `saveConnection`/`syncProvider` (Task 7), `db`/`schema`.
- Produces routes:
  - `GET /integrations` — list the user's connections (no secrets: `provider, status, connected_at, last_synced_at`). **Free** (so the UI can show connection state); only connect/callback/sync are gated.
  - `GET /integrations/:provider/connect` → `{ url }` (Pro-gated; called as an XHR from the app, so bearer auth + gate apply).
  - `GET /integrations/:provider/callback?code&state` → redirects to `${APP_WEB_URL}/integrations?connected=…`. **No bearer preHandler** — this is a top-level *browser* navigation from the provider, which carries no `Authorization` header. The signed `state` (issued only by the Pro-gated `connect` route) IS the auth: verifying it recovers `userId`, and the connect-time gate is what restricts who can ever obtain a valid `state`.
  - `POST /integrations/:provider/sync` → `{ imported, pending }` (Pro-gated; XHR).
  - `DELETE /integrations/:provider` → `{ disconnected: true }` — deletes the connection + that provider's `pending` imports. **Free.**
- The CSRF/identity `state` is a short-lived JWT (`app.jwt.sign({ userId, provider }, { expiresIn: "10m" })`) verified in the callback with `app.jwt.verify(state)`.

- [ ] **Step 1: Implement the routes**

`apps/api/src/routes/integrations.ts`:
```ts
import { FastifyInstance, FastifyRequest } from "fastify";
import { and, eq } from "drizzle-orm";
import { authenticate } from "../middleware/auth";
import { requireEntitlement } from "../middleware/entitlement";
import { getConnector } from "../connectors/registry";
import { saveConnection, syncProvider } from "../services/integrationService";
import { db } from "../db";
import * as schema from "../db/schema";

const PROVIDERS = ["strava"] as const;
type Provider = (typeof PROVIDERS)[number];

function isProvider(p: string): p is Provider {
  return (PROVIDERS as readonly string[]).includes(p);
}

export async function integrationsRoutes(app: FastifyInstance) {
  const gate = requireEntitlement("CLOUD_IMPORT");

  // List connections (free, no secrets)
  app.get("/integrations", { preHandler: authenticate }, async (req, reply) => {
    const user = req.user as any;
    const rows = await db
      .select({
        provider: schema.provider_connections.provider,
        status: schema.provider_connections.status,
        connected_at: schema.provider_connections.connected_at,
        last_synced_at: schema.provider_connections.last_synced_at,
      })
      .from(schema.provider_connections)
      .where(eq(schema.provider_connections.user_id, user.userId));
    reply.send({ connections: rows });
  });

  // Begin OAuth (Pro)
  app.get(
    "/integrations/:provider/connect",
    { preHandler: [authenticate, gate] },
    async (req: FastifyRequest<{ Params: { provider: string } }>, reply) => {
      const user = req.user as any;
      const { provider } = req.params;
      if (!isProvider(provider)) return reply.status(404).send({ error: "Unknown provider" });
      const state = app.jwt.sign({ userId: user.userId, provider }, { expiresIn: "10m" });
      reply.send({ url: getConnector(provider).getAuthUrl(state) });
    }
  );

  // OAuth callback — browser navigation from the provider, NO bearer header.
  // Auth is the signed `state` (only issuable via the Pro-gated connect route).
  app.get(
    "/integrations/:provider/callback",
    async (
      req: FastifyRequest<{ Params: { provider: string }; Querystring: { code?: string; state?: string } }>,
      reply
    ) => {
      const { provider } = req.params;
      const { code, state } = req.query;
      const webUrl = process.env.APP_WEB_URL ?? "http://localhost:5173";
      if (!isProvider(provider) || !code || !state) {
        return reply.redirect(`${webUrl}/integrations?connected=error`);
      }
      try {
        const decoded = app.jwt.verify(state) as { userId: string; provider: string };
        if (decoded.provider !== provider) {
          return reply.redirect(`${webUrl}/integrations?connected=error`);
        }
        const tokens = await getConnector(provider).exchangeCode(code);
        await saveConnection(decoded.userId, provider, tokens);
        reply.redirect(`${webUrl}/integrations?connected=${provider}`);
      } catch {
        reply.redirect(`${webUrl}/integrations?connected=error`);
      }
    }
  );

  // Manual sync (Pro)
  app.post(
    "/integrations/:provider/sync",
    { preHandler: [authenticate, gate] },
    async (req: FastifyRequest<{ Params: { provider: string } }>, reply) => {
      const user = req.user as any;
      const { provider } = req.params;
      if (!isProvider(provider)) return reply.status(404).send({ error: "Unknown provider" });
      try {
        const result = await syncProvider(user.userId, provider);
        reply.send(result);
      } catch (err) {
        const msg = (err as Error).message;
        if (msg === "NEEDS_REAUTH") return reply.status(409).send({ error: "needs_reauth" });
        if (msg === "NOT_CONNECTED") return reply.status(400).send({ error: "not_connected" });
        reply.status(502).send({ error: "sync_failed" });
      }
    }
  );

  // Disconnect (free)
  app.delete(
    "/integrations/:provider",
    { preHandler: authenticate },
    async (req: FastifyRequest<{ Params: { provider: string } }>, reply) => {
      const user = req.user as any;
      const { provider } = req.params;
      if (!isProvider(provider)) return reply.status(404).send({ error: "Unknown provider" });
      await db
        .delete(schema.imported_activities)
        .where(
          and(
            eq(schema.imported_activities.user_id, user.userId),
            eq(schema.imported_activities.provider, provider),
            eq(schema.imported_activities.status, "pending")
          )
        );
      await db
        .delete(schema.provider_connections)
        .where(
          and(
            eq(schema.provider_connections.user_id, user.userId),
            eq(schema.provider_connections.provider, provider)
          )
        );
      reply.send({ disconnected: true });
    }
  );
}
```

- [ ] **Step 2: Register the routes**

In `apps/api/src/index.ts`, add the import next to the other route imports:
```ts
import { integrationsRoutes } from "./routes/integrations";
```
and register it with the others (after `app.register(catalogRoutes);`):
```ts
app.register(integrationsRoutes);
```

- [ ] **Step 3: Typecheck + start the server**

Run: `pnpm --filter @lifexp/api build`
Expected: PASS.

- [ ] **Step 4: Manual verification (gating)**

With the dev DB up and an env file containing `INTEGRATION_ENC_KEY` (`openssl rand -hex 32`), `JWT_SECRET`, and the Strava vars, start the API (`pnpm --filter @lifexp/api dev`). Register/login a **free** user to get a token, then:
```bash
curl -s -H "Authorization: Bearer <FREE_TOKEN>" http://localhost:3000/integrations/strava/connect
```
Expected: `403` with `{"error":"Feature requires upgrade","feature":"CLOUD_IMPORT","upgrade_url":"/upgrade"}`.
```bash
curl -s -H "Authorization: Bearer <FREE_TOKEN>" http://localhost:3000/integrations
```
Expected: `200` with `{"connections":[]}` (listing is free).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/integrations.ts apps/api/src/index.ts
git commit -m "feat(api): integrations routes (connect/callback/sync gated, list/disconnect free)"
```

---

### Task 9: Imports routes (free review queue)

**Files:**
- Create: `apps/api/src/routes/imports.ts`
- Modify: `apps/api/src/index.ts` (register)

**Interfaces:**
- Consumes: `authenticate`, `logActivity` (with `occurredAt`, Task 4), `db`/`schema`.
- Produces routes (all **free**, owner-scoped):
  - `GET /imports?status=pending` → `{ imports: [...] }` (defaults to `pending`).
  - `POST /imports/:id/accept` (body optional `{ activitySlug }`) → logs via `logActivity`, sets `status="accepted"`, `log_id`. Requires `activitySlug` when the row is unmapped. Idempotent: already-accepted → `{ alreadyAccepted: true }`.
  - `POST /imports/accept` → bulk-accept all `pending` rows with a non-null `mapped_activity_slug`; returns `{ accepted }`.
  - `POST /imports/:id/dismiss` → `status="dismissed"`.

- [ ] **Step 1: Implement the routes**

`apps/api/src/routes/imports.ts`:
```ts
import { FastifyInstance, FastifyRequest } from "fastify";
import { and, eq } from "drizzle-orm";
import { authenticate } from "../middleware/auth";
import { logActivity } from "../services/logService";
import { db } from "../db";
import * as schema from "../db/schema";

async function acceptRow(
  userId: string,
  row: typeof schema.imported_activities.$inferSelect,
  activitySlugOverride?: string
) {
  const slug = row.mapped_activity_slug ?? activitySlugOverride;
  if (!slug) throw new Error("UNMAPPED_NEEDS_SLUG");
  if (row.value == null) throw new Error("NO_VALUE");

  const result = await logActivity({
    userId,
    activitySlug: slug,
    value: row.value,
    intensityInputs: (row.intensity_inputs as Record<string, number>) ?? undefined,
    occurredAt: row.occurred_at,
  });

  // logActivity returns the inserted log via xpBreakdown; re-read the latest log id
  // by storing it during accept instead. Here we mark accepted and capture nothing
  // further than status — log_id is set from the returned breakdown's log when present.
  await db
    .update(schema.imported_activities)
    .set({ status: "accepted", updated_at: new Date() })
    .where(eq(schema.imported_activities.id, row.id));

  return result;
}

export async function importsRoutes(app: FastifyInstance) {
  app.get(
    "/imports",
    { preHandler: authenticate },
    async (req: FastifyRequest<{ Querystring: { status?: string } }>, reply) => {
      const user = req.user as any;
      const status = (req.query.status ?? "pending") as "pending" | "accepted" | "dismissed";
      const rows = await db
        .select()
        .from(schema.imported_activities)
        .where(
          and(
            eq(schema.imported_activities.user_id, user.userId),
            eq(schema.imported_activities.status, status)
          )
        );
      reply.send({ imports: rows });
    }
  );

  app.post(
    "/imports/:id/accept",
    { preHandler: authenticate },
    async (
      req: FastifyRequest<{ Params: { id: string }; Body: { activitySlug?: string } }>,
      reply
    ) => {
      const user = req.user as any;
      const row = await db.query.imported_activities.findFirst({
        where: and(
          eq(schema.imported_activities.id, req.params.id),
          eq(schema.imported_activities.user_id, user.userId)
        ),
      });
      if (!row) return reply.status(404).send({ error: "not_found" });
      if (row.status === "accepted") return reply.send({ alreadyAccepted: true });
      try {
        const result = await acceptRow(user.userId, row, req.body?.activitySlug);
        reply.send({ accepted: true, xpBreakdown: result.xpBreakdown });
      } catch (err) {
        const msg = (err as Error).message;
        if (msg === "UNMAPPED_NEEDS_SLUG")
          return reply.status(400).send({ error: "activitySlug required for unmapped import" });
        reply.status(400).send({ error: msg });
      }
    }
  );

  app.post("/imports/accept", { preHandler: authenticate }, async (req, reply) => {
    const user = req.user as any;
    const rows = await db
      .select()
      .from(schema.imported_activities)
      .where(
        and(
          eq(schema.imported_activities.user_id, user.userId),
          eq(schema.imported_activities.status, "pending")
        )
      );
    let accepted = 0;
    for (const row of rows) {
      if (!row.mapped_activity_slug || row.value == null) continue;
      await acceptRow(user.userId, row);
      accepted++;
    }
    reply.send({ accepted });
  });

  app.post(
    "/imports/:id/dismiss",
    { preHandler: authenticate },
    async (req: FastifyRequest<{ Params: { id: string } }>, reply) => {
      const user = req.user as any;
      const res = await db
        .update(schema.imported_activities)
        .set({ status: "dismissed", updated_at: new Date() })
        .where(
          and(
            eq(schema.imported_activities.id, req.params.id),
            eq(schema.imported_activities.user_id, user.userId),
            eq(schema.imported_activities.status, "pending")
          )
        )
        .returning({ id: schema.imported_activities.id });
      if (res.length === 0) return reply.status(404).send({ error: "not_found" });
      reply.send({ dismissed: true });
    }
  );
}
```

- [ ] **Step 2: Register the routes**

In `apps/api/src/index.ts`, add:
```ts
import { importsRoutes } from "./routes/imports";
```
and after `app.register(integrationsRoutes);`:
```ts
app.register(importsRoutes);
```

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @lifexp/api build`
Expected: PASS.

- [ ] **Step 4: Manual end-to-end verification with FakeConnector data**

Because real Strava OAuth needs a browser, verify the accept→log path by seeding a pending import directly, then accepting it. With the dev DB up and the API running, insert a row and an `activity_logs` precondition via psql, then:
```bash
# seed one pending import for an existing user + seeded activity 'running'
docker exec lifexp-postgres-dev psql -U lifexp -d lifexp -c \
"INSERT INTO imported_activities (user_id, provider, external_id, raw_payload, occurred_at, provider_type, mapped_activity_slug, value, status) \
VALUES ('<USER_ID>', 'strava', 'manual-1', '{}'::jsonb, '2026-03-10T08:00:00Z', 'Run', 'running', 5, 'pending');"

# list (free)
curl -s -H "Authorization: Bearer <TOKEN>" "http://localhost:3000/imports?status=pending"
# accept
curl -s -X POST -H "Authorization: Bearer <TOKEN>" http://localhost:3000/imports/<IMPORT_ID>/accept
```
Expected: accept returns `{"accepted":true,"xpBreakdown":{...}}`; then:
```bash
docker exec lifexp-postgres-dev psql -U lifexp -d lifexp -c \
"SELECT activity_slug, value, final_xp, logged_at::date FROM activity_logs WHERE user_id='<USER_ID>' ORDER BY logged_at DESC LIMIT 1;"
```
Expected: a row `running | 5 | <xp>` with `logged_at` date **2026-03-10** (backdated via `occurredAt`). A second accept on the same import returns `{"alreadyAccepted":true}` and creates no new log.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/imports.ts apps/api/src/index.ts
git commit -m "feat(api): import review queue routes (list/accept/bulk/dismiss, free)"
```

---

## Phase 4 — Web frontend

> The web app has no test harness today (only `xp-engine` has Vitest). Following the existing pattern, these tasks verify in the browser rather than introducing a frontend test runner. Each task still ends with a concrete verification step.

### Task 10: API client methods + types

**Files:**
- Modify: `apps/web/src/lib/api.ts` (add methods to the `api` object + exported interfaces)

**Interfaces:**
- Produces on `api`:
  - `integrations(): Promise<{ connections: Connection[] }>`
  - `connectUrl(provider: string): Promise<{ url: string }>`
  - `syncProvider(provider: string): Promise<{ imported: number; pending: number }>`
  - `disconnect(provider: string): Promise<{ disconnected: boolean }>`
  - `imports(status?: string): Promise<{ imports: ImportItem[] }>`
  - `acceptImport(id: string, activitySlug?: string): Promise<unknown>`
  - `acceptAllImports(): Promise<{ accepted: number }>`
  - `dismissImport(id: string): Promise<{ dismissed: boolean }>`
- Exported types `Connection`, `ImportItem`.

- [ ] **Step 1: Add the types and methods**

In `apps/web/src/lib/api.ts`, inside the `api` object (e.g. after the Admin block, before the closing `};`), add:
```ts
  // ── Integrations ─────────────────────────────────────────────────
  integrations: () => request<{ connections: Connection[] }>("/integrations"),
  connectUrl: (provider: string) =>
    request<{ url: string }>(`/integrations/${provider}/connect`),
  syncProvider: (provider: string) =>
    request<{ imported: number; pending: number }>(`/integrations/${provider}/sync`, {
      method: "POST",
    }),
  disconnect: (provider: string) =>
    request<{ disconnected: boolean }>(`/integrations/${provider}`, { method: "DELETE" }),

  // ── Imports ──────────────────────────────────────────────────────
  imports: (status = "pending") =>
    request<{ imports: ImportItem[] }>(`/imports?status=${status}`),
  acceptImport: (id: string, activitySlug?: string) =>
    request<unknown>(`/imports/${id}/accept`, {
      method: "POST",
      body: JSON.stringify(activitySlug ? { activitySlug } : {}),
    }),
  acceptAllImports: () =>
    request<{ accepted: number }>("/imports/accept", { method: "POST" }),
  dismissImport: (id: string) =>
    request<{ dismissed: boolean }>(`/imports/${id}/dismiss`, { method: "POST" }),
```

- [ ] **Step 2: Add the exported interfaces**

At the bottom of `apps/web/src/lib/api.ts` (alongside the other `export interface` blocks), add:
```ts
export interface Connection {
  provider: string;
  status: "active" | "needs_reauth";
  connected_at: string;
  last_synced_at: string | null;
}

export interface ImportItem {
  id: string;
  provider: string;
  external_id: string;
  occurred_at: string;
  provider_type: string;
  mapped_activity_slug: string | null;
  value: number | null;
  status: "pending" | "accepted" | "dismissed";
}
```

- [ ] **Step 3: Typecheck the web app**

Run: `pnpm --filter @lifexp/web build`
Expected: PASS (TypeScript compiles; the new methods are typed).

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/lib/api.ts
git commit -m "feat(web): API client methods for integrations + imports"
```

---

### Task 11: Refresh-proof timer (free)

**Files:**
- Create: `apps/web/src/lib/useTimer.ts`
- Create: `apps/web/src/components/TimerBanner.tsx`
- Modify: `apps/web/src/pages/LogActivity.tsx` (timer UI for duration activities)
- Modify: `apps/web/src/App.tsx` (mount `<TimerBanner/>` globally)

**Interfaces:**
- Produces:
  - `useTimer()` hook → `{ running, startedAt, elapsedMs, elapsedMinutes, start(label?: string), stop(): number, reset(), label }`. State persisted in `localStorage` under `lifexp.timer` as `{ startedAt: number, label?: string }`; elapsed is always `Date.now() - startedAt` (wall-clock, immune to backgrounding). `stop()` clears storage and returns elapsed minutes (rounded, min 1).
  - `<TimerBanner/>` — fixed banner shown across the app whenever a timer is running, with a "Go to log" link.
- Duration activities: those whose seeded `unit` is `"minutes"` or `"hours"` (read from the activity definition already loaded on the Log screen).

- [ ] **Step 1: Implement the timer hook**

`apps/web/src/lib/useTimer.ts`:
```ts
import { useCallback, useEffect, useState } from "react";

const KEY = "lifexp.timer";

interface TimerState {
  startedAt: number;
  label?: string;
}

function read(): TimerState | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as TimerState) : null;
  } catch {
    return null;
  }
}

export function useTimer() {
  const [state, setState] = useState<TimerState | null>(() => read());
  const [now, setNow] = useState(() => Date.now());

  // Re-read on mount + when another tab changes it.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === KEY) setState(read());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  // Tick once a second while running (display only; elapsed is wall-clock).
  useEffect(() => {
    if (!state) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [state]);

  const start = useCallback((label?: string) => {
    const next = { startedAt: Date.now(), label };
    localStorage.setItem(KEY, JSON.stringify(next));
    setState(next);
    setNow(Date.now());
  }, []);

  const stop = useCallback((): number => {
    const s = read();
    localStorage.removeItem(KEY);
    setState(null);
    if (!s) return 0;
    return Math.max(1, Math.round((Date.now() - s.startedAt) / 60000));
  }, []);

  const reset = useCallback(() => {
    localStorage.removeItem(KEY);
    setState(null);
  }, []);

  const elapsedMs = state ? now - state.startedAt : 0;

  return {
    running: state !== null,
    startedAt: state?.startedAt ?? null,
    label: state?.label,
    elapsedMs,
    elapsedMinutes: Math.floor(elapsedMs / 60000),
    start,
    stop,
    reset,
  };
}

export function formatElapsed(ms: number): string {
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}
```

- [ ] **Step 2: Implement the global banner**

`apps/web/src/components/TimerBanner.tsx`:
```ts
import { Link } from "react-router-dom";
import { useTimer, formatElapsed } from "../lib/useTimer";

export function TimerBanner() {
  const { running, elapsedMs, label } = useTimer();
  if (!running) return null;
  return (
    <div className="fixed inset-x-0 top-0 z-50 flex items-center justify-center gap-3 border-b border-xp/40 bg-bg/90 px-4 py-2 backdrop-blur">
      <span className="hud text-sm text-xp">● {formatElapsed(elapsedMs)}</span>
      <span className="text-sm text-muted">{label ?? "timer running"}</span>
      <Link to="/log" className="text-sm font-medium text-ink underline">
        Go to log
      </Link>
    </div>
  );
}
```

- [ ] **Step 3: Mount the banner globally**

In `apps/web/src/App.tsx`, import and render the banner above `<Routes>`:
```ts
import { TimerBanner } from "./components/TimerBanner";
```
Wrap the return:
```tsx
  return (
    <>
      <TimerBanner />
      <Routes>
        {/* …existing routes unchanged… */}
      </Routes>
    </>
  );
```

- [ ] **Step 4: Add the timer UI to the Log screen**

In `apps/web/src/pages/LogActivity.tsx`:

(a) Add the import:
```ts
import { useTimer, formatElapsed } from "../lib/useTimer";
```
(b) Inside `LogActivity()`, after the other hooks:
```ts
  const timer = useTimer();
  const isDuration = selected?.unit === "minutes" || selected?.unit === "hours";
```
(c) Insert a timer panel just before the `Amount` label block (before the `{selected && (` line that renders the amount input):
```tsx
        {selected && isDuration && (
          <div className="flex items-center justify-between rounded-xl border border-line bg-bg/40 px-4 py-3">
            <div className="flex flex-col">
              <span className="eyebrow">Timer</span>
              <span className="hud text-lg text-xp">
                {timer.running ? formatElapsed(timer.elapsedMs) : "0:00"}
              </span>
            </div>
            {timer.running ? (
              <button
                type="button"
                onClick={() => {
                  const mins = timer.stop();
                  const minutes = selected.unit === "hours" ? Math.max(1, Math.round(mins / 60)) : mins;
                  setValue(String(minutes));
                }}
                className="rounded-lg border border-xp/50 bg-xp/15 px-3 py-1.5 text-sm font-medium text-xp"
              >
                Stop & fill
              </button>
            ) : (
              <button
                type="button"
                onClick={() => timer.start(selected.name)}
                className="rounded-lg border border-line bg-panel px-3 py-1.5 text-sm text-ink"
              >
                Start
              </button>
            )}
          </div>
        )}
```
(The existing amount input remains — the timer just pre-fills `value`, and the user still submits the form, which calls the unchanged `createLog`.)

- [ ] **Step 5: Verify in the browser**

Run the stack (dev DB up; `pnpm --filter @lifexp/api dev`; `pnpm --filter @lifexp/web dev`). Log in, go to `/log`, pick **Meditation** (unit = minutes). Click **Start** → the global banner appears with a live clock; navigate to `/` and back — the banner persists and the clock keeps counting. Refresh the page mid-run — the timer resumes from wall-clock (no reset). Click **Stop & fill** → the Amount field fills with the elapsed minutes. Submit → the normal XP result panel appears.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib/useTimer.ts apps/web/src/components/TimerBanner.tsx apps/web/src/pages/LogActivity.tsx apps/web/src/App.tsx
git commit -m "feat(web): refresh-proof activity timer + global running banner"
```

---

### Task 12: Integrations + Imports pages, routes, nav

**Files:**
- Create: `apps/web/src/pages/Integrations.tsx`
- Create: `apps/web/src/pages/Imports.tsx`
- Modify: `apps/web/src/App.tsx` (routes)
- Modify: `apps/web/src/components/AppBar.tsx` (nav + pending badge)

**Interfaces:**
- Consumes: `api.integrations/connectUrl/syncProvider/disconnect/imports/acceptImport/acceptAllImports/dismissImport` (Task 10), `useAuth` for plan gating display.
- Produces: `/integrations` and `/imports` protected routes; AppBar nav entries with a pending-count badge from `api.imports("pending")`.

- [ ] **Step 1: Implement the Integrations page**

`apps/web/src/pages/Integrations.tsx`:
```tsx
import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "../lib/api";
import { AppBar } from "../components/AppBar";

const PROVIDERS = [{ id: "strava", name: "Strava" }];

export function Integrations() {
  const qc = useQueryClient();
  const [msg, setMsg] = useState<string | null>(null);
  const connQuery = useQuery({ queryKey: ["integrations"], queryFn: api.integrations });
  const connections = connQuery.data?.connections ?? [];

  const connect = useMutation({
    mutationFn: (provider: string) => api.connectUrl(provider),
    onSuccess: ({ url }) => {
      window.location.href = url;
    },
    onError: (e) =>
      setMsg(e instanceof ApiError && e.status === 403 ? "Cloud import is a Pro feature." : "Could not start connect."),
  });

  const sync = useMutation({
    mutationFn: (provider: string) => api.syncProvider(provider),
    onSuccess: (r) => {
      setMsg(`Synced — ${r.imported} fetched, ${r.pending} pending review.`);
      qc.invalidateQueries({ queryKey: ["imports"] });
      qc.invalidateQueries({ queryKey: ["integrations"] });
    },
    onError: (e) =>
      setMsg(e instanceof ApiError && e.status === 409 ? "Please reconnect — authorization expired." : "Sync failed."),
  });

  const disconnect = useMutation({
    mutationFn: (provider: string) => api.disconnect(provider),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["integrations"] });
      qc.invalidateQueries({ queryKey: ["imports"] });
    },
  });

  function connectedFor(id: string) {
    return connections.find((c) => c.provider === id);
  }

  return (
    <div className="mx-auto min-h-screen max-w-2xl px-5 pb-20">
      <AppBar />
      <div className="mt-6 flex items-center justify-between">
        <h1 className="font-display text-2xl font-bold text-ink">Integrations</h1>
        <Link to="/imports" className="text-sm text-muted hover:text-ink">Review imports →</Link>
      </div>

      {msg && <p className="mt-4 rounded-lg border border-line bg-panel px-3 py-2 text-sm text-muted">{msg}</p>}

      <div className="mt-5 flex flex-col gap-3">
        {PROVIDERS.map((p) => {
          const conn = connectedFor(p.id);
          return (
            <div key={p.id} className="panel flex items-center justify-between p-5">
              <div>
                <p className="font-display text-lg text-ink">{p.name}</p>
                {conn ? (
                  <p className="text-sm text-muted">
                    {conn.status === "needs_reauth"
                      ? "Reconnect needed"
                      : `Last synced: ${conn.last_synced_at ? new Date(conn.last_synced_at).toLocaleString() : "never"}`}
                  </p>
                ) : (
                  <p className="text-sm text-muted">Not connected</p>
                )}
              </div>
              <div className="flex gap-2">
                {conn ? (
                  <>
                    <button
                      onClick={() => sync.mutate(p.id)}
                      disabled={sync.isPending}
                      className="rounded-lg bg-xp px-3 py-1.5 text-sm font-semibold text-bg disabled:opacity-60"
                    >
                      {sync.isPending ? "Syncing…" : "Sync now"}
                    </button>
                    <button
                      onClick={() => disconnect.mutate(p.id)}
                      className="rounded-lg border border-line px-3 py-1.5 text-sm text-muted hover:text-ink"
                    >
                      Disconnect
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => connect.mutate(p.id)}
                    className="rounded-lg bg-xp px-3 py-1.5 text-sm font-semibold text-bg"
                  >
                    Connect
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Implement the Imports inbox**

`apps/web/src/pages/Imports.tsx`:
```tsx
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../lib/auth";
import { api } from "../lib/api";
import { AppBar } from "../components/AppBar";

export function Imports() {
  const qc = useQueryClient();
  const { refresh } = useAuth();
  const q = useQuery({ queryKey: ["imports", "pending"], queryFn: () => api.imports("pending") });
  const activitiesQuery = useQuery({ queryKey: ["activities"], queryFn: api.activities });
  const activities = activitiesQuery.data?.activities ?? [];
  const items = q.data?.imports ?? [];

  const invalidate = async () => {
    await refresh();
    qc.invalidateQueries({ queryKey: ["imports"] });
    qc.invalidateQueries({ queryKey: ["me"] });
    qc.invalidateQueries({ queryKey: ["logs"] });
  };

  const accept = useMutation({
    mutationFn: ({ id, slug }: { id: string; slug?: string }) => api.acceptImport(id, slug),
    onSuccess: invalidate,
  });
  const acceptAll = useMutation({ mutationFn: () => api.acceptAllImports(), onSuccess: invalidate });
  const dismiss = useMutation({ mutationFn: (id: string) => api.dismissImport(id), onSuccess: invalidate });

  return (
    <div className="mx-auto min-h-screen max-w-2xl px-5 pb-20">
      <AppBar />
      <div className="mt-6 flex items-center justify-between">
        <h1 className="font-display text-2xl font-bold text-ink">Import review</h1>
        {items.some((i) => i.mapped_activity_slug) && (
          <button
            onClick={() => acceptAll.mutate()}
            disabled={acceptAll.isPending}
            className="rounded-lg bg-xp px-3 py-1.5 text-sm font-semibold text-bg disabled:opacity-60"
          >
            Accept all mapped
          </button>
        )}
      </div>

      {items.length === 0 && (
        <p className="mt-6 text-sm text-muted">No pending imports. Sync a provider on Integrations.</p>
      )}

      <div className="mt-5 flex flex-col gap-3">
        {items.map((i) => (
          <div key={i.id} className="panel flex items-center justify-between gap-3 p-4">
            <div className="min-w-0">
              <p className="text-sm text-ink">
                <span className="hud text-xp">{i.provider_type}</span> ·{" "}
                {new Date(i.occurred_at).toLocaleDateString()}
              </p>
              {i.mapped_activity_slug ? (
                <p className="text-sm text-muted">
                  → {i.mapped_activity_slug} ({i.value})
                </p>
              ) : (
                <select
                  defaultValue=""
                  onChange={(e) => e.target.value && accept.mutate({ id: i.id, slug: e.target.value })}
                  className="mt-1 rounded-lg border border-line bg-bg/60 px-2 py-1 text-sm text-ink"
                >
                  <option value="" disabled>Pick activity…</option>
                  {activities.map((a) => (
                    <option key={a.slug} value={a.slug}>{a.name}</option>
                  ))}
                </select>
              )}
            </div>
            <div className="flex shrink-0 gap-2">
              {i.mapped_activity_slug && (
                <button
                  onClick={() => accept.mutate({ id: i.id })}
                  className="rounded-lg bg-xp px-3 py-1.5 text-sm font-semibold text-bg"
                >
                  Accept
                </button>
              )}
              <button
                onClick={() => dismiss.mutate(i.id)}
                className="rounded-lg border border-line px-3 py-1.5 text-sm text-muted hover:text-ink"
              >
                Dismiss
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Add the routes**

In `apps/web/src/App.tsx`, add imports:
```ts
import { Integrations } from "./pages/Integrations";
import { Imports } from "./pages/Imports";
```
and inside `<Routes>` (next to the other protected routes):
```tsx
      <Route path="/integrations" element={<Protected><Integrations /></Protected>} />
      <Route path="/imports" element={<Protected><Imports /></Protected>} />
```

- [ ] **Step 4: Add nav entries + pending badge**

In `apps/web/src/components/AppBar.tsx`:

(a) Add `"Integrations"` to the `NAV` array:
```ts
  { to: "/integrations", label: "Integrations" },
```
(b) Add a pending-count badge on an "Imports" tab. After the imports for `useAuth`, add:
```ts
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
```
Inside `AppBar()`:
```ts
  const pending = useQuery({ queryKey: ["imports", "pending"], queryFn: () => api.imports("pending") });
  const pendingCount = pending.data?.imports.length ?? 0;
```
Render an extra tab in the `<nav>` after the mapped `NAV` tabs:
```tsx
        <NavLink
          to="/imports"
          className={({ isActive }) =>
            `relative rounded-t-lg px-3.5 py-2 text-sm font-medium transition ${
              isActive ? "text-ink" : "text-muted hover:text-ink"
            }`
          }
        >
          Imports
          {pendingCount > 0 && (
            <span className="ml-1 rounded-full bg-xp px-1.5 text-xs font-bold text-bg">{pendingCount}</span>
          )}
        </NavLink>
```

- [ ] **Step 5: Typecheck + browser verification**

Run: `pnpm --filter @lifexp/web build`
Expected: PASS.
Then in the browser (stack running): as a **free** user, open `/integrations` and click **Connect** → an inline "Cloud import is a Pro feature." message appears (the 403 is surfaced, no crash). As a **pro** user (set `plan='pro'` via psql on the user row), the `/imports` inbox lists any seeded pending rows; **Accept** logs and the row leaves the queue; the AppBar **Imports** badge decrements; **Dismiss** removes a row without logging.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/pages/Integrations.tsx apps/web/src/pages/Imports.tsx apps/web/src/App.tsx apps/web/src/components/AppBar.tsx
git commit -m "feat(web): integrations + import review pages, nav, pending badge"
```

---

## Final verification

- [ ] **Run the full API test suite**

Run: `pnpm --filter @lifexp/api test`
Expected: all tests green (crypto, log dates, mapping, strava normalize, buildImportRow).

- [ ] **Typecheck everything**

Run: `pnpm -r build`
Expected: types, xp-engine, api, web all compile.

- [ ] **Manual smoke (full loop)**

With a Pro user and a real Strava app configured: `/integrations` → Connect → authorize → redirected back → "Sync now" → pending count rises → `/imports` → Accept all mapped → logs appear on the Dashboard with backdated dates; daily caps respected for each activity's date. Timer path: `/log` → Meditation → Start → refresh → resumes → Stop & fill → submit → XP panel.

---

## Notes for the implementer

- **`log_id` backfill on accept:** `logActivity` currently returns an `xpBreakdown` but not the inserted log row id. Task 9 marks the import `accepted` without setting `log_id` (the column exists and stays null). If you want `log_id` populated, extend `logActivity`'s return to include the inserted `log.id` and set it in `acceptRow` — this is a small, optional follow-up, not required for the feature to work. Keep it out of scope unless trivial.
- **Streak correctness for backdated logs:** the streak "previous day" is computed relative to the log's own date (`previousDateStr(today_str)`), so accepting historical activities in chronological order builds streaks sensibly. Accepting wildly out-of-order historical data can produce imperfect streak counts — acceptable for Wave 1; note it for users if it surfaces.
- **Activity slug targets in `mapping.ts`** must exist in `apps/api/src/db/seed.ts`'s `activity_definitions`. Verify `running`, `cycling`, `swimming`, `walking`, `workout`, `meditation` are seeded; adjust the `RULES` table (and the matching test) if a target slug differs.
