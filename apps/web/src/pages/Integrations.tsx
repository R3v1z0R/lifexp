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
      setMsg(
        e instanceof ApiError && e.status === 403
          ? "Cloud import is a Pro feature."
          : "Could not start connect."
      ),
  });

  const sync = useMutation({
    mutationFn: (provider: string) => api.syncProvider(provider),
    onSuccess: (r) => {
      setMsg(`Synced — ${r.imported} fetched, ${r.pending} pending review.`);
      qc.invalidateQueries({ queryKey: ["imports"] });
      qc.invalidateQueries({ queryKey: ["integrations"] });
    },
    onError: (e) =>
      setMsg(
        e instanceof ApiError && e.status === 409
          ? "Please reconnect — authorization expired."
          : "Sync failed."
      ),
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
        <Link to="/imports" className="text-sm text-muted hover:text-ink">
          Review imports →
        </Link>
      </div>

      {msg && (
        <p className="mt-4 rounded-lg border border-line bg-panel px-3 py-2 text-sm text-muted">
          {msg}
        </p>
      )}

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
                      : `Last synced: ${
                          conn.last_synced_at
                            ? new Date(conn.last_synced_at).toLocaleString()
                            : "never"
                        }`}
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
