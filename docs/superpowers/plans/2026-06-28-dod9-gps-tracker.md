# DoD 9 Wave 2 — GPS Activity Tracker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a native Track flow to `apps/mobile` that records a workout via background GPS, draws it on a map live, derives distance + pace/speed, and submits them to the existing `POST /logs` — with saved tracks persisted on-device.

**Architecture:** A new 4th tab (Track) launches a background `expo-location` session whose `expo-task-manager` task appends GPS fixes to an `expo-sqlite` store (UI and task run in separate JS contexts and share that DB). Pure modules derive distance/pace/speed from the points and map them to the Wave 1 `api.createLog` body. A live screen renders the route via a `TrackMap` wrapper; a review screen submits and shows the reused XP card; saved sessions form an on-device history. No backend change.

**Tech Stack:** Expo SDK 56, Expo Router (root `src/app/`), TypeScript strict, React 19, `expo-location`, `expo-task-manager`, `expo-sqlite`, `react-native-maps` (or `expo-maps`, isolated behind one wrapper), `expo-keep-awake`, jest-expo, TanStack Query.

## Global Constraints

- **Expo SDK 56.** Read the versioned docs at `https://docs.expo.dev/versions/v56.0.0/` before writing native code (per `apps/mobile/AGENTS.md`). Install every Expo/RN dep with `npx expo install <pkg>` (never hand-pick versions).
- **Router root is `src/app/`** (NOT project-root `app/`). All new routes go under `apps/mobile/src/app/`.
- **TypeScript strict** across the app. `apps/mobile/tsconfig.json` excludes `**/*.test.ts(x)`; app typecheck = `npx tsc --noEmit` from `apps/mobile`.
- **No backend change.** Reuse `POST /logs`, `GET /activities`, `GET /activities/:slug/intensity` via the existing `apps/mobile/src/lib/api.ts` (`api.createLog`, `api.activities`, `api.intensity`).
- **Shared packages** resolve to source via Metro alias + tsconfig paths; do NOT add `@lifexp/*` as workspace deps.
- **Commits:** omit any Claude `Co-Authored-By` trailer. Work stays on branch `feat/dod9-gps-tracker`.
- **Activities in scope:** `running`, `cycling`, `walking` (unit `km`), `swimming` (unit `meters`, GPS-in-water caveat). Intensity input keys (from seed): running `pace_min_per_km`, cycling `avg_speed_kmh`, swimming `pace_per_100m_sec`, walking none.
- **theme tokens** (`apps/mobile/src/theme.ts`): `colors` (bg, panel, line, ink, muted, xp, arcane, arcane2, danger), `spacing` (xs4/sm8/md12/lg16/xl24/xxl32), `radii` (sm/md/lg/pill), `fonts` (display, body, bodyBold, hud). Match existing screen styling.

---

### Task 1: Dependencies + native config

**Files:**
- Modify: `apps/mobile/package.json` (deps added by `expo install`)
- Modify: `apps/mobile/app.json` (plugins + permissions + Maps key)
- Create: `apps/mobile/.env.example` (document `EXPO_PUBLIC_API_URL` + Maps key placeholder)

**Interfaces:**
- Consumes: nothing.
- Produces: installed native modules (`expo-location`, `expo-task-manager`, `expo-sqlite`, `react-native-maps`, `expo-keep-awake`) and an `app.json` configured for background location + maps that all later tasks rely on.

- [ ] **Step 1: Install the native deps**

Run from `apps/mobile`:
```bash
npx expo install expo-location expo-task-manager expo-sqlite react-native-maps expo-keep-awake
```
Expected: each resolves to an SDK-56-compatible version and is added to `package.json` dependencies.

> **Map library note:** The spec preferred `expo-maps`. `react-native-maps` is installed here because its `<MapView>`/`<Polyline>` API is stable and concrete for SDK 56. The map is isolated behind one wrapper (`TrackMap`, Task 7), so if `expo-maps`' SDK-56 polyline API is confirmed in the docs you may install it instead and reimplement only `TrackMap.tsx` — no other file changes. Pick one; do not ship both.

- [ ] **Step 2: Read the SDK-56 docs for the installed modules**

Open and skim (per AGENTS.md): `https://docs.expo.dev/versions/v56.0.0/sdk/location/`, `.../task-manager/`, `.../sqlite/`. Confirm: `Location.startLocationUpdatesAsync` options (`accuracy`, `foregroundService`, `deferredUpdatesInterval`), `TaskManager.defineTask` signature, and `SQLite.openDatabaseAsync`. If any signature differs from this plan's code, adapt the code to the docs and note it in the commit.

- [ ] **Step 3: Configure `app.json`**

Edit `apps/mobile/app.json` so the `expo` object includes the location plugin, iOS background mode, Android permissions, and the Maps API key. Merge into the existing config (keep current keys):
```json
{
  "expo": {
    "ios": {
      "infoPlist": {
        "UIBackgroundModes": ["location"],
        "NSLocationWhenInUseUsageDescription": "LifeXP uses your location to measure your run, ride, or walk.",
        "NSLocationAlwaysAndWhenInUseUsageDescription": "LifeXP records your route in the background so you can lock your phone during a workout."
      }
    },
    "android": {
      "permissions": [
        "ACCESS_FINE_LOCATION",
        "ACCESS_COARSE_LOCATION",
        "ACCESS_BACKGROUND_LOCATION",
        "FOREGROUND_SERVICE",
        "FOREGROUND_SERVICE_LOCATION"
      ],
      "config": {
        "googleMaps": { "apiKey": "REPLACE_WITH_GOOGLE_MAPS_ANDROID_KEY" }
      }
    },
    "plugins": [
      "expo-router",
      [
        "expo-location",
        {
          "isAndroidBackgroundLocationEnabled": true,
          "isAndroidForegroundServiceEnabled": true,
          "locationAlwaysAndWhenInUsePermission": "LifeXP records your route in the background so you can lock your phone during a workout."
        }
      ]
    ]
  }
}
```
Keep any plugins already listed (e.g. `expo-router`, fonts) — add `expo-location` to the existing array rather than replacing it.

- [ ] **Step 4: Document env in `.env.example`**

Create `apps/mobile/.env.example`:
```
# Base URL of the LifeXP API (defaults to http://localhost:3000)
EXPO_PUBLIC_API_URL=http://localhost:3000
# Google Maps Android key goes in app.json -> expo.android.config.googleMaps.apiKey
```

- [ ] **Step 5: Verify config is valid**

Run from `apps/mobile`:
```bash
npx expo config --type public > /dev/null && echo "config-ok"
```
Expected: prints `config-ok` (no schema error). The Maps key placeholder is fine for this check.

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/package.json apps/mobile/app.json apps/mobile/.env.example ../../pnpm-lock.yaml
git commit -m "chore(mobile): add GPS tracker deps + background-location/maps config"
```

---

### Task 2: Pure geo math (`geo.ts`)

**Files:**
- Create: `apps/mobile/src/lib/track/geo.ts`
- Test: `apps/mobile/src/lib/track/geo.test.ts`

**Interfaces:**
- Consumes: nothing (pure; zero RN/Expo imports).
- Produces:
  - `interface GeoPoint { lat: number; lng: number; accuracy: number; t: number }`
  - `haversineMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number`
  - `accumulateDistance(points: GeoPoint[], opts?: { minAccuracyM?: number; minMoveM?: number }): number`
  - `interface SessionSummary { distanceM: number; movingMs: number }`
  - `summarize(points: GeoPoint[], pausedMs: number): SessionSummary`
  - `derivePaceSpeed(activitySlug: string, distanceM: number, movingMs: number): { value: number; intensityInputs?: Record<string, number> }`

- [ ] **Step 1: Write the failing tests**

Create `apps/mobile/src/lib/track/geo.test.ts`:
```ts
import {
  haversineMeters,
  accumulateDistance,
  summarize,
  derivePaceSpeed,
  type GeoPoint,
} from "./geo";

