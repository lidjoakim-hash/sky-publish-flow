import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { PageHeader, Panel, Empty } from "@/components/app-ui";
import { BrandSwitcher, selectCls, useActiveBrand } from "@/components/brand";
import { supabase } from "@/integrations/supabase/client";
import { assetsQuery, draftsQuery, jobsQuery, type Draft } from "@/lib/queries";
import { generateIdeas } from "@/lib/ideas";
import { bucketLabel } from "@/lib/strategy";
import { formatOslo } from "@/lib/schedule";

const META = { title: "Ideas — Skyline Publisher", description: "Hook and brief drafts built from your existing media." };
export const Route = createFileRoute("/_authenticated/ideas")({
  head: () => ({ meta: [{ title: META.title }, { name: "description", content: META.description }, { property: "og:title", content: META.title }, { property: "og:description", content: META.description }] }),
  component: IdeasPage,
});

const STATUS: Record<string, string> = { draft: "Draft brief", ready: "Brief approved", rejected: "Rejected" };

function IdeasPage() {
  const qc = useQueryClient();
  const { slug, brand } = useActiveBrand();
  const { data: assets = [] } = useQuery(assetsQuery);
  const { data: drafts = [] } = useQuery(draftsQuery);
  const { data: jobs = [] } = useQuery(jobsQuery);
  const [source, setSource] = useState("");
  const brandAssets = useMemo(() => assets.filter((a) => a.brand_slug === slug && !a.skipped), [assets, slug]);
  const byId = useMemo(() => new Map(assets.map((a) => [a.id, a])), [assets]);
  const list = drafts.filter((d) => d.brand_slug === slug);
  const lastWorker = jobs.map((j) => j.updated_at).sort().pop();
  const workerSeen = lastWorker && Date.now() - new Date(lastWorker).getTime() < 15 * 60_000;

  async function generate(ids: string[]) {
    const rows = ids.flatMap((id) => {
      const a = byId.get(id);
      return a ? generateIdeas({ ...a, topics: a.topics ?? [] }, brand?.language ?? "nb").map((i) => ({ ...i, brand_slug: slug })) : [];
    });
    if (!rows.length) return;
    const { error } = await supabase.from("content_drafts").insert(rows);
    if (error) return toast.error(error.message);
    toast.success(`${rows.length} draft briefs created. Original captions are unchanged.`);
    qc.invalidateQueries({ queryKey: ["drafts"] });
  }

  async function upd(d: Draft, p: Partial<Draft>) {
    await supabase.from("content_drafts").update({ ...p, updated_at: new Date().toISOString() }).eq("id", d.id);
    qc.invalidateQueries({ queryKey: ["drafts"] });
  }

  const reachOnly = brandAssets.filter((a) => !drafts.some((d) => d.source_asset_id === a.id)).slice(0, 10);

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="Ideas" subtitle="Template-based hooks and briefs from your own media. No AI service is connected; nothing here is a finished video." actions={<BrandSwitcher />} />
      <div className="grid gap-4 lg:grid-cols-3">
        <Panel title="Create briefs" className="lg:col-span-2">
          <div className="flex flex-wrap gap-2">
            <select aria-label="Source item" className={`${selectCls} min-w-0 flex-1`} value={source} onChange={(e) => setSource(e.target.value)}>
              <option value="">Pick a source item…</option>
              {brandAssets.map((a) => <option key={a.id} value={a.id}>{a.kind === "reel" ? "Reel" : "Post"} · {a.file_name} · {bucketLabel(a.bucket)}</option>)}
            </select>
            <Button variant="teal" disabled={!source} onClick={() => generate([source])}>Create 2 briefs</Button>
            <Button variant="outline" disabled={!reachOnly.length} onClick={() => generate(reachOnly.map((a) => a.id))}>Batch: next {reachOnly.length} without briefs</Button>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">Briefs reference the source file and its bucket/objective. Caption drafts put a hook above your original caption — the original stays untouched and drafts are never scheduled automatically.</p>
        </Panel>
        <Panel title="Pipeline">
          <ol className="space-y-1 text-sm">
            <li>1. Original media (imported)</li>
            <li>2. Draft brief (here)</li>
            <li>3. Audio render & check — <Link to="/audio" className="text-teal underline">Audio Studio</Link></li>
            <li>4. Approve in Calendar</li>
            <li>5. Schedule</li>
          </ol>
          <p className="mt-2 text-xs text-muted-foreground">Render worker: {workerSeen ? "active in the last 15 min" : "not seen recently (it runs on your computer)"}. It can add music to Reels; it does not edit text overlays or cut new videos from briefs.</p>
        </Panel>
      </div>
      <div className="mt-6 space-y-3">
        {!list.length ? <Empty>No briefs yet.</Empty> : list.map((d) => {
          const a = byId.get(d.source_asset_id);
          return (
            <div key={d.id} className="rounded-xl border bg-card p-4 shadow-card">
              <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
                <Badge variant={d.status === "ready" ? "teal" : d.status === "rejected" ? "warning" : "muted"}>{STATUS[d.status] ?? d.status}</Badge>
                <Badge variant="outline">Brief only — not rendered</Badge>
                <span className="text-muted-foreground">Source: {a?.file_name ?? "missing"} · {bucketLabel(d.bucket)} · {d.objective ?? "no objective"} · {d.generator} · {formatOslo(d.created_at)}</span>
              </div>
              <Input defaultValue={d.hook} onBlur={(e) => e.target.value !== d.hook && upd(d, { hook: e.target.value })} className="mb-2 font-medium" aria-label="Hook" />
              <Textarea defaultValue={d.brief} rows={2} onBlur={(e) => e.target.value !== d.brief && upd(d, { brief: e.target.value })} className="mb-2 text-sm" aria-label="Brief" />
              <Textarea defaultValue={d.caption_draft ?? ""} rows={3} onBlur={(e) => e.target.value !== (d.caption_draft ?? "") && upd(d, { caption_draft: e.target.value })} className="text-sm" aria-label="Caption draft" placeholder="No original caption to build on." />
              <div className="mt-2 flex gap-2">
                <Button size="sm" variant="outline" onClick={() => upd(d, { status: "ready" })}>Approve brief</Button>
                <Button size="sm" variant="ghost" onClick={() => upd(d, { status: "rejected" })}>Reject</Button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
