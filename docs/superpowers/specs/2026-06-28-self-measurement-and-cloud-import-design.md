# Self-Measurement & Cloud Import — Design

**Date:** 2026-06-28
**Status:** Approved (pre-implementation)
**Scope of this spec:** Wave 1 only — in-app **timers** (free) and provider-agnostic **cloud import** (Pro-gated), Strava as the reference connector. GPS tracking and on-device health-platform imports (Apple Health, Google Fit / Health Connect) are explicitly **deferred to the mobile build (DoD 9)**.

---

## 1. Context & Goal

LifeXP currently only gains activity data through manual logging on `POST /logs`. This spec adds two new **sources** of activity data that converge on that same pipeline without changing any XP, level, perk, streak, or daily-cap logic:

1. **Timers** — measure duration-based activities (meditation, focus, workout, …) in-app and pre-fill a normal log.
2. **Cloud import** — connect a third-party account (Strava first), pull completed activities, and let the user review them into real logs.

**Core architectural insight:** both features produce the same shape the log pipeline already accepts — `{ activitySlug, value, intensityInputs }` — so they are additive sources, not pipeline changes. The only pipeline modification is allowing a backdated `occurredAt`.

### Non-goals (Wave 1)
- GPS / route tracking (mobile, DoD 9).
- Apple Health / Google Fit / Health Connect (on-device, mobile, DoD 9).
- Webhook / real-time push sync (manual sync only).
- Background or scheduled polling (manual sync only).
- Garmin / Fitbit connectors (the framework supports them; only Strava is implemented now).

---

## 2. Decisions (locked)

| Question | Decision |
|---|---|
| What to build first | Timers (web+backend) + cloud import; defer GPS & health platforms to mobile |
| Provider strategy | Provider-agnostic connector framework; **Strava** is the reference implementation |
| Import → XP model | **Review queue**: imports land in a pending inbox; user accepts before XP is granted |
| Sync trigger | **Manual only** ("Sync now"); no webhook, no cron |
| Timer robustness | **Client-side, refresh-proof** (wall-clock from stored start timestamp + localStorage); no backend |
| First-sync window | Last **30 days** on first sync; thereafter since `last_synced_at` |
| Token storage | Server-side only, **encrypted at rest** (AES-256-GCM) |
| Backdating | Accepted imports log with the activity's real `occurred_at`, not "now" |
| Entitlements | **Timers free** for all; **cloud import gated behind a new `CLOUD_IMPORT` feature (Pro/Team)** |

---

## 3. Data Model

Two new tables (Drizzle schema in `apps/api/src/db/schema.ts` + migration).

### `provider_connections`
| Column | Notes |
|---|---|
| `id` | UUID PK |
| `user_id` | FK → users |
| `provider` | enum (`strava`; extensible) |
| `access_token` | **encrypted at rest** |
| `refresh_token` | **encrypted at rest** |
| `token_expires_at` | timestamp |
| `scopes` | text |
| `external_athlete_id` | provider's user id |
| `status` | enum (`active`, `needs_reauth`) |
| `connected_at`, `last_synced_at` | timestamps (`last_synced_at` nullable) |

Unique on `(user_id, provider)`.

### `imported_activities` (the review queue)
| Column | Notes |
|---|---|
| `id` | UUID PK |
| `user_id` | FK → users |
| `provider` | enum |
| `external_id` | provider activity id |
| `raw_payload` | JSONB — full provider payload preserved for re-mapping (mirrors `activity_logs.intensity_inputs` philosophy) |
| `occurred_at` | when the activity happened |
| `provider_type` | raw provider type string (e.g. `Run`) |
| `mapped_activity_slug` | nullable — null = unmapped, user must pick |
| `value` | proposed value in the LifeXP activity's unit |
| `intensity_inputs` | JSONB — proposed intensity inputs |
| `status` | enum (`pending`, `accepted`, `dismissed`) |
| `log_id` | FK → activity_logs, set once accepted |
| `created_at`, `updated_at` | timestamps |

**Dedup:** unique on `(provider, external_id)`. Re-sync upserts, never double-inserts.

---

## 4. Connector Framework

`apps/api/src/connectors/types.ts`:

```ts
interface TokenSet { accessToken: string; refreshToken: string; expiresAt: Date; scopes: string; athleteId: string; }

interface NormalizedActivity {
  externalId: string;
  occurredAt: Date;
  providerType: string;     // raw, e.g. "Run"
  distanceM?: number;
  durationS?: number;
  avgHr?: number;
  avgSpeedMps?: number;
  // …whatever the provider reliably gives
}

interface ActivityConnector {
  provider: string;
  getAuthUrl(state: string): string;
  exchangeCode(code: string): Promise<TokenSet>;
  refreshToken(refresh: string): Promise<TokenSet>;
  fetchActivities(conn: Connection, since: Date): Promise<unknown[]>;
  normalize(raw: unknown): NormalizedActivity;
}
```

- `StravaConnector` (`apps/api/src/connectors/strava.ts`) implements it against the Strava REST API. Client id/secret from env.
- A `FakeConnector` exists for deterministic tests.

### Mapping layer (separate from connectors)
`apps/api/src/connectors/mapping.ts` turns a `NormalizedActivity` → `{ activitySlug, value, intensityInputs }` using a **provider-type → LifeXP-slug** table:

