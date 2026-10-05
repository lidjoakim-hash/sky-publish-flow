import { describe, expect, it } from "vitest";
import { parseCaptionCsv } from "@/lib/csv";
import { classifyFiles, matchCaption, importOrder } from "@/lib/matching";
import { assignSchedule, zonedToUtc } from "@/lib/schedule";
import { validateEntryPath, checkBomb } from "@/lib/zip-safety";
import { classifyLevel } from "@/lib/audio";

describe("CSV captions", () => {
  it("parses quoted, multiline Norwegian captions with escaped quotes", () => {
    const csv = '\uFEFFAsset,Type,Caption\r\nreel_001.mp4,Reel,"Utsikt over Stavanger 🌅\nBlå time, «Skyline»"\r\npost_01.jpg,Post,"Han sa ""hei"" på Ålgård"\r\n';
    const rows = parseCaptionCsv(csv);
    expect(rows).toHaveLength(2);
    expect(rows[0].caption).toBe("Utsikt over Stavanger 🌅\nBlå time, «Skyline»");
    expect(rows[1].caption).toBe('Han sa "hei" på Ålgård');
  });
});

describe("file classification", () => {
  it("treats Reel JPEGs as covers and excludes previews and HTML", () => {
    const roles = classifyFiles([
      { path: "A/reel_001.mp4", size: 1 },
      { path: "A/reel_001.jpg", size: 1 },
      { path: "A/post_01.jpg", size: 1 },
      { path: "A/preview_grid.jpg", size: 1 },
      { path: "index.html", size: 1 },
    ]);
    expect(roles.get("A/reel_001.mp4")).toBe("reel");
    expect(roles.get("A/reel_001.jpg")).toBe("cover");
    expect(roles.get("A/post_01.jpg")).toBe("post");
    expect(roles.get("A/preview_grid.jpg")).toBe("excluded");
    expect(roles.get("index.html")).toBe("excluded");
  });

  it("classifies 120 Reels (with covers) and 44 posts", () => {
    const files = [];
    for (let i = 1; i <= 120; i++) files.push({ path: `r/reel_${i}.mp4`, size: 1 }, { path: `r/reel_${i}.jpg`, size: 1 });
    for (let i = 1; i <= 44; i++) files.push({ path: `p/post_${i}.jpg`, size: 1 });
    const roles = [...classifyFiles(files).values()];
    expect(roles.filter((r) => r === "reel")).toHaveLength(120);
    expect(roles.filter((r) => r === "post")).toHaveLength(44);
    expect(roles.filter((r) => r === "cover")).toHaveLength(120);
  });

  it("imports campaign folder first", () => {
    const o = importOrder(["Main/reel_2.mp4", "First_Campaign_20_Reels_4_Posts/reel_10.mp4", "Main/reel_10.mp4"]);
    expect(o[0]).toContain("First_Campaign");
    expect(o.slice(1)).toEqual(["Main/reel_2.mp4", "Main/reel_10.mp4"]);
  });
});

describe("caption matching", () => {
  const rows = [
    { asset: "A/reel_1.mp4", type: "Reel", caption: "path" },
    { asset: "X/dup.jpg", type: "Post", caption: "one" },
    { asset: "Y/dup.jpg", type: "Post", caption: "two" },
    { asset: "only.jpg", type: "Post", caption: "base" },
  ];
  it("prefers relative path, then unique basename, then sidecar", () => {
    expect(matchCaption("A/reel_1.mp4", rows, new Map()).source).toBe("csv_path");
    expect(matchCaption("B/only.jpg", rows, new Map()).caption).toBe("base");
    expect(matchCaption("C/x.jpg", rows, new Map([["c/x.txt", "side"]])).caption).toBe("side");
  });
  it("flags ambiguous and missing captions", () => {
    expect(matchCaption("Z/dup.jpg", rows, new Map()).issue).toBe("ambiguous");
    expect(matchCaption("Z/none.jpg", rows, new Map()).issue).toBe("missing");
  });
});

describe("Oslo scheduling", () => {
  it("keeps 19:00 local across the October DST change", () => {
    expect(zonedToUtc("2026-10-24", "19:00").toISOString()).toBe("2026-10-24T17:00:00.000Z");
    expect(zonedToUtc("2026-10-25", "19:00").toISOString()).toBe("2026-10-25T18:00:00.000Z");
    expect(zonedToUtc("2027-03-28", "18:00").toISOString()).toBe("2027-03-28T16:00:00.000Z");
  });
  it("posts finish after 44 days and Reels after 120, independently", () => {
    const items = [
      ...Array.from({ length: 44 }, (_, i) => ({ id: `p${i}`, kind: "post" as const })),
      ...Array.from({ length: 120 }, (_, i) => ({ id: `r${i}`, kind: "reel" as const })),
    ];
    const m = assignSchedule(items, { startDate: "2026-11-01", postTime: "18:00", reelTime: "19:00", taken: new Set(), notBefore: new Date("2026-10-01") });
    expect(m.get("p43")).toBe(zonedToUtc("2026-12-14", "18:00").toISOString());
    expect(m.get("r119")).toBe(zonedToUtc("2027-02-28", "19:00").toISOString());
  });
  it("skips occupied and past slots when appending", () => {
    const taken = new Set([zonedToUtc("2026-11-02", "19:00").toISOString()]);
    const m = assignSchedule([{ id: "a", kind: "reel" }, { id: "b", kind: "reel" }], {
      startDate: "2026-11-01", postTime: "18:00", reelTime: "19:00", taken, notBefore: zonedToUtc("2026-11-01", "20:00"),
    });
    expect(m.get("a")).toBe(zonedToUtc("2026-11-03", "19:00").toISOString());
    expect(m.get("b")).toBe(zonedToUtc("2026-11-04", "19:00").toISOString());
  });
});

describe("ZIP safety", () => {
  it("rejects traversal and absolute paths", () => {
    expect(validateEntryPath("../evil.mp4")).toBeNull();
    expect(validateEntryPath("a/../../x")).toBeNull();
    expect(validateEntryPath("/etc/passwd")).toBeNull();
    expect(validateEntryPath("C:/x.mp4")).toBeNull();
    expect(validateEntryPath("Skyline/reel_1.mp4")).toBe("Skyline/reel_1.mp4");
  });
  it("rejects decompression bombs", () => {
    expect(checkBomb(1000, 500 * 1024 * 1024, 0)).not.toBeNull();
    expect(checkBomb(5_000_000, 6_000_000, 0)).toBeNull();
  });
});

describe("audio levels", () => {
  it("a silent audio track does not count as existing audio", () => {
    expect(classifyLevel(false, null)).toBe("missing");
    expect(classifyLevel(true, -90)).toBe("silent");
    expect(classifyLevel(true, -22)).toBe("existing");
  });
});
