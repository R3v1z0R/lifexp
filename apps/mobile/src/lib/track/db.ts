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
    "UPDATE sessions SET status = 'saved', value = ?, intensity_json = ?, final_xp = ?, ended_at = COALESCE(ended_at, ?) WHERE id = ?",
    value,
    intensityJson,
    finalXp,
    Date.now(),
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
