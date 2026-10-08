import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type Asset = Database["public"]["Tables"]["assets"]["Row"];
export type Publication = Database["public"]["Tables"]["publications"]["Row"];
export type Settings = Database["public"]["Tables"]["settings"]["Row"];
export type Batch = Database["public"]["Tables"]["batches"]["Row"];
export type Track = Database["public"]["Tables"]["audio_tracks"]["Row"];
export type RenderJob = Database["public"]["Tables"]["render_jobs"]["Row"];

async function all<T>(build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await build(from, from + 999);
    if (error) throw error;
    out.push(...(data ?? []));
    if (!data || data.length < 1000) return out;
  }
}

export const assetsQuery = queryOptions({
  queryKey: ["assets"],
  queryFn: () => all<Asset>((f, t) => supabase.from("assets").select("*").order("sort_index").range(f, t)),
});

export const publicationsQuery = queryOptions({
  queryKey: ["publications"],
  queryFn: () => all<Publication>((f, t) => supabase.from("publications").select("*").range(f, t)),
});

export const settingsQuery = queryOptions({
  queryKey: ["settings"],
  queryFn: async (): Promise<Settings> => {
    const { data, error } = await supabase.from("settings").select("*").maybeSingle();
    if (error) throw error;
    if (data) return data;
    const { data: created, error: e2 } = await supabase.from("settings").insert({}).select().single();
    if (e2) throw e2;
    return created;
  },
});

export const batchesQuery = queryOptions({
  queryKey: ["batches"],
  queryFn: async () => {
    const { data, error } = await supabase.from("batches").select("*").order("created_at", { ascending: false });
    if (error) throw error;
    return data;
  },
});

export const connectionQuery = queryOptions({
  queryKey: ["connection", "by-brand"],
  queryFn: async () => {
    const { data, error } = await supabase.from("meta_connection").select("*");
    if (error) throw error;
    return data ?? [];
  },
});

export const tracksQuery = queryOptions({
  queryKey: ["tracks"],
  queryFn: async () => {
    const { data, error } = await supabase.from("audio_tracks").select("*").order("created_at");
    if (error) throw error;
    return data;
  },
});

export const jobsQuery = queryOptions({
  queryKey: ["render_jobs"],
  queryFn: async () => {
    return all<RenderJob>((f, t) => supabase.from("render_jobs").select("*").order("created_at", { ascending: false }).order("id").range(f, t));
  },
  refetchInterval: 5000,
});

export const alertsQuery = queryOptions({
  queryKey: ["alerts"],
  queryFn: async () => {
    const { data, error } = await supabase.from("alerts").select("*").eq("read", false).order("created_at", { ascending: false }).limit(20);
    if (error) throw error;
    return data;
  },
});

export async function signedUrl(path: string, seconds = 600) {
  const { data } = await supabase.storage.from("media").createSignedUrl(path, seconds);
  return data?.signedUrl ?? null;
}

export type Brand = Database["public"]["Tables"]["brands"]["Row"];
export type Draft = Database["public"]["Tables"]["content_drafts"]["Row"];
export type MetricSnapshot = Database["public"]["Tables"]["metric_snapshots"]["Row"];
export type StrategyChange = Database["public"]["Tables"]["strategy_changes"]["Row"];

export const brandsQuery = queryOptions({
  queryKey: ["brands"],
  queryFn: async (): Promise<Brand[]> => {
    const { BRAND_DEFAULTS } = await import("./strategy");
    const { data, error } = await supabase.from("brands").select("*").order("created_at");
    if (error) throw error;
    const missing = BRAND_DEFAULTS.filter((d) => !data.some((b) => b.slug === d.slug));
    if (!missing.length) return data;
    const { error: e2 } = await supabase.from("brands").upsert(missing.map((m) => ({ ...m })), { onConflict: "user_id,slug", ignoreDuplicates: true });
    if (e2) throw e2;
    const { data: again, error: e3 } = await supabase.from("brands").select("*").order("created_at");
    if (e3) throw e3;
    return again;
  },
});

export const draftsQuery = queryOptions({
  queryKey: ["drafts"],
  queryFn: () => all<Draft>((f, t) => supabase.from("content_drafts").select("*").order("created_at", { ascending: false }).range(f, t)),
});

export const metricsQuery = queryOptions({
  queryKey: ["metrics"],
  queryFn: () => all<MetricSnapshot>((f, t) => supabase.from("metric_snapshots").select("*").order("captured_at", { ascending: false }).range(f, t)),
});

export const strategyChangesQuery = queryOptions({
  queryKey: ["strategy_changes"],
  queryFn: async () => {
    const { data, error } = await supabase.from("strategy_changes").select("*").order("applied_at", { ascending: false }).limit(50);
    if (error) throw error;
    return data;
  },
});

/** Per-business platform choice and posting switch (read-only for the browser). */
export const brandPublishingQuery = queryOptions({
  queryKey: ["brand-publishing"],
  queryFn: async () => {
    const { data, error } = await supabase.from("brand_publishing").select("*");
    if (error) throw error;
    return data ?? [];
  },
});
