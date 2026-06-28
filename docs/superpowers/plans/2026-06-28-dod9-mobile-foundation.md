# DoD 9 — Mobile Foundation (Wave 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Expo mobile app foundation — auth against the existing API, a 3-tab core (Home / Log / Profile), and push notifications — as a pure client of the existing log pipeline, plus the one backend addition (a device-token registry + a fire-and-forget push-send path).

**Architecture:** `apps/mobile` is a new Expo (managed) app using Expo Router, React Native StyleSheet + a shared `theme.ts`, TanStack Query, and `expo-secure-store`. It calls the existing API (no XP/level/streak logic changes). Backend gains a `device_tokens` table, `POST/DELETE /devices` routes, a `pushService`, and a fire-and-forget `dispatchPush` call appended to the existing `POST /logs` route after the reply is sent.

**Tech Stack:** Expo SDK 52+ (managed), Expo Router, React Native, TypeScript (strict), TanStack Query, expo-secure-store, expo-notifications, react-native-svg, @expo-google-fonts/*; backend Fastify 5 + Drizzle + Vitest (newly added to `apps/api`); jest-expo for the one mobile logic test.

## Global Constraints

- **No XP-pipeline change.** The 19-step `logActivity` transaction is not modified. Mobile is a client of `POST /logs`; the only backend additions are the device-token registry and the post-response push dispatch.
- **TypeScript strict mode** everywhere (repo-wide setting; mobile `tsconfig` extends `expo/tsconfig.base` with `"strict": true`).
- **Design identity (mirror web tokens exactly):** bg `#0E1020`, panel `#15172B`, line `#262943`, ink `#E8E9F3`, muted `#9A9CB8`, xp `#F5B445`, arcane `#6C5CE7`, arcane2 `#A29BFE`, danger `#FF6B6B`. Fonts: Space Grotesk (display), Inter (body), JetBrains Mono (HUD numerals).
- **API base URL:** from `EXPO_PUBLIC_API_URL`, default `http://localhost:3000` (matches web's `VITE_API_URL` default).
- **Token storage:** access + refresh tokens in `expo-secure-store` only (keys `lifexp.token`, `lifexp.refresh`). Never AsyncStorage.
- **Commits:** omit any Claude `Co-Authored-By` trailer.
- **Push dispatch is fire-and-forget** from the route post-response, never awaited in the request path. Factored as a single `dispatchPush` function so it can later move behind BullMQ without touching the route.
- **Workspace naming:** the mobile package is `@lifexp/mobile` (consistent with `@lifexp/api`, `@lifexp/web`).

---

## File Structure

**Backend (`apps/api`)**
- `vitest.config.ts` — *new*, test runner config.
- `src/db/schema.ts` — *modify*, add `platformEnum` + `device_tokens` table.
- `src/services/pushService.ts` — *new*, payload builders + `sendPush` + `dispatchPush`.
- `src/services/pushService.test.ts` — *new*, unit tests for builders + `sendPush`.
- `src/routes/devices.ts` — *new*, `POST /devices`, `DELETE /devices`.
- `src/routes/logs.ts` — *modify*, append fire-and-forget `dispatchPush` after reply.
- `src/index.ts` — *modify*, register `deviceRoutes`.

**Mobile (`apps/mobile`) — created by scaffold, then:**
- `.npmrc` (repo root) — *new*, `node-linker=hoisted` for Expo+pnpm.
- `metro.config.js` — *modify*, monorepo watch + resolution.
- `app.json` — *modify*, name/slug/scheme + notifications plugin.
- `src/theme.ts` — *new*, color/spacing/font tokens.
- `src/lib/api.ts` — *new*, typed fetch client (SecureStore + refresh-on-401).
- `src/lib/api.test.ts` — *new*, refresh coordinator test (jest-expo).
- `src/lib/auth.tsx` — *new*, `AuthProvider` + `useAuth`.
- `src/lib/queryClient.ts` — *new*, single QueryClient.
- `src/components/` — *new*: `Screen.tsx`, `Card.tsx`, `Button.tsx`, `Field.tsx`, `XpBar.tsx`, `XpRing.tsx`.
- `src/lib/push.ts` — *new*, expo-notifications register/unregister helpers.
- `src/app/_layout.tsx` — *modify*, providers + auth gate.
- `src/app/(auth)/login.tsx`, `src/app/(auth)/register.tsx` — *new*.
- `src/app/(tabs)/_layout.tsx`, `src/app/(tabs)/index.tsx` (Home), `src/app/(tabs)/log.tsx`, `src/app/(tabs)/profile.tsx` — *new*.

> **Router root note (post-scaffold reality):** Expo SDK 56's template uses **`src/app/`** as the Expo Router root (not project-root `app/`). All route files live under `apps/mobile/src/app/...`, so relative imports into `src/lib`, `src/components`, `src/theme` use `../` (from `src/app/`) and `../../` (from `src/app/(auth|tabs)/`). The scaffold also left demo files (`src/app/index.tsx`, `src/app/explore.tsx`, demo components under `src/components/`, `src/constants/theme.ts`, `src/hooks/`); Tasks 7–8 overwrite `src/app/_layout.tsx` and add the real routes — delete leftover demo route/component files they replace.

---

## Phase A — Backend: device registry + push

### Task 1: Add Vitest to `apps/api` + push payload builders

**Files:**
- Create: `apps/api/vitest.config.ts`
- Create: `apps/api/src/services/pushService.ts`
- Test: `apps/api/src/services/pushService.test.ts`
- Modify: `apps/api/package.json` (devDeps + `test` script)

**Interfaces:**
- Produces:
  - `interface ExpoPushMessage { to: string; title: string; body: string; data?: Record<string, unknown>; }`
  - `buildLevelUpPush(token: string, levelUp: LevelUpEvent): ExpoPushMessage`
  - `buildPerkChoicePush(token: string, count: number): ExpoPushMessage`
  - (`LevelUpEvent` is imported from `@lifexp/types`: `{ scope: "activity"|"section"|"hero"; new_level: number; ... }`)

- [ ] **Step 1: Install Vitest**

Run from repo root:
```bash
pnpm --filter @lifexp/api add -D vitest@^2.1.0
```

- [ ] **Step 2: Add the test script**

In `apps/api/package.json`, add to `"scripts"`:
```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 3: Create `apps/api/vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
```

- [ ] **Step 4: Write the failing test** — `apps/api/src/services/pushService.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { buildLevelUpPush, buildPerkChoicePush } from "./pushService";
import type { LevelUpEvent } from "@lifexp/types";

const hero: LevelUpEvent = {
  scope: "hero",
  previous_level: 4,
  new_level: 5,
  remaining_xp: 12,
};

describe("buildLevelUpPush", () => {
  it("targets the token and names the scope + new level", () => {
    const msg = buildLevelUpPush("ExponentPushToken[abc]", hero);
    expect(msg.to).toBe("ExponentPushToken[abc]");
    expect(msg.title).toBe("Level up! ✦");
    expect(msg.body).toContain("Hero");
    expect(msg.body).toContain("5");
    expect(msg.data).toEqual({ kind: "level_up", scope: "hero", level: 5 });
  });
});

describe("buildPerkChoicePush", () => {
  it("pluralizes and carries a count", () => {
    expect(buildPerkChoicePush("ExponentPushToken[x]", 1).body).toContain("a perk");
    const many = buildPerkChoicePush("ExponentPushToken[x]", 3);
    expect(many.body).toContain("3");
    expect(many.data).toEqual({ kind: "perk_choice", count: 3 });
  });
});
```

- [ ] **Step 5: Run the test to verify it fails**

Run: `pnpm --filter @lifexp/api test`
Expected: FAIL — `buildLevelUpPush` / `buildPerkChoicePush` are not exported (module has no such members).

- [ ] **Step 6: Implement the builders** — create `apps/api/src/services/pushService.ts`

```ts
import type { LevelUpEvent } from "@lifexp/types";

export interface ExpoPushMessage {
  to: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

const SCOPE_LABEL: Record<LevelUpEvent["scope"], string> = {
  hero: "Hero",
  section: "Section",
  activity: "Activity",
};

export function buildLevelUpPush(token: string, levelUp: LevelUpEvent): ExpoPushMessage {
  const label = SCOPE_LABEL[levelUp.scope];
  return {
    to: token,
    title: "Level up! ✦",
    body: `Your ${label} reached level ${levelUp.new_level}.`,
    data: { kind: "level_up", scope: levelUp.scope, level: levelUp.new_level },
  };
}

export function buildPerkChoicePush(token: string, count: number): ExpoPushMessage {
  const body = count === 1 ? "You have a perk to choose." : `You have ${count} perks to choose.`;
  return {
    to: token,
    title: "Choose your perk",
    body,
    data: { kind: "perk_choice", count },
  };
}
```

- [ ] **Step 7: Run the test to verify it passes**

Run: `pnpm --filter @lifexp/api test`
Expected: PASS (both suites green).

- [ ] **Step 8: Commit**

```bash
git add apps/api/vitest.config.ts apps/api/package.json apps/api/src/services/pushService.ts apps/api/src/services/pushService.test.ts pnpm-lock.yaml
git commit -m "feat(api): add vitest + push payload builders"
```

---

### Task 2: `sendPush` — Expo Push API with chunking + invalid-token detection

**Files:**
- Modify: `apps/api/src/services/pushService.ts`
- Modify: `apps/api/src/services/pushService.test.ts`

**Interfaces:**
- Consumes: `ExpoPushMessage` (Task 1).
- Produces: `sendPush(messages: ExpoPushMessage[]): Promise<{ invalidTokens: string[] }>` — POSTs to the Expo Push API in chunks of 100; returns the set of `to` tokens whose ticket reported `DeviceNotRegistered`.

- [ ] **Step 1: Write the failing test** — append to `apps/api/src/services/pushService.test.ts`

```ts
import { describe, it, expect, vi, afterEach } from "vitest";
import { sendPush } from "./pushService";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("sendPush", () => {
  it("returns no invalid tokens when all tickets are ok", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: [{ status: "ok" }, { status: "ok" }] }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const res = await sendPush([
      { to: "ExponentPushToken[a]", title: "t", body: "b" },
      { to: "ExponentPushToken[b]", title: "t", body: "b" },
    ]);

    expect(res.invalidTokens).toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("collects tokens whose ticket is DeviceNotRegistered", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [
          { status: "ok" },
          { status: "error", details: { error: "DeviceNotRegistered" } },
        ],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const res = await sendPush([
      { to: "ExponentPushToken[ok]", title: "t", body: "b" },
      { to: "ExponentPushToken[dead]", title: "t", body: "b" },
    ]);

    expect(res.invalidTokens).toEqual(["ExponentPushToken[dead]"]);
  });

  it("chunks into batches of 100", async () => {
    const fetchMock = vi.fn().mockImplementation(async (_url, init: any) => {
      const body = JSON.parse(init.body);
      return { ok: true, json: async () => ({ data: body.map(() => ({ status: "ok" })) }) };
    });
    vi.stubGlobal("fetch", fetchMock);

    const messages = Array.from({ length: 250 }, (_, i) => ({
      to: `ExponentPushToken[${i}]`,
      title: "t",
      body: "b",
    }));
    await sendPush(messages);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("returns no invalid tokens and does not throw when given an empty list", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const res = await sendPush([]);
    expect(res.invalidTokens).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @lifexp/api test`
Expected: FAIL — `sendPush` is not exported.

- [ ] **Step 3: Implement `sendPush`** — append to `apps/api/src/services/pushService.ts`

```ts
const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const CHUNK_SIZE = 100;

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export async function sendPush(messages: ExpoPushMessage[]): Promise<{ invalidTokens: string[] }> {
  const invalidTokens: string[] = [];
  for (const batch of chunk(messages, CHUNK_SIZE)) {
    if (batch.length === 0) continue;
    let res: Response;
    try {
      res = await fetch(EXPO_PUSH_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(batch),
      });
    } catch {
      // Network failure: a push is best-effort and must never break the caller.
      continue;
    }
    if (!res.ok) continue;
    const json = (await res.json()) as { data?: Array<{ status: string; details?: { error?: string } }> };
    const tickets = json.data ?? [];
    tickets.forEach((ticket, i) => {
      if (ticket.status === "error" && ticket.details?.error === "DeviceNotRegistered") {
        invalidTokens.push(batch[i].to);
      }
    });
  }
  return { invalidTokens };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @lifexp/api test`
Expected: PASS (all `sendPush` cases green).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/services/pushService.ts apps/api/src/services/pushService.test.ts
git commit -m "feat(api): sendPush via Expo Push API with chunking + dead-token detection"
```

---

### Task 3: `device_tokens` schema + `POST/DELETE /devices` routes

**Files:**
- Modify: `apps/api/src/db/schema.ts`
- Create: `apps/api/src/routes/devices.ts`
- Modify: `apps/api/src/index.ts`

**Interfaces:**
- Produces:
  - table `device_tokens` `{ id, user_id, expo_push_token (unique), platform ("ios"|"android"), created_at, last_seen_at }`
  - `deviceRoutes(app: FastifyInstance)` registering `POST /devices` `{ expoPushToken, platform }` and `DELETE /devices` `{ expoPushToken }`, both behind `authenticate`.

- [ ] **Step 1: Add the enum + table** — in `apps/api/src/db/schema.ts`, add next to the other enums:

```ts
export const platformEnum = pgEnum("device_platform", ["ios", "android"]);
```

and add the table (place after `user_settings`):

```ts
export const device_tokens = pgTable(
  "device_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    user_id: uuid("user_id")
      .notNull()
      .references(() => users.id),
    expo_push_token: varchar("expo_push_token").notNull().unique(),
    platform: platformEnum("platform").notNull(),
    created_at: timestamp("created_at").defaultNow().notNull(),
    last_seen_at: timestamp("last_seen_at").defaultNow().notNull(),
  }
  // expo_push_token uniqueness comes from the column-level .unique() above;
  // no second unique index (a redundant one creates two indexes on db:push).
);
```

- [ ] **Step 2: Push the schema to the dev DB**

Run: `pnpm --filter @lifexp/api db:push`
Expected: drizzle-kit reports the new `device_tokens` table + `device_platform` enum created (answer "Yes" to apply if prompted).

- [ ] **Step 3: Create the routes** — `apps/api/src/routes/devices.ts`

```ts
import { FastifyInstance, FastifyRequest } from "fastify";
import { authenticate } from "../middleware/auth";
import { db } from "../db";
import { device_tokens } from "../db/schema";
import { eq } from "drizzle-orm";

interface RegisterBody {
  expoPushToken: string;
  platform: "ios" | "android";
}
interface UnregisterBody {
  expoPushToken: string;
}

export async function deviceRoutes(app: FastifyInstance) {
  // POST /devices — register or re-bind a push token to the current user.
  app.post<{ Body: RegisterBody }>(
    "/devices",
    { preHandler: authenticate },
    async (request: FastifyRequest, reply) => {
      const user = request.user as { userId: string } | undefined;
      if (!user) return reply.status(401).send({ error: "Unauthorized" });

      const { expoPushToken, platform } = request.body as RegisterBody;
      if (!expoPushToken || (platform !== "ios" && platform !== "android")) {
        return reply.status(400).send({ error: "Missing or invalid expoPushToken/platform" });
      }

      await db
        .insert(device_tokens)
        .values({ user_id: user.userId, expo_push_token: expoPushToken, platform })
        .onConflictDoUpdate({
          target: device_tokens.expo_push_token,
          set: { user_id: user.userId, platform, last_seen_at: new Date() },
        });

      return reply.send({ ok: true });
    }
  );

  // DELETE /devices — drop a token (logout / disable).
  app.delete<{ Body: UnregisterBody }>(
    "/devices",
    { preHandler: authenticate },
    async (request: FastifyRequest, reply) => {
      const user = request.user as { userId: string } | undefined;
      if (!user) return reply.status(401).send({ error: "Unauthorized" });

      const { expoPushToken } = (request.body ?? {}) as UnregisterBody;
      if (!expoPushToken) return reply.status(400).send({ error: "Missing expoPushToken" });

      // Scope deletion to the caller's own token (drizzle `and`): a user must
      // not be able to remove another user's registration by guessing its token.
      await db
        .delete(device_tokens)
        .where(
          and(
            eq(device_tokens.expo_push_token, expoPushToken),
            eq(device_tokens.user_id, user.userId)
          )
        );
      return reply.send({ ok: true });
    }
  );
}
```

- [ ] **Step 4: Register the routes** — in `apps/api/src/index.ts`:

Add the import next to the other route imports:
```ts
import { deviceRoutes } from "./routes/devices";
```
Add the registration next to the others:
```ts
app.register(deviceRoutes);
```

- [ ] **Step 5: Verify manually (no DB test harness in this repo)**

Start the API (`cd apps/api && PORT=3000 pnpm dev`), obtain a JWT via login, then:
```bash
TOKEN=...   # access token from POST /auth/login
curl -s -X POST localhost:3000/devices -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"expoPushToken":"ExponentPushToken[test]","platform":"ios"}'
# Expected: {"ok":true}
# Re-run the same curl — still {"ok":true} and exactly ONE row in psql:
#   SELECT count(*) FROM device_tokens WHERE expo_push_token='ExponentPushToken[test]';  -> 1
curl -s -X DELETE localhost:3000/devices -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" -d '{"expoPushToken":"ExponentPushToken[test]"}'
# Expected: {"ok":true}; row count -> 0
```

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/db/schema.ts apps/api/src/routes/devices.ts apps/api/src/index.ts
git commit -m "feat(api): device_tokens table + /devices register/unregister routes"
```

---

### Task 4: `dispatchPush` + fire-and-forget wiring into `POST /logs`

**Files:**
- Modify: `apps/api/src/services/pushService.ts`
- Modify: `apps/api/src/routes/logs.ts`

**Interfaces:**
- Consumes: `buildLevelUpPush`, `buildPerkChoicePush`, `sendPush` (Tasks 1–2); `device_tokens` (Task 3); `LevelUpEvent` from `@lifexp/types`.
- Produces: `dispatchPush(input: { userId: string; levelUps: LevelUpEvent[]; perkChoiceCount: number }): Promise<void>` — loads the user's tokens, builds one level-up message (highest scope) and/or one perk-choice message per token, sends them, and prunes `DeviceNotRegistered` tokens. Never throws.

- [ ] **Step 1: Implement `dispatchPush`** — append to `apps/api/src/services/pushService.ts`

```ts
import { db } from "../db";
import { device_tokens } from "../db/schema";
import { eq, inArray } from "drizzle-orm";

const SCOPE_RANK: Record<LevelUpEvent["scope"], number> = { hero: 3, section: 2, activity: 1 };

export async function dispatchPush(input: {
  userId: string;
  levelUps: LevelUpEvent[];
  perkChoiceCount: number;
}): Promise<void> {
  try {
    const { userId, levelUps, perkChoiceCount } = input;
    if (levelUps.length === 0 && perkChoiceCount === 0) return;

    const rows = await db
      .select({ token: device_tokens.expo_push_token })
      .from(device_tokens)
      .where(eq(device_tokens.user_id, userId));
    if (rows.length === 0) return;

    const topLevelUp =
      levelUps.length > 0
        ? [...levelUps].sort((a, b) => SCOPE_RANK[b.scope] - SCOPE_RANK[a.scope])[0]
        : null;

    const messages = rows.flatMap(({ token }) => {
      const msgs = [];
      if (topLevelUp) msgs.push(buildLevelUpPush(token, topLevelUp));
      if (perkChoiceCount > 0) msgs.push(buildPerkChoicePush(token, perkChoiceCount));
      return msgs;
    });

    const { invalidTokens } = await sendPush(messages);
    if (invalidTokens.length > 0) {
      await db.delete(device_tokens).where(inArray(device_tokens.expo_push_token, invalidTokens));
    }
  } catch (err) {
    console.error("dispatchPush failed (non-fatal):", err);
  }
}
```

- [ ] **Step 2: Wire it into the logs route (fire-and-forget)** — in `apps/api/src/routes/logs.ts`

Add the import:
```ts
import { dispatchPush } from "../services/pushService";
import type { LevelUpEvent } from "@lifexp/types";
```

Replace the `reply.send(result);` line in the `POST /logs` handler with:
```ts
        reply.send(result);

        // Fire-and-forget: notify devices of level-ups / perk choices. Never awaited,
        // never blocks the response, never throws into the request lifecycle.
        const levelUps = [result.heroLevelUp, result.sectionLevelUp, result.activityLevelUp].filter(
          (l): l is LevelUpEvent => l != null
        );
        void dispatchPush({
          userId: user.userId,
          levelUps,
          perkChoiceCount: result.pendingPerkChoices?.length ?? 0,
        });
```

- [ ] **Step 3: Verify the API still compiles + boots**

Run: `pnpm --filter @lifexp/api build`
Expected: PASS (no TS errors).
Then `cd apps/api && PORT=3000 pnpm dev` boots without error; the existing push unit tests still pass: `pnpm --filter @lifexp/api test`.

- [ ] **Step 4: Manual end-to-end check (deferred device step noted)**

With a registered token row present, `POST /logs` for an activity that triggers a level-up returns the normal `LogResponse` immediately; server logs show no `dispatchPush failed`. (Actual delivery to a device is verified in Task 10's device checklist — Expo Go cannot receive these on current SDKs.)

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/services/pushService.ts apps/api/src/routes/logs.ts
git commit -m "feat(api): dispatch push on level-up/perk-choice (fire-and-forget) from POST /logs"
```

---

## Phase B — Mobile app foundation

### Task 5: Scaffold `apps/mobile` (Expo Router) + monorepo wiring + theme/fonts

**Files:**
- Create: `apps/mobile/*` (scaffold) — then `package.json` rename, `metro.config.js`, `app.json`, `src/theme.ts`, `.npmrc` (root)
- Modify: repo-root `.npmrc`

**Interfaces:**
- Produces: a bootable Expo app whose package is `@lifexp/mobile`; `src/theme.ts` exporting `colors`, `spacing`, `radii`, `fonts`.

- [ ] **Step 1: Scaffold the Expo app**

Run from repo root:
```bash
pnpm dlx create-expo-app@latest apps/mobile --template default
```
(The `default` template is the Expo Router tab starter. Delete its demo content as the tasks below replace it.)

- [ ] **Step 2: Make Expo work under pnpm** — create repo-root `.npmrc`:

```
node-linker=hoisted
```
Then reinstall from the repo root:
```bash
pnpm install
```
Expected: install completes; `apps/api` and `apps/web` still build (`pnpm --filter @lifexp/api build` and `pnpm --filter @lifexp/web build` both pass).

- [ ] **Step 3: Rename the package + add scripts** — set `apps/mobile/package.json` `"name"` to `@lifexp/mobile`; ensure scripts include:

```json
"scripts": {
  "start": "expo start",
  "android": "expo start --android",
  "ios": "expo start --ios",
  "test": "jest"
}
```

- [ ] **Step 4: Configure Metro for the monorepo** — `apps/mobile/metro.config.js`:

```js
const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);
config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules"),
];
config.resolver.disableHierarchicalLookup = true;

module.exports = config;
```

- [ ] **Step 5: Set app identity + scheme** — in `apps/mobile/app.json`, set `expo.name` = `"LifeXP"`, `expo.slug` = `"lifexp"`, `expo.scheme` = `"lifexp"`, and `expo.userInterfaceStyle` = `"dark"`.

- [ ] **Step 6: Install fonts + svg + secure-store + query**

Run:
```bash
cd apps/mobile && pnpm expo install expo-secure-store react-native-svg expo-notifications expo-constants \
  @expo-google-fonts/space-grotesk @expo-google-fonts/inter @expo-google-fonts/jetbrains-mono
pnpm add @tanstack/react-query@^5.59.0
```

- [ ] **Step 7: Create the theme** — `apps/mobile/src/theme.ts`:

```ts
export const colors = {
  bg: "#0E1020",
  panel: "#15172B",
  line: "#262943",
  ink: "#E8E9F3",
  muted: "#9A9CB8",
  xp: "#F5B445",
  arcane: "#6C5CE7",
  arcane2: "#A29BFE",
  danger: "#FF6B6B",
};

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };
export const radii = { sm: 8, md: 12, lg: 16, pill: 999 };

export const fonts = {
  display: "SpaceGrotesk_700Bold",
  body: "Inter_400Regular",
  bodyBold: "Inter_600SemiBold",
  hud: "JetBrainsMono_700Bold",
};
```

- [ ] **Step 8: Verify it boots**

Run: `cd apps/mobile && pnpm start`
Expected: Metro bundles with **no resolution errors**; the app opens in an emulator/Expo Go and renders the (unmodified) starter without red-screen. (Stop the server after confirming.)

- [ ] **Step 9: Commit**

```bash
git add .npmrc apps/mobile pnpm-lock.yaml
git commit -m "feat(mobile): scaffold Expo Router app + pnpm monorepo wiring + theme tokens"
```

---

### Task 6: API client — SecureStore tokens + refresh-on-401 (the riskiest logic, TDD)

**Files:**
- Create: `apps/mobile/src/lib/api.ts`
- Test: `apps/mobile/src/lib/api.test.ts`
- Create: `apps/mobile/jest.config.js`
- Modify: `apps/mobile/package.json` (jest devDeps)

**Interfaces:**
- Produces:
  - `tokenStore` `{ getAccess(), getRefresh(), setTokens(access, refresh), clear() }` (async, SecureStore-backed).
  - `request<T>(path: string, options?: RequestInit): Promise<T>` — attaches bearer; on a single `401`, runs **one** shared refresh and retries once; on refresh failure clears tokens and throws `ApiError(401)`.
  - `ApiError` (status + message); `api` object with `login`, `register`, `me`, `activities`, `intensity`, `logs`, `createLog`, `billingMe`, `registerDevice`, `unregisterDevice`.
- Consumes: `@lifexp/types` (`User`, `ActivityDefinition`, `ActivityIntensityConfig`, `XpBreakdown`, `LevelUpEvent`).

- [ ] **Step 1: Install jest-expo**

Run: `cd apps/mobile && pnpm add -D jest jest-expo @types/jest`

- [ ] **Step 2: Create `apps/mobile/jest.config.js`**

```js
module.exports = {
  preset: "jest-expo",
  setupFiles: ["<rootDir>/jest.setup.js"],
  testMatch: ["**/*.test.ts", "**/*.test.tsx"],
  // Guard for any future VALUE import of the shared package (current imports
  // are type-only and erased at runtime, but this keeps jest correct if that
  // changes). The package ships source only, so map to its src entry.
  moduleNameMapper: {
    "^@lifexp/types$": "<rootDir>/../../packages/types/src/index.ts",
  },
};
```

> Resolution note (already wired in Task 5's `metro.config.js` + `tsconfig.json`): `@lifexp/types` resolves to `packages/types/src` via a Metro `resolveRequest` alias and a `tsconfig` path. Do NOT add `@lifexp/types` to `apps/mobile/package.json` dependencies — a `workspace:*` symlink would let Metro resolve the package's broken `main` (`./dist`, which does not exist) before the alias. Imports stay `import type {...}` where possible.

- [ ] **Step 3: Create `apps/mobile/jest.setup.js`** (in-memory SecureStore mock)

```js
const store = {};
jest.mock("expo-secure-store", () => ({
  getItemAsync: jest.fn(async (k) => (k in store ? store[k] : null)),
  setItemAsync: jest.fn(async (k, v) => {
    store[k] = v;
  }),
  deleteItemAsync: jest.fn(async (k) => {
    delete store[k];
  }),
  __reset: () => {
    for (const k of Object.keys(store)) delete store[k];
  },
}));
```

- [ ] **Step 4: Write the failing test** — `apps/mobile/src/lib/api.test.ts`

```ts
import * as SecureStore from "expo-secure-store";
import { api, tokenStore, ApiError } from "./api";

function jsonResponse(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

beforeEach(async () => {
  (SecureStore as any).__reset();
  await tokenStore.setTokens("access-old", "refresh-1");
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("request refresh-on-401", () => {
  it("refreshes once then retries the original request", async () => {
    const fetchMock = jest
      .fn()
      // 1) original call -> 401
      .mockResolvedValueOnce(jsonResponse(401, { error: "Unauthorized" }))
      // 2) refresh -> new access token only (API does not rotate the refresh token)
      .mockResolvedValueOnce(jsonResponse(200, { accessToken: "access-new" }))
      // 3) retry -> success
      .mockResolvedValueOnce(jsonResponse(200, { user: { id: "u1" } }));
    global.fetch = fetchMock as any;

    const res = await api.me();
    expect(res).toEqual({ user: { id: "u1" } });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(await tokenStore.getAccess()).toBe("access-new");
  });

  it("logs out (clears tokens) when refresh fails", async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(jsonResponse(401, { error: "Unauthorized" }))
      .mockResolvedValueOnce(jsonResponse(401, { error: "bad refresh" }));
    global.fetch = fetchMock as any;

    await expect(api.me()).rejects.toBeInstanceOf(ApiError);
    expect(await tokenStore.getAccess()).toBeNull();
    expect(await tokenStore.getRefresh()).toBeNull();
  });

  it("shares a single refresh across concurrent 401s", async () => {
    const fetchMock = jest.fn().mockImplementation(async (url: string) => {
      if (url.endsWith("/auth/refresh")) return jsonResponse(200, { accessToken: "access-new" });
      // first time each protected call is hit it 401s, then succeeds with new token
      return jsonResponse(401, { error: "Unauthorized" });
    });
    global.fetch = fetchMock as any;

    // Two concurrent calls both get 401; they must only refresh once.
    await Promise.allSettled([api.me(), api.activities()]);
    const refreshCalls = fetchMock.mock.calls.filter((c: any[]) => String(c[0]).endsWith("/auth/refresh"));
    expect(refreshCalls.length).toBe(1);
  });
});
```

- [ ] **Step 5: Run the test to verify it fails**

Run: `cd apps/mobile && pnpm test`
Expected: FAIL — `./api` does not yet export `api` / `tokenStore` / `ApiError`.

- [ ] **Step 6: Implement the client** — `apps/mobile/src/lib/api.ts`

```ts
import * as SecureStore from "expo-secure-store";
import type {
  ActivityDefinition,
  ActivityIntensityConfig,
  LevelUpEvent,
  User,
  XpBreakdown,
} from "@lifexp/types";

const API_URL = process.env.EXPO_PUBLIC_API_URL || "http://localhost:3000";
const ACCESS_KEY = "lifexp.token";
const REFRESH_KEY = "lifexp.refresh";

export const tokenStore = {
  getAccess: () => SecureStore.getItemAsync(ACCESS_KEY),
  getRefresh: () => SecureStore.getItemAsync(REFRESH_KEY),
  async setTokens(access: string, refresh: string) {
    await SecureStore.setItemAsync(ACCESS_KEY, access);
    await SecureStore.setItemAsync(REFRESH_KEY, refresh);
  },
  async clear() {
    await SecureStore.deleteItemAsync(ACCESS_KEY);
    await SecureStore.deleteItemAsync(REFRESH_KEY);
  },
};

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

// Module-level in-flight refresh so concurrent 401s trigger exactly one refresh.
let refreshPromise: Promise<boolean> | null = null;

async function doRefresh(): Promise<boolean> {
  if (!refreshPromise) {
    refreshPromise = (async () => {
      try {
        const refreshToken = await tokenStore.getRefresh();
        if (!refreshToken) return false;
        const res = await fetch(`${API_URL}/auth/refresh`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ refreshToken }),
        });
        if (!res.ok) return false;
        const text = await res.text();
        const data = text ? JSON.parse(text) : null;
        if (!data?.accessToken) return false;
        // The API's /auth/refresh returns ONLY a new access token; the refresh
        // token is non-rotating, so we keep the existing one in storage.
        await tokenStore.setTokens(data.accessToken, refreshToken);
        return true;
      } catch {
        // Network/parse failure during refresh = failed refresh: request()
        // clears tokens and throws ApiError(401), never a raw throw.
        return false;
      }
    })().finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
}

async function rawFetch(path: string, options: RequestInit, access: string | null): Promise<Response> {
  return fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(access ? { Authorization: `Bearer ${access}` } : {}),
      ...(options.headers ?? {}),
    },
  });
}

export async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  let access = await tokenStore.getAccess();
  let res = await rawFetch(path, options, access);

  if (res.status === 401 && !path.endsWith("/auth/refresh")) {
    const ok = await doRefresh();
    if (!ok) {
      await tokenStore.clear();
      throw new ApiError(401, "Session expired");
    }
    access = await tokenStore.getAccess();
    res = await rawFetch(path, options, access);
  }

  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    throw new ApiError(res.status, data?.error ?? `Request failed (${res.status})`);
  }
  return data as T;
}

export interface AuthResult {
  accessToken: string;
  refreshToken: string;
  user: User;
}

export interface LogResponse {
  xpBreakdown: XpBreakdown;
  activityLevelUp: LevelUpEvent | null;
  sectionLevelUp: LevelUpEvent | null;
  heroLevelUp: LevelUpEvent | null;
}

export const api = {
  login: (body: { identifier: string; password: string }) =>
    request<AuthResult>("/auth/login", { method: "POST", body: JSON.stringify(body) }),
  register: (body: { username: string; email: string; password: string }) =>
    request<AuthResult>("/auth/register", { method: "POST", body: JSON.stringify(body) }),
  me: () => request<{ user: User; sections: unknown[] }>("/me"),
  activities: () => request<{ activities: ActivityDefinition[] }>("/activities"),
  intensity: (slug: string) =>
    request<{ configs: ActivityIntensityConfig[] }>(`/activities/${slug}/intensity`),
  logs: () => request<unknown[]>("/logs"),
  createLog: (body: {
    activitySlug: string;
    value: number;
    intensityInputs?: Record<string, number>;
  }) => request<LogResponse>("/logs", { method: "POST", body: JSON.stringify(body) }),
  billingMe: () => request<{ plan: string; credit_balance: number }>("/billing/me"),
  registerDevice: (body: { expoPushToken: string; platform: "ios" | "android" }) =>
    request<{ ok: boolean }>("/devices", { method: "POST", body: JSON.stringify(body) }),
  unregisterDevice: (expoPushToken: string) =>
    request<{ ok: boolean }>("/devices", {
      method: "DELETE",
      body: JSON.stringify({ expoPushToken }),
    }),
};
```

- [ ] **Step 7: Run the test to verify it passes**

Run: `cd apps/mobile && pnpm test`
Expected: PASS — all three refresh cases green.

- [ ] **Step 8: Commit**

```bash
git add apps/mobile/src/lib/api.ts apps/mobile/src/lib/api.test.ts apps/mobile/jest.config.js apps/mobile/jest.setup.js apps/mobile/package.json pnpm-lock.yaml
git commit -m "feat(mobile): API client with SecureStore tokens + single-flight refresh-on-401"
```

---

### Task 7: Auth context, routing gate, Login + Register screens

**Files:**
- Create: `apps/mobile/src/lib/auth.tsx`
- Create: `apps/mobile/src/lib/queryClient.ts`
- Modify: `apps/mobile/src/app/_layout.tsx`
- Create: `apps/mobile/src/app/(auth)/login.tsx`
- Create: `apps/mobile/src/app/(auth)/register.tsx`

**Interfaces:**
- Consumes: `api`, `tokenStore`, `ApiError` (Task 6); `colors/spacing/radii/fonts` (Task 5).
- Produces: `AuthProvider`, `useAuth()` → `{ user, status: "loading"|"authed"|"anon", login, register, logout, refreshMe }`.

- [ ] **Step 1: Create the QueryClient** — `apps/mobile/src/lib/queryClient.ts`

```ts
import { QueryClient } from "@tanstack/react-query";

export const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 30_000 } },
});
```

- [ ] **Step 2: Create the auth context** — `apps/mobile/src/lib/auth.tsx`

```tsx
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { api, tokenStore } from "./api";
import type { User } from "@lifexp/types";

type Status = "loading" | "authed" | "anon";

interface AuthValue {
  user: User | null;
  status: Status;
  login: (identifier: string, password: string) => Promise<void>;
  register: (username: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshMe: () => Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [status, setStatus] = useState<Status>("loading");

  async function loadMe() {
    try {
      const { user } = await api.me();
      setUser(user);
      setStatus("authed");
    } catch {
      setUser(null);
      setStatus("anon");
    }
  }

  useEffect(() => {
    (async () => {
      const access = await tokenStore.getAccess();
      if (!access) {
        setStatus("anon");
        return;
      }
      await loadMe();
    })();
  }, []);

  const value: AuthValue = {
    user,
    status,
    async login(identifier, password) {
      const res = await api.login({ identifier, password });
      await tokenStore.setTokens(res.accessToken, res.refreshToken);
      setUser(res.user);
      setStatus("authed");
    },
    async register(username, email, password) {
      const res = await api.register({ username, email, password });
      await tokenStore.setTokens(res.accessToken, res.refreshToken);
      setUser(res.user);
      setStatus("authed");
    },
    async logout() {
      await tokenStore.clear();
      setUser(null);
      setStatus("anon");
    },
    refreshMe: loadMe,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
```

- [ ] **Step 3: Wire providers + auth gate** — replace `apps/mobile/src/app/_layout.tsx`

```tsx
import { useEffect } from "react";
import { Stack, useRouter, useSegments } from "expo-router";
import { QueryClientProvider } from "@tanstack/react-query";
import { View, ActivityIndicator } from "react-native";
import {
  useFonts as useSpaceGrotesk,
  SpaceGrotesk_700Bold,
} from "@expo-google-fonts/space-grotesk";
import { Inter_400Regular, Inter_600SemiBold } from "@expo-google-fonts/inter";
import { JetBrainsMono_700Bold } from "@expo-google-fonts/jetbrains-mono";
import { AuthProvider, useAuth } from "../lib/auth";
import { queryClient } from "../lib/queryClient";
import { colors } from "../theme";

function Gate() {
  const { status } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (status === "loading") return;
    const inAuth = segments[0] === "(auth)";
    if (status === "anon" && !inAuth) router.replace("/(auth)/login");
    if (status === "authed" && inAuth) router.replace("/(tabs)");
  }, [status, segments]);

  if (status === "loading") {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, justifyContent: "center" }}>
        <ActivityIndicator color={colors.xp} />
      </View>
    );
  }
  return <Stack screenOptions={{ headerShown: false }} />;
}

export default function RootLayout() {
  const [fontsLoaded] = useSpaceGrotesk({
    SpaceGrotesk_700Bold,
    Inter_400Regular,
    Inter_600SemiBold,
    JetBrainsMono_700Bold,
  });
  if (!fontsLoaded) {
    return <View style={{ flex: 1, backgroundColor: colors.bg }} />;
  }
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <Gate />
      </AuthProvider>
    </QueryClientProvider>
  );
}
```

- [ ] **Step 4: Login screen** — `apps/mobile/src/app/(auth)/login.tsx`

```tsx
import { useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet } from "react-native";
import { Link } from "expo-router";
import { useAuth } from "../../lib/auth";
import { ApiError } from "../../lib/api";
import { colors, spacing, radii, fonts } from "../../theme";

export default function Login() {
  const { login } = useAuth();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit() {
    setBusy(true);
    setError(null);
    try {
      await login(identifier.trim(), password);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not sign in.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.screen}>
      <Text style={styles.brand}>
        Life<Text style={{ color: colors.xp }}>XP</Text>
      </Text>
      <TextInput
        style={styles.input}
        placeholder="Email or username"
        placeholderTextColor={colors.muted}
        autoCapitalize="none"
        value={identifier}
        onChangeText={setIdentifier}
      />
      <TextInput
        style={styles.input}
        placeholder="Password"
        placeholderTextColor={colors.muted}
        secureTextEntry
        value={password}
        onChangeText={setPassword}
      />
      {error && <Text style={styles.error}>{error}</Text>}
      <Pressable style={styles.button} onPress={onSubmit} disabled={busy}>
        <Text style={styles.buttonText}>{busy ? "Signing in…" : "Sign in"}</Text>
      </Pressable>
      <Link href="/(auth)/register" style={styles.link}>
        New here? Create an account
      </Link>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg, padding: spacing.xl, justifyContent: "center", gap: spacing.md },
  brand: { fontFamily: fonts.display, fontSize: 34, color: colors.ink, textAlign: "center", marginBottom: spacing.lg },
  input: { borderWidth: 1, borderColor: colors.line, backgroundColor: colors.panel, color: colors.ink, borderRadius: radii.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, fontFamily: fonts.body },
  button: { backgroundColor: colors.xp, borderRadius: radii.md, paddingVertical: spacing.lg, alignItems: "center", marginTop: spacing.sm },
  buttonText: { color: colors.bg, fontFamily: fonts.bodyBold, fontSize: 16 },
  link: { color: colors.arcane2, textAlign: "center", marginTop: spacing.md, fontFamily: fonts.body },
  error: { color: colors.danger, fontFamily: fonts.body },
});
```

- [ ] **Step 5: Register screen** — `apps/mobile/src/app/(auth)/register.tsx`

```tsx
import { useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet } from "react-native";
import { Link } from "expo-router";
import { useAuth } from "../../lib/auth";
import { ApiError } from "../../lib/api";
import { colors, spacing, radii, fonts } from "../../theme";

export default function Register() {
  const { register } = useAuth();
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit() {
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await register(username.trim(), email.trim(), password);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not register.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.screen}>
      <Text style={styles.brand}>Create your hero</Text>
      <TextInput style={styles.input} placeholder="Username" placeholderTextColor={colors.muted} autoCapitalize="none" value={username} onChangeText={setUsername} />
      <TextInput style={styles.input} placeholder="Email" placeholderTextColor={colors.muted} autoCapitalize="none" keyboardType="email-address" value={email} onChangeText={setEmail} />
      <TextInput style={styles.input} placeholder="Password" placeholderTextColor={colors.muted} secureTextEntry value={password} onChangeText={setPassword} />
      <TextInput style={styles.input} placeholder="Confirm password" placeholderTextColor={colors.muted} secureTextEntry value={confirm} onChangeText={setConfirm} />
      {error && <Text style={styles.error}>{error}</Text>}
      <Pressable style={styles.button} onPress={onSubmit} disabled={busy}>
        <Text style={styles.buttonText}>{busy ? "Creating…" : "Create account"}</Text>
      </Pressable>
      <Link href="/(auth)/login" style={styles.link}>
        Already have an account? Sign in
      </Link>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg, padding: spacing.xl, justifyContent: "center", gap: spacing.md },
  brand: { fontFamily: fonts.display, fontSize: 26, color: colors.ink, textAlign: "center", marginBottom: spacing.lg },
  input: { borderWidth: 1, borderColor: colors.line, backgroundColor: colors.panel, color: colors.ink, borderRadius: radii.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, fontFamily: fonts.body },
  button: { backgroundColor: colors.xp, borderRadius: radii.md, paddingVertical: spacing.lg, alignItems: "center", marginTop: spacing.sm },
  buttonText: { color: colors.bg, fontFamily: fonts.bodyBold, fontSize: 16 },
  link: { color: colors.arcane2, textAlign: "center", marginTop: spacing.md, fontFamily: fonts.body },
  error: { color: colors.danger, fontFamily: fonts.body },
});
```

- [ ] **Step 6: Verify auth flow against the running API**

Start the API (`cd apps/api && PORT=3000 pnpm dev`) and the app (`cd apps/mobile && EXPO_PUBLIC_API_URL=http://<your-LAN-ip>:3000 pnpm start`). On a device/emulator:
- Register a new user → lands on the (empty for now) tabs.
- Kill + reopen the app → stays signed in (SecureStore + `GET /me`).
- Sign out path is added in Task 10; for now verify register + persistence.

> Note: a device/emulator cannot reach `localhost` on your machine — use your LAN IP in `EXPO_PUBLIC_API_URL`.

- [ ] **Step 7: Commit**

```bash
git add apps/mobile/src/lib/auth.tsx apps/mobile/src/lib/queryClient.ts apps/mobile/src/app/_layout.tsx "apps/mobile/src/app/(auth)"
git commit -m "feat(mobile): auth context, routing gate, login + register screens"
```

---

### Task 8: Shared primitives + Home (dashboard) screen

**Files:**
- Create: `apps/mobile/src/components/Screen.tsx`, `Card.tsx`, `XpBar.tsx`, `XpRing.tsx`
- Create: `apps/mobile/src/app/(tabs)/_layout.tsx`
- Create: `apps/mobile/src/app/(tabs)/index.tsx`

**Interfaces:**
- Consumes: `api.me`, `api.logs` (Task 6); theme (Task 5).
- Produces: `Screen`, `Card`, `XpBar`, `XpRing` components; Tabs layout with `index/log/profile`.

- [ ] **Step 1: `Screen` wrapper** — `apps/mobile/src/components/Screen.tsx`

```tsx
import { ScrollView, View, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { ReactNode } from "react";
import { colors, spacing } from "../theme";

export function Screen({ children }: { children: ReactNode }) {
  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={{ gap: spacing.lg }}>{children}</View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.xl, paddingBottom: spacing.xxl },
});
```

- [ ] **Step 2: `Card`** — `apps/mobile/src/components/Card.tsx`

```tsx
import { View, StyleSheet } from "react-native";
import type { ReactNode } from "react";
import { colors, spacing, radii } from "../theme";

export function Card({ children }: { children: ReactNode }) {
  return <View style={styles.card}>{children}</View>;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.panel,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: radii.lg,
    padding: spacing.lg,
    gap: spacing.sm,
  },
});
```

- [ ] **Step 3: `XpBar`** — `apps/mobile/src/components/XpBar.tsx`

```tsx
import { View, StyleSheet } from "react-native";
import { colors, radii } from "../theme";

export function XpBar({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.min(100, Math.max(0, Math.round((value / max) * 100))) : 0;
  return (
    <View style={styles.track}>
      <View style={[styles.fill, { width: `${pct}%` }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  track: { height: 10, backgroundColor: colors.bg, borderRadius: radii.pill, overflow: "hidden", borderWidth: 1, borderColor: colors.line },
  fill: { height: "100%", backgroundColor: colors.xp, borderRadius: radii.pill },
});
```

- [ ] **Step 4: `XpRing`** (signature hero ring, react-native-svg) — `apps/mobile/src/components/XpRing.tsx`

```tsx
import { View, Text, StyleSheet } from "react-native";
import Svg, { Circle } from "react-native-svg";
import { colors, fonts } from "../theme";

export function XpRing({ level, pct }: { level: number; pct: number }) {
  const size = 120;
  const stroke = 10;
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const dash = (Math.min(100, Math.max(0, pct)) / 100) * circ;

  return (
    <View style={styles.wrap}>
      <Svg width={size} height={size}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={colors.line} strokeWidth={stroke} fill="none" />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={colors.xp}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circ}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      <View style={styles.center}>
        <Text style={styles.level}>{level}</Text>
        <Text style={styles.caption}>LEVEL</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: 120, height: 120, alignItems: "center", justifyContent: "center" },
  center: { position: "absolute", alignItems: "center" },
  level: { fontFamily: fonts.hud, fontSize: 32, color: colors.xp },
  caption: { fontFamily: fonts.body, fontSize: 10, color: colors.muted, letterSpacing: 2 },
});
```

- [ ] **Step 5: Tabs layout** — `apps/mobile/src/app/(tabs)/_layout.tsx`

```tsx
import { Tabs } from "expo-router";
import { colors } from "../../theme";

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: { backgroundColor: colors.panel, borderTopColor: colors.line },
        tabBarActiveTintColor: colors.xp,
        tabBarInactiveTintColor: colors.muted,
      }}
    >
      <Tabs.Screen name="index" options={{ title: "Home" }} />
      <Tabs.Screen name="log" options={{ title: "Log" }} />
      <Tabs.Screen name="profile" options={{ title: "Profile" }} />
    </Tabs>
  );
}
```

- [ ] **Step 6: Home screen** — `apps/mobile/src/app/(tabs)/index.tsx`

```tsx
import { Text, StyleSheet, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { Screen } from "../../components/Screen";
import { Card } from "../../components/Card";
import { XpRing } from "../../components/XpRing";
import { XpBar } from "../../components/XpBar";
import { colors, fonts, spacing } from "../../theme";

function xpToNext(level: number) {
  return Math.floor(50 * Math.pow(level, 1.6));
}

export default function Home() {
  const { user } = useAuth();
  const meQuery = useQuery({ queryKey: ["me"], queryFn: api.me });
  const logsQuery = useQuery({ queryKey: ["logs"], queryFn: api.logs });

  const hero = meQuery.data?.user ?? user;
  const level = hero?.hero_level ?? 1;
  const xp = hero?.hero_xp ?? 0;
  const next = xpToNext(level);

  return (
    <Screen>
      <Text style={styles.h1}>
        Life<Text style={{ color: colors.xp }}>XP</Text>
      </Text>

      <Card>
        <View style={styles.heroRow}>
          <XpRing level={level} pct={next > 0 ? (xp / next) * 100 : 0} />
          <View style={{ flex: 1, gap: spacing.sm }}>
            <Text style={styles.username}>{hero?.username ?? "Hero"}</Text>
            <Text style={styles.muted}>{xp} / {next} XP</Text>
            <XpBar value={xp} max={next} />
          </View>
        </View>
      </Card>

      <Text style={styles.h2}>Recent quests</Text>
      {(logsQuery.data ?? []).slice(0, 10).map((log: any) => (
        <Card key={log.id}>
          <Text style={styles.logTitle}>{log.activity_slug}</Text>
          <Text style={styles.muted}>
            {log.value} · +{log.final_xp} XP
          </Text>
        </Card>
      ))}
      {logsQuery.data && logsQuery.data.length === 0 && (
        <Text style={styles.muted}>No quests yet — log your first activity.</Text>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  h1: { fontFamily: fonts.display, fontSize: 28, color: colors.ink },
  h2: { fontFamily: fonts.display, fontSize: 18, color: colors.ink, marginTop: spacing.sm },
  heroRow: { flexDirection: "row", gap: spacing.lg, alignItems: "center" },
  username: { fontFamily: fonts.bodyBold, fontSize: 18, color: colors.ink },
  muted: { fontFamily: fonts.body, color: colors.muted },
  logTitle: { fontFamily: fonts.bodyBold, color: colors.ink, textTransform: "capitalize" },
});
```

- [ ] **Step 7: Install safe-area context (used by `Screen`)**

Run: `cd apps/mobile && pnpm expo install react-native-safe-area-context`

- [ ] **Step 8: Verify Home renders**

With API + app running and a logged-in user: Home shows the hero ring with the correct level, the XP bar, and any recent logs. No red-screen; fonts are applied (display title is Space Grotesk).

- [ ] **Step 9: Commit**

```bash
git add apps/mobile/src/components "apps/mobile/src/app/(tabs)/_layout.tsx" "apps/mobile/src/app/(tabs)/index.tsx" apps/mobile/package.json pnpm-lock.yaml
git commit -m "feat(mobile): UI primitives + Home dashboard (hero ring, XP bar, recent logs)"
```

---

### Task 9: Log activity screen

**Files:**
- Create: `apps/mobile/src/app/(tabs)/log.tsx`

**Interfaces:**
- Consumes: `api.activities`, `api.intensity`, `api.createLog` (Task 6); `useAuth().refreshMe`; theme + primitives.

- [ ] **Step 1: Build the Log screen** — `apps/mobile/src/app/(tabs)/log.tsx`

```tsx
import { useMemo, useState } from "react";
import { Text, TextInput, Pressable, StyleSheet, View } from "react-native";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, ApiError, type LogResponse } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { Screen } from "../../components/Screen";
import { Card } from "../../components/Card";
import { colors, fonts, spacing, radii } from "../../theme";

export default function Log() {
  const { refreshMe } = useAuth();
  const qc = useQueryClient();
  const activitiesQuery = useQuery({ queryKey: ["activities"], queryFn: api.activities });
  const activities = activitiesQuery.data?.activities ?? [];

  const [slug, setSlug] = useState("");
  const selected = useMemo(() => activities.find((a) => a.slug === slug), [activities, slug]);
  const [value, setValue] = useState("");
  const [intensity, setIntensity] = useState<Record<string, string>>({});
  const [result, setResult] = useState<LogResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const intensityQuery = useQuery({
    queryKey: ["intensity", slug],
    queryFn: () => api.intensity(slug),
    enabled: Boolean(slug),
  });
  const configs = intensityQuery.data?.configs ?? [];

  const mutation = useMutation({
    mutationFn: () => {
      const inputs: Record<string, number> = {};
      for (const [k, v] of Object.entries(intensity)) if (v !== "") inputs[k] = Number(v);
      return api.createLog({
        activitySlug: slug,
        value: Number(value),
        intensityInputs: Object.keys(inputs).length ? inputs : undefined,
      });
    },
    onSuccess: async (res) => {
      setResult(res);
      setError(null);
      await refreshMe();
      qc.invalidateQueries({ queryKey: ["logs"] });
      qc.invalidateQueries({ queryKey: ["me"] });
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : "Could not log activity."),
  });

  return (
    <Screen>
      <Text style={styles.h1}>Log activity</Text>

      <Card>
        <Text style={styles.label}>Activity</Text>
        <View style={styles.chips}>
          {activities.map((a) => (
            <Pressable
              key={a.slug}
              onPress={() => {
                setSlug(a.slug);
                setIntensity({});
                setResult(null);
              }}
              style={[styles.chip, slug === a.slug && styles.chipActive]}
            >
              <Text style={[styles.chipText, slug === a.slug && styles.chipTextActive]}>{a.name}</Text>
            </Pressable>
          ))}
        </View>

        {selected && (
          <>
            <Text style={styles.label}>Amount · {selected.unit}</Text>
            <TextInput
              style={styles.input}
              keyboardType="numeric"
              value={value}
              onChangeText={setValue}
              placeholder={`${selected.min_value}–${selected.max_value}`}
              placeholderTextColor={colors.muted}
            />
          </>
        )}

        {configs.length > 0 && (
          <>
            <Text style={styles.label}>Intensity (optional)</Text>
            {configs.map((cfg) => (
              <View key={cfg.input_key} style={{ gap: spacing.xs }}>
                <Text style={styles.muted}>{cfg.label}</Text>
                <TextInput
                  style={styles.input}
                  keyboardType="numeric"
                  value={intensity[cfg.input_key] ?? ""}
                  onChangeText={(t) => setIntensity((p) => ({ ...p, [cfg.input_key]: t }))}
                />
              </View>
            ))}
          </>
        )}

        {error && <Text style={styles.error}>{error}</Text>}

        <Pressable
          style={[styles.button, (!slug || value === "" || mutation.isPending) && styles.buttonDisabled]}
          disabled={!slug || value === "" || mutation.isPending}
          onPress={() => {
            setResult(null);
            mutation.mutate();
          }}
        >
          <Text style={styles.buttonText}>{mutation.isPending ? "Logging…" : "Log it"}</Text>
        </Pressable>
      </Card>

      {result && (
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
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  h1: { fontFamily: fonts.display, fontSize: 24, color: colors.ink },
  label: { fontFamily: fonts.body, fontSize: 11, color: colors.muted, letterSpacing: 1, textTransform: "uppercase", marginTop: spacing.sm },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  chip: { borderWidth: 1, borderColor: colors.line, borderRadius: radii.pill, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  chipActive: { backgroundColor: colors.arcane, borderColor: colors.arcane },
  chipText: { color: colors.muted, fontFamily: fonts.body },
  chipTextActive: { color: colors.ink, fontFamily: fonts.bodyBold },
  input: { borderWidth: 1, borderColor: colors.line, backgroundColor: colors.bg, color: colors.ink, borderRadius: radii.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, fontFamily: fonts.body },
  button: { backgroundColor: colors.xp, borderRadius: radii.md, paddingVertical: spacing.lg, alignItems: "center", marginTop: spacing.md },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: colors.bg, fontFamily: fonts.bodyBold, fontSize: 16 },
  muted: { fontFamily: fonts.body, color: colors.muted },
  error: { color: colors.danger, fontFamily: fonts.body, marginTop: spacing.sm },
  xpEarned: { fontFamily: fonts.hud, fontSize: 28, color: colors.xp },
  levelUp: { color: colors.arcane2, fontFamily: fonts.bodyBold, marginTop: spacing.sm },
});
```

- [ ] **Step 2: Verify the log flow end-to-end**

With API + app running and a logged-in user: pick an activity chip → enter a value → "Log it" → an XP card appears with `final_xp`; Home's recent quests + hero XP update (queries invalidated). A value outside the activity's range surfaces the API's 400 message inline.

- [ ] **Step 3: Commit**

```bash
git add "apps/mobile/src/app/(tabs)/log.tsx"
git commit -m "feat(mobile): log activity screen with intensity inputs + XP breakdown"
```

---

### Task 10: Profile screen + push registration

**Files:**
- Create: `apps/mobile/src/lib/push.ts`
- Create: `apps/mobile/src/app/(tabs)/profile.tsx`
- Modify: `apps/mobile/app.json` (notifications plugin + EAS projectId placeholder)

**Interfaces:**
- Consumes: `api.billingMe`, `api.registerDevice`, `api.unregisterDevice` (Task 6); `useAuth().logout`; theme + primitives.
- Produces: `registerForPush(): Promise<string | null>` and `getStoredPushToken(): string | null` in `src/lib/push.ts`.

- [ ] **Step 1: Push helper** — `apps/mobile/src/lib/push.ts`

```ts
import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import Constants from "expo-constants";
import { api } from "./api";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

let lastToken: string | null = null;
export function getStoredPushToken() {
  return lastToken;
}

// Returns the Expo push token if permission is granted and registration succeeds, else null.
export async function registerForPush(): Promise<string | null> {
  const settings = await Notifications.getPermissionsAsync();
  let granted = settings.granted;
  if (!granted) {
    const req = await Notifications.requestPermissionsAsync();
    granted = req.granted;
  }
  if (!granted) return null;

  const projectId =
    (Constants.expoConfig?.extra as any)?.eas?.projectId ??
    (Constants as any)?.easConfig?.projectId;
  if (!projectId) return null; // dev build with EAS projectId required

  const tokenResp = await Notifications.getExpoPushTokenAsync({ projectId });
  const token = tokenResp.data;
  lastToken = token;
  await api.registerDevice({
    expoPushToken: token,
    platform: Platform.OS === "ios" ? "ios" : "android",
  });
  return token;
}
```

- [ ] **Step 2: Profile screen** — `apps/mobile/src/app/(tabs)/profile.tsx`

```tsx
import { useEffect, useState } from "react";
import { Text, StyleSheet, Pressable, Switch, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { registerForPush, getStoredPushToken } from "../../lib/push";
import { Screen } from "../../components/Screen";
import { Card } from "../../components/Card";
import { colors, fonts, spacing, radii } from "../../theme";

export default function Profile() {
  const { user, logout } = useAuth();
  const billingQuery = useQuery({ queryKey: ["billing"], queryFn: api.billingMe });
  const [pushOn, setPushOn] = useState(false);

  // Try to register for push on first mount (no-op if already denied or no dev build).
  useEffect(() => {
    (async () => {
      const token = await registerForPush();
      setPushOn(Boolean(token));
    })();
  }, []);

  async function togglePush(next: boolean) {
    if (next) {
      const token = await registerForPush();
      setPushOn(Boolean(token));
    } else {
      const token = getStoredPushToken();
      if (token) {
        try {
          await api.unregisterDevice(token);
        } catch {
          /* best-effort */
        }
      }
      setPushOn(false);
    }
  }

  async function onSignOut() {
    const token = getStoredPushToken();
    if (token) {
      try {
        await api.unregisterDevice(token);
      } catch {
        /* best-effort */
      }
    }
    await logout();
  }

  return (
    <Screen>
      <Text style={styles.h1}>Profile</Text>
      <Card>
        <Text style={styles.username}>{user?.username}</Text>
        <Text style={styles.muted}>{user?.email}</Text>
        <Text style={styles.plan}>Plan: {billingQuery.data?.plan ?? "free"}</Text>
      </Card>

      <Card>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>Push notifications</Text>
          <Switch value={pushOn} onValueChange={togglePush} trackColor={{ true: colors.arcane }} />
        </View>
        <Text style={styles.muted}>Level-up and perk-choice alerts on this device.</Text>
      </Card>

      <Pressable style={styles.signOut} onPress={onSignOut}>
        <Text style={styles.signOutText}>Sign out</Text>
      </Pressable>
    </Screen>
  );
}

