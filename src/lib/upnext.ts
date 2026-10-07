/** Pure rules for the Up next page: content runway and swap-candidate choice. No I/O. */
import { REPLANNABLE } from "./publishing-rules";

type Item = { id: string; kind: string; scheduled_at: string | null; skipped: boolean };
type Pub = { asset_id: string; status: string };

const dayNum = (key: string) => Date.UTC(+key.slice(0, 4), +key.slice(5, 7) - 1, +key.slice(8, 10)) / 86400000;

/** Days of content left counting today, per kind. lastKey = Oslo date key of last scheduled item. */
export function runway(items: Item[], todayKey: string, keyOf: (iso: string) => string, nowMs: number) {
  const future = items.filter((a) => !a.skipped && a.scheduled_at && new Date(a.scheduled_at).getTime() >= nowMs);
  const last = (kind?: string) => {
    const xs = future.filter((a) => !kind || a.kind === kind).map((a) => a.scheduled_at!).sort();
    return xs.length ? keyOf(xs[xs.length - 1]) : null;
  };
  const days = (k: string | null) => (k ? dayNum(k) - dayNum(todayKey) + 1 : 0);
  const posts = last("post"), reels = last("reel"), all = last();
  return {
    days: days(all),
    lastKey: all,
    postDays: days(posts),
    reelDays: days(reels),
    postsLeft: future.filter((a) => a.kind === "post").length,
    reelsLeft: future.filter((a) => a.kind === "reel").length,
  };
}

/** An item can move only if none of its platform records went past "waiting". */
export function canMove(id: string, pubs: Pub[]) {
  return pubs.filter((p) => p.asset_id === id).every((p) => (REPLANNABLE as readonly string[]).includes(p.status));
}

/** The latest-scheduled movable item of the same kind, later than the target — it takes the target's slot. */
export function swapCandidate<T extends Item>(target: Item, items: T[], pubs: Pub[]): T | null {
  if (!target.scheduled_at) return null;
  const xs = items
    .filter((a) => a.id !== target.id && a.kind === target.kind && !a.skipped && a.scheduled_at && a.scheduled_at > target.scheduled_at! && canMove(a.id, pubs))
    .sort((a, b) => b.scheduled_at!.localeCompare(a.scheduled_at!));
  return xs[0] ?? null;
}
