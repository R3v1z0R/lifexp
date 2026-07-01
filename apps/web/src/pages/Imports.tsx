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
        <p className="mt-6 text-sm text-muted">
          No pending imports. Sync a provider on Integrations.
        </p>
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
                  <option value="" disabled>
                    Pick activity…
                  </option>
                  {activities.map((a) => (
                    <option key={a.slug} value={a.slug}>
                      {a.name}
                    </option>
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
