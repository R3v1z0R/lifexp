import * as SecureStore from "expo-secure-store";
import { api, tokenStore, ApiError } from "./api";

function jsonResponse(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

beforeEach(async () => {
  (SecureStore as any).__reset();
  await tokenStore.setTokens("access-old", "refresh-1");
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("request refresh-on-401", () => {
  it("refreshes once then retries the original request", async () => {
    const fetchMock = jest
      .fn()
      // 1) original call -> 401
      .mockResolvedValueOnce(jsonResponse(401, { error: "Unauthorized" }))
      // 2) refresh -> new access token only (API does not rotate the refresh token)
      .mockResolvedValueOnce(jsonResponse(200, { accessToken: "access-new" }))
      // 3) retry -> success
      .mockResolvedValueOnce(jsonResponse(200, { user: { id: "u1" } }));
    global.fetch = fetchMock as any;

    const res = await api.me();
    expect(res).toEqual({ user: { id: "u1" } });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(await tokenStore.getAccess()).toBe("access-new");
  });

  it("logs out (clears tokens) when refresh fails", async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(jsonResponse(401, { error: "Unauthorized" }))
      .mockResolvedValueOnce(jsonResponse(401, { error: "bad refresh" }));
    global.fetch = fetchMock as any;

    await expect(api.me()).rejects.toBeInstanceOf(ApiError);
    expect(await tokenStore.getAccess()).toBeNull();
    expect(await tokenStore.getRefresh()).toBeNull();
  });

  it("shares a single refresh across concurrent 401s", async () => {
    const fetchMock = jest.fn().mockImplementation(async (url: string) => {
      if (url.endsWith("/auth/refresh")) return jsonResponse(200, { accessToken: "access-new" });
      // Protected paths keep returning 401 here; both calls ultimately reject.
      // What we assert is that the shared in-flight refresh fires only ONCE.
      return jsonResponse(401, { error: "Unauthorized" });
    });
    global.fetch = fetchMock as any;

    // Two concurrent calls both get 401; they must only refresh once.
    await Promise.allSettled([api.me(), api.activities()]);
    const refreshCalls = fetchMock.mock.calls.filter((c: any[]) => String(c[0]).endsWith("/auth/refresh"));
    expect(refreshCalls.length).toBe(1);
  });

  it("logs out when the refresh request itself throws (network error)", async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(jsonResponse(401, { error: "Unauthorized" }))
      .mockRejectedValueOnce(new Error("network down"));
    global.fetch = fetchMock as any;

    await expect(api.me()).rejects.toBeInstanceOf(ApiError);
    expect(await tokenStore.getAccess()).toBeNull();
    expect(await tokenStore.getRefresh()).toBeNull();
  });
});