- `Run` → `running`, `value = distanceM / 1000` (km), intensity inputs from pace/HR.
- `Ride` → `cycling`, `value = distanceM / 1000`.
- Duration-based mapped types → `value = durationS / 60` (minutes).
- Intensity inputs map to the target activity's `activity_intensity_configs` input keys (e.g. pace, avg HR) where the provider supplies them.
- **Unmapped** provider types → `mapped_activity_slug = null`, queued `pending`; user picks an activity manually or dismisses. Never silently dropped.

The mapping table starts as seeded config and is structured so it can become admin-editable later (consistent with DoD 7), but admin CRUD for it is **not** in Wave 1 scope.

---

## 5. Flows & Endpoints

All under an `integrations` + `imports` route group. Connect/sync routes carry `requireEntitlement(CLOUD_IMPORT)`.

### Connect (OAuth)
1. `GET /integrations/:provider/connect` → returns provider auth URL with a **signed, expiring `state`** (CSRF guard; encodes `user_id` + nonce).
2. Provider redirects to `GET /integrations/:provider/callback?code&state`.
3. Verify `state` → `exchangeCode` → encrypt + store tokens → redirect to the app Integrations page with success/failure.

### Sync (manual)
1. `POST /integrations/:provider/sync` → load connection; refresh token if expired; `fetchActivities(since = last_synced_at ?? now − 30d)`.
2. Each raw activity: `normalize` → map → **upsert** into `imported_activities` on `(provider, external_id)`. Set `last_synced_at = now`.
3. Returns `{ imported, pending }`. **Rate-limit aware:** on provider `429`, stop gracefully and report partial; never crash.

### Review → log
- `GET /imports?status=pending` → the queue.
- `POST /imports/:id/accept` → if `mapped_activity_slug` is null, require `activitySlug` in body. Calls the **existing `logActivity`** with the proposed `value` / `intensityInputs` / `occurredAt`. On success: `status=accepted`, set `log_id`. Real pipeline → caps, streaks, level-ups, perks all apply. **Idempotent:** already-accepted → no-op.
- `POST /imports/accept` (bulk) → accept all `pending` rows that have a non-null `mapped_activity_slug`.
- `POST /imports/:id/dismiss` → `status=dismissed`, never logs.

### Pipeline change (small, isolated)
`logActivity` gains an optional `occurredAt` param. When provided (imports), it is used for the log's date and for all date-keyed logic (daily cap bucket, streak day). When absent (manual logs, timers), behavior is unchanged ("now").

### Timers (frontend only)
- On the Log screen, duration-based activities show **Start / Pause / Stop**.
- Elapsed computed from a stored `startedAt` wall-clock timestamp (immune to tab-background throttling), persisted in `localStorage`; refresh resumes it. A global "timer running" banner appears across the app.
- **Stop** pre-fills the normal log form with measured minutes → user submits → existing `POST /logs`. No backend change.

---

## 6. UI Surfaces (web)

- **Integrations page** (`/integrations`) — provider list, Connect/Disconnect, last-synced time, "Sync now" with result toast. Pro-gated (locked state for free users, linking to Upgrade).
- **Import review inbox** (`/imports`) — pending cards: activity type, date, proposed LifeXP activity + XP preview, Accept / pick-activity / Dismiss; "Accept all mapped" bulk action. Nav badge shows pending count.
- **Timer** — inline on the existing Log screen + global running banner (free, all users).
- **Disconnect** — removes connection + tokens; already-accepted logs remain (they are real logs); pending imports for that provider are cleared.

---

## 7. Security

- Tokens encrypted at rest with **AES-256-GCM**, key from env `INTEGRATION_ENC_KEY`; decrypted only in-memory during sync. Never sent to the client.
- OAuth `state` is signed and expiring.
- `external_id` uniqueness prevents replay / double-log; accept is idempotent.
- Strava `STRAVA_CLIENT_ID` / `STRAVA_CLIENT_SECRET` from env; documented in `.env.example`.

---

## 8. Error Handling

- Token refresh failure → set connection `status=needs_reauth`; surface a "Reconnect" prompt; sync returns a clear error.
- Provider 4xx/5xx → partial sync, report what succeeded, never a hard crash.
- Mapping miss → queued as unmapped (`pending`, null slug); never silently dropped.
- Accept on an unmapped row without `activitySlug` → 400 with a clear message.

---

## 9. Testing

- **Vitest unit:** mapping layer (provider types → slugs, unit conversions, unmapped path); encryption helper (round-trip, tamper detection).
- **Connector:** `StravaConnector.normalize` against **recorded Strava fixtures** (no live API in tests).
- **Integration:** accept → `logActivity` → `activity_logs` row with correct **backdated `occurred_at`**, daily cap honored for the activity's date; idempotent re-accept; dedup upsert on re-sync.
- **Flow:** `FakeConnector` drives a deterministic connect → sync → review → accept path.

---

## 10. Entitlements

- New `Feature.CLOUD_IMPORT` in the entitlement enum; granted to Pro/Team.
- `requireEntitlement(CLOUD_IMPORT)` preHandler on all `/integrations/*` and `/imports/*` routes (sync + review are part of the paid feature; a denied call returns 403 + `upgrade_url`, consistent with existing behavior).
- Timers require no entitlement.

---

## 11. Future Seams (not built now)

- Add `FitbitConnector` / `GarminConnector` by implementing `ActivityConnector` + extending the mapping table — no pipeline or schema change.
- The `imported_activities` staging table can generalize into a canonical "measured activity" ingestion store that mobile GPS and timers also emit into (Approach C), if that proves valuable later.
- Admin CRUD for the provider-type → slug mapping table (consistent with DoD 7).
- Webhook/real-time sync and scheduled polling, if manual sync proves insufficient.
