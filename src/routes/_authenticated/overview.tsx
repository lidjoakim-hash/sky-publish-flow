import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { CheckCircle2, Circle, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader, Panel, Stat } from "@/components/app-ui";
import { supabase } from "@/integrations/supabase/client";
import { alertsQuery, assetsQuery, connectionQuery, publicationsQuery, settingsQuery, jobsQuery } from "@/lib/queries";
import { formatOslo } from "@/lib/schedule";
import { reelAudioOk } from "@/lib/audio";
import { lockedAssetIds } from "@/lib/plan";
import { readiness } from "@/lib/readiness";
import { bucketLabel, sourceGroupOf } from "@/lib/strategy";
import { metricsQuery } from "@/lib/queries";
import { useActiveBrand } from "@/components/brand";
import { MissedPanel } from "@/components/missed";

export const Route = createFileRoute("/_authenticated/overview")({
  head: () => ({ meta: [{ title: "Overview — Skyline Publisher" }, { name: "description", content: "Remaining posts, next publication and setup tasks." }, { property: "og:title", content: "Overview — Skyline Publisher" }, { property: "og:description", content: "Remaining posts, next publication and setup tasks." }] }),
  component: Overview,
});

function Overview() {
  const qc = useQueryClient();
  const { data: assets = [] } = useQuery(assetsQuery);
  const { data: pubs = [] } = useQuery(publicationsQuery);
  const { data: settings } = useQuery(settingsQuery);
  const { data: conn } = useQuery(connectionQuery);
  const { data: alerts = [] } = useQuery(alertsQuery);
  const { data: jobs = [] } = useQuery(jobsQuery);
  const { data: metrics = [] } = useQuery(metricsQuery);
  const { slug, brand } = useActiveBrand();
  const st = useMemo(() => {
    const now = Date.now();
    const mine = assets.filter((a) => a.brand_slug === slug && !a.skipped);
    const future = mine.filter((a) => a.scheduled_at && new Date(a.scheduled_at).getTime() > now).sort((a, b) => a.scheduled_at!.localeCompare(b.scheduled_at!));
    const last = future[future.length - 1]?.scheduled_at;
    const days = last ? Math.ceil((new Date(last).getTime() - now) / 86_400_000) : 0;
    const ready = future.filter((a) => a.approved && readiness(a).every((r) => r.startsWith("Seasonal"))).length;
    const blocked = future.filter((a) => readiness(a).some((r) => !r.startsWith("Seasonal"))).length;
    const mix = new Map<string, number>();
    for (const a of future.slice(0, 28)) mix.set(bucketLabel(a.bucket), (mix.get(bucketLabel(a.bucket)) ?? 0) + 1);
    const unplanned = mine.filter((a) => !a.scheduled_at);
    const sources = new Set(unplanned.map((a) => sourceGroupOf(a))).size;
    const lastJob = jobs.map((j) => j.updated_at).sort().pop();
    return { days, ready, blocked, mix, unplanned: unplanned.length, sources, unclassified: mine.filter((a) => !a.bucket).length, workerRecent: !!lastJob && now - new Date(lastJob).getTime() < 15 * 60_000, snaps: metrics.filter((m) => m.brand_slug === slug).length };
  }, [assets, jobs, metrics, slug]);

  const s = useMemo(() => {
    const active = assets.filter((a) => !a.skipped);
    const fullyDone = new Set(
      active.filter((a) => pubs.filter((p) => p.asset_id === a.id && p.status === "published").length === 2).map((a) => a.id),
    );
    const locked = lockedAssetIds(pubs);
    const now = Date.now();
    const upcoming = active.filter((a) => a.scheduled_at && new Date(a.scheduled_at).getTime() > now).sort((a, b) => a.scheduled_at!.localeCompare(b.scheduled_at!));
    const reels = active.filter((a) => a.kind === "reel");
    return {
      postsLeft: active.filter((a) => a.kind === "post" && !fullyDone.has(a.id)).length,
      reelsLeft: reels.filter((a) => !fullyDone.has(a.id)).length,
      next: upcoming[0],
      audioReady: reels.filter((r) => reelAudioOk(r.audio_state)).length,
      reels: reels.length,
      missed: active.filter((a) => a.scheduled_at && new Date(a.scheduled_at).getTime() < now && !locked.has(a.id)).length,
      failures: pubs.filter((p) => p.status === "failed" || p.status === "unknown").length,
      uploading: active.filter((a) => a.upload_state !== "done").length,
      rendering: jobs.filter((j) => j.status === "queued" || j.status === "processing").length,
      dated: active.filter((a) => a.scheduled_at).length,
      approved: active.filter((a) => a.approved).length,
    };
  }, [assets, pubs, jobs]);

  const steps = [
    { done: assets.length > 0, label: "Add your batch", to: "/import" },
    { done: s.reels > 0 && s.audioReady === s.reels, label: "Give every Reel audible audio", to: "/audio" },
    { done: s.dated > 0 && s.dated === assets.filter((a) => !a.skipped).length, label: "Assign dates", to: "/calendar" },
    { done: s.dated > 0 && s.approved === s.dated, label: "Review and approve", to: "/calendar" },
    { done: conn?.status === "connected", label: "Connect Facebook Page and Instagram", to: "/connections" },
    { done: !!settings?.publishing_active, label: "Activate publishing", to: "/calendar" },
  ] as const;

  async function dismiss(id: string) {
    await supabase.from("alerts").update({ read: true }).eq("id", id);
    qc.invalidateQueries({ queryKey: ["alerts"] });
  }

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="Overview" subtitle="Add batch → Prepare → Review schedule → Activate" actions={<Button asChild variant="teal"><Link to="/import">Add batch</Link></Button>} />
      {alerts.length > 0 && (
        <div className="mb-4 space-y-2">
          {alerts.map((a) => (
            <div key={a.id} className={`flex items-start gap-3 rounded-lg border p-3 text-sm ${a.level === "error" ? "border-destructive/40 bg-destructive/5" : "border-warning/50 bg-warning/10"}`}>
              <span className="flex-1">{a.message}</span>
              <button onClick={() => dismiss(a.id)} aria-label="Dismiss"><X className="size-4" /></button>
            </div>
          ))}
        </div>
      )}
      <MissedPanel assets={assets} pubs={pubs} />
      <Panel title={`Strategy readiness · ${brand?.name ?? slug}`} className="mb-4">
        <div className="grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
          <div><div className="text-xs text-muted-foreground">Queue coverage</div><div className="font-display text-xl font-bold">{st.days} days</div></div>
          <div><div className="text-xs text-muted-foreground">Approved & ready / blocked</div><div className="font-display text-xl font-bold"><span className="text-teal">{st.ready}</span> / <span className="text-warning-foreground">{st.blocked}</span></div></div>
          <div><div className="text-xs text-muted-foreground">Unplanned items / distinct sources</div><div className="font-display text-xl font-bold">{st.unplanned} / {st.sources}</div></div>
          <div><div className="text-xs text-muted-foreground">Unclassified</div><div className="font-display text-xl font-bold">{st.unclassified}</div></div>
        </div>
        <div className="mt-3 flex flex-wrap gap-1 text-xs">{st.mix.size ? [...st.mix].map(([b, n]) => <span key={b} className="rounded bg-muted px-2 py-0.5">{b}: {n}</span>) : <span className="text-muted-foreground">No upcoming items.</span>}<span className="text-muted-foreground">(next 28 items)</span></div>
        <p className="mt-2 text-xs text-muted-foreground">Meta: {conn?.status === "connected" ? "connected" : "not connected"} · Render worker: {st.workerRecent ? "active recently" : "not seen in 15 min"} · Performance data: {st.snaps ? `${st.snaps} snapshots` : "none yet"}</p>
      </Panel>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Posts remaining" value={s.postsLeft} />
        <Stat label="Reels remaining" value={s.reelsLeft} />
        <Stat label="Reel audio ready" value={`${s.audioReady}/${s.reels}`} tone={s.audioReady === s.reels && s.reels ? "teal" : "warn"} />
        <Stat label="Next publication" value={s.next ? formatOslo(s.next.scheduled_at!) : "—"} hint={s.next?.file_name} />
        <Stat label="Missed slots" value={s.missed} tone={s.missed ? "warn" : undefined} hint={s.missed ? "Reschedule or skip them" : undefined} />
        <Stat label="Failures / review" value={s.failures} tone={s.failures ? "danger" : undefined} />
        <Stat label="Uploads unfinished" value={s.uploading} />
        <Stat label="Renders running" value={s.rendering} />
      </div>
      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Panel title="Setup">
          <ul className="space-y-2">
            {steps.map((st) => (
              <li key={st.label}>
                <Link to={st.to} className="flex items-center gap-3 rounded-lg p-2 text-sm hover:bg-muted">
                  {st.done ? <CheckCircle2 className="size-5 text-success" /> : <Circle className="size-5 text-muted-foreground" />}
                  <span className={st.done ? "text-muted-foreground line-through" : "font-medium"}>{st.label}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Panel>
        <Panel title="Status">
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between"><dt className="text-muted-foreground">Publishing</dt><dd className="font-medium">{settings?.publishing_active ? "Active" : "Paused"}</dd></div>
            <div className="flex justify-between"><dt className="text-muted-foreground">Meta accounts</dt><dd className="font-medium">{conn?.status === "connected" ? "Connected" : conn?.status === "error" ? "Problem" : "Not connected"}</dd></div>
            <div className="flex justify-between"><dt className="text-muted-foreground">Library</dt><dd className="font-medium">{assets.length} items (no demo data)</dd></div>
          </dl>
        </Panel>
      </div>
    </div>
  );
}
