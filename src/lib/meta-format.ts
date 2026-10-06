/**
 * Meta (Instagram + Facebook) format and caption checks, plus own-data posting-hour advice.
 * Pure rules, no I/O. Limits follow Meta's published API docs for content publishing.
 * "error" blocks approval (Meta would reject it); "tip" is advisory only.
 */

export type MetaIssue = { level: "error" | "tip"; text: string };

export const META_LIMITS = {
  captionMax: 2200, // Instagram caption limit
  hashtagMax: 30, // Instagram hashtag limit
  mentionMax: 20, // Instagram @mention limit
  firstLineVisible: 125, // approx. chars shown before "… more"
  reelMinS: 3,
  reelMaxS: 900, // Instagram Reels via API: 3 s – 15 min
  fbReelMaxS: 90, // Facebook Reels API: 3 – 90 s
  reelMaxBytes: 1024 ** 3, // 1 GB
  imageMaxBytes: 8 * 1024 ** 2, // Instagram image limit 8 MB
  imageMinRatio: 4 / 5, // 4:5 portrait
  imageMaxRatio: 1.91, // 1.91:1 landscape
  reelMinWidth: 540,
} as const;

type FormatInput = {
  kind: string;
  mime?: string | null;
  file_name?: string;
  size_bytes?: number | null;
  duration_s?: number | null;
  width?: number | null;
  height?: number | null;
  cover_path?: string | null;
};

/** Checks size, length, shape and file type. Unknown values are not judged. */
export function checkMetaFormat(a: FormatInput): MetaIssue[] {
  const out: MetaIssue[] = [];
  const L = META_LIMITS;
  const size = Number(a.size_bytes ?? 0);
  const dur = a.duration_s == null ? null : Number(a.duration_s);
  const w = a.width ?? null;
  const h = a.height ?? null;
  if (a.kind === "reel") {
    if (dur != null && dur < L.reelMinS) out.push({ level: "error", text: `Reel too short for Meta (${dur}s, min ${L.reelMinS}s)` });
    if (dur != null && dur > L.reelMaxS) out.push({ level: "error", text: `Reel too long for Instagram (${dur}s, max 15 min)` });
    if (dur != null && dur > L.fbReelMaxS && dur <= L.reelMaxS) out.push({ level: "tip", text: `Over ${L.fbReelMaxS}s: Facebook may refuse it as a Reel` });
    if (size > L.reelMaxBytes) out.push({ level: "error", text: "Video over 1 GB" });
    if (w && h) {
      const r = w / h;
      if (Math.abs(r - 9 / 16) > 0.02) out.push({ level: "tip", text: `Not 9:16 (${w}×${h}): Meta adds bars or crops` });
      if (Math.min(w, h) < L.reelMinWidth) out.push({ level: "tip", text: `Low resolution (${w}×${h}); 1080×1920 is best` });
    }
    if (!a.cover_path) out.push({ level: "tip", text: "No cover image: Meta picks a frame" });
  } else {
    const name = (a.file_name ?? "").toLowerCase();
    const isJpeg = a.mime ? /jpe?g/.test(a.mime) : /\.jpe?g$/.test(name);
    if ((a.mime || name) && !isJpeg) out.push({ level: "error", text: "Instagram only accepts JPEG photos" });
    if (size > L.imageMaxBytes) out.push({ level: "error", text: "Photo over 8 MB" });
    if (w && h) {
      const r = w / h;
      if (r < L.imageMinRatio - 0.01) out.push({ level: "error", text: `Too tall for Instagram (${w}×${h}); max 4:5` });
      else if (r > L.imageMaxRatio + 0.01) out.push({ level: "error", text: `Too wide for Instagram (${w}×${h}); max 1.91:1` });
      else if (Math.abs(r - 0.8) > 0.02) out.push({ level: "tip", text: "4:5 portrait fills the most feed space" });
    }
  }
  return out;
}

/** Caption checks. Never changes the text — only reports. */
export function checkCaption(caption: string | null | undefined): MetaIssue[] {
  const c = caption ?? "";
  if (!c.trim()) return [];
  const out: MetaIssue[] = [];
  const L = META_LIMITS;
  const chars = [...c].length;
  if (chars > L.captionMax) out.push({ level: "error", text: `Caption ${chars} characters (Instagram max ${L.captionMax})` });
  const tags = c.match(/(^|\s)#[\p{L}\p{N}_]+/gu)?.length ?? 0;
  if (tags > L.hashtagMax) out.push({ level: "error", text: `${tags} hashtags (Instagram max ${L.hashtagMax})` });
  const mentions = c.match(/(^|\s)@[\w.]+/g)?.length ?? 0;
  if (mentions > L.mentionMax) out.push({ level: "error", text: `${mentions} @mentions (max ${L.mentionMax})` });
  const first = c.split("\n")[0].trim();
  if ([...first].length > L.firstLineVisible) out.push({ level: "tip", text: "First line is long; it gets cut off at “… more”" });
  return out;
}

export function metaIssues(a: FormatInput & { caption?: string | null }): MetaIssue[] {
  return [...checkMetaFormat(a), ...checkCaption(a.caption)];
}

/** Hour of day (0–23) in Europe/Oslo for a timestamp. */
export function osloHour(iso: string): number {
  const h = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Oslo", hour: "2-digit", hourCycle: "h23" }).format(new Date(iso));
  return Number(h);
}

export type HourStat = { hour: number; n: number; median: number };

/**
 * Posting-hour advice from the owner's own results only.
 * Hours with fewer than minSample posts are listed but never ranked; missing values are ignored, not zero.
 */
export function hourStats(rows: { publishedAt: string; value: number | null | undefined }[], minSample = 5) {
  const by = new Map<number, number[]>();
  for (const r of rows) {
    if (r.value == null || !Number.isFinite(r.value)) continue;
    const h = osloHour(r.publishedAt);
    by.set(h, [...(by.get(h) ?? []), r.value]);
  }
  const med = (v: number[]) => {
    const s = [...v].sort((a, b) => a - b);
    const m = Math.floor(s.length / 2);
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  };
  const all: HourStat[] = [...by.entries()].map(([hour, v]) => ({ hour, n: v.length, median: med(v) })).sort((a, b) => a.hour - b.hour);
  const ranked = all.filter((s) => s.n >= minSample).sort((a, b) => b.median - a.median);
  return { all, ranked, enough: ranked.length >= 2 };
}
