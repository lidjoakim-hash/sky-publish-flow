import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { reelAudioOk } from "./audio";

/** Checks the server-side Meta credentials and that the Instagram account belongs to the Page. */
export const checkMetaConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { brand?: string } | undefined) => {
    const brand = d?.brand ?? "skyline";
    if (!/^[a-z0-9_-]{1,40}$/.test(brand)) throw new Error("Invalid business");
    return { brand };
  })
  .handler(async ({ context, data }) => {
    const { readMetaCreds, metaSecretNames, graph } = await import("./meta.server");
    const { supabaseAdmin: admin } = await import("@/integrations/supabase/client.server");
    const brand = data.brand;
    const c = readMetaCreds(brand);
    const save = async (row: Record<string, unknown>) => {
      await admin.from("meta_connection").upsert({ user_id: context.userId, brand_slug: brand, checked_at: new Date().toISOString(), ...row });
    };
    if (!c) {
      const n = metaSecretNames(brand);
      await save({ status: "not_connected", last_error: "Meta secrets for this business are not set yet" });
      return { status: "not_connected" as const, message: `Add ${n.token}, ${n.pageId} and ${n.igUserId} as secrets.` };
    }
    try {
      const page = await graph<{ name: string; instagram_business_account?: { id: string; username?: string } }>(c, "GET", c.pageId, {
        fields: "name,instagram_business_account{id,username}",
      });
      const linked = page.instagram_business_account?.id;
      if (linked !== c.igUserId) {
        const msg = `The Instagram account ${c.igUserId} is not the one linked to Page "${page.name}" (${linked ?? "none linked"}).`;
        await save({ status: "error", page_id: c.pageId, page_name: page.name, last_error: msg });
        return { status: "error" as const, message: msg };
      }
      const dbg = await graph<{ data: { expires_at?: number; data_access_expires_at?: number; scopes?: string[]; is_valid?: boolean } }>(c, "GET", "debug_token", {
        input_token: c.token,
      }).catch(() => null);
      const needed = ["instagram_basic", "instagram_content_publish", "pages_manage_posts", "pages_read_engagement", "pages_show_list"];
      const scopes = dbg?.data.scopes ?? [];
      const missing = dbg ? needed.filter((s) => !scopes.includes(s)) : [];
      const exp = dbg?.data.expires_at ? new Date(dbg.data.expires_at * 1000).toISOString() : null;
      const status = missing.length ? "error" : "connected";
      const msg = missing.length ? `Token is missing permissions: ${missing.join(", ")}` : null;
      await save({
        status,
        page_id: c.pageId,
        page_name: page.name,
        ig_user_id: linked,
        ig_username: page.instagram_business_account?.username ?? null,
        token_expires_at: exp,
        scopes,
        last_error: msg,
      });
      if (status === "connected") {
        // Already-dated items of this business get their posting entries now (idempotent).
        const { data: dated } = await admin.from("assets").select("id").eq("user_id", context.userId).eq("brand_slug", brand).eq("skipped", false).not("scheduled_at", "is", null);
        const rows = (dated ?? []).flatMap((a) => (["instagram", "facebook"] as const).map((platform) => ({ user_id: context.userId, asset_id: a.id, platform })));
        for (let i = 0; i < rows.length; i += 500) await admin.from("publications").upsert(rows.slice(i, i + 500), { onConflict: "asset_id,platform", ignoreDuplicates: true });
      }
      return { status, message: msg ?? `Connected to ${page.name} and @${page.instagram_business_account?.username ?? linked}` };
    } catch (e) {
      const msg = (e as Error).message;
      await save({ status: "error", last_error: msg });
      return { status: "error" as const, message: msg };
    }
  });

/**
 * Activates publishing. Publication rows are created by the assets trigger when items are dated
 * (Skyline only). Only APPROVED items are checked for readiness; unapproved items are never claimed.
 */
export const activatePublishing = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { activationBlockers } = await import("./publishing-rules");
    const { data: conns } = await supabase.from("meta_connection").select("brand_slug, status").eq("status", "connected");
    const brands = (conns ?? []).map((c) => c.brand_slug);
    if (!brands.length) return { ok: false, message: "Connect and check a business's Meta accounts first." };
    // Each business posts only with its own connected accounts.
    const { data: assets, error } = await supabase
      .from("assets")
      .select("id, kind, audio_state, caption, approved, skipped, scheduled_at, upload_state")
      .eq("skipped", false)
      .in("brand_slug", brands)
      .not("scheduled_at", "is", null);
    if (error) throw error;
    const blockers = activationBlockers(assets ?? []);
    if (blockers.length) return { ok: false, message: `${blockers.length} approved items are not ready (upload, caption or Reel audio). Fix or unapprove them.` };
    const approved = (assets ?? []).filter((a) => a.approved).length;
    const { error: se } = await supabase.from("settings").upsert({ user_id: userId, publishing_active: true, updated_at: new Date().toISOString() });
    if (se) throw se;
    return { ok: true, message: `Publishing is active. ${approved} approved items will be posted; unapproved items wait until you approve them.` };
  });

