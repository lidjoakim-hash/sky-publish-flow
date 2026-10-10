import { describe, expect, it } from "vitest";
import { parseCaptionCsv } from "@/lib/csv";
import { matchCaption } from "@/lib/matching";

describe("caption CSV headers", () => {
  it("reads creator Path,File,Type,Caption with BOM and multiline captions", () => {
    const rows = parseCaptionCsv('\uFEFFpath,FILE,Type,Caption\r\nNorge/fjord_01.jpg,fjord_01.jpg,Post,"Fjorden i dag\nNydelig"\r\n,nordlys.jpg,Post,Nordlys\r\n');
    expect(rows).toEqual([
      { asset: "Norge/fjord_01.jpg", type: "Post", caption: "Fjorden i dag\nNydelig" },
      { asset: "nordlys.jpg", type: "Post", caption: "Nordlys" },
    ]);
    expect(matchCaption("Norge/fjord_01.jpg", rows, new Map()).caption).toBe("Fjorden i dag\nNydelig");
    expect(matchCaption("X/nordlys.jpg", rows, new Map()).caption).toBe("Nordlys");
  });
  it("reads File-only and keeps the Asset format", () => {
    expect(parseCaptionCsv("File,Caption\na.jpg,Hei")[0].asset).toBe("a.jpg");
    expect(parseCaptionCsv("ASSET,Type,Caption\nb.jpg,Post,Hei")[0]).toEqual({ asset: "b.jpg", type: "Post", caption: "Hei" });
  });
  it("throws a readable error without Caption or a path column", () => {
    expect(() => parseCaptionCsv("Path,Type\na.jpg,Post")).toThrow(/Caption column/);
    expect(() => parseCaptionCsv("Type,Caption\nPost,Hei")).toThrow(/Asset, Path or File/);
  });
});
