# DoD 9 — Mobile Foundation (Wave 1) — Design

**Date:** 2026-06-28
**Status:** Approved (pre-implementation)
**Scope of this spec:** Wave 1 of the mobile build only — a focused Expo app foundation: auth against the existing API, a 3-tab core (Home / Log / Profile), and push notifications (the one backend addition). On-device **GPS self-measurement**, in-app **timers**, **cloud/health import**, **deep links**, and the remaining web screens (Friends / Goals / Events / Upgrade / Admin) are explicitly **deferred to later mobile waves**.

---

## 1. Context & Goal

LifeXP's backend (DoD 1–7) and web app (DoD 8, incl. PWA) are complete and merged to master. `apps/mobile` is an empty placeholder already included in the pnpm workspace globs. The user's broader goal is on-device self-measurement of activities (GPS for running/cycling, etc.), but DoD 9 spans several independent subsystems, so it is decomposed into waves. **This spec is Wave 1: the app foundation** — prove auth, the design language, the existing log pipeline, and push delivery on a real device. GPS lands in a later wave on top of this shell.

The mobile app is a **client of the existing API**. It introduces **no XP, level, perk, streak, or cap logic** — it calls `POST /logs` exactly as the web app does. The only backend additions are a device-token registry and a push-send path; neither touches the XP pipeline.

### Non-goals (Wave 1)
- GPS / route tracking (later mobile wave).
- In-app timers (deferred to mobile from the web Wave 1 spec; later wave).
- Cloud import (Strava) / health platforms (Apple Health, Google Fit / Health Connect) (later waves).
- Deep links / universal links (notification taps open the app to a sensible tab only).
- Friends / Goals / Events / Upgrade / Admin screens (later wave).
- Offline write queue (logging requires connectivity, same as web).

---

## 2. Decisions (locked)

| Question | Decision |
|---|---|
| First mobile wave | **Foundation only** — Expo app + auth + Home/Log/Profile + push. GPS is a later wave. |
| Screens | **Core 3-tab**: Home (dashboard), Log activity, Profile. |
| Push notifications | **Included** this wave: Expo push token registry + send on level-up / perk-choice. |
| Styling | **React Native StyleSheet + a shared `theme.ts`** (no NativeWind / component lib). Manual parity with the web HUD identity. |
| Navigation | **Expo Router** (file-based; built on React Navigation). |
| Token storage | **expo-secure-store** (access + refresh tokens). |
| Session | Auto-refresh on `401` via existing `POST /auth/refresh`; on failure → clear + Login. |
| Server state | **TanStack Query** (same pattern as web). |
| API client | Mobile-local `src/lib/api.ts` mirroring web; reuse `@lifexp/types`. No shared `api-client` package extraction this wave. |
| Push dispatch | Enqueued on the **existing BullMQ** infra **post-commit**, not inline in the request path. |

---

## 3. Architecture & Monorepo Wiring

- **`apps/mobile`** — Expo managed workflow, latest stable SDK, TypeScript strict (matches the repo-wide strict setting).
- **Metro / monorepo:** `metro.config.js` configured for pnpm workspaces — watch the workspace root, resolve hoisted/symlinked deps, and resolve `@lifexp/types` to its `src` (the package ships no dist build, same gotcha the web Vite config handles via alias).
- **Navigation tree (Expo Router):**
  - `app/_layout.tsx` — root: font loading + `AuthProvider` + `QueryClientProvider`; renders the auth stack or the tabs based on auth state.
  - `app/(auth)/login.tsx`, `app/(auth)/register.tsx` — unauthenticated stack.
  - `app/(tabs)/_layout.tsx` — `Tabs` with `index` (Home), `log`, `profile`.
- **Server state:** one `QueryClient`; query keys mirror web (`["me"]`, `["activities"]`, `["logs"]`, `["intensity", slug]`) so behavior is predictable.

### Styling system
- `src/theme.ts` — single source of truth: colors (`bg #0E1020`, `panel`, `line`, `ink`, `muted`, `xp #F5B445`, `arcane #6C5CE7`, `arcane2`, `danger`), spacing scale, radii, font-family names. Mirrors the web `@theme` tokens by hand.
- **Fonts:** `@expo-google-fonts/space-grotesk` (display), `@expo-google-fonts/inter` (body), `@expo-google-fonts/jetbrains-mono` (HUD/numerals), loaded via `expo-font` before the app renders.
- **Primitives** (`src/components/`): `Screen` (safe-area + bg), `Card` (panel surface), `XpBar`, `XpRing` (the signature hero level-ring, re-implemented with `react-native-svg`), `Button`, `Field`. Screens compose these so each screen file stays focused and small.

---

## 4. Auth & Session

- **Storage:** access + refresh tokens in **expo-secure-store** (keys `lifexp.token`, `lifexp.refresh`). Never AsyncStorage.
- **`AuthContext`** (mirrors web `lib/auth`): `{ user, login, register, logout, refresh, status }`. On boot it reads SecureStore, calls `GET /me`, and resolves authenticated/unauthenticated; the root layout renders the auth stack or tabs accordingly.
- **Request wrapper** (`src/lib/api.ts`): attaches `Authorization: Bearer <access>`. On `401`, it performs a **single** `POST /auth/refresh` with the stored refresh token, persists the rotated pair, and retries the original request **once**. Concurrent 401s share one in-flight refresh (a module-level promise) so the refresh route is hit at most once. On refresh failure → clear SecureStore → `AuthContext` flips to unauthenticated → Login.
- **No backend change** for auth — `/auth/register`, `/auth/login`, `/auth/refresh`, `/auth/logout` already exist and rotate refresh tokens.
- **Login/Register parity:** login by `identifier` (email or username) + password; register = username + email + password + confirm-password (client-side confirm match).

