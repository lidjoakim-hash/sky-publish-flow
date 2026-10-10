import { describe, it, expect } from "vitest";
import { runway, swapCandidate, canMove } from "@/lib/upnext";
import { addDays, calendarItems, monthDays, moveMonth, preparationLabels } from "@/lib/next-calendar";
import type { Asset } from "@/lib/queries";

const key = (iso: string) => iso.slice(0, 10);
const now = Date.parse("2026-10-07T06:00:00Z");
const it_ = (id: string, kind: string, at: string, skipped = false) => ({ id, kind, scheduled_at: at, skipped });

describe("up next rules", () => {
  it("counts days left including today, per kind", () => {
    const r = runway([it_("a", "post", "2026-10-07T09:00:00Z"), it_("b", "reel", "2026-10-09T17:00:00Z"), it_("c", "post", "2026-10-12T09:00:00Z")], "2026-10-07", key, now);
    expect(r.days).toBe(6);
    expect(r.postDays).toBe(6);
    expect(r.reelDays).toBe(3);
  });
  it("ignores skipped and past items", () => {
    const r = runway([it_("a", "post", "2026-10-06T09:00:00Z"), it_("b", "post", "2026-10-20T09:00:00Z", true)], "2026-10-07", key, now);
    expect(r.days).toBe(0);
  });
  it("swap picks the latest movable item of the same kind", () => {
    const t = it_("t", "post", "2026-10-07T09:00:00Z");
    const items = [t, it_("p1", "post", "2026-10-08T09:00:00Z"), it_("p2", "post", "2026-10-10T09:00:00Z"), it_("r", "reel", "2026-10-11T17:00:00Z")];
    expect(swapCandidate(t, items, [])?.id).toBe("p2");
    expect(swapCandidate(t, items, [{ asset_id: "p2", status: "published" }])?.id).toBe("p1");
  });
  it("items past waiting cannot move", () => {
    expect(canMove("x", [{ asset_id: "x", status: "sending" }])).toBe(false);
    expect(canMove("x", [{ asset_id: "x", status: "missed" }])).toBe(true);
  });
  it("includes all scheduled non-skipped brand entries, sorted by Oslo day", () => {
    const items = Array.from({ length: 84 }, (_, i) => ({ ...it_(String(i), "post", `2026-10-10T${i % 2 ? "11" : "09"}:00:00Z`), brand_slug: "norge" }));
    const by = calendarItems([...items, { ...items[0], id: "other", brand_slug: "skyline" }, { ...items[0], id: "skip", skipped: true }, { ...items[0], id: "undated", scheduled_at: null }].reverse(), "norge");
    expect(by.get("2026-10-10")).toHaveLength(84);
    expect(by.get("2026-10-10")?.[0].scheduled_at).toBe("2026-10-10T09:00:00Z");
    expect(by.get("2026-10-10")?.some((a) => a.id === "other")).toBe(false);
  });
  it("uses Monday-first weeks and moves correctly across years and DST", () => {
    expect(monthDays("2027-01-01")[0]).toBe("2026-12-28");
    expect(moveMonth("2026-12-31", 1)).toBe("2027-01-01");
    expect(moveMonth("2027-01-01", -1)).toBe("2026-12-01");
    expect(addDays("2026-10-25", 1)).toBe("2026-10-26");
    expect(calendarItems([{ ...it_("x", "post", "2026-10-10T22:30:00Z"), brand_slug: "norge" }], "norge").has("2026-10-11")).toBe(true);
  });
  it("never labels published, unknown or processing items ready", () => {
    const asset = { approved: true, upload_state: "done", caption: "Original caption", kind: "post", width: 1080, height: 1350 } as Asset;
    expect(preparationLabels(asset, ["pending"]).ready).toBe(true);
    for (const s of ["published", "unknown", "processing", "failed", "needs_finish"]) expect(preparationLabels(asset, [s]).ready).toBe(false);
    expect(preparationLabels({ ...asset, approved: false }, []).approval).toBe("Not approved");
    expect(preparationLabels({ ...asset, caption: null }, []).issues).toContain("Caption missing");
  });
});
