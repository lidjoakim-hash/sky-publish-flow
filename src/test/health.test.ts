import { describe, it, expect } from "vitest";
import { brandHealth } from "@/lib/health";

const now = new Date("2026-11-01T12:00:00Z").getTime();
const a = (id: string, brand: string, at: string | null, approved = true) => ({ id, brand_slug: brand, scheduled_at: at, skipped: false, approved });

describe("all-businesses check", () => {
  it("counts only this business's missed posts", () => {
    const assets = [a("1", "norge", "2026-10-30T10:00:00Z"), a("2", "skyline", "2026-10-30T10:00:00Z")];
    const pubs = [{ asset_id: "1", platform: "instagram", status: "missed" }, { asset_id: "2", platform: "facebook", status: "missed" }];
    const h = brandHealth("norge", assets, pubs, { connected: true, postingOn: false, now });
    expect(h.missed).toBe(1);
    expect(h.problems.length).toBe(1);
  });
  it("is okay when nothing is wrong", () => {
    const h = brandHealth("lidverk", [a("1", "lidverk", "2026-11-10T10:00:00Z")], [], { connected: true, postingOn: true, now });
    expect(h.problems).toEqual([]);
  });
});
