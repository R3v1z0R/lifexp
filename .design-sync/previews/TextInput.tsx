import { TextInput } from "@lifexp/web";

// Form text field — dark fill, hairline border, gold focus ring.

export const Placeholder = () => (
  <div style={{ width: 320 }}>
    <TextInput placeholder="Sir Reginald Sweatsalot" style={{ width: "100%" }} />
  </div>
);

export const Filled = () => (
  <div style={{ width: 320 }}>
    <TextInput defaultValue="aria@lifexp.app" style={{ width: "100%" }} />
  </div>
);
