import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { workerDenied } from "@/lib/worker-auth.server";
import { classifyLevel } from "@/lib/audio";

const Body = z.object({
  job_id: z.string().uuid(),
  status: z.enum(["processing", "completed", "failed"]),
  progress: z.number().min(0).max(100).optional(),
  error: z.string().max(1000).optional(),
  output_path: z.string().max(500).optional(),
  verification: z
    .object({
      has_audio: z.boolean(),
      rms_db: z.number().nullable(),
      loudness_lufs: z.number().nullable().optional(),
      duration_s: z.number(),
      width: z.number().int(),
      height: z.number().int(),
      size_bytes: z.number(),
      video_codec: z.string(),
      audio_codec: z.string().nullable(),
    })
    .optional(),
});

export const Route = createFileRoute("/api/public/worker/update")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const denied = workerDenied(request);
        if (denied) return denied;
        const parsed = Body.safeParse(await request.json().catch(() => null));
        if (!parsed.success) return Response.json({ error: "Invalid body" }, { status: 400 });
        const b = parsed.data;
        const { supabaseAdmin: admin } = await import("@/integrations/supabase/client.server");
        const { data: job } = await admin.from("render_jobs").select("*").eq("id", b.job_id).single();
        if (!job) return Response.json({ error: "Not found" }, { status: 404 });
        if (job.cancel_requested) {
          await admin.from("render_jobs").update({ status: "cancelled", updated_at: new Date().toISOString() }).eq("id", job.id);
          return Response.json({ cancel: true });
        }
        const now = new Date().toISOString();
        if (b.status === "processing") {
          await admin.from("render_jobs").update({ progress: b.progress ?? job.progress, lease_until: new Date(Date.now() + 600000).toISOString(), updated_at: now }).eq("id", job.id);
          return Response.json({ cancel: false });
        }
        if (b.status === "failed") {
          await admin.from("render_jobs").update({ status: "failed", error: b.error ?? "Unknown error", updated_at: now }).eq("id", job.id);
          await admin.from("assets").update({ audio_state: "failed" }).eq("id", job.asset_id);
          return Response.json({ ok: true });
        }
        const v = b.verification;
        if (!v) return Response.json({ error: "Verification required" }, { status: 400 });
        const level = classifyLevel(v.has_audio, v.rms_db);
        if (job.mode === "probe") {
          await admin.from("assets").update({ audio_state: level, audio_rms_db: v.rms_db, duration_s: v.duration_s, width: v.width, height: v.height }).eq("id", job.asset_id);
          await admin.from("render_jobs").update({ status: "completed", progress: 100, verification: v, updated_at: now }).eq("id", job.id);
          return Response.json({ ok: true });
        }
        const problems: string[] = [];
        if (level !== "existing") problems.push(`audio ${level}`);
        if (v.audio_codec !== "aac") problems.push("audio is not AAC");
        if (v.video_codec !== "h264") problems.push("video is not H.264");
        if (v.duration_s < 3 || v.duration_s > 900) problems.push("duration outside Reels range");
        if (v.size_bytes > 1024 * 1024 * 1024) problems.push("file larger than 1 GB");
        const expectedPrefix = `${job.user_id}/rendered/`;
        if (!b.output_path?.startsWith(expectedPrefix)) problems.push("unexpected output path");
        if (problems.length) {
          await admin.from("render_jobs").update({ status: "failed", error: `Verification failed: ${problems.join(", ")}`, verification: v, updated_at: now }).eq("id", job.id);
          await admin.from("assets").update({ audio_state: "failed" }).eq("id", job.asset_id);
          return Response.json({ ok: false, problems });
        }
        await admin.from("render_jobs").update({ status: "completed", progress: 100, output_path: b.output_path, verification: v, updated_at: now }).eq("id", job.id);
        await admin.from("assets").update({ audio_state: "ready", rendered_path: b.output_path, rendered_verified: v }).eq("id", job.asset_id);
        return Response.json({ ok: true });
      },
    },
  },
});
