import { describe, it, expect } from "vitest";
import { runway, swapCandidate, canMove } from "@/lib/upnext";

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
});
