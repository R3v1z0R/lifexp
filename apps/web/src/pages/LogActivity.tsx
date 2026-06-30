import { useMemo, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../lib/auth";
import { api, ApiError, type LogResponse } from "../lib/api";
import { AppBar } from "../components/AppBar";
import { useTimer, formatElapsed } from "../lib/useTimer";

export function LogActivity() {
  const { refresh } = useAuth();
  const queryClient = useQueryClient();

  const activitiesQuery = useQuery({ queryKey: ["activities"], queryFn: api.activities });
  const activities = activitiesQuery.data?.activities ?? [];

  const [slug, setSlug] = useState<string>("");
  const selected = useMemo(() => activities.find((a) => a.slug === slug), [activities, slug]);
  const [value, setValue] = useState<string>("");
  const [intensity, setIntensity] = useState<Record<string, string>>({});
  const [result, setResult] = useState<LogResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const timer = useTimer();
  const isDuration = selected?.unit === "minutes" || selected?.unit === "hours";

  const intensityQuery = useQuery({
    queryKey: ["intensity", slug],
    queryFn: () => api.intensity(slug),
    enabled: Boolean(slug),
  });
  const intensityConfigs = intensityQuery.data?.configs ?? [];

  const mutation = useMutation({
    mutationFn: () => {
      const inputs: Record<string, number> = {};
      for (const [k, v] of Object.entries(intensity)) {
        if (v !== "") inputs[k] = Number(v);
      }
      return api.createLog({
        activitySlug: slug,
        value: Number(value),
        intensityInputs: Object.keys(inputs).length ? inputs : undefined,
      });
    },
    onSuccess: async (res) => {
      setResult(res);
      setError(null);
      await refresh();
      queryClient.invalidateQueries({ queryKey: ["logs"] });
      queryClient.invalidateQueries({ queryKey: ["me"] });
    },
    onError: (err) => {
      setError(err instanceof ApiError ? err.message : "Could not log activity.");
    },
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!slug || value === "") return;
    setResult(null);
    mutation.mutate();
  }

  return (
    <div className="mx-auto min-h-screen max-w-2xl px-5 pb-20">
      <AppBar />

      <div className="mt-6 flex items-center gap-3">
        <Link to="/" className="text-sm text-muted transition hover:text-ink">
          ← Back
        </Link>
        <h1 className="font-display text-2xl font-bold text-ink">Log activity</h1>
      </div>

      <form onSubmit={onSubmit} className="panel mt-5 flex flex-col gap-5 p-6">
        <label className="flex flex-col gap-1.5">
          <span className="eyebrow">Activity</span>
          <select
            value={slug}
            onChange={(e) => {
              setSlug(e.target.value);
              setIntensity({});
              setResult(null);
            }}
            className="rounded-xl border border-line bg-bg/60 px-3.5 py-2.5 text-ink focus:border-xp"
            required
          >
            <option value="" disabled>
              Choose an activity…
            </option>
            {activities.map((a) => (
              <option key={a.slug} value={a.slug}>
                {a.name}
              </option>
            ))}
          </select>
        </label>

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
                  const minutes =
                    selected.unit === "hours" ? Math.max(1, Math.round(mins / 60)) : mins;
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

        {selected && (
          <label className="flex flex-col gap-1.5">
            <span className="eyebrow">
              Amount · {selected.unit}
            </span>
            <input
              type="number"
              value={value}
              min={selected.min_value}
              max={selected.max_value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={`${selected.min_value}–${selected.max_value}`}
              className="rounded-xl border border-line bg-bg/60 px-3.5 py-2.5 text-ink placeholder:text-muted focus:border-xp"
              required
            />
          </label>
        )}

        {intensityConfigs.length > 0 && (
          <div className="flex flex-col gap-3">
            <span className="eyebrow">Intensity (optional)</span>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {intensityConfigs.map((cfg) => (
                <label key={cfg.input_key} className="flex flex-col gap-1.5">
                  <span className="text-sm text-muted">{cfg.label}</span>
                  <input
                    type="number"
                    value={intensity[cfg.input_key] ?? ""}
                    onChange={(e) =>
                      setIntensity((prev) => ({ ...prev, [cfg.input_key]: e.target.value }))
                    }
                    className="rounded-xl border border-line bg-bg/60 px-3.5 py-2.5 text-ink focus:border-xp"
                  />
                </label>
              ))}
            </div>
          </div>
        )}

        {error && (
          <p className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={mutation.isPending || !slug || value === ""}
          className="rounded-xl bg-xp px-4 py-3 font-display text-sm font-semibold text-bg transition hover:brightness-110 disabled:opacity-60"
        >
          {mutation.isPending ? "Logging…" : "Log it"}
        </button>
      </form>

      {result && <XpResult result={result} />}
    </div>
  );
}

function XpResult({ result }: { result: LogResponse }) {
  const b = result.xpBreakdown;
  const levelUps = [
    result.heroLevelUp && { scope: "Hero", level: result.heroLevelUp.new_level },
    result.sectionLevelUp && { scope: "Section", level: result.sectionLevelUp.new_level },
    result.activityLevelUp && { scope: "Activity", level: result.activityLevelUp.new_level },
  ].filter(Boolean) as { scope: string; level: number }[];

  return (
    <div className="panel mt-5 p-6">
      <div className="flex items-baseline justify-between">
        <p className="eyebrow">XP earned</p>
        <span className="hud text-3xl font-bold text-xp">+{b.final_xp}</span>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Base" value={`${b.raw_xp}`} />
        <Stat label="Intensity" value={`×${b.intensity_multiplier.toFixed(2)}`} />
        <Stat label="Perks" value={`×${b.perk_multiplier.toFixed(2)}`} />
        <Stat label="Streak" value={`×${b.streak_multiplier.toFixed(2)}`} />
      </div>

      {levelUps.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {levelUps.map((l) => (
            <span
              key={l.scope}
              className="rounded-lg border border-arcane/50 bg-arcane/15 px-3 py-1.5 text-sm text-arcane2"
            >
              {l.scope} reached level {l.level} ✦
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-line bg-bg/40 px-3 py-2.5 text-center">
      <p className="eyebrow">{label}</p>
      <p className="hud mt-1 text-sm font-bold text-ink">{value}</p>
    </div>
  );
}
