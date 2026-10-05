import type { Asset, Publication } from "./queries";
import { assignSchedule } from "./schedule";

/** An item is locked once any platform has gone past "waiting": its slot and records are preserved. */
export function lockedAssetIds(pubs: Publication[]): Set<string> {
  return new Set(pubs.filter((p) => !["pending", "retry", "skipped"].includes(p.status)).map((p) => p.asset_id));
}

export interface PlanInput {
  assets: Asset[];
  pubs: Publication[];
  startDate: string;
  postTime: string;
  reelTime: string;
  timeZone: string;
  topicMixing: boolean;
  /** "append": only undated items; "reschedule": all unlocked items; "missed": unlocked items whose slot already passed */
  mode: "append" | "reschedule" | "missed";
  now?: Date;
}

export function planSchedule(i: PlanInput): Map<string, string> {
  const now = i.now ?? new Date();
  const locked = lockedAssetIds(i.pubs);
  const active = i.assets.filter((a) => !a.skipped && a.upload_state === "done");
  const moving = active.filter((a) => {
    if (locked.has(a.id)) return false;
    if (i.mode === "append") return !a.scheduled_at;
    if (i.mode === "missed") return !!a.scheduled_at && new Date(a.scheduled_at) <= now;
    return true;
  });
  const movingIds = new Set(moving.map((a) => a.id));
  const taken = new Set(i.assets.filter((a) => a.scheduled_at && !movingIds.has(a.id)).map((a) => new Date(a.scheduled_at!).toISOString()));
  const ordered = [...moving].sort((a, b) => Number(b.campaign_first) - Number(a.campaign_first) || a.sort_index - b.sort_index);
  return assignSchedule(
    ordered.map((a) => ({ id: a.id, kind: a.kind as "reel" | "post", topics: a.topics })),
    { startDate: i.startDate, postTime: i.postTime.slice(0, 5), reelTime: i.reelTime.slice(0, 5), timeZone: i.timeZone, taken, notBefore: now, topicMixing: i.topicMixing },
  );
}
