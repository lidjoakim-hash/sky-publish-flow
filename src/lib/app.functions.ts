import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { reelAudioOk } from "./audio";

const SLUG = /^[a-z0-9_-]{1,40}$/;

/**
 * Read-only connection check for one business: verifies the token belongs to the expected Page and has
 * the permissions for that business's chosen platforms. Never queues or sends posts; never returns the token.
 */
export const checkMetaConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { brand?: string } | undefined) => {
    const brand = d?.brand ?? "skyline";
    if (!SLUG.test(brand)) throw new Error("Invalid business");
    return { brand };
  })
  .handler(async ({ context, data }) => {
    const { readMetaCreds, graph } = await import("./meta.server");
    const { verifyMetaConnection } = await import("./meta-verify");
    const { requiredSecrets, DEFAULT_PLATFORMS } = await import("./brand-publishing");
    const { supabaseAdmin: admin } = await import("@/integrations/supabase/client.server");
    const brand = data.brand;
    const { data: bp } = await admin.from("brand_publishing").select("platforms").eq("user_id", context.userId).eq("brand_slug", brand).maybeSingle();
    const platforms = bp?.platforms?.length ? bp.platforms : (DEFAULT_PLATFORMS[brand] ?? []);
    const save = async (row: Record<string, unknown>) => {
      await admin.from("meta_connection").upsert({ user_id: context.userId, brand_slug: brand, checked_at: new Date().toISOString(), ...row });
    };
    if (!platforms.length) return { status: "not_connected" as const, message: "Choose which platforms this business posts to first." };
    const c = readMetaCreds(brand, platforms);
    if (!c) {
      await save({ status: "not_connected", last_error: "Meta secrets for this business are not set yet" });
      return { status: "not_connected" as const, message: `Add ${requiredSecrets(brand, platforms).join(", ")} as secrets.` };
    }
    const { connectionMode, INSTAGRAM_LOGIN_BRANDS } = await import("./brand-publishing");
    if (connectionMode(brand) === "instagram_login") {
      const { verifyInstagramLogin } = await import("./meta-verify");
      try {
        const r = await verifyInstagramLogin((path, params) => graph(c, "GET", path, params), { igUserId: c.igUserId!, expectedUsername: INSTAGRAM_LOGIN_BRANDS[brand].expectedUsername });
        const { message, ...rest } = r;
        await save({ ...rest, last_error: r.status === "connected" ? null : message });
        return { status: r.status, message };
      } catch (e) {
        const msg = (e as Error).message.replace(/access_token=[^&\s]+/g, "access_token=***");
        await save({ status: "error", last_error: msg });
        return { status: "error" as const, message: msg };
      }
    }
    try {
      const r = await verifyMetaConnection(
        (path, params) => graph(c, "GET", path, params.input_token === "__SELF__" ? { ...params, input_token: c.token } : params),
        { pageId: c.pageId, igUserId: c.igUserId, platforms, strictScopes: brand !== "skyline" },
      );
      const { message, ...rest } = r;
      await save({ ...rest, last_error: r.status === "connected" ? null : message });
      return { status: r.status, message };
    } catch (e) {
      const msg = (e as Error).message.replace(/access_token=[^&\s]+/g, "access_token=***");
      await save({ status: "error", last_error: msg });
      return { status: "error" as const, message: msg };
    }
  });

/** Owner chooses which platforms a business posts to. Only while that business is paused. */
export const setBrandPlatforms = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { brand: string; platforms: string[] }) => {
    if (!d || !SLUG.test(d.brand)) throw new Error("Invalid business");
    return d;
  })
  .handler(async ({ context, data }) => {
    const { normalizePlatforms } = await import("./brand-publishing");
    const platforms = normalizePlatforms(data.platforms, data.brand);
    const { supabaseAdmin: admin } = await import("@/integrations/supabase/client.server");
    const { data: cur } = await admin.from("brand_publishing").select("enabled").eq("user_id", context.userId).eq("brand_slug", data.brand).maybeSingle();
    if (cur?.enabled) return { ok: false, message: "Pause posting for this business before changing its platforms." };
    const { error } = await admin.from("brand_publishing").upsert({ user_id: context.userId, brand_slug: data.brand, platforms, updated_at: new Date().toISOString() });
    if (error) throw error;
    // A changed platform list needs a fresh connection check.
    await admin.from("meta_connection").update({ status: "not_connected", last_error: "Platforms changed — check the connection again" }).eq("user_id", context.userId).eq("brand_slug", data.brand).neq("brand_slug", "skyline");
    return { ok: true, message: "Platforms saved." };
  });

/**
 * Explicit per-business switch. Turning ON requires a checked connection and the owner's confirmation that
 * a draft/non-public test was reviewed; only then are posting entries created for its approved schedule.
 * The global switch alone never enables a business.
 */