const pt = (lat: number, lng: number, t: number, accuracy = 5): GeoPoint => ({ lat, lng, accuracy, t });

describe("haversineMeters", () => {
  it("is ~0 for identical points", () => {
    expect(haversineMeters({ lat: 50, lng: 14 }, { lat: 50, lng: 14 })).toBeCloseTo(0, 5);
  });
  it("matches a known short distance (~111m per 0.001 lat deg)", () => {
    const d = haversineMeters({ lat: 50.0, lng: 14.0 }, { lat: 50.001, lng: 14.0 });
    expect(d).toBeGreaterThan(105);
    expect(d).toBeLessThan(118);
  });
});

describe("accumulateDistance", () => {
  it("sums consecutive segments", () => {
    const pts = [pt(50.0, 14.0, 0), pt(50.001, 14.0, 1000), pt(50.002, 14.0, 2000)];
    const total = accumulateDistance(pts);
    expect(total).toBeGreaterThan(210);
    expect(total).toBeLessThan(236);
  });
  it("drops fixes worse than minAccuracyM", () => {
    const pts = [pt(50.0, 14.0, 0, 5), pt(50.5, 14.0, 1000, 200), pt(50.001, 14.0, 2000, 5)];
    const total = accumulateDistance(pts, { minAccuracyM: 30 });
    expect(total).toBeLessThan(120); // the 50.5 jump is excluded
  });
  it("ignores sub-threshold jitter while stationary", () => {
    const pts = [pt(50.0, 14.0, 0), pt(50.000005, 14.0, 1000), pt(50.0, 14.0, 2000)];
    expect(accumulateDistance(pts, { minMoveM: 5 })).toBeCloseTo(0, 1);
  });
  it("returns 0 for fewer than two points", () => {
    expect(accumulateDistance([pt(50, 14, 0)])).toBe(0);
    expect(accumulateDistance([])).toBe(0);
  });
});

describe("summarize", () => {
  it("computes distance and moving time minus paused", () => {
    const pts = [pt(50.0, 14.0, 10_000), pt(50.001, 14.0, 70_000)];
    const s = summarize(pts, 20_000);
    expect(s.movingMs).toBe(40_000); // (70000-10000) - 20000
    expect(s.distanceM).toBeGreaterThan(100);
  });
  it("is zero for empty input", () => {
    expect(summarize([], 0)).toEqual({ distanceM: 0, movingMs: 0 });
  });
});

