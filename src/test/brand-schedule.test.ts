import { describe, it, expect } from "vitest";
import { planWithStrategy } from "@/lib/plan";
import { validateBrandTimes } from "@/lib/publishing-rules";
import { osloDateKey } from "@/lib/schedule";

const mk = (id: string, kind: string, brand: string) => ({ id, kind, brand_slug: brand, skipped: false, upload_state: "done", scheduled_at: null, campaign_first: false, sort_index: 0, review_status: "unreviewed", bucket: null, hooks: [], rel_path: id, source_group: id, topics: [] }) as never;

describe("per-business daily times", () => {
  it("Norge: 5 posts and 2 Reels on one day", () => {
    const assets = [...Array.from({ length: 5 }, (_, i) => mk(`p${i}`, "post", "norge")), mk("r0", "reel", "norge"), mk("r1", "reel", "norge")];
    const r = planWithStrategy({ assets, pubs: [], startDate: "2026-11-02", postTimes: ["09:00"], reelTime: "19:00", timeZone: "Europe/Oslo", topicMixing: false, mode: "append", brand: "norge",
      strategy: { cooldownDays: 0, schedule: { postTimes: ["08:00", "10:00", "12:00", "15:00", "18:00"], reelTimes: ["17:00", "20:00"] } }, now: new Date("2026-11-01T00:00:00Z") });
    expect(r.assignments.size).toBe(7);
    expect(new Set([...r.assignments.values()].map((d) => osloDateKey(d)))).toEqual(new Set(["2026-11-02"]));
  });
  it("without own times a business keeps the shared 3 + 1", () => {
    const assets = [...Array.from({ length: 4 }, (_, i) => mk(`p${i}`, "post", "skyline")), mk("r0", "reel", "skyline"), mk("r1", "reel", "skyline")];
    const r = planWithStrategy({ assets, pubs: [], startDate: "2026-11-02", postTimes: ["09:00", "13:00", "18:00"], reelTime: "19:00", timeZone: "Europe/Oslo", topicMixing: false, mode: "append", brand: "skyline", strategy: { cooldownDays: 0 }, now: new Date("2026-11-01T00:00:00Z") });
    const first = [...r.assignments.values()].filter((d) => osloDateKey(d) === "2026-11-02");
    expect(first.length).toBe(4);
  });
  it("rejects a time used for both a post and a Reel", () => {
    expect(validateBrandTimes(["09:00", "19:00"], ["19:00"])).toMatch(/both/);
    expect(validateBrandTimes(["08:00", "10:00", "12:00", "15:00", "18:00"], ["17:00", "20:00"])).toBeNull();
  });
});
