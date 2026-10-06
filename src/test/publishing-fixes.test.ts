import { describe, expect, it } from "vitest";
import { activationBlockers, isMissed, loudnessOk, missedAlertMessage, validateDailyTimes } from "@/lib/publishing-rules";
import { lockedAssetIds } from "@/lib/plan";

describe("daily times validation", () => {
  it("accepts 09:00, 13:00, 18:00 with Reel 19:00", () => expect(validateDailyTimes(["09:00", "13:00", "18:00"], "19:00:00")).toBeNull());
  it("rejects the broken {18:00,13:00,18:00}", () => expect(validateDailyTimes(["18:00", "13:00", "18:00"], "19:00")).not.toBeNull());
  it("rejects duplicates", () => expect(validateDailyTimes(["09:00", "09:00"], "19:00")).toMatch(/different/));
  it("rejects unsorted", () => expect(validateDailyTimes(["13:00", "09:00"], "19:00")).toMatch(/order/));
  it("rejects bad format", () => expect(validateDailyTimes(["9:00"], "19:00")).toMatch(/HH:MM/));
  it("rejects a post time equal to the Reel time", () => expect(validateDailyTimes(["09:00", "19:00"], "19:00")).toMatch(/Reel/));
});

describe("missed slots", () => {
  const now = new Date("2026-10-06T16:00:00Z");
  it("pending older than 3h is missed", () => expect(isMissed("2026-10-06T12:59:00Z", "pending", false, now)).toBe(true));
  it("pending within 3h is not missed", () => expect(isMissed("2026-10-06T13:01:00Z", "pending", false, now)).toBe(false));
  it("anything with a remote id is never missed", () => expect(isMissed("2026-10-01T00:00:00Z", "retry", true, now)).toBe(false));
  it("published/unknown are never missed", () => {
    expect(isMissed("2026-10-01T00:00:00Z", "published", false, now)).toBe(false);
    expect(isMissed("2026-10-01T00:00:00Z", "unknown", false, now)).toBe(false);
  });
  it("alert names file and Oslo time", () => expect(missedAlertMessage("a.mp4", "2026-10-06T07:00:00Z")).toMatch(/^Missed slot: a\.mp4 was not posted at .*09[:.]00/));
  it("missed items can be replanned; sending ones stay locked", () => {
    const l = lockedAssetIds([{ asset_id: "m", status: "missed" }, { asset_id: "s", status: "sending" }] as never);
    expect(l.has("m")).toBe(false);
    expect(l.has("s")).toBe(true);
  });
});

describe("activation", () => {
  const base = { approved: true, upload_state: "done", caption: "Hei", kind: "post", audio_state: "unchecked" };
  it("ignores unapproved items even if not ready", () => expect(activationBlockers([{ ...base, approved: false, caption: null }])).toHaveLength(0));
  it("blocks approved items without caption", () => expect(activationBlockers([{ ...base, caption: null }])).toHaveLength(1));
  it("blocks approved Reels without audible audio", () => expect(activationBlockers([{ ...base, kind: "reel", audio_state: "silent" }])).toHaveLength(1));
});

describe("render loudness", () => {
  it("-22.8 LUFS is too quiet", () => expect(loudnessOk(-22.8)).toBe(false));
  it("-14 LUFS is fine", () => expect(loudnessOk(-14)).toBe(true));
  it("unknown is not a failure", () => expect(loudnessOk(null)).toBe(true));
});
