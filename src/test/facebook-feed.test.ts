import { describe, expect, it } from "vitest";
import { buildFeedPostParams, buildPhotoUploadParams, facebookPostFormat, feedConfirmOutcome, feedCreateGuard, feedErrorOutcome, feedPostNextAction } from "@/lib/facebook-feed";

describe("per-brand Facebook post format", () => {
  it("Lidverk uses feed posts with an attached image", () => expect(facebookPostFormat("lidverk")).toBe("feed"));
  it("all other brands keep the existing direct-photo behavior", () => {
    for (const b of ["skyline", "tekstilrens", "norge", "unknown-brand"]) expect(facebookPostFormat(b)).toBe("photo");
  });
});

describe("payloads", () => {
  it("step 1 uploads the photo unpublished, with no caption", () => {
    const p = buildPhotoUploadParams("https://example.com/a.jpg");
    expect(p).toEqual({ url: "https://example.com/a.jpg", published: "false" });
    expect("message" in p).toBe(false);
  });
  it("step 2 creates a feed post with the full caption and the uploaded photo attached", () => {
    const p = buildFeedPostParams("photo123", "Hei verden");
    expect(p.message).toBe("Hei verden");
    expect(JSON.parse(p.attached_media)).toEqual([{ media_fbid: "photo123" }]);
  });
});

describe("state machine — no duplicate feed creation", () => {
  it("a new post uploads the photo first", () =>
    expect(feedPostNextAction({ status: "pending", container_id: null, remote_id: null })).toBe("upload_photo"));
  it("after the photo upload, the next step is creating the feed post", () =>
    expect(feedPostNextAction({ status: "processing", container_id: "photo123", remote_id: null })).toBe("create_feed"));
  it("once the feed post id is stored it is only ever confirmed, never created again", () =>
    expect(feedPostNextAction({ status: "processing", container_id: "photo123", remote_id: "feed456" })).toBe("confirm"));
  it("confirmation requires the real feed post id — the photo id alone is never treated as published", () => {
    const p = feedPostNextAction({ status: "processing", container_id: "photo123", remote_id: null });
    expect(p).not.toBe("confirm");
  });
  it("a saved feed post id wins even on a retry-status row — it is confirmed, never recreated", () =>
    expect(feedPostNextAction({ status: "retry", container_id: "photo123", remote_id: "feed456" })).toBe("confirm"));
  it("a saved feed post id on a pending row is confirmed, never re-uploaded", () =>
    expect(feedPostNextAction({ status: "pending", container_id: null, remote_id: "feed456" })).toBe("confirm"));
});

describe("feed-format error handling — ambiguous outcomes never auto-retry", () => {
  it("a transient 5xx after feed intent (persisted 'publishing') becomes unknown", () =>
    expect(feedErrorOutcome({ platform: "facebook", brand: "lidverk", persistedStatus: "publishing" })).toBe("unknown"));
  it("an auth failure after feed intent also becomes unknown, not retry", () =>
    expect(feedErrorOutcome({ platform: "facebook", brand: "lidverk", persistedStatus: "publishing" })).toBe("unknown"));
  it("Lidverk rows before feed intent keep normal handling", () => {
    for (const s of ["pending", "retry", "sending", "processing"])
      expect(feedErrorOutcome({ platform: "facebook", brand: "lidverk", persistedStatus: s })).toBeNull();
  });
  it("other brands are never affected, even in 'publishing'", () => {
    for (const b of ["skyline", "tekstilrens", "norge"])
      expect(feedErrorOutcome({ platform: "facebook", brand: b, persistedStatus: "publishing" })).toBeNull();
    expect(feedErrorOutcome({ platform: "instagram", brand: "lidverk", persistedStatus: "publishing" })).toBeNull();
  });
});

describe("feed confirmation — success only on explicit proof", () => {
  it("published requires is_published true AND a permalink", () =>
    expect(feedConfirmOutcome({ is_published: true, permalink_url: "https://facebook.com/post/1" })).toBe("published"));
  it("missing is_published defers instead of marking success", () =>
    expect(feedConfirmOutcome({ permalink_url: "https://facebook.com/post/1" })).toBe("defer"));
  it("missing permalink defers instead of marking success", () =>
    expect(feedConfirmOutcome({ is_published: true })).toBe("defer"));
  it("is_published false defers", () =>
    expect(feedConfirmOutcome({ is_published: false, permalink_url: "https://facebook.com/post/1" })).toBe("defer"));
});

describe("legacy rows — a published photo is never turned into a second feed post", () => {
  it("an already-published photo id refuses feed creation", () =>
    expect(feedCreateGuard({ is_published: true })).toBe("unknown"));
  it("an unpublished photo upload may proceed to feed creation", () => {
    expect(feedCreateGuard({ is_published: false })).toBe("proceed");
    expect(feedCreateGuard({})).toBe("proceed");
  });
});