export const setBrandPublishing = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { brand: string; enabled: boolean; testConfirmed?: boolean }) => {
    if (!d || !SLUG.test(d.brand) || typeof d.enabled !== "boolean") throw new Error("Invalid request");
    return d;
  })
  .handler(async ({ context, data }) => {
    const { enableBlocker } = await import("./brand-publishing");
    const { supabaseAdmin: admin } = await import("@/integrations/supabase/client.server");
    const now = new Date().toISOString();
    if (!data.enabled) {
      await admin.from("brand_publishing").update({ enabled: false, updated_at: now }).eq("user_id", context.userId).eq("brand_slug", data.brand);
      return { ok: true, message: "Posting paused for this business." };
    }
    const { data: bp } = await admin.from("brand_publishing").select("platforms").eq("user_id", context.userId).eq("brand_slug", data.brand).maybeSingle();
    const { data: conn } = await admin.from("meta_connection").select("status").eq("user_id", context.userId).eq("brand_slug", data.brand).maybeSingle();
    const blocker = enableBlocker({ connected: conn?.status === "connected", testConfirmed: data.testConfirmed === true, platforms: bp?.platforms ?? [] });
    if (blocker) return { ok: false, message: blocker };
    const { error } = await admin.from("brand_publishing").update({ enabled: true, enabled_at: now, test_confirmed_at: now, updated_at: now }).eq("user_id", context.userId).eq("brand_slug", data.brand);
    if (error) throw error;
    // Queue entries for this business's already-dated items, chosen platforms only (idempotent).
    const { data: dated } = await admin.from("assets").select("id").eq("user_id", context.userId).eq("brand_slug", data.brand).eq("skipped", false).gt("scheduled_at", now);
    const rows = (dated ?? []).flatMap((a) => (bp?.platforms ?? []).map((platform) => ({ user_id: context.userId, asset_id: a.id, platform })));
    for (let i = 0; i < rows.length; i += 500) await admin.from("publications").upsert(rows.slice(i, i + 500), { onConflict: "asset_id,platform", ignoreDuplicates: true });
    return { ok: true, message: `Posting turned on for this business. Only approved items are posted, and only while the main publishing switch is on.` };
  });

/**
 * Turns on the main (global) switch. It does NOT enable any business — each business has its own switch.
 * Only APPROVED items of enabled businesses are checked for readiness.
 */
export const activatePublishing = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { activationBlockers } = await import("./publishing-rules");
    const { data: enabled } = await supabase.from("brand_publishing").select("brand_slug").eq("enabled", true);
    const brands = (enabled ?? []).map((c) => c.brand_slug);
    if (!brands.length) return { ok: false, message: "No business has posting turned on yet (Connections page)." };
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
    return { ok: true, message: `Publishing is active for: ${brands.join(", ")}. ${approved} approved items will be posted; unapproved items wait until you approve them.` };
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

/**
 * Dry run for one business: resolves business → connection mode → account → platforms and checks the readiness
 * of its next dated items. Makes ZERO Meta calls and writes nothing (no queue, no status). Not proof of live posting.
 */
export const dryRunBrand = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { brand: string }) => {
    if (!d || !SLUG.test(d.brand)) throw new Error("Invalid business");
    return d;
  })
  .handler(async ({ context, data }) => {
    const { buildDryRun } = await import("./dry-run");
    const { connectionMode, requiredSecrets, DEFAULT_PLATFORMS } = await import("./brand-publishing");
    const { supabase } = context;
    const brand = data.brand;
    const [{ data: bp }, { data: conn }, { data: st }, { data: assets }] = await Promise.all([
      supabase.from("brand_publishing").select("platforms, enabled").eq("brand_slug", brand).maybeSingle(),
      supabase.from("meta_connection").select("status, ig_username, ig_user_id, page_name").eq("brand_slug", brand).maybeSingle(),
      supabase.from("settings").select("publishing_active, timezone").maybeSingle(),
      supabase.from("assets").select("*").eq("brand_slug", brand).eq("skipped", false).not("scheduled_at", "is", null).gt("scheduled_at", new Date().toISOString()).order("scheduled_at").limit(10),
    ]);
    const platforms = bp?.platforms?.length ? bp.platforms : (DEFAULT_PLATFORMS[brand] ?? []);
    // Secret presence only (booleans) — values never leave the server.
    const secretsPresent = Object.fromEntries(requiredSecrets(brand, platforms).map((n) => [n, !!process.env[n]]));
    return buildDryRun({
      brand, mode: connectionMode(brand), platforms, enabled: !!bp?.enabled, globalActive: !!st?.publishing_active,
      timeZone: st?.timezone ?? "Europe/Oslo", connection: conn ?? null, secretsPresent, assets: (assets ?? []) as never,
    });
  });
