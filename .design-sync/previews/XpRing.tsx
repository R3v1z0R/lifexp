import { XpRing } from "@lifexp/web";

// The signature element — a gold XP-energy arc filling toward the next level
// around a large level numeral. Each cell sweeps the progress axis.

export const EarlyHero = () => <XpRing level={3} progress={0.18} />;

export const MidClimb = () => <XpRing level={12} progress={0.62} />;

export const NearLevelUp = () => <XpRing level={27} progress={0.94} />;
