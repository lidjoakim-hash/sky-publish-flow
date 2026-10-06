import { describe, expect, it } from "vitest";
import { strategyPlan, type PlanItem } from "@/lib/planner";
import { planWithStrategy } from "@/lib/plan";
import { groupStats, latestPerAsset, recommendWeights, parseMetricsCsv, type Snapshot } from "@/lib/feedback";
import { sourceGroupOf, suggestClassification } from "@/lib/strategy";
import type { Asset, Publication } from "@/lib/queries";

const base = { startDate: "2026-11-02", postTimes: ["09:00", "13:00", "18:00"], reelTime: "19:00", timeZone: "Europe/Oslo", taken: new Set<string>(), notBefore: new Date("2026-11-01T00:00:00Z"), history: [] };
const item = (id: string, p: Partial<PlanItem> = {}): PlanItem => ({ id, kind: "post", bucket: null, sourceGroup: id, hook: null, campaignFirst: false, ...p });

describe("strategy planner", () => {
  it("rotates buckets instead of clumping", () => {
    const items = [item("a1", { bucket: "proof" }), item("a2", { bucket: "proof" }), item("b1", { bucket: "local" }), item("b2", { bucket: "local" })];
    const r = strategyPlan(items, base);
    const order = [...r.assignments].sort((x, y) => x[1].localeCompare(y[1])).map(([id]) => id[0]);
    expect(order).toEqual(["a", "b", "a", "b"]);
  });

  it("never schedules the same source back to back and leaves the slot empty instead", () => {
    const items = [item("x1", { sourceGroup: "s" }), item("x2", { sourceGroup: "s" })];
    const r = strategyPlan(items, base);
    const times = [...r.assignments.values()].sort();
    expect(times).toHaveLength(2);
    expect(r.shortages.length).toBeGreaterThan(0);
    expect(r.shortages[0]!.reason).toMatch(/same source/);
  });

  it("enforces a source cooldown in days", () => {
    const items = [item("x1", { sourceGroup: "s" }), item("y", { sourceGroup: "t" }), item("x2", { sourceGroup: "s" })];
    const r = strategyPlan(items, { ...base, cooldownDays: 3 });
    const gap = Math.abs(new Date(r.assignments.get("x2")!).getTime() - new Date(r.assignments.get("x1")!).getTime());
    expect(gap).toBeGreaterThanOrEqual(3 * 86_400_000);
  });

  it("keeps campaign items first and skips past/taken slots", () => {
    const taken = new Set(["2026-11-02T08:00:00.000Z"]); // 09:00 Oslo
    const r = strategyPlan([item("n"), item("c", { campaignFirst: true })], { ...base, taken });
    expect(r.assignments.get("c")).toBe("2026-11-02T12:00:00.000Z");
    expect(r.assignments.get("n")).toBe("2026-11-02T17:00:00.000Z");
  });

  it("does not repeat the same hook consecutively", () => {
    const items = [item("h1", { hook: "Fra oven" }), item("h2", { hook: "Fra oven" }), item("h3", { hook: "Annet" })];
    const r = strategyPlan(items, base);
    const order = [...r.assignments].sort((x, y) => x[1].localeCompare(y[1])).map(([id]) => id);
    expect(order[1]).toBe("h3");
  });
});

const asset = (id: string, p: Partial<Asset> = {}): Asset => ({ id, user_id: "u", batch_id: null, rel_path: `f/${id}.jpg`, file_name: `${id}.jpg`, kind: "post", sha256: id, size_bytes: 1, mime: null, storage_path: null, upload_state: "done", cover_path: null, caption: "c", caption_source: null, caption_issue: null, topics: [], seasonal: false, campaign_first: false, sort_index: 0, skipped: false, approved: false, duration_s: null, width: null, height: null, audio_state: "unchecked", audio_rms_db: null, rendered_path: null, rendered_verified: null, scheduled_at: null, created_at: "", brand_slug: "skyline", bucket: null, objective: null, source_group: null, hooks: [], style_tags: [], review_status: "unreviewed", classification_source: null, ...p }) as Asset;

