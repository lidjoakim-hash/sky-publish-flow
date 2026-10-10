import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type CommitInput = { brand: string; mode: "append" | "reschedule" | "missed"; startDate: string; assignments: { id: string; at: string }[] };

function validateCommit(d: unknown): CommitInput {
  const x = d as CommitInput;
  if (!x || typeof x.brand !== "string" || !/^[a-z0-9_-]{1,40}$/.test(x.brand)) throw new Error("Invalid brand");
  if (!["append", "reschedule", "missed"].includes(x.mode)) throw new Error("Invalid mode");
  if (typeof x.startDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(x.startDate)) throw new Error("Invalid start date");
  if (!Array.isArray(x.assignments) || x.assignments.length > 2000) throw new Error("Invalid plan");
  const ids = new Set<string>();
  for (const a of x.assignments) {
    if (!a || typeof a.id !== "string" || typeof a.at !== "string" || Number.isNaN(new Date(a.at).getTime())) throw new Error("Invalid plan entry");
    if (ids.has(a.id)) throw new Error("Duplicate item in plan");
    ids.add(a.id);
  }
  return x;
}

/**
 * Commits a previewed plan. The server recomputes the plan from persisted assets, publications,
 * settings and brand strategy; if it differs from the preview the commit is refused (stale preview).
 * The write itself is the commit_schedule database function: one transaction with fresh row locks,
 * lock/lease, brand and collision checks — all-or-nothing.
 */
export const commitSchedule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(validateCommit)
  .handler(async ({ context, data }) => {
    const { supabase } = context;
    const { planWithStrategy } = await import("./plan");
    const { addDays, osloDateKey } = await import("./schedule");
    const page = async <T,>(q: (f: number, t: number) => PromiseLike<{ data: T[] | null; error: unknown }>) => {
      const out: T[] = [];
      for (let f = 0; ; f += 1000) {
        const { data: rows, error } = await q(f, f + 999);
        if (error) throw new Error("Could not read current data; nothing was saved.");
        out.push(...(rows ?? []));
        if (!rows || rows.length < 1000) return out;
      }
    };
    const assets = await page((f, t) => supabase.from("assets").select("*").order("sort_index").range(f, t));
    const pubs = await page((f, t) => supabase.from("publications").select("*").range(f, t));
    const { data: settings, error: se } = await supabase.from("settings").select("*").maybeSingle();
    const { data: brand, error: be } = await supabase.from("brands").select("strategy").eq("slug", data.brand).maybeSingle();
    if (se || be || !settings) throw new Error("Could not read settings; nothing was saved.");
    const today = osloDateKey(new Date());
    const startDate = data.mode === "missed" ? addDays(today, 1) : data.startDate;
    if (startDate < today) throw new Error("Choose today or a later start date.");
    const plan = planWithStrategy({
      assets, pubs, startDate, mode: data.mode, brand: data.brand,
      postTimes: settings.post_times?.length ? settings.post_times : [settings.post_time],
      reelTime: settings.reel_time, timeZone: settings.timezone, topicMixing: settings.topic_mixing,
      strategy: (brand?.strategy ?? {}) as never,
    });
    const sent = new Map(data.assignments.map((a) => [a.id, new Date(a.at).toISOString()]));
    const same = sent.size === plan.assignments.size && [...plan.assignments].every(([id, at]) => sent.get(id) === at);
    if (!same) return { saved: 0, stale: true, message: "Your data or settings changed since the preview. Preview again — nothing was saved." };
    const { data: n, error } = await supabase.rpc("commit_schedule", { _brand: data.brand, _items: [...plan.assignments].map(([id, at]) => ({ id, at })) });
    if (error) return { saved: 0, stale: false, message: `Nothing was saved: ${error.message}` };
    return { saved: n ?? 0, stale: false, message: `${n} items dated. Review them, then approve.` };
  });

/** Pulls Meta insights for published Skyline items using the server-side token. Missing metrics are recorded as unavailable, not zero. */
export const fetchMetaInsights = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { readMetaCreds, graph } = await import("./meta.server");
    const c = readMetaCreds();
    if (!c) return { available: false, saved: 0, message: "Meta is not connected (server secrets missing). Use manual entry or CSV for now." };
    const { data: pubs, error } = await context.supabase
      .from("publications")
      .select("id, asset_id, platform, remote_id, published_at, assets!inner(brand_slug)")
      .eq("status", "published")
      .not("remote_id", "is", null)
      .eq("assets.brand_slug", "skyline")
      .limit(100);
    if (error) throw error;
    const { supabaseAdmin: admin } = await import("@/integrations/supabase/client.server");
    let saved = 0;
    const problems = new Set<string>();
    const map = { instagram: { reach: "reach", views: "views", saves: "saved", shares: "shares", profile_actions: "profile_activity" }, facebook: { reach: "post_impressions_unique", clicks: "post_clicks" } } as const;
    for (const p of pubs ?? []) {
      const metrics = map[p.platform as "instagram" | "facebook"];
      if (!metrics) continue;
      const row: Record<string, unknown> = { user_id: context.userId, asset_id: p.asset_id, brand_slug: "skyline", platform: p.platform, source: "meta_api" };
      const unavailable: string[] = [];
      for (const [col, name] of Object.entries(metrics)) {
        try {
          const r = await graph<{ data: { name: string; values?: { value: number }[]; total_value?: { value: number } }[] }>(c, "GET", `${p.remote_id}/insights`, { metric: name });
          const d = r.data[0];
          const v = d?.total_value?.value ?? d?.values?.[0]?.value;
          if (typeof v === "number") row[col] = v;
          else unavailable.push(col);
        } catch (e) {
          unavailable.push(col);
          problems.add((e as Error).message.slice(0, 160));
        }
      }
      row["unavailable"] = unavailable;
      row["hours_since_publish"] = p.published_at ? Math.round((Date.now() - new Date(p.published_at).getTime()) / 3_600_000) : null;
      const { error: e } = await admin.from("metric_snapshots").insert(row as never);
      if (!e) saved++;
    }
    return { available: true, saved, message: `Saved ${saved} snapshots.${problems.size ? ` Some metrics unavailable: ${[...problems].slice(0, 2).join(" | ")}` : ""}` };
  });
