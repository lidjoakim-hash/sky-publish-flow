import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { PageHeader, Panel, Empty } from "@/components/app-ui";
import { BrandSwitcher, useActiveBrand } from "@/components/brand";
import { supabase } from "@/integrations/supabase/client";
import { strategyChangesQuery, settingsQuery } from "@/lib/queries";
import { BUCKETS, DEFAULT_STRATEGY, UNCLASSIFIED, bucketLabel, type BrandStrategy } from "@/lib/strategy";
import { formatOslo } from "@/lib/schedule";

const META = { title: "Strategy — Skyline Publisher", description: "Brand profiles, content mix and planning rules." };
export const Route = createFileRoute("/_authenticated/strategy")({
  head: () => ({ meta: [{ title: META.title }, { name: "description", content: META.description }, { property: "og:title", content: META.title }, { property: "og:description", content: META.description }] }),
  component: StrategyPage,
});

function StrategyPage() {
  const qc = useQueryClient();
  const { brand, strategy, slug } = useActiveBrand();
  const { data: settings } = useQuery(settingsQuery);
  const { data: history = [] } = useQuery(strategyChangesQuery);
  const [voice, setVoice] = useState("");
  const [offers, setOffers] = useState("");
  const [s, setS] = useState<BrandStrategy>({});

  useEffect(() => {
    if (!brand) return;
    setVoice(brand.voice ?? "");
    setOffers(brand.verified_offers ?? "");
    setS(strategy);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brand?.id, brand?.updated_at]);

  const q = s.qualityPreset ?? { enabled: false, postsPerDay: 1, reelsPerDay: 1, minSpacingHours: 3 };
  const num = (v: string, d: number) => (Number.isFinite(Number(v)) && v !== "" ? Number(v) : d);

  async function saveProfile() {
    if (!brand) return;
    const { error } = await supabase.from("brands").update({ voice, verified_offers: offers || null, updated_at: new Date().toISOString() }).eq("id", brand.id);
    if (error) return toast.error(error.message);
    toast.success("Brand profile saved.");
    qc.invalidateQueries({ queryKey: ["brands"] });
  }

  async function saveStrategy(reason: string) {
    if (!brand) return;
    const { error } = await supabase.from("brands").update({ strategy: s as never, updated_at: new Date().toISOString() }).eq("id", brand.id);
    if (error) return toast.error(error.message);
    await supabase.from("strategy_changes").insert({ brand_slug: slug, before: (brand.strategy ?? {}) as never, after: s as never, reason });
    toast.success("Planning rules saved. Nothing was rescheduled — use the Calendar to preview a new plan.");
    qc.invalidateQueries({ queryKey: ["brands"] });
    qc.invalidateQueries({ queryKey: ["strategy_changes"] });
  }

  const brandHistory = history.filter((h) => h.brand_slug === slug);

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="Strategy" subtitle="Brand profile, content mix and planning rules. Changes here never move dates on their own." actions={<BrandSwitcher />} />
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title={`Profile · ${brand?.name ?? ""}`}>
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">Language: {brand?.language === "nb" ? "Norwegian Bokmål" : brand?.language} · {brand?.focus}</p>
            <div className="space-y-1.5"><Label htmlFor="voice">Voice and focus</Label><Textarea id="voice" rows={3} value={voice} onChange={(e) => setVoice(e.target.value)} /></div>
            <div className="space-y-1.5">
              <Label htmlFor="offers">Verified offers and prices (owner only)</Label>
              <Textarea id="offers" rows={3} placeholder="Leave empty unless the offer is real and current." value={offers} onChange={(e) => setOffers(e.target.value)} />
              <p className="text-xs text-muted-foreground">Idea briefs never invent offers, prices, savings or guarantees. Only what you type here may be referenced.</p>
            </div>
            <Button variant="teal" onClick={saveProfile}>Save profile</Button>
          </div>
        </Panel>

        <Panel title="Schedule">
          <div className="space-y-3 text-sm">
            <div className="rounded-lg bg-muted p-3">
              <div className="font-medium">Current daily schedule (Calendar)</div>
              <div className="text-muted-foreground">Image posts: {(s.schedule?.postTimes ?? settings?.post_times ?? []).map((t) => t.slice(0, 5)).join(", ")} · Reels: {(s.schedule?.reelTimes ?? [settings?.reel_time ?? ""]).map((t) => t.slice(0, 5)).join(", ")} · {settings?.timezone}</div>
            </div>
            <label className="flex items-center justify-between gap-2">
              <span><span className="font-medium">Quality-first preset</span><br /><span className="text-xs text-muted-foreground">Fewer, better-spaced posts. Only used by new plans you preview in the Calendar.</span></span>
              <Switch checked={q.enabled} onCheckedChange={(v) => setS({ ...s, qualityPreset: { ...q, enabled: v } })} />
            </label>
            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-1"><Label htmlFor="ppd">Posts/day</Label><Input id="ppd" type="number" min={0} max={3} value={q.postsPerDay} onChange={(e) => setS({ ...s, qualityPreset: { ...q, postsPerDay: Math.min(3, Math.max(0, num(e.target.value, 1))) } })} /></div>
              <div className="space-y-1"><Label htmlFor="rpd">Reels/day</Label><Input id="rpd" type="number" min={0} max={1} value={q.reelsPerDay} onChange={(e) => setS({ ...s, qualityPreset: { ...q, reelsPerDay: Math.min(1, Math.max(0, num(e.target.value, 1))) } })} /></div>
              <div className="space-y-1"><Label htmlFor="sp">Min. gap (h)</Label><Input id="sp" type="number" min={0} max={12} value={q.minSpacingHours} onChange={(e) => setS({ ...s, qualityPreset: { ...q, minSpacingHours: Math.max(0, num(e.target.value, 0)) } })} /></div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1"><Label htmlFor="cd">Source cooldown (days)</Label><Input id="cd" type="number" min={0} max={60} value={s.cooldownDays ?? DEFAULT_STRATEGY.cooldownDays} onChange={(e) => setS({ ...s, cooldownDays: Math.max(0, num(e.target.value, 0)) })} /></div>
              <div className="space-y-1"><Label htmlFor="ms">Min. samples for advice</Label><Input id="ms" type="number" min={3} value={s.minSample ?? DEFAULT_STRATEGY.minSample} onChange={(e) => setS({ ...s, minSample: Math.max(3, num(e.target.value, 5)) })} /></div>
              <div className="space-y-1"><Label htmlFor="mx">Max change per step (%)</Label><Input id="mx" type="number" min={5} max={50} value={Math.round((s.maxStep ?? DEFAULT_STRATEGY.maxStep) * 100)} onChange={(e) => setS({ ...s, maxStep: Math.min(0.5, Math.max(0.05, num(e.target.value, 20) / 100)) })} /></div>
              <div className="space-y-1"><Label htmlFor="df">Diversity floor (%)</Label><Input id="df" type="number" min={1} max={20} value={Math.round((s.diversityFloor ?? DEFAULT_STRATEGY.diversityFloor) * 100)} onChange={(e) => setS({ ...s, diversityFloor: Math.min(0.2, Math.max(0.01, num(e.target.value, 5) / 100)) })} /></div>
            </div>
          </div>
        </Panel>

        <Panel title="Content mix (bucket weights)" className="lg:col-span-2">
          <p className="mb-3 text-xs text-muted-foreground">1 = normal share. 0 = never chosen. The planner rotates buckets toward these shares and never repeats the same source or hook back to back.</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
            {[...BUCKETS.map((b) => b.id as string), UNCLASSIFIED].map((b) => (
              <div key={b} className="space-y-1">
                <Label htmlFor={`w-${b}`} className="text-xs">{bucketLabel(b)}</Label>
                <Input id={`w-${b}`} type="number" step="0.1" min={0} max={5} value={s.weights?.[b] ?? 1} onChange={(e) => setS({ ...s, weights: { ...(s.weights ?? {}), [b]: Math.max(0, num(e.target.value, 1)) } })} />
              </div>
            ))}
          </div>
          <Button className="mt-4" variant="teal" onClick={() => saveStrategy("Owner edited planning rules")}>Save planning rules</Button>
        </Panel>

        <Panel title="Change history" className="lg:col-span-2">
          {!brandHistory.length ? <Empty>No strategy changes yet.</Empty> : (
            <ul className="divide-y text-sm">
              {brandHistory.map((h) => (
                <li key={h.id} className="py-2"><span className="font-medium">{formatOslo(h.applied_at)}</span> — {h.reason}</li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}