describe("derivePaceSpeed", () => {
  it("running -> km value + pace_min_per_km", () => {
    const r = derivePaceSpeed("running", 2000, 600_000); // 2km in 10min
    expect(r.value).toBeCloseTo(2, 3);
    expect(r.intensityInputs?.pace_min_per_km).toBeCloseTo(5, 3); // 10min / 2km
  });
  it("cycling -> km value + avg_speed_kmh", () => {
    const r = derivePaceSpeed("cycling", 10_000, 1_800_000); // 10km in 30min
    expect(r.value).toBeCloseTo(10, 3);
    expect(r.intensityInputs?.avg_speed_kmh).toBeCloseTo(20, 3);
  });
  it("walking -> km value, no intensity", () => {
    const r = derivePaceSpeed("walking", 3000, 1_800_000);
    expect(r.value).toBeCloseTo(3, 3);
    expect(r.intensityInputs).toBeUndefined();
  });
  it("swimming -> meters value + pace_per_100m_sec", () => {
    const r = derivePaceSpeed("swimming", 400, 480_000); // 400m in 8min
    expect(r.value).toBeCloseTo(400, 3);
    expect(r.intensityInputs?.pace_per_100m_sec).toBeCloseTo(120, 3); // 480s / 4 * 100m
  });
  it("guards against zero distance / zero time", () => {
    expect(derivePaceSpeed("running", 0, 600_000)).toEqual({ value: 0 });
    expect(derivePaceSpeed("running", 2000, 0)).toEqual({ value: 2 });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run from `apps/mobile`: `npx jest src/lib/track/geo.test.ts`
Expected: FAIL — `Cannot find module './geo'`.

- [ ] **Step 3: Implement `geo.ts`**

Create `apps/mobile/src/lib/track/geo.ts`:
```ts
// Pure geo math for the GPS tracker. Zero RN/Expo imports so it is unit-testable.

export interface GeoPoint {
  lat: number;
  lng: number;
  accuracy: number; // horizontal accuracy in meters (lower is better)
  t: number; // epoch ms
}

export interface SessionSummary {
  distanceM: number;
  movingMs: number;
}

const EARTH_RADIUS_M = 6_371_000;
const toRad = (deg: number): number => (deg * Math.PI) / 180;

export function haversineMeters(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function accumulateDistance(
  points: GeoPoint[],
  opts: { minAccuracyM?: number; minMoveM?: number } = {},
): number {
  const minAccuracyM = opts.minAccuracyM ?? 30;
  const minMoveM = opts.minMoveM ?? 3;
  const good = points.filter((p) => p.accuracy <= minAccuracyM);
  let total = 0;
  for (let i = 1; i < good.length; i += 1) {
    const seg = haversineMeters(good[i - 1], good[i]);
    if (seg >= minMoveM) total += seg;
  }
  return total;
}

export function summarize(points: GeoPoint[], pausedMs: number): SessionSummary {
  if (points.length === 0) return { distanceM: 0, movingMs: 0 };
  const elapsed = points[points.length - 1].t - points[0].t;
  return {
    distanceM: accumulateDistance(points),
    movingMs: Math.max(0, elapsed - pausedMs),
  };
}

export function derivePaceSpeed(
  activitySlug: string,
  distanceM: number,
  movingMs: number,
): { value: number; intensityInputs?: Record<string, number> } {
  const km = distanceM / 1000;
  const minutes = movingMs / 60_000;
  const hours = movingMs / 3_600_000;
  const seconds = movingMs / 1000;

  if (activitySlug === "swimming") {
    const value = distanceM; // unit: meters
    if (distanceM <= 0 || movingMs <= 0) return { value };
    return { value, intensityInputs: { pace_per_100m_sec: seconds / (distanceM / 100) } };
  }

  const value = km; // running / cycling / walking unit: km
  if (distanceM <= 0 || movingMs <= 0) return { value };

  if (activitySlug === "running") {
    return { value, intensityInputs: { pace_min_per_km: minutes / km } };
  }
  if (activitySlug === "cycling") {
    return { value, intensityInputs: { avg_speed_kmh: km / hours } };
  }
  // walking: distance only, no intensity config
  return { value };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run from `apps/mobile`: `npx jest src/lib/track/geo.test.ts`
Expected: PASS (all describe blocks green).

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/lib/track/geo.ts apps/mobile/src/lib/track/geo.test.ts
git commit -m "feat(mobile): pure geo math for GPS distance/pace/speed derivation"
```

---

### Task 3: Log-body builder (`submit.ts`)

**Files:**
- Create: `apps/mobile/src/lib/track/submit.ts`
- Test: `apps/mobile/src/lib/track/submit.test.ts`

**Interfaces:**
- Consumes: `derivePaceSpeed`, `SessionSummary` (Task 2); `ActivityDefinition` from `@lifexp/types` (fields `slug`, `unit`, `min_value`, `max_value`).
- Produces:
  - `interface CreateLogBody { activitySlug: string; value: number; intensityInputs?: Record<string, number> }`
  - `buildLogBody(activity: ActivityDefinition, summary: SessionSummary): CreateLogBody`
  - `clampValue(value: number, min: number, max: number): number`

- [ ] **Step 1: Write the failing tests**

Create `apps/mobile/src/lib/track/submit.test.ts`:
```ts
import type { ActivityDefinition } from "@lifexp/types";
import { buildLogBody, clampValue } from "./submit";

const activity = (over: Partial<ActivityDefinition>): ActivityDefinition => ({
  slug: "running",
  section_slug: "body",
  name: "Running",
  unit: "km",
  input_type: "numeric",
  effort_minutes_per_unit: 10,
  min_value: 0,
  max_value: 100,
  daily_xp_cap: 1000,
  required_plan: "free",
  is_active: true,
  display_order: 1,
  ...over,
});

describe("clampValue", () => {
  it("clamps below min and above max", () => {
    expect(clampValue(-1, 0, 100)).toBe(0);
    expect(clampValue(150, 0, 100)).toBe(100);
    expect(clampValue(42, 0, 100)).toBe(42);
  });
});

describe("buildLogBody", () => {
  it("running: rounds value, includes pace, clamps to max", () => {
    const body = buildLogBody(activity({ max_value: 5 }), { distanceM: 8000, movingMs: 2_400_000 });
    expect(body.activitySlug).toBe("running");
    expect(body.value).toBe(5); // 8km clamped to max 5
    expect(body.intensityInputs?.pace_min_per_km).toBeDefined();
  });
  it("walking: no intensity inputs key omitted", () => {
    const body = buildLogBody(activity({ slug: "walking", name: "Walking" }), {
      distanceM: 3000,
      movingMs: 1_800_000,
    });
    expect(body.value).toBeCloseTo(3, 2);
    expect(body.intensityInputs).toBeUndefined();
  });
  it("swimming: meters value + pace_per_100m_sec", () => {
    const body = buildLogBody(
      activity({ slug: "swimming", name: "Swimming", unit: "meters", min_value: 0, max_value: 5000 }),
      { distanceM: 400, movingMs: 480_000 },
    );
    expect(body.value).toBe(400);
    expect(body.intensityInputs?.pace_per_100m_sec).toBeCloseTo(120, 1);
  });
  it("rounds value to 2 decimals", () => {
    const body = buildLogBody(activity({}), { distanceM: 2345, movingMs: 600_000 });
    expect(body.value).toBe(2.35);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run from `apps/mobile`: `npx jest src/lib/track/submit.test.ts`
Expected: FAIL — `Cannot find module './submit'`.

- [ ] **Step 3: Implement `submit.ts`**

Create `apps/mobile/src/lib/track/submit.ts`:
```ts
import type { ActivityDefinition } from "@lifexp/types";
import { derivePaceSpeed, type SessionSummary } from "./geo";

export interface CreateLogBody {
  activitySlug: string;
  value: number;
  intensityInputs?: Record<string, number>;
}

export function clampValue(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

const round2 = (n: number): number => Math.round(n * 100) / 100;

export function buildLogBody(
  activity: ActivityDefinition,
  summary: SessionSummary,
): CreateLogBody {
  const derived = derivePaceSpeed(activity.slug, summary.distanceM, summary.movingMs);
  const value = round2(clampValue(derived.value, activity.min_value, activity.max_value));
  const body: CreateLogBody = { activitySlug: activity.slug, value };
  if (derived.intensityInputs) {
    const rounded: Record<string, number> = {};
    for (const [k, v] of Object.entries(derived.intensityInputs)) rounded[k] = round2(v);
    body.intensityInputs = rounded;
  }
  return body;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run from `apps/mobile`: `npx jest src/lib/track/submit.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/lib/track/submit.ts apps/mobile/src/lib/track/submit.test.ts
git commit -m "feat(mobile): map GPS session summary to POST /logs body with clamping"
```

---

### Task 4: On-device session store (`db.ts`)

**Files:**
- Create: `apps/mobile/src/lib/track/db.ts`

**Interfaces:**
- Consumes: `expo-sqlite`, `expo-crypto` (UUID) — if `expo-crypto` is not present use `Crypto.randomUUID()` from `expo-crypto`; install via `npx expo install expo-crypto` in Step 1.
- Produces (all async):
  - `interface TrackSession { id: string; activity_slug: string; status: "active" | "saved"; started_at: number; ended_at: number | null; paused_ms: number; value: number | null; intensity_json: string | null; final_xp: number | null }`
  - `interface StoredPoint { lat: number; lng: number; accuracy: number; t: number }`
  - `initDb(): Promise<void>`
  - `createSession(activitySlug: string): Promise<string>`
  - `appendPoints(sessionId: string, points: StoredPoint[]): Promise<void>`
  - `getActiveSession(): Promise<TrackSession | null>`
  - `getSession(id: string): Promise<TrackSession | null>`
  - `getPoints(sessionId: string): Promise<StoredPoint[]>`
  - `setPausedMs(sessionId: string, pausedMs: number): Promise<void>`
  - `endSession(sessionId: string): Promise<void>`
  - `saveSession(sessionId: string, value: number, intensityJson: string, finalXp: number): Promise<void>`
  - `deleteSession(sessionId: string): Promise<void>`
  - `listSavedSessions(): Promise<TrackSession[]>`

> **Testing note:** `expo-sqlite` requires the native runtime, so this module is verified by `tsc` here and exercised end-to-end in the device smoke (Task 10), not by a jest unit test. Keep the SQL simple and the surface small.

- [ ] **Step 1: Install UUID helper**

Run from `apps/mobile`: `npx expo install expo-crypto`
Expected: added to dependencies.

- [ ] **Step 2: Implement `db.ts`**

Create `apps/mobile/src/lib/track/db.ts`:
```ts
import * as SQLite from "expo-sqlite";
import * as Crypto from "expo-crypto";

export interface TrackSession {
  id: string;
  activity_slug: string;
  status: "active" | "saved";
  started_at: number;
  ended_at: number | null;
  paused_ms: number;
  value: number | null;
  intensity_json: string | null;
  final_xp: number | null;
}

export interface StoredPoint {
  lat: number;
  lng: number;
  accuracy: number;
  t: number;
}

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) dbPromise = SQLite.openDatabaseAsync("lifexp-track.db");
  return dbPromise;
}

export async function initDb(): Promise<void> {
  const db = await getDb();
  await db.execAsync(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY NOT NULL,
      activity_slug TEXT NOT NULL,
      status TEXT NOT NULL,
      started_at INTEGER NOT NULL,
      ended_at INTEGER,
      paused_ms INTEGER NOT NULL DEFAULT 0,
      value REAL,
      intensity_json TEXT,
      final_xp INTEGER
    );
    CREATE TABLE IF NOT EXISTS points (
      id TEXT PRIMARY KEY NOT NULL,
      session_id TEXT NOT NULL,
      lat REAL NOT NULL,
      lng REAL NOT NULL,
      accuracy REAL NOT NULL,
      t INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_points_session ON points (session_id, t);
  `);
}

export async function createSession(activitySlug: string): Promise<string> {
  const db = await getDb();
  const id = Crypto.randomUUID();
  await db.runAsync(
    "INSERT INTO sessions (id, activity_slug, status, started_at, paused_ms) VALUES (?, ?, 'active', ?, 0)",
    id,
    activitySlug,
    Date.now(),
  );
  return id;
}

export async function appendPoints(sessionId: string, points: StoredPoint[]): Promise<void> {
  if (points.length === 0) return;
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    for (const p of points) {
      await db.runAsync(
        "INSERT INTO points (id, session_id, lat, lng, accuracy, t) VALUES (?, ?, ?, ?, ?, ?)",
        Crypto.randomUUID(),
        sessionId,
        p.lat,
        p.lng,
        p.accuracy,
        p.t,
      );
    }
  });
}

export async function getActiveSession(): Promise<TrackSession | null> {
  const db = await getDb();
  return (
    (await db.getFirstAsync<TrackSession>(
      "SELECT * FROM sessions WHERE status = 'active' ORDER BY started_at DESC LIMIT 1",
    )) ?? null
  );
}

export async function getSession(id: string): Promise<TrackSession | null> {
  const db = await getDb();
  return (await db.getFirstAsync<TrackSession>("SELECT * FROM sessions WHERE id = ?", id)) ?? null;
}

export async function getPoints(sessionId: string): Promise<StoredPoint[]> {
  const db = await getDb();
  return db.getAllAsync<StoredPoint>(
    "SELECT lat, lng, accuracy, t FROM points WHERE session_id = ? ORDER BY t ASC",
    sessionId,
  );
}

export async function setPausedMs(sessionId: string, pausedMs: number): Promise<void> {
  const db = await getDb();
  await db.runAsync("UPDATE sessions SET paused_ms = ? WHERE id = ?", pausedMs, sessionId);
}

export async function endSession(sessionId: string): Promise<void> {
  const db = await getDb();
  await db.runAsync("UPDATE sessions SET ended_at = ? WHERE id = ?", Date.now(), sessionId);
}

export async function saveSession(
  sessionId: string,
  value: number,
  intensityJson: string,
  finalXp: number,
): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    "UPDATE sessions SET status = 'saved', value = ?, intensity_json = ?, final_xp = ? WHERE id = ?",
    value,
    intensityJson,
    finalXp,
    sessionId,
  );
}

