import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { PageHeader, Panel, Empty } from "@/components/app-ui";
import { BrandSwitcher, selectCls, useActiveBrand } from "@/components/brand";
import { supabase } from "@/integrations/supabase/client";
import { assetsQuery, connectionQuery, metricsQuery } from "@/lib/queries";
import { METRICS, groupStats, latestPerAsset, parseMetricsCsv, recommendWeights, type Metric, type Snapshot } from "@/lib/feedback";
import { DEFAULT_STRATEGY, UNCLASSIFIED, bucketLabel } from "@/lib/strategy";
import { formatOslo } from "@/lib/schedule";
import { fetchMetaInsights } from "@/lib/strategy.functions";

const META = { title: "Performance — Skyline Publisher", description: "Metric snapshots and evidence-based content-mix advice." };
export const Route = createFileRoute("/_authenticated/performance")({
  head: () => ({ meta: [{ title: META.title }, { name: "description", content: META.description }, { property: "og:title", content: META.title }, { property: "og:description", content: META.description }] }),
  component: PerformancePage,
});

const LABEL: Record<Metric, string> = { reach: "Reach", views: "Views", saves: "Saves", shares: "Shares", profile_actions: "Profile actions", clicks: "Clicks", inquiries: "Inquiries (manual)" };
const WINDOWS = { "24-72": { minHours: 24, maxHours: 72 }, "72-336": { minHours: 72, maxHours: 336 }, any: undefined } as const;

