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
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Posts remaining" value={s.postsLeft} />
        <Stat label="Reels remaining" value={s.reelsLeft} />
        <Stat label="Reel audio ready" value={`${s.audioReady}/${s.reels}`} tone={s.audioReady === s.reels && s.reels ? "teal" : "warn"} />
        <Stat label="Next publication" value={s.next ? formatOslo(s.next.scheduled_at!) : "—"} hint={s.next?.file_name} />
        <Stat label="Missed slots" value={s.missed} tone={s.missed ? "warn" : undefined} hint={s.missed ? "Move them in Calendar" : undefined} />
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
