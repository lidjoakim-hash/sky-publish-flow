/**
 * Bounded publisher tick. Each publication (asset x platform) is a small state machine:
 * pending -> sending -> processing -> publishing -> confirming -> published
 * Intent is persisted before every remote write; anything interrupted mid-send becomes
 * "unknown" for manual reconciliation, never a blind retry.
 */
import { graph, MetaError, readMetaCreds, ruploadFromUrl, type MetaCreds } from "./meta.server";
import { missedAlertMessage } from "./publishing-rules";

type Admin = Awaited<typeof import("@/integrations/supabase/client.server")>["supabaseAdmin"];
interface Pub {
  id: string;
  user_id: string;
  asset_id: string;
  platform: "instagram" | "facebook";
  status: string;
  container_id: string | null;
  remote_id: string | null;
  attempts: number;
}

const SIGNED_URL_TTL = 60 * 60 * 6; // 6h: covers Meta ingestion/processing
const MAX_ATTEMPTS = 5;

export async function runPublisherTick(admin: Admin, owner: string, deadlineMs = 20000) {
  const started = Date.now();
  const report = { reconciled: 0, processed: 0, skippedNoCreds: false };

  // Interrupted sends (lease expired while sending/publishing) need human review.
  const { data: stuck } = await admin
    .from("publications")
    .update({ status: "unknown", last_error: "Interrupted after sending; check the account before retrying", lease_owner: null, lease_until: null })
    .in("status", ["sending", "publishing"])
    .lt("lease_until", new Date().toISOString())
    .select("id, user_id");
  for (const s of stuck ?? []) await alert(admin, s.user_id, "warning", "A post needs review: the outcome of a send is unknown.");
  report.reconciled = stuck?.length ?? 0;

  // Slots older than the claim window become "missed" (never posted late), one alert per item.
  const { data: missed, error: me } = await admin.rpc("mark_missed_publications");
  if (me) throw me;
  const seen = new Set<string>();
  for (const m of missed ?? []) {
    if (seen.has(m.asset_id)) continue;
    seen.add(m.asset_id);
    await alert(admin, m.user_id, "warning", missedAlertMessage(m.file_name, m.scheduled_at));
  }

  const creds = readMetaCreds();
  if (!creds) {
    report.skippedNoCreds = true;
    return report;
  }
  const { data: claimed, error } = await admin.rpc("claim_publications", { _owner: owner, _limit: 6 });
  if (error) throw error;
  for (const pub of (claimed ?? []) as Pub[]) {
    if (Date.now() - started > deadlineMs) {
      await admin.from("publications").update({ lease_owner: null, lease_until: null }).eq("id", pub.id);
      continue;
    }
    await step(admin, creds, pub).catch((e) => handleError(admin, pub, e));
    report.processed++;
  }
  return report;
}

async function set(admin: Admin, id: string, patch: Record<string, unknown>) {
  const { error } = await admin.from("publications").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) throw error;
}

async function alert(admin: Admin, userId: string, level: string, message: string) {
  await admin.from("alerts").insert({ user_id: userId, level, message });
}

async function mediaUrls(admin: Admin, assetId: string) {
  const { data: a, error } = await admin.from("assets").select("*").eq("id", assetId).single();
  if (error || !a) throw new MetaError("Asset missing", "permanent");
  const path = a.kind === "reel" ? (a.rendered_path ?? a.storage_path) : a.storage_path;
  if (!path) throw new MetaError("Media not uploaded", "permanent");
  const sign = async (p: string) => {
    const { data, error: e } = await admin.storage.from("media").createSignedUrl(p, SIGNED_URL_TTL);
    if (e || !data) throw new MetaError(`Could not sign media URL: ${e?.message}`, "transient");
    return data.signedUrl;
  };
  return { asset: a, url: await sign(path), coverUrl: a.cover_path ? await sign(a.cover_path) : undefined };
}

async function step(admin: Admin, c: MetaCreds, pub: Pub) {
  if (pub.platform === "instagram") return stepInstagram(admin, c, pub);
  return stepFacebook(admin, c, pub);
}

async function stepInstagram(admin: Admin, c: MetaCreds, pub: Pub) {
  if (pub.status === "pending" || pub.status === "retry") {
    const { asset, url, coverUrl } = await mediaUrls(admin, pub.asset_id);
    await set(admin, pub.id, { status: "sending", intent_at: new Date().toISOString(), attempts: pub.attempts + 1 });
    const params =
      asset.kind === "reel"
        ? { media_type: "REELS", video_url: url, caption: asset.caption ?? "", cover_url: coverUrl, share_to_feed: "true" }
        : { image_url: url, caption: asset.caption ?? "" };
    const r = await graph<{ id: string }>(c, "POST", `${c.igUserId}/media`, params);
    await set(admin, pub.id, { status: "processing", container_id: r.id, next_attempt_at: new Date(Date.now() + 30000).toISOString(), lease_owner: null, lease_until: null });
    return;
  }
  if (pub.status === "processing" && pub.container_id) {
    const s = await graph<{ status_code: string; status?: string }>(c, "GET", pub.container_id, { fields: "status_code,status" });
    if (s.status_code === "IN_PROGRESS") {
      await set(admin, pub.id, { next_attempt_at: new Date(Date.now() + 60000).toISOString(), lease_owner: null, lease_until: null });
      return;
    }
    if (s.status_code === "ERROR" || s.status_code === "EXPIRED") throw new MetaError(`Instagram processing ${s.status_code}: ${s.status ?? ""}`, "permanent");
    if (s.status_code === "PUBLISHED") throw new MetaError("Container already published; reconcile manually", "unknown");
    await set(admin, pub.id, { status: "publishing", intent_at: new Date().toISOString() });
    const p = await graph<{ id: string }>(c, "POST", `${c.igUserId}/media_publish`, { creation_id: pub.container_id });
    const m = await graph<{ permalink?: string }>(c, "GET", p.id, { fields: "permalink" }).catch(() => ({ permalink: undefined }));
    await set(admin, pub.id, { status: "published", remote_id: p.id, permalink: m.permalink ?? null, published_at: new Date().toISOString(), last_error: null, lease_owner: null, lease_until: null });
  }
}