---

## 5. Push Notifications

### Mobile
- `expo-notifications`: after successful login, request permission; if granted, fetch the Expo push token (`getExpoPushTokenAsync`, needs the EAS `projectId`) and `POST /devices` to register it.
- Set a notification handler (foreground display) and a response listener: tapping a notification opens the app to a sensible tab (Home for level-ups). **Full deep-linking is out of scope.**
- On logout, `DELETE /devices` for the current token, then clear local notification state.

### Backend (new, minimal — no XP-pipeline change)
- **Table `device_tokens`** (Drizzle, `apps/api/src/db/schema.ts` + migration):
  | Column | Notes |
  |---|---|
  | `id` | UUID PK |
  | `user_id` | FK → users |
  | `expo_push_token` | text, **unique** |
  | `platform` | enum (`ios`, `android`) |
  | `created_at`, `last_seen_at` | timestamps |
- **Routes** (`apps/api/src/routes/devices.ts`, auth'd):
  - `POST /devices` `{ expoPushToken, platform }` → upsert on `expo_push_token` (re-bind to current user, bump `last_seen_at`).
  - `DELETE /devices` `{ expoPushToken }` → remove the row.
- **`pushService`** (`apps/api/src/services/pushService.ts`):
  - `buildLevelUpPush(event)` / `buildPerkChoicePush(choice)` — **pure** payload builders (`{ to, title, body, data }`); unit-tested.
  - `sendPush(messages)` — POSTs to the Expo Push API (`https://exp.host/--/api/v2/push/send`), chunked, tolerant of per-message errors; logs and drops `DeviceNotRegistered` tokens (deletes them).
- **Dispatch (post-commit, via BullMQ):** `logActivity` already returns `heroLevelUp / sectionLevelUp / activityLevelUp` and pending perk choices. After the log transaction commits, the route enqueues a `push` job (alongside the existing achievement job) carrying `{ userId, levelUps, perkChoices }`. A worker loads the user's `device_tokens`, builds payloads, and calls `sendPush`. **No external call in the request path; no change to the 19-step transaction.**

---

## 6. Screens (Core, 3 tabs)

| Screen | Elements | API |
|---|---|---|
| **Login / Register** | identifier+password / username+email+password+confirm; error states | `POST /auth/login`, `POST /auth/register` |
| **Home** | hero level-ring + hero XP bar, section "attribute" cards (per-section level/xp), streak summary, recent-logs feed | `GET /me`, `GET /logs` |
| **Log** | activity picker → value input (unit, min/max) → dynamic intensity inputs → submit → XP breakdown (base/intensity/perks/streak) + level-up badges | `GET /activities`, `GET /activities/:slug/intensity`, `POST /logs` |
| **Profile** | username, plan, notification permission toggle, sign out | `GET /me`, `GET /billing/me`, `DELETE /devices` |

Behavior matches the web equivalents (`apps/web/src/pages/*`); this is a native re-implementation of the same flows, not new product behavior.

---

## 7. Error Handling

- **Network / API errors:** typed `ApiError` (status + message) as on web; screens show inline error text; TanStack Query handles retry/stale.
- **Auth:** 401 → one silent refresh+retry; refresh failure → forced logout to Login.
- **Push permission denied:** app works fully; Profile reflects the off state and offers a path to OS settings. No registration attempted.
- **Push send failures:** per-token tolerant; `DeviceNotRegistered` tokens are pruned; a failed push never affects the log response (it already committed).
- **Font load failure:** fall back to system fonts; app still renders.

---

## 8. Testing & Verification

- **Unit (Vitest, `apps/api`):** `device_tokens` upsert semantics (re-bind, dedup on token); `pushService` payload builders (level-up / perk-choice shapes); `sendPush` chunking + `DeviceNotRegistered` pruning (Expo API mocked).
- **Mobile component tests** (if a RN test runner is set up): the `api.ts` refresh-on-401 wrapper (single in-flight refresh, one retry, logout on failure) against a mocked fetch — this is the riskiest client logic.
- **Manual device checklist (flagged — required for push):** push delivery cannot be verified in Expo Go on current SDKs. A **dev build on a physical device** is required to confirm: token registration, foreground notification, and a level-up push arriving after a log. iOS additionally needs APNs credentials via EAS; Android needs an FCM key. These credentials/build steps are a documented manual prerequisite, not automated.
- **Smoke:** auth → Home loads `GET /me` → Log a manual activity → XP breakdown renders → row appears in recent feed.

---

## 9. Future Seams (not built now)

- **GPS tracker wave:** a `Track` screen using `expo-location` (foreground + background) producing distance/duration/route, feeding the same `POST /logs`. Builds on this shell's auth + theme + api client unchanged.
- **Timers wave:** the web Wave 1 timer concept, native (wall-clock + persisted start), → `POST /logs`.
- **Import waves:** Apple Health / Google Fit / Health Connect on-device readers, and the Strava cloud connector (per the separate Wave 1 import spec), landing in the existing review-queue model.
- **Deep links:** `lifexp://events/:id`, `lifexp://goals/:id` once those screens exist; notification taps then route precisely.
- **Remaining screens:** Friends / Goals / Events / Upgrade / Admin parity.
- **Shared `api-client` package:** extract once a second consumer justifies refactoring web off localStorage.
