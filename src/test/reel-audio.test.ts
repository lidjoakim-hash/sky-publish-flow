import { describe, it, expect } from "vitest";
import { audioLabel, effectiveAudioMode, needsInstagramFinish, publishFile } from "@/lib/reel-audio";

describe("reel audio modes", () => {
  it("defaults to Trending Clean", () => expect(effectiveAudioMode(null, null)).toBe("trending_clean"));
  it("item setting beats account default", () => expect(effectiveAudioMode("no_music", "trending")).toBe("no_music"));
  it("ignores unknown values", () => expect(effectiveAudioMode("bogus", "manual")).toBe("manual"));
  it("No Music sends the original even when a music render exists", () =>
    expect(publishFile({ storage_path: "o.mp4", rendered_path: "r.mp4" }, "no_music")).toBe("o.mp4"));
  it("Trending modes send the licensed render when present", () =>
    expect(publishFile({ storage_path: "o.mp4", rendered_path: "r.mp4" }, "trending_clean")).toBe("r.mp4"));
  it("Finish in Instagram holds only the Instagram Reel", () => {
    const a = { kind: "reel", finish_in_instagram: true };
    expect(needsInstagramFinish(a, "instagram")).toBe(true);
    expect(needsInstagramFinish(a, "facebook")).toBe(false);
    expect(needsInstagramFinish({ kind: "post", finish_in_instagram: true }, "instagram")).toBe(false);
  });
  it("label states the API limit for trending", () => expect(audioLabel("trending_clean", false)).toContain("Auto — Trending Clean"));
});
