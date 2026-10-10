import { describe, expect, it } from "vitest";
import { classifyFiles } from "@/lib/matching";
import { strategyPlan } from "@/lib/planner";
import { zonedToUtc } from "@/lib/schedule";

const base = { postTimes: ["09:00", "13:00", "18:00"], reelTime: "19:00", taken: new Set<string>(), history: [] };
const posts = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `p${i}`, kind: "post" as const, bucket: null, sourceGroup: `s${i}`, hook: null, campaignFirst: false }));

describe("starting today", () => {
  it("uses only today's remaining slots, then continues tomorrow", () => {
    const r = strategyPlan(posts(3), { ...base, startDate: "2026-10-10", notBefore: zonedToUtc("2026-10-10", "12:26") });
    expect([...r.assignments.values()].sort()).toEqual([
      zonedToUtc("2026-10-10", "13:00").toISOString(),
      zonedToUtc("2026-10-10", "18:00").toISOString(),
      zonedToUtc("2026-10-11", "09:00").toISOString(),
    ]);
  });
  it("a tomorrow start is unaffected", () => {
    const r = strategyPlan(posts(3), { ...base, startDate: "2026-10-11", notBefore: zonedToUtc("2026-10-10", "12:26") });
    expect(r.assignments.get("p0")).toBe(zonedToUtc("2026-10-11", "09:00").toISOString());
    expect(r.assignments.size).toBe(3);
    expect([...r.assignments.values()].every((v) => v.startsWith("2026-10-11"))).toBe(true);
  });
});

describe("review artifacts", () => {
  it("excludes review sheets but keeps marketing files and covers", () => {
    const roles = classifyFiles([
      { path: "T/B16_Review.jpg", size: 1 },
      { path: "T/Reels_Review.jpg", size: 1 },
      { path: "T/collection_preview.jpg", size: 1 },
      { path: "T/customer_review_story.jpg", size: 1 },
      { path: "T/rens_01.jpg", size: 1 },
      { path: "T/reel_1.mp4", size: 1 },
      { path: "T/reel_1.jpg", size: 1 },
    ]);
    expect(roles.get("T/B16_Review.jpg")).toBe("excluded");
    expect(roles.get("T/Reels_Review.jpg")).toBe("excluded");
    expect(roles.get("T/collection_preview.jpg")).toBe("excluded");
    expect(roles.get("T/customer_review_story.jpg")).toBe("post");
    expect(roles.get("T/rens_01.jpg")).toBe("post");
    expect(roles.get("T/reel_1.jpg")).toBe("cover");
  });
});
