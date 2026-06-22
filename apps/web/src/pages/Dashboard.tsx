import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { xpToNextLevel } from "@lifexp/xp-engine";
import { useAuth } from "../lib/auth";
import { api } from "../lib/api";
import { XpRing } from "../components/XpRing";
import { AppBar } from "../components/AppBar";

export function Dashboard() {
  const { user } = useAuth();

  const meQuery = useQuery({ queryKey: ["me"], queryFn: api.me });
  const logsQuery = useQuery({ queryKey: ["logs"], queryFn: api.logs });

  const hero = meQuery.data?.user ?? user!;
  const need = xpToNextLevel(hero.hero_level);
  const progress = need > 0 ? hero.hero_xp / need : 0;
  const sections = meQuery.data?.sections ?? [];
  const logs = logsQuery.data ?? [];

  return (
    <div className="mx-auto min-h-screen max-w-5xl px-5 pb-20">
      <AppBar username={hero.username} />

      {/* Hero banner — the character sheet header */}
      <section className="panel mt-6 flex flex-col items-center gap-7 p-6 sm:flex-row sm:items-center sm:gap-9 sm:p-8">
        <XpRing level={hero.hero_level} progress={progress} />

        <div className="flex-1">
          <p className="eyebrow">Hero</p>
          <h2 className="font-display text-3xl font-bold text-ink">{hero.username}</h2>
          <p className="mt-1 text-sm text-muted">
            <span className="hud text-xp">{hero.hero_xp.toLocaleString()}</span>
            <span className="text-muted"> / {need.toLocaleString()} XP to level {hero.hero_level + 1}</span>
          </p>

          <div className="mt-4 h-3 w-full overflow-hidden rounded-full border border-line bg-bg/60">
            <div className="xp-fill h-full rounded-full" style={{ width: `${Math.min(100, progress * 100)}%` }} />
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            <Pill label="Plan" value={hero.plan} />
            <Pill label="Credits" value={String(hero.credit_balance)} />
            <Link
              to="/log"
              className="ml-auto rounded-xl bg-xp px-5 py-2.5 font-display text-sm font-semibold text-bg transition hover:brightness-110"
            >
              + Log activity
            </Link>
          </div>
        </div>
      </section>

      {/* Section attribute scores */}
      <h3 className="eyebrow mt-9 mb-3">Attributes</h3>
      {sections.length === 0 ? (
        <EmptyHint>Log your first activity to start building your attributes.</EmptyHint>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {sections.map((s) => (
            <div key={s.section_slug} className="panel p-4">
              <p className="text-sm capitalize text-muted">{s.section_slug.replace(/_/g, " ")}</p>
              <p className="mt-1 font-display text-2xl font-bold text-ink">Lv {s.level}</p>
              <p className="hud mt-0.5 text-xs text-arcane2">{s.xp.toLocaleString()} XP</p>
            </div>
          ))}
        </div>
      )}

      {/* Quest log — recent activity */}
      <h3 className="eyebrow mt-9 mb-3">Quest log</h3>
      {logs.length === 0 ? (
        <EmptyHint>No entries yet. Your logged activities will appear here.</EmptyHint>
      ) : (
        <div className="panel divide-y divide-line">
          {logs.map((log) => (
            <div key={log.id} className="flex items-center gap-4 px-5 py-3.5">
              <div className="grid h-9 w-9 place-items-center rounded-lg border border-line bg-bg/50 text-xs capitalize text-muted">
                {log.activity_slug.slice(0, 2)}
              </div>
              <div className="flex-1">
                <p className="text-sm capitalize text-ink">{log.activity_slug.replace(/_/g, " ")}</p>
                <p className="text-xs text-muted">
                  {log.value} · {new Date(log.logged_at).toLocaleString()}
                </p>
              </div>
              <span className="hud text-sm font-bold text-xp">+{log.final_xp} XP</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Pill({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-bg/50 px-3 py-1.5 text-xs">
      <span className="eyebrow">{label}</span>
      <span className="font-medium capitalize text-ink">{value}</span>
    </span>
  );
}

function EmptyHint({ children }: { children: React.ReactNode }) {
  return (
    <div className="panel px-5 py-8 text-center text-sm text-muted">{children}</div>
  );
}
