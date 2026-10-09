/** Pure per-business health check (no I/O, no AI). Reads what is already stored and lists problems. */
type A = { id: string; brand_slug: string; scheduled_at: string | null; skipped: boolean; approved: boolean };
type P = { asset_id: string; platform: string; status: string };

export interface BrandHealth {
  slug: string;
  missed: number;
  needsCheck: number;
  failed: number;
  notApproved: number;
  nextAt: string | null;
  daysLeft: number;
  connected: boolean;
  postingOn: boolean;
  problems: string[];
}

const DAY = 86_400_000;

export function brandHealth(
  slug: string,
  assets: A[],
  pubs: P[],
  o: { connected: boolean; postingOn: boolean; now: number },
): BrandHealth {
  const mine = assets.filter((a) => a.brand_slug === slug && !a.skipped);
  const ids = new Set(mine.map((a) => a.id));
  const my = pubs.filter((p) => ids.has(p.asset_id));
  const count = (s: string) => my.filter((p) => p.status === s).length;
  const future = mine.filter((a) => a.scheduled_at && new Date(a.scheduled_at).getTime() > o.now).sort((a, b) => a.scheduled_at!.localeCompare(b.scheduled_at!));
  const last = future.at(-1)?.scheduled_at;
  const h: BrandHealth = {
    slug,
    missed: count("missed"),
    needsCheck: count("unknown"),
    failed: count("failed"),
    notApproved: future.filter((a) => !a.approved).length,
    nextAt: future[0]?.scheduled_at ?? null,
    daysLeft: last ? Math.max(0, Math.ceil((new Date(last).getTime() - o.now) / DAY)) : 0,
    connected: o.connected,
    postingOn: o.postingOn,
    problems: [],
  };
  if (h.missed) h.problems.push(`${h.missed} missed — reschedule or skip in Calendar`);
  if (h.needsCheck) h.problems.push(`${h.needsCheck} need your check on Meta`);
  if (h.failed) h.problems.push(`${h.failed} failed to post`);
  if (h.notApproved) h.problems.push(`${h.notApproved} dated but not approved`);
  if (o.postingOn && !o.connected) h.problems.push("Posting is on but the connection isn't confirmed");
  if (o.postingOn && h.daysLeft < 3) h.problems.push(future.length ? `Only ${h.daysLeft} day(s) of content left` : "Nothing scheduled");
  return h;
}
