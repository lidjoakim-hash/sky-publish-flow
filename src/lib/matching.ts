import type { CaptionRow } from "./csv";

export type FileRole = "reel" | "post" | "cover" | "caption_txt" | "caption_csv" | "excluded";

export interface InputFile {
  path: string; // relative path using "/"
  size: number;
}

const VIDEO = /\.(mp4|mov|m4v)$/i;
const IMAGE = /\.(jpe?g|png|webp)$/i;

export const normPath = (p: string) => p.replace(/\\/g, "/").replace(/^\.?\//, "");
export const baseName = (p: string) => normPath(p).split("/").pop() ?? p;
export const stem = (p: string) => baseName(p).replace(/\.[^.]+$/, "");
export const dirOf = (p: string) => {
  const parts = normPath(p).split("/");
  parts.pop();
  return parts.join("/");
};

export function isExcludedName(path: string): boolean {
  const b = baseName(path).toLowerCase();
  if (/\.(html?|htm|ds_store|ini|db)$/i.test(b) || b.startsWith("._") || b === "thumbs.db") return true;
  if (normPath(path).split("/").some((s) => s === "__MACOSX")) return true;
  if (/(^|[_\-. ])(preview|contact[_-]?sheet|thumbnail|collection[_-]?preview)s?([_\-. ]|$)/i.test(b)) return true;
  // Review/overview sheets such as "Reels_Review.jpg" or "B16_Review.jpg": "review" as the final word only,
  // so ordinary marketing files like "customer_review_story.jpg" are kept.
  return /(^|[_\-. ])review$/i.test(stem(b));
}

/** Classifies every file. Images sharing a stem with a video in the same folder are Reel covers. */
export function classifyFiles(files: InputFile[]): Map<string, FileRole> {
  const roles = new Map<string, FileRole>();
  const videoKeys = new Set(
    files.filter((f) => VIDEO.test(f.path)).map((f) => `${dirOf(f.path)}/${stem(f.path).toLowerCase()}`),
  );
  for (const f of files) {
    const p = normPath(f.path);
    if (isExcludedName(p)) roles.set(p, "excluded");
    else if (/\.csv$/i.test(p)) roles.set(p, "caption_csv");
    else if (/\.txt$/i.test(p)) roles.set(p, "caption_txt");
    else if (VIDEO.test(p)) roles.set(p, "reel");
    else if (IMAGE.test(p)) {
      const key = `${dirOf(p)}/${stem(p).toLowerCase().replace(/[_-]?(cover|thumb)$/, "")}`;
      roles.set(p, videoKeys.has(key) ? "cover" : "post");
    } else roles.set(p, "excluded");
  }
  return roles;
}

export interface CaptionMatch {
  caption: string | null;
  source: "csv_path" | "csv_basename" | "sidecar_txt" | null;
  issue: "missing" | "ambiguous" | null;
}

/**
 * Matches captions: CSV relative path first, then unique CSV basename, then sidecar .txt.
 * Ambiguous basename matches (same basename in several CSV rows with different captions) are flagged.
 */
export function matchCaption(
  mediaPath: string,
  csvRows: CaptionRow[],
  txtByPath: Map<string, string>,
  csvDir = "",
): CaptionMatch {
  const p = normPath(mediaPath);
  const rel = csvDir && p.startsWith(csvDir + "/") ? p.slice(csvDir.length + 1) : p;
  const byPath = csvRows.find((r) => {
    const a = normPath(r.asset);
    return a === rel || a === p;
  });
  if (byPath) return { caption: byPath.caption, source: "csv_path", issue: null };

  const b = baseName(p).toLowerCase();
  const byBase = csvRows.filter((r) => baseName(r.asset).toLowerCase() === b);
  const unique = new Set(byBase.map((r) => r.caption));
  if (byBase.length && unique.size === 1) return { caption: byBase[0].caption, source: "csv_basename", issue: null };

  const sidecar = txtByPath.get(`${dirOf(p)}/${stem(p)}.txt`.replace(/^\//, "").toLowerCase());
  if (sidecar != null) return { caption: sidecar, source: "sidecar_txt", issue: null };

  if (byBase.length > 1) return { caption: null, source: null, issue: "ambiguous" };
  return { caption: null, source: null, issue: "missing" };
}

/** Topic labels from filename words, e.g. "reel_012_utsikt-solnedgang.mp4" -> ["utsikt","solnedgang"]. */
export function topicsFromName(path: string): string[] {
  return stem(path)
    .toLowerCase()
    .split(/[_\-\s.]+/)
    .filter((w) => w.length > 2 && !/^\d+$/.test(w) && !["reel", "post", "img", "video", "final"].includes(w));
}

const SEASONAL = /(jul|christmas|xmas|nyttar|nyttår|paske|påske|easter|sommer|summer|vinter|winter|17[_-]?mai|halloween|black[_-]?friday|advent|host|høst)/i;
export const isSeasonal = (path: string, caption: string | null) =>
  SEASONAL.test(baseName(path)) || (caption ? SEASONAL.test(caption) : false);

/** Campaign folder content is imported first, then everything else, each in natural path order. */
export function importOrder(paths: string[], campaignMarker = "First_Campaign"): string[] {
  const coll = new Intl.Collator("nb", { numeric: true });
  return [...paths].sort((a, b) => {
    const ca = a.includes(campaignMarker) ? 0 : 1;
    const cb = b.includes(campaignMarker) ? 0 : 1;
    return ca - cb || coll.compare(a, b);
  });
}
