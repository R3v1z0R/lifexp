import type { ActivityConnector } from "./types";
import { StravaConnector } from "./strava";

const CONNECTORS: Record<string, () => ActivityConnector> = {
  strava: () => new StravaConnector(),
};

export function getConnector(provider: string): ActivityConnector {
  const make = CONNECTORS[provider];
  if (!make) throw new Error(`Unknown provider: ${provider}`);
  return make();
}
