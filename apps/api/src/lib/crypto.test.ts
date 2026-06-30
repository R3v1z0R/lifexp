import { describe, it, expect, beforeAll } from "vitest";
import { randomBytes } from "node:crypto";

beforeAll(() => {
  process.env.INTEGRATION_ENC_KEY = randomBytes(32).toString("hex");
});

import { encryptSecret, decryptSecret } from "./crypto";

describe("crypto", () => {
  it("round-trips a secret", () => {
    const secret = "strava-access-token-abc123";
    const blob = encryptSecret(secret);
    expect(blob).not.toContain(secret);
    expect(decryptSecret(blob)).toBe(secret);
  });

  it("produces a different ciphertext each call (random IV)", () => {
    expect(encryptSecret("same")).not.toBe(encryptSecret("same"));
  });

  it("throws when the ciphertext is tampered", () => {
    const blob = encryptSecret("token");
    const [iv, tag, cipher] = blob.split(":");
    const tampered = [iv, tag, Buffer.from("garbage").toString("base64")].join(":");
    expect(() => decryptSecret(tampered)).toThrow();
  });
});
