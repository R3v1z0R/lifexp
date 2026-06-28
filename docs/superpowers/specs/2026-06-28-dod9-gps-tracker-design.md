# DoD 9 — Wave 2 — GPS Activity Tracker — Design

**Date:** 2026-06-28
**Status:** Approved (pre-implementation)
**Builds on:** DoD 9 Wave 1 (mobile foundation — auth, theme, api client, 3-tab core, push), merged to master (PR #2).
**Scope of this spec:** Wave 2 of the mobile build — an on-device **GPS activity tracker**: record a real workout via background GPS, draw it live on a map, derive **distance + pace/speed**, and submit them to the existing `POST /logs`. Saved tracks persist **on-device** with a history view. Timers, cloud/health import, and the remaining screens stay deferred to later waves.

---

## 1. Context & Goal

LifeXP's backend (DoD 1–7), web app (DoD 8), and the mobile foundation (DoD 9 Wave 1) are complete and merged to master. The mobile shell already proves auth, the design language, the existing log pipeline, and push delivery.

This wave delivers the user's original headline goal: **the app measures the sport itself.** A new **Track** flow uses the phone's GPS — running in the **background** (screen off, phone in pocket) — to record a workout, render the route on a map in real time, and on finish derive the activity's `value` (distance) **and** its intensity input (pace or speed). Those derived numbers are submitted through the **existing** `POST /logs` route exactly as a manual log would be.

The tracker is a **client of the existing API**. It introduces **no XP, level, perk, streak, or cap logic**, and — by design — **no backend change**. It reuses `POST /logs`, `GET /activities`, and `GET /activities/:slug/intensity`. Route geometry is stored **only on-device**.

### Non-goals (Wave 2)
- Backend persistence of route geometry (routes stay on-device this wave).
- Server-side or cross-device sync of tracks.
- In-app timers (later wave).
- Cloud import (Strava) / health platforms (Apple Health, Google Fit / Health Connect) (later waves).
- Auto-pause / auto-resume detection, turn-by-turn, splits/laps, elevation, heart-rate/sensor integration.
- Deep links, and the remaining screens (Friends / Goals / Events / Upgrade / Admin).

---

## 2. Decisions (locked)

| Question | Decision |
|---|---|
| Tracking model | **Background** — keeps recording with the screen off / app backgrounded. `expo-location` background updates + an `expo-task-manager` task; Android foreground-service notification; iOS `UIBackgroundModes: ["location"]`. Requires an **EAS dev build** (not Expo Go). |
| Map display | **`expo-maps`** (official Expo module; Apple Maps on iOS, Google Maps on Android) drawing the route polyline live. `react-native-maps` is the documented fallback. |
| Route storage | **On-device only.** Saved tracks (route + stats) persist in `expo-sqlite`; a history list + per-track view live in the app. No backend change. |
| Activities | **Running, Cycling, Walking, Swimming.** Swimming included with an explicit caveat (open-water only; GPS is unreliable in water). |
| Submit path | Derived `value` + `intensityInputs` go through the **existing** `POST /logs` via the Wave 1 `api.createLog`. No new endpoint. |
| Cross-context state | UI and the background task share **`expo-sqlite`** (separate JS contexts can't share React state). |
| Navigation | New **4th tab**: Home · Log · **Track** · Profile. |

---

## 3. Architecture & Monorepo Wiring

### Navigation tree (Expo Router, root `src/app/`)
- `src/app/(tabs)/_layout.tsx` — add a **Track** tab between Log and Profile.
- `src/app/(tabs)/track.tsx` — **Track tab**: activity picker (Running/Cycling/Walking/Swimming) + **Start tracking** button; below it the **local history list** of saved tracks (most recent first). On mount, if an `active` session exists in the DB, show a **Resume / Discard** prompt (crash recovery).
- `src/app/track/active.tsx` — **live session** (pushed stack route): map with the route polyline, live **distance / duration / pace-or-speed**, **Pause · Resume · Stop**. Stop → review.
- `src/app/track/review.tsx` — **review & submit**: derived `value` + intensity (editable, clamped to the activity's `min_value`/`max_value`), **Save & earn XP** / **Discard**. On save, reuse the Wave 1 XP-breakdown card.
- `src/app/track/[id].tsx` — **view a saved track** from history (map + stats, read-only).

### Background location subsystem
- **`src/lib/track/locationTask.ts`** — defines the `expo-task-manager` task (`LIFEXP_TRACK_TASK`). On each batch of fixes it appends rows to the active session's `points` table. The task is registered at module load (Expo requires task definitions at the top level, before `registerRootComponent` runs).
- **`src/lib/track/tracker.ts`** — start/stop/pause API the UI calls:
  - `startTracking(activitySlug)` — request foreground then background permission; create an `active` session row; `Location.startLocationUpdatesAsync(LIFEXP_TRACK_TASK, { accuracy: BestForNavigation, foregroundService: {…}, … })`.
  - `pauseTracking()` / `resumeTracking()` — record paused segments (so duration excludes them); pausing stops appending distance.
  - `stopTracking()` — `Location.stopLocationUpdatesAsync`, finalize the session (status stays `active` until saved/discarded in review).
- **Permissions:** `requestForegroundPermissionsAsync()` → `requestBackgroundPermissionsAsync()`. Denial of either → no tracking; surface an explainer + a link to OS settings (`Linking.openSettings()`) and point the user back to manual logging on the Log tab.

### Local persistence (`expo-sqlite`)
- **`src/lib/track/db.ts`** — opens one DB (`lifexp-track.db`) and owns the schema + queries. Both the UI and the background task import it.
- Schema:
  | Table | Columns |
  |---|---|
  | `sessions` | `id` (uuid), `activity_slug`, `status` (`active`/`saved`), `started_at`, `ended_at`, `paused_ms`, `value`, `intensity_json`, `final_xp` |
  | `points` | `id`, `session_id` FK, `lat`, `lng`, `accuracy`, `t` (epoch ms) |
- Incremental point writes give **crash recovery**: at most one `active` session exists at a time; on launch it's offered for resume/discard. `saved` sessions are the history list.

### Map
- **`expo-maps`** renders the map; the polyline is built from the session's `points`. The live screen reads points on a short interval (e.g. 1–2s) and re-renders the line + recenters the camera. The saved-track view fits the camera to the route's bounds.
- **`app.json`** gains: the `expo-location` config plugin (background location enabled, `NSLocation*`/`ACCESS_*` permission strings, iOS `UIBackgroundModes`), the `expo-maps` plugin, and a **Google Maps Android API key**. These are a documented manual prerequisite for the dev build.

### Derivation (pure, unit-tested)
- **`src/lib/track/geo.ts`** — pure functions, zero RN/Expo imports, jest-tested:
  - `haversineMeters(a, b)` — distance between two fixes.
  - `accumulateDistance(points, { minAccuracyM, minMoveM })` — sums haversine over **accuracy-filtered** fixes, ignoring sub-threshold jitter when stationary.
  - `summarize(session, points)` → `{ distanceM, movingMs }` (movingMs = elapsed − paused).
  - `derivePaceSpeed(activitySlug, distanceM, movingMs)` → the intensity payload:
    | Activity | `value` (unit) | `intensityInputs` |
    |---|---|---|
    | Running | distance → km | `{ pace_min_per_km }` |
    | Walking | distance → km | *(none)* |
    | Cycling | distance → km | `{ avg_speed_kmh }` |
    | Swimming | distance → m | `{ pace_per_100m_sec }` |
- **`src/lib/track/submit.ts`** — maps a session summary to the `api.createLog` body (`{ activitySlug, value, intensityInputs }`), clamping `value` into `[min_value, max_value]` from the activity definition. Also pure/tested.

---

## 4. Session lifecycle (end to end)

1. **Track tab** → pick activity → **Start tracking**.
2. Permissions granted → an `active` session is created; background updates start; the app pushes `track/active.tsx`.
3. The task appends fixes to `points`; the live screen polls the DB, redraws the polyline, and shows live distance/duration/pace.
4. **Pause/Resume** adjust `paused_ms`; **Stop** halts updates and routes to `track/review.tsx`.
5. **Review**: `geo.ts` derives `value` + intensity (editable, clamped). **Save & earn XP** → `submit.ts` → `api.createLog` → on success: store `value`/`intensity_json`/`final_xp`, flip session to `saved`, show the XP-breakdown card (reused from Wave 1's Log result), invalidate `["me"]`/`["logs"]`. **Discard** → delete the session + its points.
6. A **zero-distance** (or below a small floor) session blocks submit — no XP for an empty track; offer Discard.
7. Saved sessions appear in the **history list**; tapping one opens `track/[id].tsx`.

---

## 5. Error Handling

- **Permission denied (foreground or background):** no tracking; explainer + `Linking.openSettings()`; manual-log fallback. The Track tab reflects the disabled state.
- **Weak / lost GPS signal:** keep the last good fix; show a "weak signal" badge; resume accruing when fixes return (accuracy filter drops bad fixes rather than corrupting distance).
- **App killed mid-run:** the `active` session + its already-written points survive in SQLite; next launch offers **Resume / Discard**. (True background restart of the location task after a hard kill is OS-dependent and out of scope; the user can resume the screen and continue.)
- **Out-of-range derived value:** warn and clamp to the activity's `min`/`max` before submit (review screen shows the clamped value).
- **`POST /logs` failure:** the session stays `active` (unsaved); show inline error; allow retry from review. Nothing is lost.
- **Map / API-key failure:** stats (distance/duration/pace) still render; the map area shows a graceful fallback. Tracking is unaffected.

---

## 6. Testing & Verification

- **jest (pure, `apps/mobile`):**
  - `geo.ts` — haversine accuracy, `accumulateDistance` accuracy + min-move filtering (jitter while stationary contributes ~0), `summarize` paused-time subtraction, `derivePaceSpeed` per activity (incl. divide-by-zero/zero-distance guards).
  - `submit.ts` — session summary → `createLog` body per activity, including `value` clamping to `[min,max]` and the swimming meters/`pace_per_100m_sec` path.
- **Manual device checklist (flagged — required for GPS):** background GPS cannot be verified in Expo Go or a simulator. A **dev build on a physical device** is required to confirm: foreground+background permission grant, the Android foreground-service notification appears, fixes accrue with the screen locked, the live map polyline updates, Stop → review derives sane distance/pace, **Save** posts a log and the XP breakdown renders, and the track lands in history. iOS needs the location background mode; Android needs the Google Maps API key + background-location permission via the dev build.
- **Smoke (device):** Track → Running → walk a known short loop outside → Stop → review shows plausible km + pace → Save → XP card → row appears in Home's recent feed and in the Track history.

---

## 7. Future Seams (not built now)

- **Backend route persistence:** an encoded-polyline column on `activity_logs` (+ migration) to sync routes across devices, once a second consumer needs it.
- **Auto-pause, splits/laps, elevation, HR/sensors:** richer session analytics on top of the same `points` store.
- **Health/cloud import:** Apple Health / Google Fit / Health Connect readers and the Strava connector feed the same `POST /logs` (separate import spec).
- **Deep links:** notification taps routing to a specific saved track once those screens stabilize.
- **Timers wave:** the deferred web Wave 1 timer concept, native.
