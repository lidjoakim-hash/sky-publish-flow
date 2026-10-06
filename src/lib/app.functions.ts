import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { reelAudioOk } from "./audio";

/** Checks the server-side Meta credentials and that the Instagram account belongs to the Page. */
export const checkMetaConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { readMetaCreds, graph } = await import("./meta.server");
    const { supabaseAdmin: admin } = await import("@/integrations/supabase/client.server");
    const c = readMetaCreds();
    const save = async (row: Record<string, unknown>) => {
      await admin.from("meta_connection").upsert({ user_id: context.userId, checked_at: new Date().toISOString(), ...row });
    };
    if (!c) {
      await save({ status: "not_connected", last_error: "Meta secrets are not set yet" });
      return { status: "not_connected" as const, message: "Add META_PAGE_ACCESS_TOKEN, META_PAGE_ID and META_IG_USER_ID in Project Settings → Secrets." };
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
      return { status, message: msg ?? `Connected to ${page.name} and @${page.instagram_business_account?.username ?? linked}` };
    } catch (e) {
      const msg = (e as Error).message;
      await save({ status: "error", last_error: msg });
      return { status: "error" as const, message: msg };
    }
  });

/** Activates publishing after verifying readiness; creates per-platform publication rows. */
export const activatePublishing = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: conn } = await supabase.from("meta_connection").select("status").maybeSingle();
    if (conn?.status !== "connected") return { ok: false, message: "Connect and check your Meta accounts first." };
    const { data: assets, error } = await supabase
      .from("assets")
      .select("id, kind, audio_state, caption, approved, skipped, scheduled_at, upload_state")
      .eq("skipped", false)
      .eq("brand_slug", "skyline") // Meta secrets belong to Skyline; other brands are never sent with them.
      .not("scheduled_at", "is", null);
    if (error) throw error;
    const blockers = (assets ?? []).filter(
      (a) => !a.approved || a.upload_state !== "done" || !a.caption || (a.kind === "reel" && !reelAudioOk(a.audio_state)),
    );
    if (blockers.length) return { ok: false, message: `${blockers.length} scheduled items are not ready (approval, upload, caption or audio).` };
    const { supabaseAdmin: admin } = await import("@/integrations/supabase/client.server");
    const rows = (assets ?? []).flatMap((a) =>
      (["instagram", "facebook"] as const).map((platform) => ({ user_id: userId, asset_id: a.id, platform })),
    );
    for (let i = 0; i < rows.length; i += 500) {
      const { error: e } = await admin.from("publications").upsert(rows.slice(i, i + 500), { onConflict: "asset_id,platform", ignoreDuplicates: true });
      if (e) throw e;
    }
    await supabase.from("settings").upsert({ user_id: userId, publishing_active: true, updated_at: new Date().toISOString() });
    return { ok: true, message: `Publishing is active for ${assets?.length ?? 0} items.` };
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