export async function deleteSession(sessionId: string): Promise<void> {
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    await db.runAsync("DELETE FROM points WHERE session_id = ?", sessionId);
    await db.runAsync("DELETE FROM sessions WHERE id = ?", sessionId);
  });
}

export async function listSavedSessions(): Promise<TrackSession[]> {
  const db = await getDb();
  return db.getAllAsync<TrackSession>(
    "SELECT * FROM sessions WHERE status = 'saved' ORDER BY started_at DESC",
  );
}
```

- [ ] **Step 3: Typecheck**

Run from `apps/mobile`: `npx tsc --noEmit`
Expected: no errors (pre-existing app compiles clean). If `getFirstAsync`/`runAsync` generics differ in the installed `expo-sqlite`, adjust to the documented API.

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/src/lib/track/db.ts apps/mobile/package.json ../../pnpm-lock.yaml
git commit -m "feat(mobile): expo-sqlite store for GPS sessions + points"
```

---

### Task 5: Background location task + tracker control (`locationTask.ts`, `tracker.ts`)

**Files:**
- Create: `apps/mobile/src/lib/track/locationTask.ts`
- Create: `apps/mobile/src/lib/track/tracker.ts`

**Interfaces:**
- Consumes: `expo-location`, `expo-task-manager`; `db.ts` (`getActiveSession`, `appendPoints`, `createSession`, `setPausedMs`, `getSession`, `endSession`).
- Produces:
  - `locationTask.ts`: `export const LIFEXP_TRACK_TASK = "lifexp-track-task";` and a top-level `TaskManager.defineTask(...)` registration (side-effecting import).
  - `tracker.ts`:
    - `type StartResult = { ok: true; sessionId: string } | { ok: false; reason: "foreground-denied" | "background-denied" };`
    - `startTracking(activitySlug: string): Promise<StartResult>`
    - `stopTracking(): Promise<void>`
    - `pauseTracking(sessionId: string): Promise<void>`
    - `resumeTracking(sessionId: string): Promise<void>`
    - `isTracking(): Promise<boolean>`

> **Testing note:** native location/task APIs cannot run under jest; verified by `tsc` + the device checklist (Task 10).

- [ ] **Step 1: Implement `locationTask.ts`**

Create `apps/mobile/src/lib/track/locationTask.ts`:
```ts
import * as TaskManager from "expo-task-manager";
import type { LocationObject } from "expo-location";
import { getActiveSession, appendPoints, type StoredPoint } from "./db";

export const LIFEXP_TRACK_TASK = "lifexp-track-task";

interface LocationTaskData {
  locations: LocationObject[];
}

// Registered at module load (Expo requires task definitions at the top level).
TaskManager.defineTask(LIFEXP_TRACK_TASK, async ({ data, error }) => {
  if (error) return;
  const { locations } = (data ?? {}) as LocationTaskData;
  if (!locations?.length) return;
  const session = await getActiveSession();
  if (!session) return; // nothing active -> drop (task may outlive a stop)
  const points: StoredPoint[] = locations.map((l) => ({
    lat: l.coords.latitude,
    lng: l.coords.longitude,
    accuracy: l.coords.accuracy ?? 9999,
    t: l.timestamp,
  }));
  await appendPoints(session.id, points);
});
```

- [ ] **Step 2: Implement `tracker.ts`**

Create `apps/mobile/src/lib/track/tracker.ts`:
```ts
import * as Location from "expo-location";
import { LIFEXP_TRACK_TASK } from "./locationTask";
import { createSession, setPausedMs, getSession, endSession } from "./db";

export type StartResult =
  | { ok: true; sessionId: string }
  | { ok: false; reason: "foreground-denied" | "background-denied" };

// In-memory pause bookkeeping (valid while the live screen is mounted).
let pauseStartedAt: number | null = null;

async function startUpdates(): Promise<void> {
  await Location.startLocationUpdatesAsync(LIFEXP_TRACK_TASK, {
    accuracy: Location.Accuracy.BestForNavigation,
    timeInterval: 2000,
    distanceInterval: 5,
    showsBackgroundLocationIndicator: true,
    foregroundService: {
      notificationTitle: "LifeXP is tracking your activity",
      notificationBody: "Recording your route in the background.",
      notificationColor: "#6C5CE7",
    },
  });
}

export async function startTracking(activitySlug: string): Promise<StartResult> {
  const fg = await Location.requestForegroundPermissionsAsync();
  if (fg.status !== "granted") return { ok: false, reason: "foreground-denied" };
  const bg = await Location.requestBackgroundPermissionsAsync();
  if (bg.status !== "granted") return { ok: false, reason: "background-denied" };

  const sessionId = await createSession(activitySlug);
  pauseStartedAt = null;
  await startUpdates();
  return { ok: true, sessionId };
}

export async function isTracking(): Promise<boolean> {
  return Location.hasStartedLocationUpdatesAsync(LIFEXP_TRACK_TASK);
}

export async function pauseTracking(sessionId: string): Promise<void> {
  if (await isTracking()) await Location.stopLocationUpdatesAsync(LIFEXP_TRACK_TASK);
  pauseStartedAt = Date.now();
}

export async function resumeTracking(sessionId: string): Promise<void> {
  if (pauseStartedAt != null) {
    const session = await getSession(sessionId);
    const added = Date.now() - pauseStartedAt;
    await setPausedMs(sessionId, (session?.paused_ms ?? 0) + added);
    pauseStartedAt = null;
  }
  await startUpdates();
}

export async function stopTracking(): Promise<void> {
  if (await isTracking()) await Location.stopLocationUpdatesAsync(LIFEXP_TRACK_TASK);
  pauseStartedAt = null;
}

// Finalize a session's ended_at after stopping updates.
export async function finalizeSession(sessionId: string): Promise<void> {
  await endSession(sessionId);
}
```

