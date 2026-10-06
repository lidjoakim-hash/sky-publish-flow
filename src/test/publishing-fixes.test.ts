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

import { slotJitterMinutes, jitteredSlot, zonedToUtc } from "@/lib/schedule";
import { planWithStrategy } from "@/lib/plan";
describe("posting time jitter (±5 min)", () => {
  it("stays within ±5 minutes and is never exactly on time", () => {
    for (let d = 1; d <= 60; d++) {
      const iso = new Date(Date.UTC(2026, 10, d, 8)).toISOString();
      const j = slotJitterMinutes(iso, "post", 5);
      expect(Math.abs(j)).toBeLessThanOrEqual(5);
      expect(j).not.toBe(0);
    }
  });
  it("varies from day to day", () => {
    const set = new Set(Array.from({ length: 30 }, (_, d) => slotJitterMinutes(new Date(Date.UTC(2026, 10, d + 1, 8)).toISOString(), "post", 5)));
    expect(set.size).toBeGreaterThan(4);
  });
  it("is the same every time for the same slot (server can recheck the preview)", () => {
    expect(jitteredSlot("2026-11-02", "09:00", "Europe/Oslo", "post", 5).toISOString()).toBe(jitteredSlot("2026-11-02", "09:00", "Europe/Oslo", "post", 5).toISOString());
  });
  it("max 0 means exact time", () => expect(jitteredSlot("2026-11-02", "09:00", "Europe/Oslo", "post", 0).toISOString()).toBe(zonedToUtc("2026-11-02", "09:00").toISOString()));
  it("the Calendar planner applies it", () => {
    const a = { id: "a", kind: "post", skipped: false, upload_state: "done", scheduled_at: null, brand_slug: "skyline", campaign_first: false, sort_index: 0, topics: [], hooks: [], bucket: null, review_status: "unreviewed", rel_path: "x/a.jpg", source_group: null };
    const r = planWithStrategy({ assets: [a] as never, pubs: [], startDate: "2026-11-02", postTimes: ["09:00"], reelTime: "19:00", timeZone: "Europe/Oslo", topicMixing: false, mode: "append", brand: "skyline", strategy: {} as never, now: new Date("2026-11-01T00:00:00Z") } as never);
    const diff = (new Date(r.assignments.get("a")!).getTime() - zonedToUtc("2026-11-02", "09:00").getTime()) / 60000;
    expect(Math.abs(diff)).toBeGreaterThan(0);
    expect(Math.abs(diff)).toBeLessThanOrEqual(5);
  });
});
