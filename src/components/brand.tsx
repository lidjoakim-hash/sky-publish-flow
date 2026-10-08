import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { brandsQuery, connectionQuery, settingsQuery } from "@/lib/queries";
import type { BrandStrategy } from "@/lib/strategy";

export function useActiveBrand() {
  const qc = useQueryClient();
  const { data: settings } = useQuery(settingsQuery);
  const { data: brands = [] } = useQuery(brandsQuery);
  const slug = settings?.active_brand ?? "skyline";
  const brand = brands.find((b) => b.slug === slug);
  const strategy = (brand?.strategy ?? {}) as BrandStrategy;
  async function setSlug(s: string) {
    if (!settings) return;
    await supabase.from("settings").update({ active_brand: s }).eq("user_id", settings.user_id);
    qc.invalidateQueries({ queryKey: ["settings"] });
  }
  return { slug, brand, brands, strategy, setSlug };
}

export const selectCls = "h-10 rounded-md border bg-background px-2 text-sm";

export function BrandSwitcher() {
  const { slug, brands, setSlug } = useActiveBrand();
  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="text-muted-foreground">Brand</span>
      <select aria-label="Active brand" className={selectCls} value={slug} onChange={(e) => setSlug(e.target.value)}>
        {brands.map((b) => (
          <option key={b.slug} value={b.slug}>{b.name}</option>
        ))}
      </select>
    </label>
  );
}

/** The Meta connection of the business currently selected in the top-left switcher. */
export function useBrandConnection() {
  const { slug } = useActiveBrand();
  const { data: rows } = useQuery(connectionQuery);
  return { data: rows?.find((r) => r.brand_slug === slug), slug };
}
