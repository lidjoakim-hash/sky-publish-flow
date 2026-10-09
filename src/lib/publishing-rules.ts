/** Pure publishing/schedule rules shared by the UI, server and tests. No I/O. */
import { reelAudioOk } from "./audio";
import { formatOslo } from "./schedule";

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Returns an error message, or null when the daily times are valid. Mirrors the settings DB trigger. */
export function validateDailyTimes(postTimes: string[], reelTime: string): string | null {
  if (!postTimes.length) return "Add at least one post time.";
  const reel = reelTime.slice(0, 5);
  for (let i = 0; i < postTimes.length; i++) {
    const t = postTimes[i]!;
    if (!HHMM.test(t)) return `Post time "${t}" must be HH:MM.`;
    if (i > 0 && t <= postTimes[i - 1]!) return "Post times must be different and in order (earliest first).";
    if (t === reel) return `Post time ${t} is the same as the Reel time.`;
  }
  if (!HHMM.test(reel)) return `Reel time "${reelTime}" must be HH:MM.`;
  return null;
}

/** Per-business daily times: any number of posts and Reels, each HH:MM, ascending, no time used twice. */
export function validateBrandTimes(postTimes: string[], reelTimes: string[]): string | null {
  if (!postTimes.length && !reelTimes.length) return "Add at least one post or Reel time.";
  if (postTimes.length > 12 || reelTimes.length > 6) return "At most 12 posts and 6 Reels a day.";
  for (const [list, name] of [[postTimes, "Post"], [reelTimes, "Reel"]] as const)
    for (let i = 0; i < list.length; i++) {
      if (!HHMM.test(list[i]!)) return `${name} time "${list[i]}" must be HH:MM.`;
      if (i > 0 && list[i]! <= list[i - 1]!) return `${name} times must be different and in order (earliest first).`;
    }
  const clash = postTimes.find((t) => reelTimes.includes(t));
  return clash ? `${clash} is used for both a post and a Reel.` : null;
}

/** Publication statuses that may still be (re)planned. Anything else is locked. */
export const REPLANNABLE = ["pending", "retry", "skipped", "missed"] as const;

/** Claims only reach back this far; older unsent slots become "missed" and are never posted late. */
export const MISSED_AFTER_MS = 3 * 3_600_000;
export function isMissed(scheduledAt: string, status: string, hasRemoteId: boolean, now: Date): boolean {
  return (status === "pending" || status === "retry") && !hasRemoteId && new Date(scheduledAt).getTime() < now.getTime() - MISSED_AFTER_MS;
}
export const missedAlertMessage = (fileName: string, at: string) => `Missed slot: ${fileName} was not posted at ${formatOslo(at)}`;

interface ActivationItem { approved: boolean; upload_state: string; caption: string | null; kind: string; audio_state: string }
/** Only approved items are checked; unapproved ones are simply never claimed. */
export function activationBlockers<T extends ActivationItem>(items: T[]): T[] {
  return items.filter((a) => a.approved && (a.upload_state !== "done" || !a.caption || (a.kind === "reel" && !reelAudioOk(a.audio_state))));
}

/** Rendered Reels must reach a reasonable loudness (target -14 LUFS). Unknown loudness is not a failure. */
export const MIN_RENDER_LUFS = -20;
export const loudnessOk = (lufs: number | null | undefined) => lufs == null || lufs >= MIN_RENDER_LUFS;
