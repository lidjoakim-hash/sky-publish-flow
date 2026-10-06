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
  const spacing = (o.minSpacingHours ?? 0) * 3_600_000;
  const taken = new Set(o.taken);
  const takenMs = [...taken].map((t) => new Date(t).getTime());
  const placed: HistoryEntry[] = [...o.history];
  const assignments = new Map<string, string>();
  const shortages: Shortage[] = [];
  const held: Held[] = [];
  const w = (b: string | null) => Math.max(0, o.weights?.[b ?? UNCLASSIFIED] ?? 1);

  for (const kind of ["post", "reel"] as const) {
    const pool = items.filter((i) => i.kind === kind);
    const times = kind === "post" ? (o.postTimes.length ? o.postTimes : ["18:00"]) : (o.reelsPerDay ?? 1) > 0 ? [o.reelTime] : [];
    if (!times.length) {
      for (const p of pool) held.push({ id: p.id, reason: "Reels are capped at 0 per day in this preset" });
      continue;
    }
    const kindShort: Shortage[] = [];
    let lastAssignedAt = 0;
    for (let d = 0; d < maxDays && pool.length; d++) {
      for (const t of times) {
        if (!pool.length) break;
        const slot = zonedToUtc(addDays(o.startDate, d), t, tz);
        const ms = slot.getTime();
        const iso = slot.toISOString();
        if (slot <= o.notBefore || taken.has(iso)) continue;
        if (spacing && takenMs.some((x) => Math.abs(x - ms) < spacing)) continue;
        const prev = placed.filter((h) => h.kind === kind && new Date(h.at).getTime() < ms).sort((a, b) => b.at.localeCompare(a.at))[0];
        const reasons = new Set<string>();
        const eligible = pool.filter((it) => {
          // Back-to-back repeats of one source are allowed only after a full day (or the cooldown) has passed.
          if (prev && prev.sourceGroup === it.sourceGroup && ms - new Date(prev.at).getTime() < Math.max(cooldown, DAY)) return reasons.add("same source/session as the previous item"), false;
          if (prev && it.hook && prev.hook === it.hook) return reasons.add("same hook as the previous item"), false;
          if (cooldown && placed.some((h) => h.sourceGroup === it.sourceGroup && Math.abs(new Date(h.at).getTime() - ms) < cooldown))
            return reasons.add("source cooldown"), false;
          return true;
        });
        if (!eligible.length) {
          kindShort.push({ at: iso, kind, reason: `Left empty: ${[...reasons].join(", ") || "no eligible item"}` });
          continue;
        }
        const campaign = eligible.filter((e) => e.campaignFirst);
        const cands = campaign.length ? campaign : eligible;
        const sameKind = placed.filter((h) => h.kind === kind);
        const buckets = new Set(pool.map((p) => p.bucket ?? UNCLASSIFIED));
        const totalW = [...buckets].reduce((s, b) => s + w(b), 0) || 1;
        let best = cands[0]!;
        let bestScore = -Infinity;
        for (const c of cands) {
          const b = c.bucket ?? UNCLASSIFIED;
          const share = sameKind.length ? sameKind.filter((h) => (h.bucket ?? UNCLASSIFIED) === b).length / sameKind.length : 0;
          const score = w(b) / totalW - share - (prev && (prev.bucket ?? UNCLASSIFIED) === b ? 0.5 : 0);
          if (score > bestScore + 1e-9) (best = c), (bestScore = score);
        }
        pool.splice(pool.indexOf(best), 1);
        taken.add(iso);
        takenMs.push(ms);
        placed.push({ at: iso, kind, bucket: best.bucket, sourceGroup: best.sourceGroup, hook: best.hook });
        assignments.set(best.id, iso);
        lastAssignedAt = ms;
      }
    }
    // Only gaps inside the planned range are real shortages.
    shortages.push(...kindShort.filter((s) => new Date(s.at).getTime() < lastAssignedAt));
    for (const p of pool) held.push({ id: p.id, reason: `No slot within ${maxDays} days satisfied source/hook/cooldown rules` });
  }
  return { assignments, held, shortages };
}
