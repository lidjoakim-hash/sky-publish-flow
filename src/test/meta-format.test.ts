import { describe, it, expect } from "vitest";
import { checkCaption, checkMetaFormat, hourStats } from "@/lib/meta-format";

const errs = (i: { level: string; text: string }[]) => i.filter((x) => x.level === "error");

describe("meta format", () => {
  it("rejects Reels under 3 s", () => expect(errs(checkMetaFormat({ kind: "reel", duration_s: 2 }))).toHaveLength(1));
  it("accepts a 30 s 1080x1920 Reel with cover", () => expect(checkMetaFormat({ kind: "reel", duration_s: 30, width: 1080, height: 1920, cover_path: "c.jpg" })).toEqual([]));
  it("warns Facebook over 90 s without blocking", () => {
    const r = checkMetaFormat({ kind: "reel", duration_s: 120, cover_path: "c" });
    expect(errs(r)).toHaveLength(0);
    expect(r).toHaveLength(1);
  });
  it("rejects photos taller than 4:5", () => expect(errs(checkMetaFormat({ kind: "post", file_name: "a.jpg", width: 1080, height: 1920 }))).toHaveLength(1));
  it("rejects non-JPEG photos", () => expect(errs(checkMetaFormat({ kind: "post", file_name: "a.png" }))).toHaveLength(1));
  it("rejects photos over 8 MB", () => expect(errs(checkMetaFormat({ kind: "post", file_name: "a.jpg", size_bytes: 9 * 1024 ** 2 }))).toHaveLength(1));
});

describe("caption checks", () => {
  it("rejects more than 30 hashtags", () => expect(errs(checkCaption(Array.from({ length: 31 }, (_, i) => `#t${i}`).join(" ")))).toHaveLength(1));
  it("allows 30 hashtags", () => expect(errs(checkCaption(Array.from({ length: 30 }, (_, i) => `#tak${i}`).join(" ")))).toHaveLength(0));
  it("rejects over 2200 characters", () => expect(errs(checkCaption("æ".repeat(2201)))).toHaveLength(1));
});

describe("posting hours", () => {
  it("ignores hours below the minimum sample and missing values", () => {
    const rows = [
      ...Array.from({ length: 5 }, () => ({ publishedAt: "2026-10-01T07:00:00Z", value: 100 })), // 09 Oslo
      ...Array.from({ length: 4 }, () => ({ publishedAt: "2026-10-01T16:00:00Z", value: 900 })), // 18 Oslo
      { publishedAt: "2026-10-01T16:00:00Z", value: null },
    ];
    const h = hourStats(rows, 5);
    expect(h.ranked.map((s) => s.hour)).toEqual([9]);
    expect(h.enough).toBe(false);
  });
});
