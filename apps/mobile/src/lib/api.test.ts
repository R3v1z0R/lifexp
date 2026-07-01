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

describe("imports + integrations endpoints", () => {
  it("imports() requests the review queue filtered by status", async () => {
    const fetchMock = jest.fn().mockResolvedValue(jsonResponse(200, { imports: [] }));
    global.fetch = fetchMock as any;

    await api.imports("pending");
    expect(fetchMock.mock.calls[0][0]).toBe("http://localhost:3000/imports?status=pending");
  });

  it("acceptImport() posts an empty body for an already-mapped row", async () => {
    const fetchMock = jest.fn().mockResolvedValue(jsonResponse(200, {}));
    global.fetch = fetchMock as any;

    await api.acceptImport("imp-1");
    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe("http://localhost:3000/imports/imp-1/accept");
    expect(opts.method).toBe("POST");
    expect(JSON.parse(opts.body)).toEqual({});
  });

  it("acceptImport() includes the chosen activitySlug for an unmapped row", async () => {
    const fetchMock = jest.fn().mockResolvedValue(jsonResponse(200, {}));
    global.fetch = fetchMock as any;

    await api.acceptImport("imp-2", "running");
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ activitySlug: "running" });
  });

  it("syncProvider() POSTs to the provider sync endpoint", async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValue(jsonResponse(200, { imported: 3, pending: 2 }));
    global.fetch = fetchMock as any;

    const res = await api.syncProvider("strava");
    expect(fetchMock.mock.calls[0][0]).toBe("http://localhost:3000/integrations/strava/sync");
    expect(fetchMock.mock.calls[0][1].method).toBe("POST");
    expect(res).toEqual({ imported: 3, pending: 2 });
  });

  it("disconnect() DELETEs the provider connection", async () => {
    const fetchMock = jest.fn().mockResolvedValue(jsonResponse(200, { disconnected: true }));
    global.fetch = fetchMock as any;

    await api.disconnect("strava");
    expect(fetchMock.mock.calls[0][0]).toBe("http://localhost:3000/integrations/strava");
    expect(fetchMock.mock.calls[0][1].method).toBe("DELETE");
  });
});
