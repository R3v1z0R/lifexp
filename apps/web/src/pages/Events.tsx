import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../lib/auth";
import { api, ApiError, type Visibility } from "../lib/api";
import { AppBar } from "../components/AppBar";
import {
  Page,
  Panel,
  SectionTitle,
  EmptyHint,
  PrimaryButton,
  GhostButton,
  Select,
  TextInput,
  Labeled,
  Badge,
  ErrorText,
} from "../components/ui";

export function Events() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const queryClient = useQueryClient();
  const eventsQuery = useQuery({ queryKey: ["events"], queryFn: api.events });
  const activitiesQuery = useQuery({ queryKey: ["activities"], queryFn: api.activities });

  const [title, setTitle] = useState("");
  const [activitySlug, setActivitySlug] = useState("");
  const [startAt, setStartAt] = useState("");
  const [endAt, setEndAt] = useState("");
  const [entryCredits, setEntryCredits] = useState("0");
  const [visibility, setVisibility] = useState<Visibility>("friends");
  const [isPublic, setIsPublic] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [upgrade, setUpgrade] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const activities = activitiesQuery.data?.activities ?? [];
  const events = eventsQuery.data?.events ?? [];

  const create = useMutation({
    mutationFn: () =>
      api.createEvent({
        title,
        activitySlug,
        startAt: new Date(startAt).toISOString(),
        endAt: new Date(endAt).toISOString(),
        entryCredits: Number(entryCredits) || 0,
        visibility,
        isPublic,
      }),
    onSuccess: () => {
      setTitle("");
      setActivitySlug("");
      setStartAt("");
      setEndAt("");
      setEntryCredits("0");
      setError(null);
      setUpgrade(false);
      queryClient.invalidateQueries({ queryKey: ["events"] });
    },
    onError: (e) => {
      const is403 = e instanceof ApiError && e.status === 403;
      setUpgrade(is403 && !isPublic);
      setError(e instanceof ApiError ? e.message : "Could not create event");
    },
  });

  const join = useMutation({
    mutationFn: (id: string) => api.joinEvent(id),
    onSuccess: () => {
      setActionError(null);
      queryClient.invalidateQueries({ queryKey: ["events"] });
    },
    onError: (e) => setActionError(e instanceof ApiError ? e.message : "Could not join"),
  });

  const finish = useMutation({
    mutationFn: (id: string) => api.finishEvent(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["events"] }),
    onError: (e) => setActionError(e instanceof ApiError ? e.message : "Could not finish"),
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!title || !activitySlug || !startAt || !endAt) return;
    create.mutate();
  }

  return (
    <Page>
      <AppBar />

      <SectionTitle>Host an event</SectionTitle>
      <Panel className="p-5">
        <form onSubmit={onSubmit} className="grid gap-3 sm:grid-cols-2">
          <Labeled label="Title">
            <TextInput value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Weekend Sprint" required />
          </Labeled>
          <Labeled label="Activity">
            <Select value={activitySlug} onChange={(e) => setActivitySlug(e.target.value)} required>
              <option value="" disabled>
                Choose…
              </option>
              {activities.map((a) => (
                <option key={a.slug} value={a.slug}>
                  {a.name}
                </option>
              ))}
            </Select>
          </Labeled>
          <Labeled label="Starts">
            <TextInput type="datetime-local" value={startAt} onChange={(e) => setStartAt(e.target.value)} required />
          </Labeled>
          <Labeled label="Ends">
            <TextInput type="datetime-local" value={endAt} onChange={(e) => setEndAt(e.target.value)} required />
          </Labeled>
          <Labeled label="Entry credits">
            <TextInput type="number" min={0} value={entryCredits} onChange={(e) => setEntryCredits(e.target.value)} />
          </Labeled>
          <Labeled label="Visibility">
            <Select value={visibility} onChange={(e) => setVisibility(e.target.value as Visibility)}>
              <option value="friends">Friends</option>
              <option value="private">Private</option>
              <option value="public">Public</option>
            </Select>
          </Labeled>
          <div className="flex items-center justify-between gap-3 sm:col-span-2">
            {isAdmin ? (
              <label className="flex items-center gap-2 text-sm text-muted">
                <input type="checkbox" checked={isPublic} onChange={(e) => setIsPublic(e.target.checked)} />
                Public event (admin)
              </label>
            ) : (
              <span className="text-xs text-muted">Private/group events require Pro.</span>
            )}
            <PrimaryButton type="submit" disabled={create.isPending}>
              {create.isPending ? "…" : "Create event"}
            </PrimaryButton>
          </div>
        </form>

        {error && <div className="mt-3"><ErrorText>{error}</ErrorText></div>}
        {upgrade && (
          <p className="mt-2 text-sm text-muted">
            <Link to="/upgrade" className="font-medium text-xp hover:underline">
              Upgrade to Pro
            </Link>{" "}
            to host private events.
          </p>
        )}
      </Panel>

      <SectionTitle>Events</SectionTitle>
      {actionError && <div className="mb-3"><ErrorText>{actionError}</ErrorText></div>}
      {events.length === 0 ? (
        <EmptyHint>No events yet. Host one above to challenge your friends.</EmptyHint>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {events.map((ev) => {
            const mine = ev.creator_id === user?.id;
            const finished = ev.status === "completed";
            return (
              <Panel key={ev.id} className="flex flex-col gap-3 p-5">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-display text-lg font-bold text-ink">{ev.title}</p>
                    <p className="text-sm capitalize text-muted">{ev.activity_slug.replace(/_/g, " ")}</p>
                  </div>
                  <Badge tone={finished ? "muted" : "streak"}>{ev.status}</Badge>
                </div>
                <p className="text-xs text-muted">
                  {new Date(ev.start_at).toLocaleDateString()} → {new Date(ev.end_at).toLocaleDateString()}
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  {ev.is_public && <Badge tone="arcane">Public</Badge>}
                  <Badge tone={ev.entry_credits > 0 ? "xp" : "muted"}>
                    {ev.entry_credits > 0 ? `${ev.entry_credits} credits` : "Free entry"}
                  </Badge>
                  <div className="ml-auto flex gap-2">
                    {!finished && (
                      <GhostButton className="py-1.5" onClick={() => join.mutate(ev.id)} disabled={join.isPending}>
                        Join
                      </GhostButton>
                    )}
                    {mine && !finished && (
                      <PrimaryButton className="py-1.5" onClick={() => finish.mutate(ev.id)} disabled={finish.isPending}>
                        Finish
                      </PrimaryButton>
                    )}
                  </div>
                </div>
              </Panel>
            );
          })}
        </div>
      )}
    </Page>
  );
}
