import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const WAITING = ["pending", "retry", "skipped"];

/** Server-side validation + commit of a previewed plan. Never touches locked, skipped, rejected or other-brand items. */
export const commitSchedule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { brand: string; assignments: { id: string; at: string }[] }) => {
    if (!Array.isArray(d.assignments) || d.assignments.length > 2000) throw new Error("Invalid plan");
    return d;
  })
  .handler(async ({ context, data }) => {
    const { supabase } = context;
    const now = Date.now();
    const ids = data.assignments.map((a) => a.id);
    const rows: { id: string; brand_slug: string; skipped: boolean; upload_state: string; review_status: string; scheduled_at: string | null }[] = [];
    for (let i = 0; i < ids.length; i += 200) {
      const { data: r, error } = await supabase.from("assets").select("id, brand_slug, skipped, upload_state, review_status, scheduled_at").in("id", ids.slice(i, i + 200));
      if (error) throw error;
      rows.push(...(r ?? []));
    }
    const byId = new Map(rows.map((r) => [r.id, r]));
    const { data: pubs } = await supabase.from("publications").select("asset_id, status").in("asset_id", ids.slice(0, 1000));
    const locked = new Set((pubs ?? []).filter((p) => !WAITING.includes(p.status)).map((p) => p.asset_id));
    const { data: others } = await supabase.from("assets").select("id, scheduled_at").not("scheduled_at", "is", null).limit(10000);
    const movingSet = new Set(ids);
    const taken = new Set((others ?? []).filter((o) => !movingSet.has(o.id)).map((o) => new Date(o.scheduled_at!).toISOString()));
    const rejected: string[] = [];
    const ok: { id: string; at: string }[] = [];
    for (const a of data.assignments) {
      const r = byId.get(a.id);
      const t = new Date(a.at);
      const iso = Number.isNaN(t.getTime()) ? "" : t.toISOString();
      const why = !r ? "not found" : r.brand_slug !== data.brand ? "other brand" : r.skipped ? "skipped" : r.upload_state !== "done" ? "not uploaded" : r.review_status === "reject" ? "marked do not use" : locked.has(a.id) ? "already publishing/published" : !iso || t.getTime() <= now ? "slot in the past" : taken.has(iso) ? "slot already taken" : null;
      if (why) rejected.push(`${a.id.slice(0, 8)}: ${why}`);
      else {
        taken.add(iso);
        ok.push({ id: a.id, at: iso });
      }
    }
    for (let i = 0; i < ok.length; i += 25) {
      await Promise.all(ok.slice(i, i + 25).map((a) => supabase.from("assets").update({ scheduled_at: a.at, approved: false }).eq("id", a.id)));
    }
    return { saved: ok.length, rejected };
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
