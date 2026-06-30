import { ErrorText } from "@lifexp/web";

// Inline error in the game-master voice — direct about what happened and the
// fix, never apologetic.

export const NotEnoughCredits = () => (
  <div style={{ width: 360 }}>
    <ErrorText>Not enough credits to enter — top up to join.</ErrorText>
  </div>
);

export const BadLogin = () => (
  <div style={{ width: 360 }}>
    <ErrorText>That hero name or password didn't match. Try again.</ErrorText>
  </div>
);
