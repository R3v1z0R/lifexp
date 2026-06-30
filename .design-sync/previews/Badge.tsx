import { Badge } from "@lifexp/web";

// Small status pill. The `tone` prop is the variant axis — each tone maps to a
// reserved color: gold = earned XP, ember-green = streak, violet = arcane/perk.

export const Xp = () => <Badge tone="xp">+240 XP</Badge>;

export const Streak = () => <Badge tone="streak">12-day streak</Badge>;

export const Arcane = () => <Badge tone="arcane">Perk unlocked</Badge>;

export const Muted = () => <Badge tone="muted">Fitness</Badge>;
