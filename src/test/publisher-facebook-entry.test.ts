import { beforeEach, describe, expect, it, vi } from "vitest";

const graphCalls: { method: string; path: string; params?: unknown }[] = [];
let graphResponse: Record<string, unknown> = {};

vi.mock("@/lib/meta.server", () => ({
  graph: vi.fn(async (_c: unknown, method: string, path: string, params?: unknown) => {
    graphCalls.push({ method, path, params });
    return graphResponse;
  }),
  MetaError: class MetaError extends Error {
    constructor(message: string, public kind: string) {
      super(message);
    }
  },
  readMetaCreds: vi.fn(),
  ruploadFromUrl: vi.fn(),
}));

import { stepFacebook } from "@/lib/publisher.server";

const creds = { pageId: "1336", host: "graph.facebook.com", accessToken: "x", igUserId: undefined } as never;

function fakeAdmin(assetKind = "post") {
  const updates: Record<string, unknown>[] = [];
  const admin = {
    from(table: string) {
      if (table === "assets") {
        return { select: () => ({ eq: () => ({ single: async () => ({ data: { kind: assetKind } }) }) }) };
      }
      return {
        update: (patch: Record<string, unknown>) => ({ eq: async () => (updates.push(patch), { error: null }) }),
      };
    },
  };
  return { admin: admin as never, updates };
}

const retryWithFeedId = {
  id: "pub1", user_id: "u1", asset_id: "a1", platform: "facebook",
  status: "retry", container_id: "photo123", remote_id: "feed456", attempts: 1,
} as const;

describe("stepFacebook entry dispatch — a saved feed id is never re-uploaded", () => {
  beforeEach(() => {
    graphCalls.length = 0;
    graphResponse = { id: "feed456", is_published: true, permalink_url: "https://facebook.com/post/1" };
  });

  it("Lidverk retry row with a saved feed id only confirms — no photo upload, no feed creation", async () => {
    const { admin, updates } = fakeAdmin();
    await stepFacebook(admin, creds, retryWithFeedId, "lidverk");
    expect(graphCalls).toEqual([{ method: "GET", path: "feed456", params: { fields: "permalink_url,is_published" } }]);
    expect(graphCalls.some((c) => c.method === "POST")).toBe(false);
    expect(updates.some((u) => u.status === "published" && u.permalink === "https://facebook.com/post/1")).toBe(true);
  });

  it("defers instead of publishing when is_published or permalink is missing", async () => {
    graphResponse = { id: "feed456", is_published: true };
    const { admin, updates } = fakeAdmin();
    await stepFacebook(admin, creds, retryWithFeedId, "lidverk");
    expect(updates.some((u) => u.status === "published")).toBe(false);
    expect(updates.some((u) => u.next_attempt_at)).toBe(true);
  });

  it("other brands with a saved id keep the legacy confirm path (remote_id present)", async () => {
    const { admin, updates } = fakeAdmin();
    const pub = { ...retryWithFeedId, status: "processing" } as never;
    await stepFacebook(admin, creds, pub, "skyline");
    expect(graphCalls.every((c) => c.method === "GET")).toBe(true);
    expect(updates.some((u) => u.status === "published")).toBe(true);
  });

  it("Reels are untouched: a reel with a remote id still uses the video confirm path", async () => {
    graphResponse = { status: { video_status: "ready", publishing_phase: { status: "complete" } }, permalink_url: "/reel/1" };
    const { admin, updates } = fakeAdmin("reel");
    const pub = { ...retryWithFeedId, status: "processing", container_id: "vid1" } as never;
    await stepFacebook(admin, creds, pub, "lidverk");
    expect(graphCalls).toEqual([{ method: "GET", path: "vid1", params: { fields: "status,permalink_url" } }]);
    expect(updates.some((u) => u.status === "published")).toBe(true);
  });
});