const styles = StyleSheet.create({
  h1: { fontFamily: fonts.display, fontSize: 24, color: colors.ink },
  username: { fontFamily: fonts.bodyBold, fontSize: 18, color: colors.ink },
  muted: { fontFamily: fonts.body, color: colors.muted },
  plan: { fontFamily: fonts.body, color: colors.xp, marginTop: spacing.sm },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  rowLabel: { fontFamily: fonts.bodyBold, color: colors.ink },
  signOut: { borderWidth: 1, borderColor: colors.line, borderRadius: radii.md, paddingVertical: spacing.lg, alignItems: "center" },
  signOutText: { fontFamily: fonts.bodyBold, color: colors.danger },
});
```

- [ ] **Step 3: Configure the notifications plugin** — in `apps/mobile/app.json`, add to `expo.plugins` (create the array if absent):

```json
["expo-notifications", { "color": "#F5B445" }]
```

Add (or confirm) the EAS project id seam under `expo.extra`:
```json
"extra": { "eas": { "projectId": "REPLACE_WITH_EAS_PROJECT_ID" } }
```

- [ ] **Step 4: Verify Profile (non-push parts) in Expo Go**

Profile shows username/email/plan; the push toggle renders. In Expo Go the push token is `null` (expected — no dev build/projectId), so the toggle stays off without error; sign out returns to Login.

- [ ] **Step 5: Device push checklist (manual — required for the push feature)**

This cannot be done in Expo Go on current SDKs. On a real device with a dev build:
1. `cd apps/mobile && pnpm dlx eas-cli@latest init` (creates the EAS project; paste its id into `app.json` → `expo.extra.eas.projectId`).
2. Configure credentials: iOS APNs key + Android FCM (`eas credentials`).
3. `eas build --profile development --platform android` (or ios), install on the device.
4. Launch, sign in, accept the push prompt → confirm a `device_tokens` row exists (`SELECT * FROM device_tokens;`).
5. From another session, log an activity that triggers a hero level-up for that user → a "Level up! ✦" push arrives on the device.

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/src/lib/push.ts "apps/mobile/src/app/(tabs)/profile.tsx" apps/mobile/app.json
git commit -m "feat(mobile): profile screen + expo push registration + sign out"
```

