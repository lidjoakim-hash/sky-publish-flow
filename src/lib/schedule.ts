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
 * Assigns daily slots per type. Posts fill each of the daily post times in order (e.g. three posts
 * a day), Reels get one daily slot; the two types are scheduled independently. Occupied and past
 * slots are skipped (no collisions, no bursts of backlog).
 */
export function assignSchedule<T extends SchedulableItem>(items: T[], opts: ScheduleOptions): Map<string, string> {
  const tz = opts.timeZone ?? "Europe/Oslo";
  const postTimes = opts.postTimes.length ? opts.postTimes : ["18:00"];
  const result = new Map<string, string>();
  for (const kind of ["post", "reel"] as const) {
    let list = items.filter((i) => i.kind === kind);
    if (opts.topicMixing) list = mixTopics(list);
    let k = 0;
    for (const item of list) {
      for (;;) {
        const day = kind === "post" ? Math.floor(k / postTimes.length) : k;
        const time = kind === "post" ? postTimes[k % postTimes.length]! : opts.reelTime;
        const slot = zonedToUtc(addDays(opts.startDate, day), time, tz);
        k++;
        const iso = slot.toISOString();
        if (slot <= opts.notBefore || opts.taken.has(iso)) continue;
        result.set(item.id, iso);
        break;
      }
    }
  }
  return result;
}