async function stepFacebook(admin: Admin, c: MetaCreds, pub: Pub) {
  if (pub.status === "pending" || pub.status === "retry") {
    const { asset, url } = await mediaUrls(admin, pub.asset_id);
    await set(admin, pub.id, { status: "sending", intent_at: new Date().toISOString(), attempts: pub.attempts + 1 });
    if (asset.kind === "post") {
      const r = await graph<{ id: string; post_id?: string }>(c, "POST", `${c.pageId}/photos`, { url, message: asset.caption ?? "", published: "true" });
      await set(admin, pub.id, { status: "processing", container_id: r.id, remote_id: r.post_id ?? null, next_attempt_at: new Date(Date.now() + 20000).toISOString(), lease_owner: null, lease_until: null });
    } else {
      const start = await graph<{ video_id: string }>(c, "POST", `${c.pageId}/video_reels`, { upload_phase: "start" });
      await set(admin, pub.id, { container_id: start.video_id });
      await ruploadFromUrl(c, start.video_id, url);
      await graph(c, "POST", `${c.pageId}/video_reels`, { upload_phase: "finish", video_id: start.video_id, video_state: "PUBLISHED", description: asset.caption ?? "" });
      await set(admin, pub.id, { status: "processing", next_attempt_at: new Date(Date.now() + 60000).toISOString(), lease_owner: null, lease_until: null });
    }
    return;
  }
  if (pub.status === "processing" && pub.container_id) {
    // Submission is not proof of publication: confirm via the API.
    const { data: a } = await admin.from("assets").select("kind").eq("id", pub.asset_id).single();
    if (a?.kind === "post") {
      const id = pub.remote_id ?? pub.container_id;
      const p = await graph<{ id: string; permalink_url?: string; is_published?: boolean }>(c, "GET", id, { fields: pub.remote_id ? "permalink_url,is_published" : "link" });
      if (pub.remote_id && p.is_published === false) return later(admin, pub.id);
      await set(admin, pub.id, { status: "published", permalink: p.permalink_url ?? (p as { link?: string }).link ?? null, published_at: new Date().toISOString(), lease_owner: null, lease_until: null, last_error: null });
    } else {
      const v = await graph<{ status?: { video_status?: string; publishing_phase?: { status?: string } }; permalink_url?: string }>(c, "GET", pub.container_id, { fields: "status,permalink_url" });
      const vs = v.status?.video_status;
      if (vs === "error") throw new MetaError("Facebook video processing failed", "permanent");
      if (vs === "ready" && v.status?.publishing_phase?.status === "complete") {
        await set(admin, pub.id, { status: "published", remote_id: pub.container_id, permalink: v.permalink_url ? `https://www.facebook.com${v.permalink_url}` : null, published_at: new Date().toISOString(), lease_owner: null, lease_until: null, last_error: null });
      } else return later(admin, pub.id);
    }
  }
}

const later = (admin: Admin, id: string) => set(admin, id, { next_attempt_at: new Date(Date.now() + 90000).toISOString(), lease_owner: null, lease_until: null });

async function handleError(admin: Admin, pub: Pub, e: unknown) {
  const err = e instanceof MetaError ? e : new MetaError((e as Error).message ?? String(e), "unknown");
  const msg = err.message.slice(0, 500);
  if (err.kind === "auth") {
    await admin.from("settings").update({ publishing_active: false }).eq("user_id", pub.user_id);
    await admin.from("meta_connection").upsert({ user_id: pub.user_id, status: "error", last_error: msg, checked_at: new Date().toISOString() });
    await set(admin, pub.id, { status: pub.status === "sending" || pub.status === "publishing" ? "unknown" : "retry", last_error: msg, lease_owner: null, lease_until: null });
    await alert(admin, pub.user_id, "error", "Publishing paused: the Meta access token was rejected or expired.");
    return;
  }
  const { data: cur } = await admin.from("publications").select("status, attempts").eq("id", pub.id).single();
  const wasSending = cur?.status === "sending" || cur?.status === "publishing";
  if (err.kind === "unknown" || (wasSending && err.kind !== "permanent" && err.kind !== "transient")) {
    await set(admin, pub.id, { status: "unknown", last_error: msg, lease_owner: null, lease_until: null });
    await alert(admin, pub.user_id, "warning", `Needs review (${pub.platform}): ${msg}`);
    return;
  }
  const attempts = cur?.attempts ?? pub.attempts;
  if (err.kind === "transient" && attempts < MAX_ATTEMPTS) {
    const backoff = Math.min(60, 2 ** attempts) * 60000;
    const back = wasSending ? "retry" : cur?.status === "processing" ? "processing" : "retry";
    await set(admin, pub.id, { status: back, last_error: msg, next_attempt_at: new Date(Date.now() + backoff).toISOString(), lease_owner: null, lease_until: null });
    return;
  }
  await set(admin, pub.id, { status: "failed", last_error: msg, lease_owner: null, lease_until: null });
  await alert(admin, pub.user_id, "error", `${pub.platform === "instagram" ? "Instagram" : "Facebook"} failed: ${msg}`);
}
