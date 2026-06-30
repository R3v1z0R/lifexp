import { EmptyHint } from "@lifexp/web";

// Empty-state panel — an invitation to act, not a dead end.

export const NoQuests = () => (
  <div style={{ width: 420 }}>
    <EmptyHint>No quests yet — create one and rally your party.</EmptyHint>
  </div>
);

export const NoParty = () => (
  <div style={{ width: 420 }}>
    <EmptyHint>Your party is empty. Send a request to start a feed.</EmptyHint>
  </div>
);
