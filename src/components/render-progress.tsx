import { useEffect, useRef, useState } from "react";
import { Check, Clock3, LoaderCircle, TriangleAlert } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { formatRenderEta, observeRenderProgress, summarizeRenderProgress, type ProgressJob, type ProgressSample } from "@/lib/render-progress";

export function RenderProgress({ jobs, loading, error }: { jobs: ProgressJob[]; loading?: boolean; error?: boolean }) {
  const samples = useRef(new Map<string, ProgressSample>());
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    samples.current = observeRenderProgress(jobs, samples.current, Date.now());
    setNow(Date.now());
  }, [jobs]);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const summary = summarizeRenderProgress(jobs, samples.current, now);
  const active = !summary.settled || loading;
  const heading = loading ? "Preparing your render queue…" : summary.settled ? "Rendering finished" : summary.processing ? "Rendering your Reels" : "Waiting for render worker";
  return (
    <section aria-label="Rendering progress" className="render-progress-panel mt-4 border-t pt-4">
      <div className="flex items-center gap-4">
        <div className="relative size-24 shrink-0">
          <svg viewBox="0 0 100 100" className="size-full -rotate-90" role="progressbar" aria-label="Render completion" aria-valuemin={0} aria-valuemax={100} aria-valuenow={summary.percent}>
            <circle cx="50" cy="50" r="43" fill="none" stroke="currentColor" strokeWidth="6" className="text-muted" />
            <circle cx="50" cy="50" r="43" fill="none" stroke="currentColor" strokeWidth="6" pathLength="100" strokeDasharray="100" strokeDashoffset={100 - summary.percent} strokeLinecap="round" className="render-completion-ring text-teal" />
          </svg>
          {active && <div className="render-orbit absolute inset-0 rounded-full border border-dashed border-teal/40" aria-hidden="true" />}
          <div className="absolute inset-0 flex flex-col items-center justify-center"><span className="font-display text-2xl font-bold tabular-nums">{summary.percent}%</span><span className="text-[10px] text-muted-foreground">processed</span></div>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-sm font-semibold">{active ? <LoaderCircle className="size-4 shrink-0 motion-safe:animate-spin text-teal" /> : <Check className="size-4 shrink-0 text-success" />}<span>{heading}</span></div>
          <p className="mt-1 text-xs text-muted-foreground">{summary.done} of {jobs.length} Reels completed</p>
          <div className="mt-2 flex items-center gap-1.5 text-xs"><Clock3 className="size-3.5 shrink-0 text-teal" /><span>Estimated remaining: <strong>{error ? "Unavailable" : loading || !summary.settled && !summary.processing ? "Waiting for worker" : summary.stale ? "Waiting for progress update" : formatRenderEta(summary.estimatedMs)}</strong></span></div>
        </div>
      </div>
      <div className="relative mt-4 overflow-hidden rounded-full"><Progress value={summary.percent} className="h-2.5 [&>div]:bg-teal [&>div]:duration-1000" />{active && summary.processing > 0 && <div className="render-bar-shimmer pointer-events-none absolute inset-0 bg-teal/20" />}</div>
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground"><span>{summary.processing} rendering</span><span>{summary.queued} queued</span>{summary.failed > 0 && <span className="text-destructive">{summary.failed} failed</span>}{summary.cancelled > 0 && <span>{summary.cancelled} cancelled</span>}</div>
      {error && <p className="mt-2 flex gap-1 text-xs text-destructive"><TriangleAlert className="size-3.5 shrink-0" />Progress could not be refreshed. Retrying…</p>}
      {!loading && !summary.settled && !summary.processing && <p className="mt-2 text-xs text-muted-foreground">Your render worker must be running on your computer. The estimate appears after progress updates arrive.</p>}
    </section>
  );
}