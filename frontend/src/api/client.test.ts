import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError, api, buildQuery } from "./client";

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

function jsonResponse(status: number, body: unknown, ok?: boolean) {
  return { ok: ok ?? (status >= 200 && status < 300), status, json: async () => body };
}

beforeEach(() => fetchMock.mockReset());
afterAll(() => vi.unstubAllGlobals());

describe("api request", () => {
  it("returns parsed JSON on a 200", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { id: 1 }));
    await expect(api.get<{ id: number }>("/api/x")).resolves.toEqual({ id: 1 });
  });

  it("returns undefined on a 204 without touching the body", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 204,
      json: async () => {
        throw new Error("204 body should not be read");
      },
    });
    await expect(api.del("/api/x/1")).resolves.toBeUndefined();
  });

  it("sets Content-Type application/json and merges caller headers", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, {}));
    await api.get("/api/x");
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/x",
      expect.objectContaining({ headers: expect.objectContaining({ "Content-Type": "application/json" }) }),
    );
  });

  it("stringifies a POST body", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(201, {}));
    await api.post("/api/x", { a: 1 });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/x",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ a: 1 }) }),
    );
  });

  it("sends no body when the POST body is undefined", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(201, {}));
    await api.post("/api/x");
    expect(fetchMock).toHaveBeenCalledWith("/api/x", expect.objectContaining({ method: "POST", body: undefined }));
  });
});

describe("api error handling", () => {
  it("throws ApiError using a string `detail` as the message", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(400, { detail: "bad input" }));
    await expect(api.get("/api/x")).rejects.toMatchObject({ status: 400, message: "bad input" });
  });

  it("stringifies a non-string `detail` (e.g. pydantic validation array)", async () => {
    const detail = [{ loc: ["body", "x"], msg: "field required" }];
    fetchMock.mockResolvedValueOnce(jsonResponse(422, { detail }));
    await expect(api.get("/api/x")).rejects.toMatchObject({ status: 422, message: JSON.stringify(detail) });
  });

  it("falls back to the default message when there is no `detail`", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(500, { error: "boom" }));
    await expect(api.get("/api/x")).rejects.toMatchObject({ status: 500, message: "API error 500" });
  });

  it("survives a non-JSON error body (json() rejects) with body null", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 502,
      json: async () => {
        throw new Error("not json");
      },
    });
    let caught: unknown;
    try {
      await api.get("/api/x");
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(ApiError);
    expect((caught as ApiError).status).toBe(502);
    expect((caught as ApiError).body).toBeNull();
  });
});

describe("ApiError", () => {
  it("defaults the message from the status", () => {
    expect(new ApiError(404, null).message).toBe("API error 404");
  });

  it("keeps status, body and an explicit message", () => {
    const err = new ApiError(409, { detail: "conflict" }, "conflict");
    expect(err.status).toBe(409);
    expect(err.body).toEqual({ detail: "conflict" });
    expect(err.message).toBe("conflict");
  });
});

describe("buildQuery", () => {
  it("returns an empty string for no params", () => {
    expect(buildQuery({})).toBe("");
  });

  it("skips undefined, null and empty-string values", () => {
    expect(buildQuery({ a: undefined, b: null, c: "" })).toBe("");
  });

  it("coerces numbers/booleans and builds the query string in insertion order", () => {
    expect(buildQuery({ status: "open", page: 2, active: true })).toBe("?status=open&page=2&active=true");
  });
});
