import type { Asset } from "./queries";
import { osloDateKey } from "./schedule";
import { readiness } from "./readiness";

export function addDays(key: string, n: number) {
  const d = new Date(key + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function moveMonth(key: string, n: number) {
  const d = new Date(key.slice(0, 7) + "-01T12:00:00Z");
  d.setUTCMonth(d.getUTCMonth() + n);
  return d.toISOString().slice(0, 10);
}

export function monthDays(key: string) {
  const first = key.slice(0, 7) + "-01";
  const offset = (new Date(first + "T12:00:00Z").getUTCDay() + 6) % 7;
  const last = addDays(moveMonth(first, 1), -1);
  const length = Math.ceil((offset + Number(last.slice(8))) / 7) * 7;
  return Array.from({ length }, (_, i) => addDays(first, i - offset));
}

/** Include every scheduled item for this business, including history; never limit the calendar. */
export function calendarItems<T extends { id: string; brand_slug: string; skipped: boolean; scheduled_at: string | null }>(items: T[], slug: string) {
  const byDay = new Map<string, T[]>();
  const sorted = items.filter((a) => a.brand_slug === slug && !a.skipped && a.scheduled_at)
    .sort((a, b) => (a.scheduled_at ?? "").localeCompare(b.scheduled_at ?? "") || a.id.localeCompare(b.id));
  for (const a of sorted) {
    if (!a.scheduled_at) continue;
    const key = osloDateKey(a.scheduled_at);
    const list = byDay.get(key) ?? [];
    list.push(a);
    byDay.set(key, list);
  }
  return byDay;
}

export const publicationLabel = (status: string) => ({
  pending: "Queued", retry: "Retry pending", sending: "Sending", processing: "Processing",
  published: "Published", unknown: "Needs your check", missed: "Missed", failed: "Failed",
  skipped: "Skipped", needs_finish: "Finish in Instagram",
}[status] ?? status);

/** Readiness describes preparation only; completed or interrupted sends must never appear ready. */
export function preparationLabels(asset: Asset, statuses: string[]) {
  const issues = readiness(asset);
  const terminal = statuses.some((s) => !["pending", "retry", "skipped", "missed"].includes(s));
  return {
    approval: asset.approved ? "Approved" : "Not approved",
    issues,
    ready: asset.approved && !issues.length && !terminal,
  };
}