---

## Self-Review

**Spec coverage (each spec section → task):**
- §3 Stack & monorepo wiring → Task 5 (Expo Router, Metro monorepo, theme, fonts). ✓
- §3 Styling system (theme/fonts/primitives) → Task 5 (theme/fonts) + Task 8 (`Screen`/`Card`/`XpBar`/`XpRing`). ✓
- §4 Auth & session (SecureStore, refresh-on-401, AuthContext, login by identifier, register+confirm) → Task 6 (client + refresh) + Task 7 (context + screens). ✓
- §5 Push — mobile registration + tap handler → Task 10 (`push.ts`, notification handler). ✓
- §5 Push — backend `device_tokens` + `/devices` → Task 3. ✓
- §5 Push — `pushService` builders + `sendPush` → Tasks 1–2. ✓
- §5 Push — fire-and-forget dispatch post-response → Task 4. ✓
- §6 Screens (Login/Register, Home, Log, Profile) → Tasks 7, 8, 9, 10. ✓
- §7 Error handling (ApiError, 401→logout, push permission denied, font fallback) → Task 6 (ApiError/401), Task 10 (permission denied), Task 7 (`_layout` font fallback). ✓
- §8 Testing — push builders/sendPush unit + api refresh unit + manual device checklist → Tasks 1, 2, 6, 10. ✓
- §8 device_tokens upsert manual verification (no DB harness) → Task 3 Step 5. ✓