describe("brand boundaries and locks", () => {
  const input = (assets: Asset[], pubs: Publication[] = []) => ({ assets, pubs, startDate: "2026-11-02", postTimes: ["09:00"], reelTime: "19:00", timeZone: "Europe/Oslo", topicMixing: false, mode: "reschedule" as const, brand: "skyline", strategy: {}, now: new Date("2026-11-01T00:00:00Z") });
  it("only plans the selected brand and treats other brands' slots as taken", () => {
    const v = asset("v", { brand_slug: "velune", scheduled_at: "2026-11-02T08:00:00.000Z" });
    const r = planWithStrategy(input([asset("s"), v]));
    expect(r.assignments.has("v")).toBe(false);
    expect(r.assignments.get("s")).toBe("2026-11-03T08:00:00.000Z");
  });
  it("keeps locked items and holds rejected ones with a reason", () => {
    const locked = asset("l", { scheduled_at: "2026-11-05T08:00:00.000Z" });
    const pub = { asset_id: "l", status: "published" } as Publication;
    const r = planWithStrategy(input([locked, asset("r", { review_status: "reject" })], [pub]));
    expect(r.assignments.has("l")).toBe(false);
    expect(r.held.find((h) => h.id === "r")?.reason).toMatch(/Do not use/);
  });
  it("legacy unclassified assets stay schedulable", () => {
    expect(planWithStrategy(input([asset("old")])).assignments.size).toBe(1);
  });
});

describe("feedback", () => {
  const snap = (asset_id: string, reach: number | null, h = 48, at = "2026-11-10"): Snapshot => ({ asset_id, platform: "instagram", captured_at: at, hours_since_publish: h, source: "manual", reach });
  it("treats missing as missing, not zero", () => {
    const [s] = groupStats([snap("a", 100), snap("b", null)], () => "g", "reach");
    expect(s).toMatchObject({ n: 1, missing: 1, median: 100 });
  });
  it("uses the latest snapshot per asset within the comparable window", () => {
    const rows = latestPerAsset([snap("a", 10, 48, "2026-11-10"), snap("a", 20, 60, "2026-11-11"), snap("a", 99, 300, "2026-11-20")], { minHours: 24, maxHours: 72 });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.reach).toBe(20);
  });
  it("does not move weights below the minimum sample", () => {
    const r = recommendWeights({}, [{ group: "a", n: 1, median: 100000, missing: 0 }, { group: "b", n: 1, median: 10, missing: 0 }], { minSample: 5, maxStep: 0.2, diversityFloor: 0.05 });
    expect(r.changes).toHaveLength(0);
    expect(r.skipped).toHaveLength(2);
  });
  it("bounds changes and keeps a diversity floor", () => {
    const r = recommendWeights({ a: 1, b: 1, c: 1 }, [{ group: "a", n: 6, median: 1_000_000, missing: 0 }, { group: "b", n: 6, median: 100, missing: 0 }, { group: "c", n: 6, median: 1, missing: 0 }], { minSample: 5, maxStep: 0.2, diversityFloor: 0.05 });
    expect(r.weights.a!).toBeLessThanOrEqual(1.25);
    expect(r.weights.c!).toBeGreaterThanOrEqual(0.7);
  });
  it("parses CSV blanks as missing", () => {
    expect(parseMetricsCsv("asset,platform\nx.jpg,Instagram,48,100,,3")[0]!.values).toMatchObject({ reach: 100, views: null, saves: 3, inquiries: null });
  });
});

describe("classification helpers", () => {
  it("groups renamed copies into one source and labels suggestions", () => {
    expect(sourceGroupOf({ rel_path: "A/tak_inspeksjon copy.mp4" })).toBe(sourceGroupOf({ rel_path: "A/tak_inspeksjon.mp4" }));
    expect(sourceGroupOf({ rel_path: "A/reel_001.mp4" })).not.toBe(sourceGroupOf({ rel_path: "A/reel_002.mp4" }));
    expect(suggestClassification({ file_name: "x.mp4", caption: "Utsikt over Stavanger" }).reason).toMatch(/Suggested/);
    expect(suggestClassification({ file_name: "x.mp4", caption: "" }).bucket).toBeNull();
  });
});
