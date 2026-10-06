/** Strategy-aware slot planner. Pure: no I/O. Fills the same Oslo slots as assignSchedule, but
 * rotates buckets, avoids consecutive repeats of source/hook, honours a source cooldown and leaves a
 * slot empty (reported as a shortage) rather than filling it with a repeat. */
import { addDays, zonedToUtc } from "./schedule";
import { UNCLASSIFIED } from "./strategy";

export interface PlanItem {
  id: string;
  kind: "post" | "reel";
  bucket: string | null;
  sourceGroup: string;
  hook: string | null;
  campaignFirst: boolean;
}

export interface HistoryEntry {
  at: string;
  kind: "post" | "reel";
  bucket: string | null;
  sourceGroup: string;
  hook: string | null;
}

export interface StrategyPlanOptions {
  startDate: string;
  postTimes: string[];
  reelTime: string;
  reelsPerDay?: number;
  timeZone?: string;
  taken: Set<string>;
  notBefore: Date;
  history: HistoryEntry[];
  weights?: Partial<Record<string, number>>;
  cooldownDays?: number;
  minSpacingHours?: number;
  maxDays?: number;
}

export interface Shortage { at: string; kind: "post" | "reel"; reason: string }
export interface Held { id: string; reason: string }
export interface StrategyPlanResult { assignments: Map<string, string>; held: Held[]; shortages: Shortage[] }

const DAY = 86_400_000;

export function strategyPlan(items: PlanItem[], o: StrategyPlanOptions): StrategyPlanResult {
  const tz = o.timeZone ?? "Europe/Oslo";
  const maxDays = o.maxDays ?? 400;
  const cooldown = (o.cooldownDays ?? 0) * DAY;
  const sourceGap = Math.max(cooldown, DAY);
  const spacing = (o.minSpacingHours ?? 0) * 3_600_000;
  const taken = new Set(o.taken);
  const takenMs = [...taken].map((t) => new Date(t).getTime());
  const placed: (HistoryEntry & { ms: number })[] = o.history.map((h) => ({ ...h, ms: new Date(h.at).getTime() }));
  const assignments = new Map<string, string>();
  const held: Held[] = [];
  const w = (b: string | null) => Math.max(0, o.weights?.[b ?? UNCLASSIFIED] ?? 1);
  const pools = { post: items.filter((i) => i.kind === "post"), reel: items.filter((i) => i.kind === "reel") };
  const postTimes = o.postTimes.length ? o.postTimes : ["18:00"];
  const reelTimes = (o.reelsPerDay ?? 1) > 0 ? [o.reelTime] : [];
  if (!reelTimes.length) {
    for (const p of pools.reel) held.push({ id: p.id, reason: "Reels are capped at 0 per day in this preset" });
    pools.reel = [];
  }
  const short: Record<"post" | "reel", Shortage[]> = { post: [], reel: [] };
  const lastAt: Record<"post" | "reel", number> = { post: 0, reel: 0 };

  for (let d = 0; d < maxDays && (pools.post.length || pools.reel.length); d++) {
    // All of the day's slots, both kinds, in chronological order.
    const date = addDays(o.startDate, d);
    const slots = [
      ...postTimes.map((t) => ({ kind: "post" as const, at: zonedToUtc(date, t, tz) })),
      ...reelTimes.map((t) => ({ kind: "reel" as const, at: zonedToUtc(date, t, tz) })),
    ].sort((a, b) => a.at.getTime() - b.at.getTime());
    for (const { kind, at } of slots) {
      const pool = pools[kind];
      if (!pool.length) continue;
      const ms = at.getTime();
      const iso = at.toISOString();
      if (at <= o.notBefore || taken.has(iso)) continue;
      if (spacing && takenMs.some((x) => Math.abs(x - ms) < spacing)) continue;
      // Chronological neighbours of any kind (history may include later, already-dated items).
      const prev = placed.filter((h) => h.ms < ms).sort((a, b) => b.ms - a.ms)[0];
      const next = placed.filter((h) => h.ms > ms).sort((a, b) => a.ms - b.ms)[0];
      const reasons = new Set<string>();
      const eligible = pool.filter((it) => {
        for (const n of [prev, next]) {
          if (!n) continue;
          if (n.sourceGroup === it.sourceGroup && Math.abs(n.ms - ms) < sourceGap) return reasons.add("same source/session as the neighbouring item"), false;
          if (it.hook && n.hook === it.hook) return reasons.add("same hook as the neighbouring item"), false;
        }
        if (cooldown && placed.some((h) => h.sourceGroup === it.sourceGroup && Math.abs(h.ms - ms) < cooldown)) return reasons.add("source cooldown"), false;
        return true;
      });
      if (!eligible.length) {
        short[kind].push({ at: iso, kind, reason: `Left empty: ${[...reasons].join(", ") || "no eligible item"}` });
        continue;
      }
      const campaign = eligible.filter((e) => e.campaignFirst);
      const cands = campaign.length ? campaign : eligible;
      // Rotation counts only items of this kind dated before this slot.
      const prior = placed.filter((h) => h.kind === kind && h.ms < ms);
      const prevSame = prior.sort((a, b) => b.ms - a.ms)[0];
      const buckets = new Set(pool.map((p) => p.bucket ?? UNCLASSIFIED));
      const totalW = [...buckets].reduce((sum, b) => sum + w(b), 0) || 1;
      let best = cands[0]!;
      let bestScore = -Infinity;
      for (const c of cands) {
        const b = c.bucket ?? UNCLASSIFIED;
        const share = prior.length ? prior.filter((h) => (h.bucket ?? UNCLASSIFIED) === b).length / prior.length : 0;
        const score = w(b) / totalW - share - (prevSame && (prevSame.bucket ?? UNCLASSIFIED) === b ? 0.5 : 0);
        if (score > bestScore + 1e-9) (best = c), (bestScore = score);
      }
      pool.splice(pool.indexOf(best), 1);
      taken.add(iso);
      takenMs.push(ms);
      placed.push({ at: iso, ms, kind, bucket: best.bucket, sourceGroup: best.sourceGroup, hook: best.hook });
      assignments.set(best.id, iso);
      lastAt[kind] = ms;
    }
  }
  const shortages = (["post", "reel"] as const).flatMap((k) => short[k].filter((x) => new Date(x.at).getTime() < lastAt[k]));
  for (const k of ["post", "reel"] as const)
    for (const p of pools[k]) held.push({ id: p.id, reason: `No slot within ${maxDays} days satisfied source/hook/cooldown rules` });
  return { assignments, held, shortages };
}