**Placeholder scan:** No "TBD/TODO/handle edge cases" — every code step has complete code. The single literal placeholder is `REPLACE_WITH_EAS_PROJECT_ID` in `app.json`, which is an intentional per-developer secret documented in Task 10 Step 5 (cannot be hardcoded).

**Type consistency:** `dispatchPush` input `{ userId, levelUps: LevelUpEvent[], perkChoiceCount }` matches the call site in Task 4 (logs route builds `levelUps` from the three nullable `*LevelUp` fields and `perkChoiceCount` from `pendingPerkChoices.length`). `buildLevelUpPush(token, levelUp)` / `buildPerkChoicePush(token, count)` signatures are identical in Tasks 1 (definition), 2 (n/a), and 4 (use). `tokenStore`/`request`/`api` shapes in Task 6 match their consumers in Tasks 7–10. `LogResponse.xpBreakdown` fields (`final_xp`, `raw_xp`, `intensity_multiplier`, `streak_multiplier`) match `XpBreakdown` from `@lifexp/types` used on web.

---

## Deviations from the spec (flag at handoff)
1. **Push dispatch is fire-and-forget from the route**, not BullMQ — the repo declares `bullmq` but runs no worker. Spec already updated to match (decisions table + §5). Factored as `dispatchPush` so it can move behind a queue later.
2. **`device_tokens` upsert + the full device push path are manually verified** (curl/psql + a dev-build device checklist), because the repo has no DB test harness and Expo Go can't receive push on current SDKs. The pure logic (payload builders, `sendPush` chunking/pruning, the api refresh coordinator) **is** covered by automated tests.
3. **`apps/api` gains Vitest** (it had no test runner); **`apps/mobile` uses jest-expo** for its one logic test.
4. **React 19 unification (supersedes the planned `.npmrc node-linker=hoisted`).** Expo SDK 56 requires React 19, but `apps/web` was React 18; in one pnpm workspace this broke web's `tsc` via duplicate `@types/react` (19 leaking into web's typecheck). The `node-linker=hoisted` idea made it worse (it forces a single shared `@types/react`, which can't satisfy web@18 + mobile@19). **Resolution (user-approved):** upgrade `apps/web` to React 19 (`react`/`react-dom`/`@types/*` @19, `react-router-dom` 6.30; `App.tsx` imports the `JSX` type from `react` since React 19 dropped the global `JSX` namespace). No `.npmrc`/linker override is used — **default isolated pnpm works**, with Metro keeping **hierarchical lookup ON** (do NOT set `disableHierarchicalLookup`) so it resolves deps in pnpm's `.pnpm` store. Verified headlessly: `apps/web` build, `apps/api` build, and `expo export` (mobile bundle) all pass. Device boot remains a deferred manual step.
