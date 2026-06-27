import { SectionTitle, GhostButton, Badge } from "@lifexp/web";

// Instrument-label heading for a console section: a small-caps eyebrow with an
// optional right-aligned action.

export const QuestLog = () => (
  <div style={{ width: 460 }}>
    <SectionTitle>Quest log</SectionTitle>
  </div>
);

export const WithAction = () => (
  <div style={{ width: 460 }}>
    <SectionTitle action={<GhostButton>See all</GhostButton>}>Active goals</SectionTitle>
  </div>
);

export const WithBadge = () => (
  <div style={{ width: 460 }}>
    <SectionTitle action={<Badge tone="xp">+240 XP today</Badge>}>Attributes</SectionTitle>
  </div>
);
