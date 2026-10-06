/** Performance feedback aggregation and bounded weight recommendations. Pure, no I/O.
 * Missing metrics stay missing (never counted as zero); medians resist single viral posts. */

export const METRICS = ["reach", "views", "saves", "shares", "profile_actions", "clicks", "inquiries"] as const;
export type Metric = (typeof METRICS)[number];

export interface Snapshot {
  asset_id: string;
  platform: string;
  captured_at: string;
  hours_since_publish: number | null;
  source: string;
  [k: string]: unknown;
}

/** Latest snapshot per (asset, platform), optionally only within a comparable age window. */
export function latestPerAsset<T extends Snapshot>(rows: T[], window?: { minHours: number; maxHours: number }): T[] {
  const m = new Map<string, T>();
  for (const r of rows) {
    if (window && (r.hours_since_publish == null || r.hours_since_publish < window.minHours || r.hours_since_publish > window.maxHours)) continue;
    const k = `${r.asset_id}|${r.platform}`;
    const cur = m.get(k);
    if (!cur || cur.captured_at < r.captured_at) m.set(k, r);
  }
  return [...m.values()];
}

export function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

export interface GroupStat { group: string; n: number; median: number | null; missing: number }

/** Per-group sample count and median of one metric; nulls are counted as missing, not zero. */
export function groupStats(rows: Snapshot[], groupOf: (r: Snapshot) => string, metric: Metric): GroupStat[] {
  const g = new Map<string, { vals: number[]; missing: number }>();
  for (const r of rows) {
    const k = groupOf(r);
    const e = g.get(k) ?? { vals: [], missing: 0 };
    const v = r[metric];
    if (typeof v === "number" && Number.isFinite(v)) e.vals.push(v);
    else e.missing++;
    g.set(k, e);
  }
  return [...g].map(([group, e]) => ({ group, n: e.vals.length, median: median(e.vals), missing: e.missing }));
}

export interface Recommendation {
  weights: Record<string, number>;
  changes: { group: string; from: number; to: number; why: string }[];
  skipped: { group: string; why: string }[];
}

/**
 * Suggests new bucket weights. Only groups with >= minSample samples move; each move is bounded by
 * ±maxStep (relative) and every bucket keeps at least diversityFloor share after normalisation.
 */
export function recommendWeights(
  current: Record<string, number>,
  stats: GroupStat[],
  opts: { minSample: number; maxStep: number; diversityFloor: number },
): Recommendation {
  const groups = new Set([...Object.keys(current), ...stats.map((s) => s.group)]);
  const eligible = stats.filter((s) => s.n >= opts.minSample && s.median != null);
  const skipped = stats.filter((s) => !(s.n >= opts.minSample && s.median != null)).map((s) => ({ group: s.group, why: `Only ${s.n} sample(s); needs ${opts.minSample}` }));
  const baseline = median(eligible.map((s) => s.median!));
  const raw: Record<string, number> = {};
  const changes: Recommendation["changes"] = [];
  for (const g of groups) {
    const from = current[g] ?? 1;
    const s = eligible.find((e) => e.group === g);
    let to = from;
    if (s && baseline && baseline > 0 && eligible.length >= 2) {
      const ratio = s.median! / baseline;
      const step = Math.max(-opts.maxStep, Math.min(opts.maxStep, ratio - 1));
      to = from * (1 + step);
      if (Math.abs(to - from) > 1e-9) changes.push({ group: g, from, to, why: `Median ${s.median!.toFixed(0)} vs typical ${baseline.toFixed(0)} over ${s.n} posts (change capped at ±${Math.round(opts.maxStep * 100)}%)` });
    }
    raw[g] = to;
  }
  // Diversity floor on shares, then rescale so the average weight stays 1.
  const n = groups.size || 1;
  const sum = Object.values(raw).reduce((a, b) => a + b, 0) || 1;
  const weights: Record<string, number> = {};
  for (const g of groups) weights[g] = Math.max(raw[g]! / sum, opts.diversityFloor);
  const s2 = Object.values(weights).reduce((a, b) => a + b, 0);
  for (const g of groups) weights[g] = +((weights[g]! / s2) * n).toFixed(3);
  for (const c of changes) c.to = weights[c.group]!;
  return { weights, changes, skipped };
}

/** Parses "asset_file,platform,hours,reach,views,saves,shares,profile_actions,clicks,inquiries" CSV rows; blank = missing. */
export function parseMetricsCsv(text: string): { file: string; platform: string; hours: number | null; values: Partial<Record<Metric, number | null>> }[] {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines[0]?.toLowerCase().startsWith("asset")) lines.shift();
  return lines.map((l) => {
    const c = l.split(",").map((x) => x.trim());
    const num = (x?: string) => (x === undefined || x === "" ? null : Number.isFinite(Number(x)) ? Number(x) : null);
    const values: Partial<Record<Metric, number | null>> = {};
    METRICS.forEach((m, i) => (values[m] = num(c[3 + i])));
    return { file: c[0] ?? "", platform: (c[1] ?? "").toLowerCase(), hours: num(c[2]), values };
  });
}
