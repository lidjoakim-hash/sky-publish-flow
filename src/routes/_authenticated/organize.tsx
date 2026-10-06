import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { PageHeader, Empty } from "@/components/app-ui";
import { BrandSwitcher, selectCls, useActiveBrand } from "@/components/brand";
import { supabase } from "@/integrations/supabase/client";
import { assetsQuery, type Asset } from "@/lib/queries";
import { BUCKETS, OBJECTIVES, REVIEW_LABEL, REVIEW_STATES, bucketLabel, sourceGroupOf, suggestClassification } from "@/lib/strategy";

const META = { title: "Organize — Skyline Publisher", description: "Classify content by bucket, objective, source and quality." };
export const Route = createFileRoute("/_authenticated/organize")({
  head: () => ({ meta: [{ title: META.title }, { name: "description", content: META.description }, { property: "og:title", content: META.title }, { property: "og:description", content: META.description }] }),
  component: OrganizePage,
});

type Patch = Partial<Pick<Asset, "bucket" | "objective" | "review_status" | "source_group" | "hooks" | "style_tags" | "classification_source" | "brand_slug">>;

function OrganizePage() {
  const qc = useQueryClient();
  const { slug, brands } = useActiveBrand();
  const { data: assets = [] } = useQuery(assetsQuery);
  const [f, setF] = useState({ bucket: "", objective: "", review: "", kind: "", q: "" });
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [hooks, setHooks] = useState("");
  const [group, setGroup] = useState("");

  const list = useMemo(
    () =>
      assets.filter((a) =>
        a.brand_slug === slug &&
        (!f.kind || a.kind === f.kind) &&
        (!f.bucket || (f.bucket === "none" ? !a.bucket : a.bucket === f.bucket)) &&
        (!f.objective || a.objective === f.objective) &&
        (!f.review || a.review_status === f.review) &&
        (!f.q || a.file_name.toLowerCase().includes(f.q.toLowerCase())),
      ),
    [assets, slug, f],
  );
  const picked = list.filter((a) => sel.has(a.id));

  async function patch(ids: string[], p: Patch) {
    for (let i = 0; i < ids.length; i += 200) {
      const { error } = await supabase.from("assets").update(p).in("id", ids.slice(i, i + 200));
      if (error) return toast.error(error.message);
    }
    toast.success(`Updated ${ids.length} items.`);
    qc.invalidateQueries({ queryKey: ["assets"] });
  }

  async function applySuggestions() {
    const targets = picked.filter((a) => !a.bucket);
    let n = 0;
    for (const a of targets) {
      const s = suggestClassification(a);
      if (!s.bucket) continue;
      await supabase.from("assets").update({ bucket: s.bucket, objective: a.objective ?? s.objective, classification_source: "suggested" }).eq("id", a.id);
      n++;
    }
    toast.success(`${n} suggestions applied (labelled “suggested”). ${targets.length - n} had no keyword match and stay unclassified.`);
    qc.invalidateQueries({ queryKey: ["assets"] });
  }

  const unclassified = assets.filter((a) => a.brand_slug === slug && !a.bucket).length;
  const ids = picked.map((a) => a.id);

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="Organize" subtitle="Bucket, objective, source/session, hooks and quality. Suggestions come from file names, tags and captions only — no video analysis." actions={<BrandSwitcher />} />
      <p className="mb-3 text-sm text-muted-foreground">{unclassified} unclassified items in this brand. Unclassified items still schedule normally.</p>
      <div className="mb-3 flex flex-wrap gap-2">
        <Input placeholder="Search file name" value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} className="h-10 w-48" />
        <select aria-label="Type" className={selectCls} value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}><option value="">All types</option><option value="reel">Reels</option><option value="post">Posts</option></select>
        <select aria-label="Bucket filter" className={selectCls} value={f.bucket} onChange={(e) => setF({ ...f, bucket: e.target.value })}><option value="">All buckets</option><option value="none">Unclassified</option>{BUCKETS.map((b) => <option key={b.id} value={b.id}>{b.label}</option>)}</select>
        <select aria-label="Objective filter" className={selectCls} value={f.objective} onChange={(e) => setF({ ...f, objective: e.target.value })}><option value="">All objectives</option>{OBJECTIVES.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}</select>
        <select aria-label="Review filter" className={selectCls} value={f.review} onChange={(e) => setF({ ...f, review: e.target.value })}><option value="">All quality</option>{REVIEW_STATES.map((r) => <option key={r} value={r}>{REVIEW_LABEL[r]}</option>)}</select>
      </div>

      <div className="sticky top-14 z-10 mb-3 flex flex-wrap items-center gap-2 rounded-xl border bg-card p-3 shadow-card lg:top-2">
        <span className="text-sm font-medium">{picked.length} selected</span>
        <select aria-label="Set bucket" className={selectCls} value="" disabled={!ids.length} onChange={(e) => patch(ids, { bucket: e.target.value || null, classification_source: "owner" })}><option value="">Set bucket…</option>{BUCKETS.map((b) => <option key={b.id} value={b.id}>{b.label}</option>)}</select>
        <select aria-label="Set objective" className={selectCls} value="" disabled={!ids.length} onChange={(e) => patch(ids, { objective: e.target.value })}><option value="">Set objective…</option>{OBJECTIVES.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}</select>
        <select aria-label="Set quality" className={selectCls} value="" disabled={!ids.length} onChange={(e) => patch(ids, { review_status: e.target.value })}><option value="">Set quality…</option>{REVIEW_STATES.map((r) => <option key={r} value={r}>{REVIEW_LABEL[r]}</option>)}</select>
        <Input placeholder="Source/session group" value={group} onChange={(e) => setGroup(e.target.value)} className="h-10 w-44" />
        <Button size="sm" variant="outline" disabled={!ids.length} onClick={() => patch(ids, { source_group: group.trim() || null })}>Set group</Button>
        <Input placeholder="Hooks/style, comma separated" value={hooks} onChange={(e) => setHooks(e.target.value)} className="h-10 w-52" />
        <Button size="sm" variant="outline" disabled={!ids.length} onClick={() => patch(ids, { hooks: hooks.split(",").map((h) => h.trim()).filter(Boolean) })}>Set hooks</Button>
        <Button size="sm" variant="outline" disabled={!ids.length} onClick={() => patch(ids, { style_tags: hooks.split(",").map((h) => h.trim()).filter(Boolean) })}>Set style</Button>
        <Button size="sm" variant="teal" disabled={!ids.length} onClick={applySuggestions}>Suggest buckets</Button>
        {brands.length > 1 && (
          <select aria-label="Move to brand" className={selectCls} value="" disabled={!ids.length} onChange={(e) => {
            const target = e.target.value;
            const movable = picked.filter((a) => !a.scheduled_at).map((a) => a.id);
            if (target && confirm(`Move ${movable.length} unscheduled items to ${target}? Scheduled items stay.`)) patch(movable, { brand_slug: target });
          }}><option value="">Move to brand…</option>{brands.filter((b) => b.slug !== slug).map((b) => <option key={b.slug} value={b.slug}>{b.name}</option>)}</select>
        )}
      </div>

      {!list.length ? <Empty>No items match.</Empty> : (
        <div className="divide-y rounded-xl border bg-card">
          <label className="flex items-center gap-3 px-4 py-2 text-xs text-muted-foreground">
            <Checkbox checked={picked.length === list.length} onCheckedChange={(v) => setSel(v ? new Set(list.map((a) => a.id)) : new Set())} /> Select all {list.length}
          </label>
          {list.map((a) => {
            const sug = !a.bucket ? suggestClassification(a) : null;
            return (
              <div key={a.id} className="flex flex-col gap-1 px-4 py-2.5 sm:flex-row sm:items-center sm:gap-3">
                <Checkbox checked={sel.has(a.id)} onCheckedChange={(v) => { const n = new Set(sel); if (v) n.add(a.id); else n.delete(a.id); setSel(n); }} aria-label={`Select ${a.file_name}`} />
                <Badge variant={a.kind === "reel" ? "teal" : "muted"} className="w-fit">{a.kind === "reel" ? "Reel" : "Post"}</Badge>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm">{a.file_name}</div>
                  <div className="truncate text-xs text-muted-foreground">Source: {sourceGroupOf(a)}{a.hooks.length ? ` · Hooks: ${a.hooks.join(", ")}` : ""}{a.style_tags.length ? ` · Style: ${a.style_tags.join(", ")}` : ""}</div>
                </div>
                <div className="flex flex-wrap items-center gap-1 text-xs">
                  <Badge variant={a.bucket ? "secondary" : "outline"}>{bucketLabel(a.bucket)}{a.classification_source === "suggested" ? " (suggested)" : ""}</Badge>
                  {sug?.bucket && <span className="text-muted-foreground" title={sug.reason}>Suggest: {bucketLabel(sug.bucket)}</span>}
                  {a.objective && <Badge variant="outline">{a.objective === "leads" ? "Leads" : "Reach"}</Badge>}
                  <Badge variant={a.review_status === "good" ? "teal" : a.review_status === "unreviewed" ? "muted" : "warning"}>{REVIEW_LABEL[a.review_status] ?? a.review_status}</Badge>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
