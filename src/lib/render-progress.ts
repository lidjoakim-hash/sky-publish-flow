/** Presentation-only estimates from observed worker progress, never simulated progress. */
export type ProgressJob = { id: string; status: string; progress: number; updated_at: string; file_name?: string };
export type ProgressSample = { firstAt: number; firstValue: number; lastAt: number; lastValue: number };
export const renderSettled = (status: string) => ["completed", "failed", "cancelled"].includes(status);
export function renderJobPercent(job: ProgressJob) {
  if (job.status === "completed") return 100;
  const reported = Math.min(100, Math.max(0, Math.round(job.progress)));
  if (job.status === "queued") return 0;
  return job.status === "processing" ? Math.min(99, reported) : reported;
}
export function renderJobLabel(job: ProgressJob) {
  if (job.status === "completed") return "Completed";
  if (job.status === "failed") return "Failed";
  if (job.status === "cancelled") return "Cancelled";
  if (job.status === "processing") return `Rendering · ${renderJobPercent(job)}%`;
  return "Queued · 0%";
}
export function renderFraction(job: ProgressJob) {
  return renderSettled(job.status) ? 1 : job.status === "processing" ? Math.min(0.99, Math.max(0, job.progress / 100)) : 0;
}
export function observeRenderProgress(jobs: ProgressJob[], previous: Map<string, ProgressSample>, now: number) {
  const samples = new Map(previous);
  for (const job of jobs) {
    const value = renderFraction(job);
    if (job.status !== "processing" && job.status !== "completed") continue;
    const old = samples.get(job.id);
    if (!old || value < old.lastValue) {
      if (job.status === "processing") samples.set(job.id, { firstAt: now, firstValue: value, lastAt: now, lastValue: value });
    } else if (value > old.lastValue) {
      samples.set(job.id, { ...old, lastAt: now, lastValue: value });
    }
  }
  return samples;
}
export function summarizeRenderProgress(jobs: ProgressJob[], samples: Map<string, ProgressSample>, now: number) {
  const done = jobs.filter((j) => j.status === "completed").length;
  const failed = jobs.filter((j) => j.status === "failed").length;
  const cancelled = jobs.filter((j) => j.status === "cancelled").length;
  const processing = jobs.filter((j) => j.status === "processing");
  const remaining = jobs.reduce((n, j) => n + 1 - renderFraction(j), 0);
  const units = jobs.reduce((n, j) => n + renderFraction(j), 0);
  const rates = jobs.flatMap((j) => {
    const s = samples.get(j.id);
    if (!s || s.lastAt - s.firstAt < 1000 || s.lastValue <= s.firstValue) return [];
    return [(s.lastAt - s.firstAt) / (s.lastValue - s.firstValue)];
  }).sort((a, b) => a - b);
  const stale = processing.some((j) => now - Date.parse(j.updated_at) > 30_000);
  const estimatedMs = remaining === 0 ? 0 : !processing.length || stale || !rates.length ? null : remaining * rates[Math.floor(rates.length / 2)] / processing.length;
  return { done, failed, cancelled, processing: processing.length, queued: jobs.filter((j) => j.status === "queued").length, percent: jobs.length ? Math.floor(units / jobs.length * 100) : 0, settled: remaining === 0, estimatedMs, stale };
}
export function formatRenderEta(ms: number | null) {
  if (ms === null) return "Calculating…";
  if (ms === 0) return "Finished";
  const minutes = Math.max(1, Math.ceil(ms / 60_000));
  return minutes < 60 ? `About ${minutes} min` : `About ${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}