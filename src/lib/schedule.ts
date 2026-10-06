/** Scheduling in a named time zone (default Europe/Oslo), DST-aware, no external deps. */

function tzOffsetMinutes(utcMs: number, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = Object.fromEntries(dtf.formatToParts(new Date(utcMs)).map((p) => [p.type, p.value]));
  const asUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
  return Math.round((asUtc - utcMs) / 60000);
}

/** Converts a wall-clock date ("2026-10-25") + time ("19:00") in a zone to a UTC Date. */
export function zonedToUtc(date: string, time: string, timeZone = "Europe/Oslo"): Date {
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  let off = tzOffsetMinutes(guess, timeZone);
  let utc = guess - off * 60000;
  const off2 = tzOffsetMinutes(utc, timeZone);
  if (off2 !== off) utc = guess - off2 * 60000;
  return new Date(utc);
}

export function addDays(date: string, n: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return t.toISOString().slice(0, 10);
}

export function formatOslo(iso: string | Date, timeZone = "Europe/Oslo"): string {
  return new Intl.DateTimeFormat("nb-NO", {
    timeZone,
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(typeof iso === "string" ? new Date(iso) : iso);
}

export function osloDateKey(iso: string | Date, timeZone = "Europe/Oslo"): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(
    typeof iso === "string" ? new Date(iso) : iso,
  );
}

export interface SchedulableItem {
  id: string;
  kind: "reel" | "post";
  topics?: string[];
}

export interface ScheduleOptions {
  startDate: string;
  /** Daily image-post slots, in order (e.g. ["09:00", "13:00", "18:00"] = three posts a day). */
  postTimes: string[];
  reelTime: string;
  timeZone?: string;
  /** UTC ISO strings already occupied (published, partially published, or scheduled items not being moved). */
  taken: Set<string>;
  /** Slots must be strictly after this instant. */
  notBefore: Date;
  topicMixing?: boolean;
}

/** Reorders so consecutive items avoid sharing the first topic label where possible (stable otherwise). */
export function mixTopics<T extends SchedulableItem>(items: T[]): T[] {
  const pool = [...items];
  const out: T[] = [];
  let last: string | undefined;
  while (pool.length) {
    const idx = pool.findIndex((i) => (i.topics?.[0] ?? "") !== last || !last);
    const pick = pool.splice(idx < 0 ? 0 : idx, 1)[0];
    out.push(pick);
    last = pick.topics?.[0];
  }
  return out;
}

/**
 * Deterministic "human" offset for a slot: -max..+max minutes, never 0, derived from the slot itself
 * (date + time + kind). Same slot -> same offset, so the server can recompute a previewed plan exactly
 * and collision checks still work, while times vary from day to day.
 */
export function slotJitterMinutes(baseIso: string, kind: string, max: number): number {
  if (max <= 0) return 0;
  let h = 2166136261;
  for (const c of baseIso + kind) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  const n = (h >>> 0) % (2 * max);
  return n < max ? n - max : n - max + 1;
}

export function jitteredSlot(date: string, time: string, timeZone: string, kind: string, max = 0): Date {
  const base = zonedToUtc(date, time, timeZone);
  return new Date(base.getTime() + slotJitterMinutes(base.toISOString(), kind, max) * 60_000);
}

/**
 * Assigns daily slots per type. Posts fill each of the daily post times in order (e.g. three posts
 * a day), Reels get one daily slot; the two types are scheduled independently. Occupied and past
 * slots are skipped (no collisions, no bursts of backlog).
 */
export function assignSchedule<T extends SchedulableItem>(items: T[], opts: ScheduleOptions): Map<string, string> {
  const tz = opts.timeZone ?? "Europe/Oslo";
  const postTimes = opts.postTimes.length ? opts.postTimes : ["18:00"];
  const result = new Map<string, string>();
  // Track slots assigned in this run too, so a post time equal to the Reel time (or a repeated
  // post time) never puts two items in the same instant.
  const taken = new Set(opts.taken);
  for (const kind of ["post", "reel"] as const) {
    let list = items.filter((i) => i.kind === kind);
    if (opts.topicMixing) list = mixTopics(list);
    let k = 0;
    for (const item of list) {
      for (;;) {
        const day = kind === "post" ? Math.floor(k / postTimes.length) : k;
        const time = kind === "post" ? postTimes[k % postTimes.length]! : opts.reelTime;
        const slot = jitteredSlot(addDays(opts.startDate, day), time, tz, kind, opts.jitterMinutes ?? 0);
        k++;
        const iso = slot.toISOString();
        if (slot <= opts.notBefore || taken.has(iso)) continue;
        taken.add(iso);
        result.set(item.id, iso);
        break;
      }
    }
  }
  return result;
}
