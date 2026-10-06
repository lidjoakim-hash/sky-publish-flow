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
  postTimes: string[];
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
    { startDate: i.startDate, postTimes: i.postTimes.map((t) => t.slice(0, 5)), reelTime: i.reelTime.slice(0, 5), timeZone: i.timeZone, taken, notBefore: now, topicMixing: i.topicMixing },
  );
}

import { strategyPlan, type HistoryEntry, type StrategyPlanResult } from "./planner";
import { sourceGroupOf, type BrandStrategy } from "./strategy";

export interface StrategyPlanInput extends PlanInput {
  brand: string;
  strategy: BrandStrategy;
}

/** Strategy-aware variant of planSchedule. Only touches assets of one brand; other brands' slots stay taken. */
export function planWithStrategy(i: StrategyPlanInput): StrategyPlanResult {
  const now = i.now ?? new Date();
  const locked = lockedAssetIds(i.pubs);
  const brandAssets = i.assets.filter((a) => (a.brand_slug ?? "skyline") === i.brand);
  const active = brandAssets.filter((a) => !a.skipped && a.upload_state === "done");
  const held: StrategyPlanResult["held"] = [];
  const moving = active.filter((a) => {
    if (locked.has(a.id)) return false;
    if (i.mode === "append" && a.scheduled_at) return false;
    if (i.mode === "missed" && !(a.scheduled_at && new Date(a.scheduled_at) <= now)) return false;
    if (a.review_status === "reject") return held.push({ id: a.id, reason: "Marked “Do not use”" }), false;
    if (a.review_status === "needs_work") return held.push({ id: a.id, reason: "Marked “Needs work”" }), false;
    return true;
  });
  const movingIds = new Set(moving.map((a) => a.id));
  const fixed = i.assets.filter((a) => a.scheduled_at && !movingIds.has(a.id));
  const taken = new Set(fixed.map((a) => new Date(a.scheduled_at!).toISOString()));
  const history: HistoryEntry[] = fixed
    .filter((a) => (a.brand_slug ?? "skyline") === i.brand)
    .map((a) => ({ at: new Date(a.scheduled_at!).toISOString(), kind: a.kind as "post" | "reel", bucket: a.bucket, sourceGroup: sourceGroupOf(a), hook: a.hooks?.[0] ?? null }));
  const ordered = [...moving].sort((a, b) => Number(b.campaign_first) - Number(a.campaign_first) || a.sort_index - b.sort_index);
  const q = i.strategy.qualityPreset?.enabled ? i.strategy.qualityPreset : null;
  const postTimes = i.postTimes.map((t) => t.slice(0, 5)).slice(0, q ? Math.max(0, q.postsPerDay) : undefined);
  const res = strategyPlan(
    ordered.map((a) => ({ id: a.id, kind: a.kind as "post" | "reel", bucket: a.bucket, sourceGroup: sourceGroupOf(a), hook: a.hooks?.[0] ?? null, campaignFirst: a.campaign_first })),
    {
      startDate: i.startDate,
      postTimes,
      reelTime: i.reelTime.slice(0, 5),
      reelsPerDay: q ? q.reelsPerDay : 1,
      timeZone: i.timeZone,
      taken,
      notBefore: now,
      history,
      weights: i.strategy.weights ?? {},
      cooldownDays: i.strategy.cooldownDays ?? 0,
      minSpacingHours: q?.minSpacingHours ?? 0,
    },
  );
  return { ...res, held: [...held, ...res.held] };
}
