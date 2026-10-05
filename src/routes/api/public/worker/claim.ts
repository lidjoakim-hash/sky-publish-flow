import { createFileRoute } from "@tanstack/react-router";
import { workerDenied } from "@/lib/worker-auth.server";

/** Local FFmpeg worker claims one render/probe job and gets short-lived signed URLs. */
export const Route = createFileRoute("/api/public/worker/claim")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const denied = workerDenied(request);
        if (denied) return denied;
        const { supabaseAdmin: admin } = await import("@/integrations/supabase/client.server");
        const { data, error } = await admin.rpc("claim_render_job", { _owner: `worker-${crypto.randomUUID()}` });
        if (error) return Response.json({ error: error.message }, { status: 500 });
        const job = data?.[0];
        if (!job) return Response.json({ job: null });
        const { data: asset } = await admin.from("assets").select("id, user_id, storage_path, file_name").eq("id", job.asset_id).single();
        if (!asset?.storage_path) {
          await admin.from("render_jobs").update({ status: "failed", error: "Original not uploaded" }).eq("id", job.id);
          return Response.json({ job: null });
        }
        const src = await admin.storage.from("media").createSignedUrl(asset.storage_path, 3600);
        let trackUrl: string | null = null;
        if (job.track_id) {
          const { data: t } = await admin.from("audio_tracks").select("storage_path").eq("id", job.track_id).single();
          if (t) trackUrl = (await admin.storage.from("media").createSignedUrl(t.storage_path, 3600)).data?.signedUrl ?? null;
        }
        let upload: { path: string; token: string; signedUrl: string } | null = null;
        if (job.mode !== "probe") {
          const outPath = `${asset.user_id}/rendered/${asset.id}-${job.id}.mp4`;
          const u = await admin.storage.from("media").createSignedUploadUrl(outPath);
          if (u.data) upload = { path: outPath, token: u.data.token, signedUrl: u.data.signedUrl };
        }
        return Response.json({ job: { id: job.id, mode: job.mode, music_volume: job.music_volume, source_url: src.data?.signedUrl, track_url: trackUrl, upload } });
      },
    },
  },
});
