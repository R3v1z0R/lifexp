import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError, type SearchUser } from "../lib/api";
import { AppBar } from "../components/AppBar";
import {
  Page,
  Panel,
  SectionTitle,
  EmptyHint,
  PrimaryButton,
  GhostButton,
  TextInput,
  Badge,
  ErrorText,
} from "../components/ui";

export function Friends() {
  const queryClient = useQueryClient();
  const friends = useQuery({ queryKey: ["friends"], queryFn: api.friends });
  const requests = useQuery({ queryKey: ["friendRequests"], queryFn: api.friendRequests });
  const feed = useQuery({ queryKey: ["feed"], queryFn: api.feed });

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchUser[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<Set<string>>(new Set());

  const search = useMutation({
    mutationFn: () => api.searchUsers(query.trim()),
    onSuccess: (res) => setResults(res.users),
    onError: (e) => setError(e instanceof ApiError ? e.message : "Search failed"),
  });

  const sendRequest = useMutation({
    mutationFn: (id: string) => api.sendFriendRequest(id),
    onSuccess: (_res, id) => setSentTo((prev) => new Set(prev).add(id)),
    onError: (e) => setError(e instanceof ApiError ? e.message : "Could not send request"),
  });

  const accept = useMutation({
    mutationFn: (id: string) => api.acceptFriendRequest(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["friendRequests"] });
      queryClient.invalidateQueries({ queryKey: ["friends"] });
      queryClient.invalidateQueries({ queryKey: ["feed"] });
    },
  });

  const incoming = requests.data?.requests ?? [];
  const myFriends = friends.data?.friends ?? [];
  const feedItems = feed.data?.feed ?? [];

  return (
    <Page>
      <AppBar />

      {/* Find heroes */}
      <SectionTitle>Find heroes</SectionTitle>
      <Panel className="p-5">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            if (query.trim().length >= 2) search.mutate();
          }}
          className="flex gap-2"
        >
          <TextInput
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by username…"
            className="flex-1"
          />
          <PrimaryButton type="submit" disabled={query.trim().length < 2 || search.isPending}>
            {search.isPending ? "…" : "Search"}
          </PrimaryButton>
        </form>

        <ErrorText>{error}</ErrorText>

        {results && (
          <div className="mt-4 flex flex-col gap-2">
            {results.length === 0 && <p className="text-sm text-muted">No heroes match “{query}”.</p>}
            {results.map((u) => (
              <div key={u.id} className="flex items-center gap-3 rounded-xl border border-line bg-bg/40 px-4 py-2.5">
                <Avatar name={u.username} />
                <div className="flex-1">
                  <p className="text-sm text-ink">{u.username}</p>
                  <p className="hud text-xs text-muted">Lv {u.hero_level}</p>
                </div>
                <GhostButton
                  onClick={() => sendRequest.mutate(u.id)}
                  disabled={sentTo.has(u.id) || sendRequest.isPending}
                >
                  {sentTo.has(u.id) ? "Requested" : "Add"}
                </GhostButton>
              </div>
            ))}
          </div>
        )}
      </Panel>

      {/* Incoming requests */}
      {incoming.length > 0 && (
        <>
          <SectionTitle>Requests</SectionTitle>
          <Panel className="divide-y divide-line">
            {incoming.map((r) => (
              <div key={r.id} className="flex items-center gap-3 px-5 py-3.5">
                <Avatar name={r.username} />
                <div className="flex-1">
                  <p className="text-sm text-ink">{r.username}</p>
                  <p className="hud text-xs text-muted">Lv {r.hero_level}</p>
                </div>
                <PrimaryButton onClick={() => accept.mutate(r.id)} disabled={accept.isPending}>
                  Accept
                </PrimaryButton>
              </div>
            ))}
          </Panel>
        </>
      )}

      {/* Friends */}
      <SectionTitle>Your party ({myFriends.length})</SectionTitle>
      {myFriends.length === 0 ? (
        <EmptyHint>No friends yet. Search above to send a request.</EmptyHint>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {myFriends.map((f) => (
            <Panel key={f.id} className="flex items-center gap-3 p-4">
              <Avatar name={f.username} />
              <div>
                <p className="text-sm text-ink">{f.username}</p>
                <p className="hud text-xs text-arcane2">Lv {f.hero_level}</p>
              </div>
            </Panel>
          ))}
        </div>
      )}

      {/* Feed */}
      <SectionTitle>Friends feed</SectionTitle>
      {feedItems.length === 0 ? (
        <EmptyHint>When your friends log activities, they’ll show up here.</EmptyHint>
      ) : (
        <Panel className="divide-y divide-line">
          {feedItems.map((item) => (
            <div key={item.id} className="flex items-center gap-3 px-5 py-3">
              <Avatar name={item.username} />
              <div className="flex-1">
                <p className="text-sm text-ink">
                  <span className="font-medium">{item.username}</span>{" "}
                  <span className="text-muted">logged</span>{" "}
                  <span className="capitalize">{item.activity_slug.replace(/_/g, " ")}</span>
                </p>
                <p className="text-xs text-muted">{new Date(item.logged_at).toLocaleString()}</p>
              </div>
              <Badge tone="xp">+{item.final_xp} XP</Badge>
            </div>
          ))}
        </Panel>
      )}
    </Page>
  );
}

function Avatar({ name }: { name: string }) {
  return (
    <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-line bg-panel2 text-sm font-semibold uppercase text-arcane2">
      {name.slice(0, 1)}
    </div>
  );
}
