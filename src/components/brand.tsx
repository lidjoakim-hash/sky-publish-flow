import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ArrowDown, ArrowUp, Eye, Plus, Settings2, X } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { brandPublishingQuery, type Brand } from "@/lib/queries";
import { supabase } from "@/integrations/supabase/client";
import { assetsQuery, brandsQuery, connectionQuery, publicationsQuery, settingsQuery } from "@/lib/queries";
import type { BrandStrategy } from "@/lib/strategy";

export function useActiveBrand() {
  const qc = useQueryClient();
  const { data: settings } = useQuery(settingsQuery);
  const { data: allBrands = [] } = useQuery(brandsQuery);
  const brands = visibleBrands(allBrands);
  const wanted = settings?.active_brand ?? "skyline";
  const slug = brands.some((b) => b.slug === wanted) ? wanted : (brands[0]?.slug ?? wanted);
  const brand = brands.find((b) => b.slug === slug);
  const strategy = (brand?.strategy ?? {}) as BrandStrategy;
  async function setSlug(s: string) {
    if (!settings) return;
    await supabase.from("settings").update({ active_brand: s }).eq("user_id", settings.user_id);
    qc.invalidateQueries({ queryKey: ["settings"] });
  }
  return { slug, brand, brands, allBrands, strategy, setSlug };
}

type Meta = { order?: number; hidden?: boolean };
const meta = (b: Brand) => (b.strategy ?? {}) as Meta;
/** Businesses in the owner's chosen order (strategy.order), hidden ones removed from the switch. */
export function sortedBrands(list: Brand[]) {
  return [...list].sort((a, b) => (meta(a).order ?? 1e9) - (meta(b).order ?? 1e9) || a.created_at.localeCompare(b.created_at));
}
export function visibleBrands(list: Brand[]) {
  return sortedBrands(list).filter((b) => !meta(b).hidden);
}

export const selectCls = "h-10 rounded-md border bg-background px-2 text-sm";

export function BrandSwitcher() {
  const { slug, brands, setSlug } = useActiveBrand();
  const [open, setOpen] = useState(false);
  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="text-muted-foreground">Brand</span>
      <select aria-label="Active brand" className={selectCls} value={slug} onChange={(e) => setSlug(e.target.value)}>
        {brands.map((b) => (
          <option key={b.slug} value={b.slug}>{b.name}</option>
        ))}
      </select>
      <Button size="icon" variant="ghost" aria-label="Manage businesses" title="Manage businesses" onClick={() => setOpen(true)}><Settings2 /></Button>
      <ManageBrands open={open} onOpenChange={setOpen} />
    </label>
  );
}

function ManageBrands({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const qc = useQueryClient();
  const { allBrands, slug } = useActiveBrand();
  const { data: bp = [] } = useQuery(brandPublishingQuery);
  const { data: assets = [] } = useQuery(assetsQuery);
  const list = sortedBrands(allBrands);
  const [newName, setNewName] = useState("");
  const save = async (b: Brand, patch: Record<string, unknown>) => {
    const { error } = await supabase.from("brands").update({ ...patch, updated_at: new Date().toISOString() } as never).eq("id", b.id);
    if (error) toast.error(error.message);
  };
  async function move(i: number, d: number) {
    const next = [...list];
    const [x] = next.splice(i, 1);
    next.splice(i + d, 0, x!);
    await Promise.all(next.map((b, k) => save(b, { strategy: { ...(b.strategy as object), order: k } })));
    qc.invalidateQueries({ queryKey: ["brands"] });
  }
  async function toggleHidden(b: Brand) {
    const hide = !meta(b).hidden;
    if (hide) {
      if (bp.some((r) => r.brand_slug === b.slug && r.enabled)) return toast.error(`Turn off posting for ${b.name} on Connections first.`);
      if (list.filter((x) => !meta(x).hidden).length <= 1) return toast.error("Keep at least one business.");
      const n = assets.filter((a) => a.brand_slug === b.slug).length;
      if (!window.confirm(`Remove ${b.name} from the list?${n ? ` Its ${n} items stay saved and come back if you show it again.` : ""}`)) return;
    }
    await save(b, { strategy: { ...(b.strategy as object), hidden: hide } });
    qc.invalidateQueries({ queryKey: ["brands"] });
  }
  async function rename(b: Brand, name: string) {
    if (!name.trim() || name === b.name) return;
    await save(b, { name: name.trim() });
    qc.invalidateQueries({ queryKey: ["brands"] });
  }
  async function add() {
    const name = newName.trim();
    const s = name.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "").slice(0, 24);
    if (!s) return toast.error("Type a name first.");
    if (allBrands.some((b) => b.slug === s)) return toast.error("That business already exists (it may be hidden — show it below).");
    const { error } = await supabase.from("brands").insert({ slug: s, name, language: "nb", strategy: { order: list.length } as never });
    if (error) return toast.error(error.message);
    setNewName("");
    toast.success(`${name} added. Posting is off until you connect it.`);
    qc.invalidateQueries({ queryKey: ["brands"] });
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Manage businesses</DialogTitle>
          <DialogDescription>Rename, reorder, add or remove businesses from the switch. Removing never deletes uploads — show it again any time.</DialogDescription>
        </DialogHeader>
        <ul className="space-y-2">
          {list.map((b, i) => (
            <li key={b.id} className={meta(b).hidden ? "flex items-center gap-1 opacity-50" : "flex items-center gap-1"}>
              <Input defaultValue={b.name} aria-label={`Name of ${b.name}`} onBlur={(e) => rename(b, e.target.value)} className="h-9" />
              <Button size="icon" variant="ghost" aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)}><ArrowUp /></Button>
              <Button size="icon" variant="ghost" aria-label="Move down" disabled={i === list.length - 1} onClick={() => move(i, 1)}><ArrowDown /></Button>
              {meta(b).hidden ? (
                <Button size="icon" variant="ghost" aria-label="Show in list" title="Show in list" onClick={() => toggleHidden(b)}><Eye /></Button>
              ) : (
                <Button size="icon" variant="ghost" aria-label={`Remove ${b.name} from list`} title="Remove from list (keeps its uploads)" onClick={() => toggleHidden(b)}><X /></Button>
              )}
              {b.slug === slug && <span className="text-xs text-muted-foreground">current</span>}
            </li>
          ))}
        </ul>
        <div className="flex gap-2">
          <Input placeholder="New business name" value={newName} onChange={(e) => setNewName(e.target.value)} className="h-9" />
          <Button variant="teal" onClick={add}><Plus /> Add</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** The Meta connection of the business currently selected in the top-left switcher. */
export function useBrandConnection() {
  const { slug } = useActiveBrand();
  const { data: rows } = useQuery(connectionQuery);
  return { data: Array.isArray(rows) ? rows.find((r) => r.brand_slug === slug) : undefined, slug };
}

/** Items and posting entries of the business picked top-left only — never another business's. */
export function useBrandAssets(opts: { refetchInterval?: number } = {}) {
  const { slug } = useActiveBrand();
  const q = useQuery({ ...assetsQuery, ...opts });
  const all = q.data ?? [];
  const assets = all.filter((a) => a.brand_slug === slug);
  return { ...q, data: assets, slug };
}

export function useBrandPublications(opts: { refetchInterval?: number } = {}) {
  const { slug } = useActiveBrand();
  const { data: all = [] } = useQuery(assetsQuery);
  const q = useQuery({ ...publicationsQuery, ...opts });
  const ids = new Set(all.filter((a) => a.brand_slug === slug).map((a) => a.id));
  return { ...q, data: (q.data ?? []).filter((p) => ids.has(p.asset_id)) };
}
