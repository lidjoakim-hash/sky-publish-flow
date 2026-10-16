import { describe, expect, it } from "vitest";
import { buildFeedPostParams, buildPhotoUploadParams, facebookPostFormat, feedPostNextAction } from "@/lib/facebook-feed";

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
});