function PerformancePage() {
  const qc = useQueryClient();
  const { slug, brand, strategy } = useActiveBrand();
  const { data: assets = [] } = useQuery(assetsQuery);
  const { data: metrics = [] } = useQuery(metricsQuery);
  const { data: conn } = useQuery(connectionQuery);
  const pull = useServerFn(fetchMetaInsights);
  const [platform, setPlatform] = useState("instagram");
  const [objective, setObjective] = useState("");
  const [metric, setMetric] = useState<Metric>("reach");
  const [win, setWin] = useState<keyof typeof WINDOWS>("24-72");
  const [form, setForm] = useState<Record<string, string>>({ asset: "", platform: "instagram", hours: "48" });
  const [csv, setCsv] = useState("");

  const byId = useMemo(() => new Map(assets.map((a) => [a.id, a])), [assets]);
  const brandRows = metrics.filter((m) => m.brand_slug === slug);
  const filtered = latestPerAsset(
    brandRows.filter((m) => m.platform === platform && (!objective || byId.get(m.asset_id)?.objective === objective)) as unknown as Snapshot[],
    WINDOWS[win],
  );
  const stats = groupStats(filtered, (r) => byId.get(r.asset_id)?.bucket ?? UNCLASSIFIED, metric);
  const opts = { minSample: strategy.minSample ?? DEFAULT_STRATEGY.minSample, maxStep: strategy.maxStep ?? DEFAULT_STRATEGY.maxStep, diversityFloor: strategy.diversityFloor ?? DEFAULT_STRATEGY.diversityFloor };
  const current = Object.fromEntries(Object.entries(strategy.weights ?? {}).map(([k, v]) => [k, v ?? 1]));
  const rec = recommendWeights(current, stats, opts);
  const newest = brandRows[0]?.captured_at;

  async function addManual() {
    const values = Object.fromEntries(METRICS.map((m) => [m, form[m] === undefined || form[m] === "" ? null : Number(form[m])]));
    const { error } = await supabase.from("metric_snapshots").insert({ asset_id: form.asset!, platform: form.platform!, brand_slug: slug, hours_since_publish: form.hours ? Number(form.hours) : null, source: "manual", ...values });
    if (error) return toast.error(error.message);
    toast.success("Snapshot saved. Empty fields are stored as missing, not zero.");
    qc.invalidateQueries({ queryKey: ["metrics"] });
  }

  async function importCsv() {
    const rows = parseMetricsCsv(csv);
    const byName = new Map(assets.filter((a) => a.brand_slug === slug).map((a) => [a.file_name, a.id]));
    const ok = rows.filter((r) => byName.has(r.file) && (r.platform === "instagram" || r.platform === "facebook"));
    if (!ok.length) return toast.error("No rows matched a file name in this brand.");
    const { error } = await supabase.from("metric_snapshots").insert(ok.map((r) => ({ asset_id: byName.get(r.file)!, platform: r.platform, brand_slug: slug, hours_since_publish: r.hours, source: "csv", ...r.values })));
    if (error) return toast.error(error.message);
    toast.success(`${ok.length} of ${rows.length} rows imported.`);
    qc.invalidateQueries({ queryKey: ["metrics"] });
  }

  async function fetchMeta() {
    const r = await pull();
    (r.available ? toast.success : toast)(r.message);
    qc.invalidateQueries({ queryKey: ["metrics"] });
  }

  async function applyRec() {
    if (!brand || !rec.changes.length) return;
    const after = { ...strategy, weights: { ...(strategy.weights ?? {}), ...rec.weights } };
    await supabase.from("brands").update({ strategy: after as never, updated_at: new Date().toISOString() }).eq("id", brand.id);
    await supabase.from("strategy_changes").insert({ brand_slug: slug, before: strategy as never, after: after as never, reason: `Applied ${platform} ${LABEL[metric]} advice (${win}h window): ${rec.changes.map((c) => `${bucketLabel(c.group)} ${c.from.toFixed(2)}→${c.to.toFixed(2)}`).join(", ")}` });
    toast.success("Weights updated. Existing dates were not changed.");
    qc.invalidateQueries({ queryKey: ["brands"] });
    qc.invalidateQueries({ queryKey: ["strategy_changes"] });
  }

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="Performance" subtitle="Snapshots per published item and platform. Missing is not zero. Advice needs enough comparable posts." actions={<BrandSwitcher />} />
      <div className="grid gap-4 lg:grid-cols-3">
        <Panel title="Meta insights">
          <p className="text-sm">{conn?.status === "connected" ? "Connected. Pulls reach, views, saves, shares and profile activity where Meta allows it for each post." : "Not available yet: Meta is not connected. Needs the Page token with instagram_manage_insights and read_insights permissions."}</p>
          <Button className="mt-3" variant="outline" onClick={fetchMeta} disabled={slug !== "skyline"}>Fetch from Meta</Button>
          <p className="mt-2 text-xs text-muted-foreground">{brandRows.length} snapshots · newest {newest ? formatOslo(newest) : "—"}</p>
        </Panel>
        <Panel title="Add manually" className="lg:col-span-2">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <select aria-label="Item" className={`${selectCls} col-span-2`} value={form.asset} onChange={(e) => setForm({ ...form, asset: e.target.value })}>
              <option value="">Item…</option>
              {assets.filter((a) => a.brand_slug === slug && a.scheduled_at).map((a) => <option key={a.id} value={a.id}>{a.file_name}</option>)}
            </select>
            <select aria-label="Platform" className={selectCls} value={form.platform} onChange={(e) => setForm({ ...form, platform: e.target.value })}><option value="instagram">Instagram</option><option value="facebook">Facebook</option></select>
            <Input aria-label="Hours since publish" placeholder="Hours since publish" value={form.hours} onChange={(e) => setForm({ ...form, hours: e.target.value })} />
            {METRICS.map((m) => (
              <div key={m} className="space-y-1"><Label className="text-xs" htmlFor={`m-${m}`}>{LABEL[m]}</Label><Input id={`m-${m}`} inputMode="numeric" value={form[m] ?? ""} onChange={(e) => setForm({ ...form, [m]: e.target.value })} /></div>
            ))}
          </div>
          <Button className="mt-3" variant="teal" disabled={!form.asset} onClick={addManual}>Save snapshot</Button>
          <details className="mt-3 text-sm">
            <summary className="cursor-pointer">Paste CSV</summary>
            <p className="my-1 text-xs text-muted-foreground">asset_file,platform,hours,reach,views,saves,shares,profile_actions,clicks,inquiries — leave blank when unknown.</p>
            <Textarea rows={4} value={csv} onChange={(e) => setCsv(e.target.value)} />
            <Button className="mt-2" size="sm" variant="outline" onClick={importCsv} disabled={!csv.trim()}>Import CSV</Button>
          </details>
        </Panel>
      </div>

      <Panel title="Compare buckets" className="mt-4">
        <div className="mb-3 flex flex-wrap gap-2">
          <select aria-label="Compare platform" className={selectCls} value={platform} onChange={(e) => setPlatform(e.target.value)}><option value="instagram">Instagram</option><option value="facebook">Facebook</option></select>
          <select aria-label="Compare objective" className={selectCls} value={objective} onChange={(e) => setObjective(e.target.value)}><option value="">All objectives</option><option value="reach">Reach</option><option value="leads">Leads</option></select>
          <select aria-label="Metric" className={selectCls} value={metric} onChange={(e) => setMetric(e.target.value as Metric)}>{METRICS.map((m) => <option key={m} value={m}>{LABEL[m]}</option>)}</select>
          <select aria-label="Window" className={selectCls} value={win} onChange={(e) => setWin(e.target.value as keyof typeof WINDOWS)}><option value="24-72">24–72 h after publish</option><option value="72-336">3–14 days</option><option value="any">Latest, any age</option></select>
        </div>
        {!stats.length ? <Empty>No snapshots in this window yet.</Empty> : (
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted-foreground"><tr><th className="py-1">Bucket</th><th>Samples</th><th>Missing</th><th>Median</th></tr></thead>
            <tbody>{stats.map((s) => <tr key={s.group} className="border-t"><td className="py-1.5">{bucketLabel(s.group)}</td><td>{s.n}</td><td>{s.missing}</td><td>{s.median == null ? "—" : Math.round(s.median)}</td></tr>)}</tbody>
          </table>
        )}
        <div className="mt-4 rounded-lg bg-muted p-3 text-sm">
          <div className="font-medium">Advice</div>
          {rec.changes.length ? (
            <>
              <ul className="mt-1 list-disc pl-5">{rec.changes.map((c) => <li key={c.group}>{bucketLabel(c.group)}: weight {c.from.toFixed(2)} → {c.to.toFixed(2)}. {c.why}</li>)}</ul>
              <Button className="mt-2" size="sm" variant="teal" onClick={applyRec}>Apply these weights</Button>
            </>
          ) : <p className="text-muted-foreground">No change suggested — needs at least two buckets with {opts.minSample}+ comparable samples each.</p>}
          {rec.skipped.length > 0 && <p className="mt-1 text-xs text-muted-foreground">Not enough data: {rec.skipped.map((s) => `${bucketLabel(s.group)} (${s.why.toLowerCase()})`).join("; ")}</p>}
          <p className="mt-1 text-xs text-muted-foreground">Medians limit the effect of one viral post. Changes are capped and every bucket keeps a minimum share. This is a nudge for your account, not a universal rule.</p>
        </div>
      </Panel>
    </div>
  );
}