- [ ] **Step 3: Typecheck**

Run from `apps/mobile`: `npx tsc --noEmit`
Expected: no errors. Adjust option names if the SDK-56 `LocationOptions`/`LocationTaskOptions` differ from the docs read in Task 1.

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/src/lib/track/locationTask.ts apps/mobile/src/lib/track/tracker.ts
git commit -m "feat(mobile): background location task + start/stop/pause tracker control"
```

---

### Task 6: Track tab — picker, start, history, resume prompt

**Files:**
- Modify: `apps/mobile/src/app/(tabs)/_layout.tsx` (add Track tab)
- Create: `apps/mobile/src/app/(tabs)/track.tsx`
- Create: `apps/mobile/src/app/track/_layout.tsx` (Stack for the session/review/detail routes)
- Modify: `apps/mobile/src/app/_layout.tsx` (call `initDb()` once on mount)

**Interfaces:**
- Consumes: `tracker.startTracking`; `db.getActiveSession`, `db.listSavedSessions`, `db.deleteSession`, `initDb`; `api.activities`; theme + `Screen`/`Card`.
- Produces: navigation to `/track/active` (with no params — the active session is read from the DB) and `/track/[id]`.

- [ ] **Step 1: Add the Track tab**

Edit `apps/mobile/src/app/(tabs)/_layout.tsx` — add a Track screen between Log and Profile:
```tsx
      <Tabs.Screen name="index" options={{ title: "Home" }} />
      <Tabs.Screen name="log" options={{ title: "Log" }} />
      <Tabs.Screen name="track" options={{ title: "Track" }} />
      <Tabs.Screen name="profile" options={{ title: "Profile" }} />
```

- [ ] **Step 2: Initialize the DB on app boot**

Edit `apps/mobile/src/app/_layout.tsx` — import `initDb` and call it once in an effect inside the root component (alongside the existing providers/Gate). Add near the top-level component body:
```tsx
import { useEffect } from "react";
import { initDb } from "../lib/track/db";
// ...
  useEffect(() => {
    initDb().catch(() => {
      // DB init failure: the Track tab will surface errors on use; app still runs.
    });
  }, []);
```
(If `_layout.tsx` already imports `useEffect`/has effects, merge rather than duplicate the import.)

- [ ] **Step 3: Create the Track stack layout**

Create `apps/mobile/src/app/track/_layout.tsx`:
```tsx
import { Stack } from "expo-router";
import { colors } from "../../theme";

export default function TrackLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.panel },
        headerTintColor: colors.ink,
        contentStyle: { backgroundColor: colors.bg },
      }}
    >
      <Stack.Screen name="active" options={{ title: "Tracking", headerBackVisible: false }} />
      <Stack.Screen name="review" options={{ title: "Review" }} />
      <Stack.Screen name="[id]" options={{ title: "Activity" }} />
    </Stack>
  );
}
```

- [ ] **Step 4: Create the Track tab screen**

Create `apps/mobile/src/app/(tabs)/track.tsx`:
```tsx
import { useCallback, useMemo, useState } from "react";
import { Text, Pressable, StyleSheet, View, Alert } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { startTracking } from "../../lib/track/tracker";
import { getActiveSession, listSavedSessions, deleteSession, type TrackSession } from "../../lib/track/db";
import { Screen } from "../../components/Screen";
import { Card } from "../../components/Card";
import { colors, fonts, spacing, radii } from "../../theme";

const TRACKABLE = new Set(["running", "cycling", "walking", "swimming"]);