/** Owner action on a missed slot: put it back into the planner, or skip it. Never posts late. */
export const resolveMissed = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { assetId: string; action: "reschedule" | "skip" }) => {
    if (!d || typeof d.assetId !== "string" || !["reschedule", "skip"].includes(d.action)) throw new Error("Invalid request");
    return d;
  })
  .handler(async ({ context, data }) => {
    const { data: asset } = await context.supabase.from("assets").select("id").eq("id", data.assetId).maybeSingle();
    if (!asset) throw new Error("Not found");
    const { supabaseAdmin: admin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await admin
      .from("publications")
      .update({ status: data.action === "reschedule" ? "pending" : "skipped", last_error: null, updated_at: new Date().toISOString() })
      .eq("asset_id", data.assetId)
      .eq("user_id", context.userId)
      .eq("status", "missed")
      .select("id");
    if (error) throw error;
    if (!rows?.length) return { ok: false, message: "Nothing to change — this item is no longer missed." };
    const patch = data.action === "reschedule" ? { scheduled_at: null, approved: false } : { skipped: true };
    const { error: ae } = await context.supabase.from("assets").update(patch).eq("id", data.assetId);
    if (ae) throw ae;
    return { ok: true, message: data.action === "reschedule" ? "Back in the planner. Use “Date new items” in Calendar." : "Skipped. The original file is kept." };
  });

/** Marks an "unknown" publication after the user checked the account manually. */
export const resolvePublication = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { id: string; outcome: "published" | "retry" | "skip"; permalink?: string }) => d)
  .handler(async ({ context, data }) => {
    const { data: pub } = await context.supabase.from("publications").select("id, status").eq("id", data.id).single();
    if (!pub) throw new Error("Not found");
    const { supabaseAdmin: admin } = await import("@/integrations/supabase/client.server");
    const patch =
      data.outcome === "published"
        ? { status: "published", permalink: data.permalink ?? null, published_at: new Date().toISOString(), last_error: null }
        : data.outcome === "retry"
          ? { status: "retry", container_id: null, next_attempt_at: null, last_error: null }
          : { status: "skipped" };
    await admin.from("publications").update(patch).eq("id", data.id);
    return { ok: true };
  });

/** Owner-initiated permanent delete: removes the file(s) from storage and every record of the item. */
export const deleteAssets = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { ids: string[] }) => {
    if (!d || !Array.isArray(d.ids) || !d.ids.length || d.ids.length > 100 || d.ids.some((id) => typeof id !== "string")) throw new Error("Invalid request");
    return d;
  })
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const { data: assets, error } = await supabase
      .from("assets")
      .select("id, file_name, storage_path, cover_path, rendered_path")
      .in("id", data.ids);
    if (error) throw error;
    if (!assets?.length) return { ok: false, deleted: 0, message: "Nothing found to delete." };
    const { supabaseAdmin: admin } = await import("@/integrations/supabase/client.server");
    const ids = assets.map((a) => a.id);
    // Only a send that is running right now (live lease) blocks deletion; stuck/unknown rows can be removed by the owner.
    const { data: busy, error: be } = await admin
      .from("publications")
      .select("asset_id")
      .in("asset_id", ids)
      .gt("lease_until", new Date().toISOString());
    if (be) throw be;
    const busyIds = new Set((busy ?? []).map((b) => b.asset_id));
    const doomed = assets.filter((a) => !busyIds.has(a.id));
    const kept = assets.filter((a) => busyIds.has(a.id)).map((a) => a.file_name);
    if (!doomed.length) return { ok: false, deleted: 0, message: `Sending right now, try again in a few minutes: ${kept.join(", ")}` };
    const dIds = doomed.map((a) => a.id);
    await admin.from("metric_snapshots").delete().in("asset_id", dIds);
    await admin.from("content_drafts").delete().in("source_asset_id", dIds);
    await admin.from("render_jobs").delete().in("asset_id", dIds);
    await admin.from("publications").delete().in("asset_id", dIds);
    const paths = doomed.flatMap((a) => [a.storage_path, a.cover_path, a.rendered_path].filter((p): p is string => !!p));
    if (paths.length) await admin.storage.from("media").remove(paths);
    const { error: de } = await admin.from("assets").delete().in("id", dIds).eq("user_id", userId);
    if (de) throw de;
    const extra = kept.length ? ` Kept ${kept.length} that are sending right now: ${kept.join(", ")}.` : "";
    return { ok: true, deleted: doomed.length, message: `Deleted ${doomed.length} item${doomed.length === 1 ? "" : "s"} permanently.${extra}` };
  });
