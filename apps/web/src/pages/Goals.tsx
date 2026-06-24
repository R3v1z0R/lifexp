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

export function Goals() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const goalsQuery = useQuery({ queryKey: ["goals"], queryFn: api.goals });
  const activitiesQuery = useQuery({ queryKey: ["activities"], queryFn: api.activities });

  const [activitySlug, setActivitySlug] = useState("");
  const [target, setTarget] = useState("");
  const [visibility, setVisibility] = useState<Visibility>("friends");
  const [error, setError] = useState<string | null>(null);
  const [upgrade, setUpgrade] = useState(false);

  const activities = activitiesQuery.data?.activities ?? [];
  const goals = goalsQuery.data?.goals ?? [];

  const create = useMutation({
    mutationFn: () =>
      api.createGoal({ activitySlug, targetValue: Number(target), visibility }),
    onSuccess: () => {
      setActivitySlug("");
      setTarget("");
      setError(null);
      setUpgrade(false);
      queryClient.invalidateQueries({ queryKey: ["goals"] });
    },
    onError: (e) => {
      if (e instanceof ApiError && e.status === 403) {
        setUpgrade(true);
        setError(e.message);
      } else {
        setUpgrade(false);
        setError(e instanceof ApiError ? e.message : "Could not create goal");
      }
    },
  });

  const join = useMutation({
    mutationFn: (id: string) => api.joinGoal(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["goals"] }),
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!activitySlug || target === "") return;
    create.mutate();
  }

  return (
    <Page>
      <AppBar />

      <SectionTitle>New shared goal</SectionTitle>
      <Panel className="p-5">
        <form onSubmit={onSubmit} className="grid gap-3 sm:grid-cols-[2fr_1fr_1fr_auto] sm:items-end">
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
          <Labeled label="Target">
            <TextInput
              type="number"
              min={1}
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              placeholder="100"
              required
            />
          </Labeled>
          <Labeled label="Visibility">
            <Select value={visibility} onChange={(e) => setVisibility(e.target.value as Visibility)}>
              <option value="friends">Friends</option>
              <option value="public">Public</option>
              <option value="private">Private</option>
            </Select>
          </Labeled>
          <PrimaryButton type="submit" disabled={create.isPending}>
            {create.isPending ? "…" : "Create"}
          </PrimaryButton>
        </form>

        {error && <div className="mt-3"><ErrorText>{error}</ErrorText></div>}
        {upgrade && (
          <p className="mt-2 text-sm text-muted">
            Free heroes get one active goal.{" "}
            <Link to="/upgrade" className="font-medium text-xp hover:underline">
              Upgrade to Pro
            </Link>{" "}
            for unlimited goals.
          </p>
        )}
      </Panel>

      <SectionTitle>Active goals</SectionTitle>
      {goals.length === 0 ? (
        <EmptyHint>No shared goals yet. Create one above and invite friends to contribute.</EmptyHint>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {goals.map((g) => {
            const mine = g.creator_id === user?.id;
            return (
              <Panel key={g.id} className="flex flex-col gap-3 p-5">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-display text-lg font-bold capitalize text-ink">
                      {g.activity_slug.replace(/_/g, " ")}
                    </p>
                    <p className="hud text-sm text-xp">Target {g.target_value}</p>
                  </div>
                  <Badge tone={g.status === "active" ? "streak" : "muted"}>{g.status}</Badge>
                </div>
                <div className="flex items-center gap-2">
                  <Badge>{g.visibility}</Badge>
                  {mine && <Badge tone="arcane">Creator</Badge>}
                  {!mine && (
                    <GhostButton
                      className="ml-auto py-1.5"
                      onClick={() => join.mutate(g.id)}
                      disabled={join.isPending}
                    >
                      Join
                    </GhostButton>
                  )}
                </div>
              </Panel>
            );
          })}
        </div>
      )}
    </Page>
  );
}