export default function Track() {
  const router = useRouter();
  const activitiesQuery = useQuery({ queryKey: ["activities"], queryFn: api.activities });
  const activities = (activitiesQuery.data?.activities ?? []).filter((a) => TRACKABLE.has(a.slug));

  const [slug, setSlug] = useState("");
  const [saved, setSaved] = useState<TrackSession[]>([]);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    listSavedSessions().then(setSaved).catch(() => setSaved([]));
    getActiveSession().then((active) => {
      if (active) {
        Alert.alert("Resume tracking?", "You have an unfinished activity.", [
          { text: "Discard", style: "destructive", onPress: () => deleteSession(active.id).then(refresh) },
          { text: "Resume", onPress: () => router.push("/track/active") },
        ]);
      }
    });
  }, [router]);

  useFocusEffect(useCallback(() => { refresh(); }, [refresh]));

  const onStart = async () => {
    setError(null);
    const res = await startTracking(slug);
    if (!res.ok) {
      setError(
        res.reason === "foreground-denied"
          ? "Location permission is required to track. Enable it in Settings."
          : "Background location is required so tracking continues with the screen off. Enable “Always” in Settings.",
      );
      return;
    }
    router.push("/track/active");
  };

  return (
    <Screen>
      <Text style={styles.h1}>Track activity</Text>
      <Card>
        <Text style={styles.label}>Activity</Text>
        <View style={styles.chips}>
          {activities.map((a) => (
            <Pressable
              key={a.slug}
              onPress={() => setSlug(a.slug)}
              style={[styles.chip, slug === a.slug && styles.chipActive]}
            >
              <Text style={[styles.chipText, slug === a.slug && styles.chipTextActive]}>{a.name}</Text>
            </Pressable>
          ))}
        </View>
        {slug === "swimming" && (
          <Text style={styles.muted}>Note: GPS is unreliable in water — open-water only.</Text>
        )}
        {error && <Text style={styles.error}>{error}</Text>}
        <Pressable
          style={[styles.button, !slug && styles.buttonDisabled]}
          disabled={!slug}
          onPress={onStart}
        >
          <Text style={styles.buttonText}>Start tracking</Text>
        </Pressable>
      </Card>

      <Text style={styles.h2}>History</Text>
      {saved.length === 0 && <Text style={styles.muted}>No tracked activities yet.</Text>}
      {saved.map((s) => (
        <Pressable key={s.id} onPress={() => router.push(`/track/${s.id}`)}>
          <Card>
            <Text style={styles.rowTitle}>{s.activity_slug}</Text>
            <Text style={styles.muted}>
              {s.value ?? 0} · +{s.final_xp ?? 0} XP · {new Date(s.started_at).toLocaleDateString()}
            </Text>
          </Card>
        </Pressable>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  h1: { fontFamily: fonts.display, fontSize: 24, color: colors.ink },
  h2: { fontFamily: fonts.display, fontSize: 18, color: colors.ink, marginTop: spacing.md },
  label: { fontFamily: fonts.body, fontSize: 11, color: colors.muted, letterSpacing: 1, textTransform: "uppercase", marginTop: spacing.sm },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  chip: { borderWidth: 1, borderColor: colors.line, borderRadius: radii.pill, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  chipActive: { backgroundColor: colors.arcane, borderColor: colors.arcane },
  chipText: { color: colors.muted, fontFamily: fonts.body },
  chipTextActive: { color: colors.ink, fontFamily: fonts.bodyBold },
  button: { backgroundColor: colors.xp, borderRadius: radii.md, paddingVertical: spacing.lg, alignItems: "center", marginTop: spacing.md },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: colors.bg, fontFamily: fonts.bodyBold, fontSize: 16 },
  rowTitle: { fontFamily: fonts.bodyBold, color: colors.ink, fontSize: 16, textTransform: "capitalize" },
  muted: { fontFamily: fonts.body, color: colors.muted, marginTop: spacing.xs },
  error: { color: colors.danger, fontFamily: fonts.body, marginTop: spacing.sm },
});
```

- [ ] **Step 5: Typecheck**

Run from `apps/mobile`: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/src/app
git commit -m "feat(mobile): Track tab with activity picker, start, history + resume prompt"
```

---

### Task 7: Map wrapper + live session screen

**Files:**
- Create: `apps/mobile/src/components/TrackMap.tsx`
- Create: `apps/mobile/src/app/track/active.tsx`

**Interfaces:**
- Consumes: `react-native-maps` (isolated here); `db.getActiveSession`, `db.getPoints`, `db.getSession`; `tracker.stopTracking`, `tracker.pauseTracking`, `tracker.resumeTracking`, `tracker.finalizeSession`; `geo.summarize`, `geo.GeoPoint`; `expo-keep-awake`.
- Produces:
  - `TrackMap`: `interface LatLng { lat: number; lng: number }` and `function TrackMap({ points }: { points: LatLng[] }): JSX.Element`.
  - Navigation to `/track/review`.

- [ ] **Step 1: Implement the map wrapper**

Create `apps/mobile/src/components/TrackMap.tsx`:
```tsx
import type { JSX } from "react";
import { StyleSheet, View, Text } from "react-native";
import MapView, { Polyline, type Region } from "react-native-maps";
import { colors, fonts, radii } from "../theme";

export interface LatLng {
  lat: number;
  lng: number;
}

// Isolates the map library. If swapping to expo-maps, reimplement ONLY this file.
export function TrackMap({ points, height = 280 }: { points: LatLng[]; height?: number }): JSX.Element {
  if (points.length === 0) {
    return (
      <View style={[styles.placeholder, { height }]}>
        <Text style={styles.placeholderText}>Waiting for GPS…</Text>
      </View>
    );
  }
  const last = points[points.length - 1];
  const region: Region = {
    latitude: last.lat,
    longitude: last.lng,
    latitudeDelta: 0.01,
    longitudeDelta: 0.01,
  };
  const coords = points.map((p) => ({ latitude: p.lat, longitude: p.lng }));
  return (
    <View style={[styles.wrap, { height }]}>
      <MapView style={StyleSheet.absoluteFill} region={region} showsUserLocation>
        <Polyline coordinates={coords} strokeColor={colors.arcane} strokeWidth={5} />
      </MapView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { borderRadius: radii.lg, overflow: "hidden" },
  placeholder: {
    borderRadius: radii.lg,
    backgroundColor: colors.panel,
    alignItems: "center",
    justifyContent: "center",
  },
  placeholderText: { color: colors.muted, fontFamily: fonts.body },
});
```

- [ ] **Step 2: Implement the live session screen**

Create `apps/mobile/src/app/track/active.tsx`:
```tsx
import { useEffect, useRef, useState } from "react";
import { Text, Pressable, StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import { useKeepAwake } from "expo-keep-awake";
import { getActiveSession, getPoints, type StoredPoint } from "../../lib/track/db";
import { stopTracking, pauseTracking, resumeTracking, finalizeSession } from "../../lib/track/tracker";
import { summarize, type GeoPoint } from "../../lib/track/geo";
import { TrackMap } from "../../components/TrackMap";
import { Screen } from "../../components/Screen";
import { Card } from "../../components/Card";
import { colors, fonts, spacing, radii } from "../../theme";

const fmtDuration = (ms: number): string => {
  const s = Math.floor(ms / 1000);
  const mm = String(Math.floor(s / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return `${mm}:${ss}`;
};

export default function ActiveSession() {
  useKeepAwake();
  const router = useRouter();
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [points, setPoints] = useState<StoredPoint[]>([]);
  const [pausedMs, setPausedMs] = useState(0);
  const [paused, setPaused] = useState(false);
  const tick = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      const session = await getActiveSession();
      if (!session || cancelled) return;
      setSessionId(session.id);
      setPausedMs(session.paused_ms);
      setPoints(await getPoints(session.id));
    };
    poll();
    tick.current = setInterval(poll, 2000);
    return () => {
      cancelled = true;
      if (tick.current) clearInterval(tick.current);
    };
  }, []);

  const geoPoints: GeoPoint[] = points.map((p) => ({ lat: p.lat, lng: p.lng, accuracy: p.accuracy, t: p.t }));
  const summary = summarize(geoPoints, pausedMs);

  const onPauseToggle = async () => {
    if (!sessionId) return;
    if (paused) {
      await resumeTracking(sessionId);
      setPaused(false);
    } else {
      await pauseTracking(sessionId);
      setPaused(true);
    }
  };

  const onStop = async () => {
    if (!sessionId) return;
    await stopTracking();
    await finalizeSession(sessionId);
    if (tick.current) clearInterval(tick.current);
    router.replace("/track/review");
  };

  return (
    <Screen>
      <TrackMap points={points.map((p) => ({ lat: p.lat, lng: p.lng }))} />
      <Card>
        <View style={styles.statsRow}>
          <View style={styles.stat}>
            <Text style={styles.statValue}>{(summary.distanceM / 1000).toFixed(2)}</Text>
            <Text style={styles.statLabel}>km</Text>
          </View>
          <View style={styles.stat}>
            <Text style={styles.statValue}>{fmtDuration(summary.movingMs)}</Text>
            <Text style={styles.statLabel}>moving</Text>
          </View>
        </View>
        {paused && <Text style={styles.paused}>Paused</Text>}
      </Card>
      <View style={styles.actions}>
        <Pressable style={[styles.button, styles.secondary]} onPress={onPauseToggle}>
          <Text style={styles.secondaryText}>{paused ? "Resume" : "Pause"}</Text>
        </Pressable>
        <Pressable style={[styles.button, styles.stop]} onPress={onStop}>
          <Text style={styles.buttonText}>Stop</Text>
        </Pressable>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  statsRow: { flexDirection: "row", justifyContent: "space-around" },
  stat: { alignItems: "center" },
  statValue: { fontFamily: fonts.hud, fontSize: 36, color: colors.ink },
  statLabel: { fontFamily: fonts.body, fontSize: 12, color: colors.muted, textTransform: "uppercase", letterSpacing: 1 },
  paused: { textAlign: "center", color: colors.xp, fontFamily: fonts.bodyBold, marginTop: spacing.sm },
  actions: { flexDirection: "row", gap: spacing.md },
  button: { flex: 1, borderRadius: radii.md, paddingVertical: spacing.lg, alignItems: "center" },
  secondary: { borderWidth: 1, borderColor: colors.line },
  secondaryText: { color: colors.ink, fontFamily: fonts.bodyBold, fontSize: 16 },
  stop: { backgroundColor: colors.danger },
  buttonText: { color: colors.ink, fontFamily: fonts.bodyBold, fontSize: 16 },
});
```

- [ ] **Step 3: Typecheck**

Run from `apps/mobile`: `npx tsc --noEmit`
Expected: no errors. If `react-native-maps` types are missing, confirm it shipped types (it does for current versions); otherwise adjust the import per the installed version.

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/src/components/TrackMap.tsx apps/mobile/src/app/track/active.tsx
git commit -m "feat(mobile): live GPS session screen with map polyline + pause/stop"
```

---

### Task 8: Review & submit screen + shared XP card

**Files:**
- Create: `apps/mobile/src/components/XpResultCard.tsx`
- Modify: `apps/mobile/src/app/(tabs)/log.tsx` (use the shared card)
- Create: `apps/mobile/src/app/track/review.tsx`

**Interfaces:**
- Consumes: `db.getActiveSession`/`getSession` (most-recent ended active session), `getPoints`, `saveSession`, `deleteSession`; `geo.summarize`; `submit.buildLogBody`; `api.activities`, `api.createLog`; `LogResponse` from `api.ts`.
- Produces: `XpResultCard({ result }: { result: LogResponse }): JSX.Element` reused by both Log and review.

- [ ] **Step 1: Extract the shared XP card**

Create `apps/mobile/src/components/XpResultCard.tsx`:
```tsx
import type { JSX } from "react";
import { Text, StyleSheet } from "react-native";
import type { LogResponse } from "../lib/api";
import { Card } from "./Card";
import { colors, fonts, spacing } from "../theme";

export function XpResultCard({ result }: { result: LogResponse }): JSX.Element {
  return (
    <Card>
      <Text style={styles.xpEarned}>+{result.xpBreakdown.final_xp} XP</Text>
      <Text style={styles.muted}>
        base {result.xpBreakdown.raw_xp} · ×{result.xpBreakdown.intensity_multiplier.toFixed(2)} intensity · ×
        {result.xpBreakdown.streak_multiplier.toFixed(2)} streak
      </Text>
      {result.heroLevelUp && (
        <Text style={styles.levelUp}>Hero reached level {result.heroLevelUp.new_level} ✦</Text>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  xpEarned: { fontFamily: fonts.hud, fontSize: 28, color: colors.xp },
  muted: { fontFamily: fonts.body, color: colors.muted },
  levelUp: { color: colors.arcane2, fontFamily: fonts.bodyBold, marginTop: spacing.sm },
});
```

- [ ] **Step 2: Use the shared card in `log.tsx`**

Edit `apps/mobile/src/app/(tabs)/log.tsx`: import `XpResultCard` and replace the inline result `<Card>…</Card>` block (the one rendering `+XP`/breakdown/levelUp) with `{result && <XpResultCard result={result} />}`. Remove the now-unused `xpEarned`/`levelUp` style entries if they are no longer referenced (keep `muted`).

- [ ] **Step 3: Implement the review screen**

Create `apps/mobile/src/app/track/review.tsx`:
```tsx
import { useEffect, useState } from "react";
import { Text, TextInput, Pressable, StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import { api, ApiError, type LogResponse } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { getActiveSession, getPoints, saveSession, deleteSession } from "../../lib/track/db";
import { summarize, type GeoPoint } from "../../lib/track/geo";
import { buildLogBody } from "../../lib/track/submit";
import { Screen } from "../../components/Screen";
import { Card } from "../../components/Card";
import { XpResultCard } from "../../components/XpResultCard";
import { colors, fonts, spacing, radii } from "../../theme";

export default function Review() {
  const router = useRouter();
  const qc = useQueryClient();
  const { refreshMe } = useAuth();
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [activitySlug, setActivitySlug] = useState("");
  const [value, setValue] = useState("");
  const [intensity, setIntensity] = useState<Record<string, number>>({});
  const [result, setResult] = useState<LogResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    (async () => {
      const session = await getActiveSession();
      if (!session) {
        router.replace("/(tabs)/track");
        return;
      }
      setSessionId(session.id);
      setActivitySlug(session.activity_slug);
      const pts = await getPoints(session.id);
      const geo: GeoPoint[] = pts.map((p) => ({ lat: p.lat, lng: p.lng, accuracy: p.accuracy, t: p.t }));
      const summary = summarize(geo, session.paused_ms);
      const activities = await api.activities();
      const def = activities.activities.find((a) => a.slug === session.activity_slug);
      if (!def) {
        setError("Activity definition unavailable.");
        return;
      }
      const body = buildLogBody(def, summary);
      setValue(String(body.value));
      setIntensity(body.intensityInputs ?? {});
    })();
  }, [router]);

  const onSave = async () => {
    if (!sessionId) return;
    const numericValue = Number(value);
    if (!numericValue || numericValue <= 0) {
      setError("Distance is zero — nothing to log. Discard instead.");
      return;
    }
    setPending(true);
    setError(null);
    try {
      const res = await api.createLog({
        activitySlug,
        value: numericValue,
        intensityInputs: Object.keys(intensity).length ? intensity : undefined,
      });
      await saveSession(sessionId, numericValue, JSON.stringify(intensity), res.xpBreakdown.final_xp);
      setResult(res);
      await refreshMe();
      qc.invalidateQueries({ queryKey: ["logs"] });
      qc.invalidateQueries({ queryKey: ["me"] });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not save activity.");
    } finally {
      setPending(false);
    }
  };

  const onDiscard = async () => {
    if (sessionId) await deleteSession(sessionId);
    router.replace("/(tabs)/track");
  };

  if (result) {
    return (
      <Screen>
        <Text style={styles.h1}>Saved</Text>
        <XpResultCard result={result} />
        <Pressable style={styles.button} onPress={() => router.replace("/(tabs)/track")}>
          <Text style={styles.buttonText}>Done</Text>
        </Pressable>
      </Screen>
    );
  }

  return (
    <Screen>
      <Text style={styles.h1}>Review</Text>
      <Card>
        <Text style={styles.label}>Activity</Text>
        <Text style={styles.activity}>{activitySlug}</Text>
        <Text style={styles.label}>Distance / amount</Text>
        <TextInput
          style={styles.input}
          keyboardType="numeric"
          value={value}
          onChangeText={setValue}
        />
        {Object.entries(intensity).map(([k, v]) => (
          <View key={k} style={{ gap: spacing.xs }}>
            <Text style={styles.label}>{k}</Text>
            <TextInput
              style={styles.input}
              keyboardType="numeric"
              value={String(v)}
              onChangeText={(t) => setIntensity((p) => ({ ...p, [k]: Number(t) }))}
            />
          </View>
        ))}
        {error && <Text style={styles.error}>{error}</Text>}
      </Card>
      <View style={styles.actions}>
        <Pressable style={[styles.button, styles.secondary]} onPress={onDiscard}>
          <Text style={styles.secondaryText}>Discard</Text>
        </Pressable>
        <Pressable
          style={[styles.button, styles.save, pending && styles.disabled]}
          disabled={pending}
          onPress={onSave}
        >
          <Text style={styles.buttonText}>{pending ? "Saving…" : "Save & earn XP"}</Text>
        </Pressable>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  h1: { fontFamily: fonts.display, fontSize: 24, color: colors.ink },
  label: { fontFamily: fonts.body, fontSize: 11, color: colors.muted, letterSpacing: 1, textTransform: "uppercase", marginTop: spacing.sm },
  activity: { fontFamily: fonts.bodyBold, color: colors.ink, fontSize: 18, textTransform: "capitalize" },
  input: { borderWidth: 1, borderColor: colors.line, backgroundColor: colors.bg, color: colors.ink, borderRadius: radii.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, fontFamily: fonts.body },
  actions: { flexDirection: "row", gap: spacing.md },
  button: { flex: 1, borderRadius: radii.md, paddingVertical: spacing.lg, alignItems: "center", marginTop: spacing.md },
  secondary: { borderWidth: 1, borderColor: colors.line },
  secondaryText: { color: colors.ink, fontFamily: fonts.bodyBold, fontSize: 16 },
  save: { backgroundColor: colors.xp },
  disabled: { opacity: 0.5 },
  buttonText: { color: colors.bg, fontFamily: fonts.bodyBold, fontSize: 16 },
  error: { color: colors.danger, fontFamily: fonts.body, marginTop: spacing.sm },
});
```

- [ ] **Step 4: Typecheck + run pure tests**

Run from `apps/mobile`: `npx tsc --noEmit && npx jest`
Expected: tsc clean; jest green (geo + submit + any Wave 1 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/components/XpResultCard.tsx apps/mobile/src/app/(tabs)/log.tsx apps/mobile/src/app/track/review.tsx
git commit -m "feat(mobile): GPS session review/submit + shared XP result card"
```

---

### Task 9: Saved-track detail screen

**Files:**
- Create: `apps/mobile/src/app/track/[id].tsx`

**Interfaces:**
- Consumes: `db.getSession`, `db.getPoints`; `geo.summarize`; `TrackMap`; `useLocalSearchParams` from expo-router.
- Produces: read-only view of a saved track.

- [ ] **Step 1: Implement the detail screen**

Create `apps/mobile/src/app/track/[id].tsx`:
```tsx
import { useEffect, useState } from "react";
import { Text, StyleSheet, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { getSession, getPoints, type TrackSession, type StoredPoint } from "../../lib/track/db";
import { summarize, type GeoPoint } from "../../lib/track/geo";
import { TrackMap } from "../../components/TrackMap";
import { Screen } from "../../components/Screen";
import { Card } from "../../components/Card";
import { colors, fonts, spacing } from "../../theme";

export default function TrackDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [session, setSession] = useState<TrackSession | null>(null);
  const [points, setPoints] = useState<StoredPoint[]>([]);

  useEffect(() => {
    if (!id) return;
    getSession(id).then(setSession);
    getPoints(id).then(setPoints);
  }, [id]);

  const geo: GeoPoint[] = points.map((p) => ({ lat: p.lat, lng: p.lng, accuracy: p.accuracy, t: p.t }));
  const summary = summarize(geo, session?.paused_ms ?? 0);

  return (
    <Screen>
      <TrackMap points={points.map((p) => ({ lat: p.lat, lng: p.lng }))} />
      <Card>
        <Text style={styles.activity}>{session?.activity_slug ?? "…"}</Text>
        <View style={styles.row}>
          <Text style={styles.stat}>{(summary.distanceM / 1000).toFixed(2)} km</Text>
          <Text style={styles.stat}>+{session?.final_xp ?? 0} XP</Text>
        </View>
        {session && (
          <Text style={styles.muted}>{new Date(session.started_at).toLocaleString()}</Text>
        )}
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  activity: { fontFamily: fonts.bodyBold, color: colors.ink, fontSize: 20, textTransform: "capitalize" },
  row: { flexDirection: "row", justifyContent: "space-between", marginTop: spacing.sm },
  stat: { fontFamily: fonts.hud, fontSize: 24, color: colors.xp },
  muted: { fontFamily: fonts.body, color: colors.muted, marginTop: spacing.sm },
});
```

- [ ] **Step 2: Typecheck**

Run from `apps/mobile`: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/src/app/track/[id].tsx
git commit -m "feat(mobile): saved-track detail screen"
```

---

### Task 10: Verification — headless gate + device checklist

**Files:**
- Create: `docs/superpowers/checklists/2026-06-28-gps-tracker-device-check.md`

**Interfaces:**
- Consumes: everything above.
- Produces: a documented manual verification the user runs on a physical device.

- [ ] **Step 1: Headless verification gate**

Run from `apps/mobile`:
```bash
npx tsc --noEmit && npx jest && npx expo export --platform android > /dev/null && echo "headless-ok"
```
Expected: `headless-ok` — types clean, all jest suites pass, and Metro bundles the app (catches missing native deps / bad imports). If `expo export` complains about the Maps key, that is fine for bundling; the key only matters at runtime on device.

- [ ] **Step 2: Write the device checklist**

Create `docs/superpowers/checklists/2026-06-28-gps-tracker-device-check.md`:
```markdown
# GPS Tracker — Device Verification (requires EAS dev build)

Background GPS cannot run in Expo Go or a simulator. Build a dev client and test on a real phone outdoors.

## Prerequisites
- [ ] Google Maps Android API key set in `app.json` (`expo.android.config.googleMaps.apiKey`).
- [ ] `EXPO_PUBLIC_API_URL` points at a reachable API; API + Postgres running; user seeded.
- [ ] Dev build: `eas build --profile development --platform android` (and/or iOS), install on device.

## Checklist
- [ ] Launch app, log in. Track tab shows the four activities.
- [ ] Pick Running → Start tracking. Grant foreground, then "Allow always" (background).
- [ ] Android: a foreground-service notification "LifeXP is tracking your activity" appears.
- [ ] Walk ~200m. The map polyline grows; distance + moving time update.
- [ ] Lock the phone, walk further, unlock — distance kept accruing while locked.
- [ ] Pause → distance/time freeze; Resume → continues; moving time excludes the pause.
- [ ] Stop → Review shows a plausible distance (km) and pace; edit if needed.
- [ ] Save & earn XP → XP breakdown card renders; Home recent feed shows the new log.
- [ ] Track tab History lists the activity; tapping it opens the route + stats.
- [ ] Kill the app mid-session, relaunch, open Track → "Resume tracking?" prompt appears.
- [ ] Deny background permission once → clear explainer + Settings path; manual logging still works.
```

- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/checklists/2026-06-28-gps-tracker-device-check.md
git commit -m "docs(mobile): GPS tracker device verification checklist"
```

---

## Self-Review

**Spec coverage:**
- §2 background tracking → Tasks 1 (config), 5 (task+tracker). ✓
- §2 map (expo-maps/react-native-maps fallback) → Tasks 1, 7 (isolated `TrackMap`). ✓
- §2 on-device storage + history → Tasks 4 (db), 6 (history list), 9 (detail). ✓
- §2 four activities incl. swimming caveat → Tasks 2/3 (derivation), 6 (picker + caveat). ✓
- §2 submit via existing /logs → Task 8 (review → `api.createLog`). ✓
- §3 cross-context SQLite sharing → Tasks 4/5/7 (task writes, UI polls). ✓
- §3 navigation 4th tab + stack routes → Tasks 6 (tab + stack), 7/8/9 (routes). ✓
- §3 pure derivation tested → Tasks 2 (geo), 3 (submit). ✓
- §4 lifecycle (start→poll→pause→stop→review→save/discard→history) → Tasks 6–9. ✓
- §5 error handling (permission denied, weak signal via accuracy filter, killed-mid-run resume, out-of-range clamp, /logs failure) → Tasks 2 (filter), 5/6 (permissions), 6 (resume), 8 (clamp + retry). ✓
- §6 testing (jest pure + device checklist) → Tasks 2/3 (jest), 10 (checklist + headless gate). ✓
- §6 no backend change → confirmed: only `apps/mobile/**` + docs touched. ✓

**Placeholder scan:** No TBD/TODO; every code step contains complete code; the only literal placeholder is the intentional `REPLACE_WITH_GOOGLE_MAPS_ANDROID_KEY` (a user-supplied secret, documented in the checklist).

**Type consistency:** `GeoPoint`/`StoredPoint` shapes match across geo/db/screens; `SessionSummary { distanceM, movingMs }` consistent geo→submit→screens; `buildLogBody(activity, summary)` signature matches its callsite in Task 8; `LogResponse` (`xpBreakdown.final_xp/raw_xp/intensity_multiplier/streak_multiplier`, `heroLevelUp.new_level`) matches `api.ts` and the reused card; tracker function names (`startTracking`, `stopTracking`, `pauseTracking`, `resumeTracking`, `finalizeSession`, `isTracking`) consistent task 5→7. ✓
