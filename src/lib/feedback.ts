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
  /** Set when no change can be recommended at all; weights are then exactly the current ones. */
  blocked?: string;
}

/**
 * Suggests new bucket weights. Works on shares of the total weight, which stays constant:
 * - only groups with >= minSample samples move; unsampled groups keep their exact weight;
 * - every moved group's FINAL share stays within ±maxStep (relative) of its current share;
 * - every moved group's FINAL share is >= diversityFloor;
 * - with no evidence, or infeasible settings, current weights are returned unchanged.
 */
export function recommendWeights(
  current: Record<string, number>,
  stats: GroupStat[],
  opts: { minSample: number; maxStep: number; diversityFloor: number },
): Recommendation {
  const unchanged = (blocked: string, skipped: Recommendation["skipped"]): Recommendation => ({ weights: { ...current }, changes: [], skipped, blocked });
  const eligible = stats.filter((s) => s.n >= opts.minSample && s.median != null);
  const skipped = stats.filter((s) => !eligible.includes(s)).map((s) => ({ group: s.group, why: `Only ${s.n} sample(s); needs ${opts.minSample}` }));
  if (!(opts.maxStep > 0 && opts.maxStep < 1) || !(opts.diversityFloor >= 0 && opts.diversityFloor < 1)) return unchanged("Invalid step or floor setting", skipped);
  const baseline = median(eligible.map((s) => s.median!));
  if (eligible.length < 2 || !baseline || baseline <= 0) return unchanged(`Needs at least two buckets with ${opts.minSample}+ comparable samples`, skipped);

  const groups = [...new Set([...Object.keys(current), ...stats.map((s) => s.group)])];
  const wOf = (g: string) => Math.max(0, current[g] ?? 1);
  const total = groups.reduce((sum, g) => sum + wOf(g), 0);
  if (total <= 0) return unchanged("All current weights are zero", skipped);
  const share = Object.fromEntries(groups.map((g) => [g, wOf(g) / total])) as Record<string, number>;
  const moving = new Set(eligible.map((e) => e.group));
  const lo: Record<string, number> = {};
  const hi: Record<string, number> = {};
  const target: Record<string, number> = {};
  for (const g of groups) {
    const s = share[g]!;
    if (!moving.has(g)) {
      lo[g] = hi[g] = target[g] = s;
      continue;
    }
    lo[g] = Math.max(opts.diversityFloor, s * (1 - opts.maxStep));
    hi[g] = Math.min(1, s * (1 + opts.maxStep));
    if (lo[g]! > hi[g]! + 1e-12) return unchanged(`${g} is below the diversity floor and cannot reach it within one capped step — raise its weight in Strategy first`, skipped);
    const st = eligible.find((e) => e.group === g)!;
    target[g] = s * (1 + Math.max(-opts.maxStep, Math.min(opts.maxStep, st.median! / baseline - 1)));
  }
  const sumLo = groups.reduce((a, g) => a + lo[g]!, 0);
  const sumHi = groups.reduce((a, g) => a + hi[g]!, 0);
  if (sumLo > 1 + 1e-9 || sumHi < 1 - 1e-9) return unchanged("Floor and step settings cannot be satisfied together for these buckets", skipped);
  // Shift moving groups by λ·share (clamped to their bounds) so the shares sum to 1 again.
  const at = (l: number) => Object.fromEntries(groups.map((g) => [g, moving.has(g) ? Math.min(hi[g]!, Math.max(lo[g]!, target[g]! + l * share[g]!)) : share[g]!])) as Record<string, number>;
  const sumAt = (l: number) => Object.values(at(l)).reduce((a, b) => a + b, 0);
  let a = -10, b = 10;
  for (let i = 0; i < 200; i++) {
    const m = (a + b) / 2;
    if (sumAt(m) < 1) a = m;
    else b = m;
  }
  const final = at((a + b) / 2);
  const weights: Record<string, number> = { ...current };
  const changes: Recommendation["changes"] = [];
  for (const g of moving) {
    const to = final[g]! * total;
    const from = wOf(g);
    weights[g] = to;
    if (Math.abs(to - from) > 1e-9) {
      const st = eligible.find((e) => e.group === g)!;
      changes.push({ group: g, from, to, why: `Median ${st.median!.toFixed(0)} vs typical ${baseline.toFixed(0)} over ${st.n} posts (capped at ±${Math.round(opts.maxStep * 100)}%, floor ${Math.round(opts.diversityFloor * 100)}%)` });
    }
  }
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
