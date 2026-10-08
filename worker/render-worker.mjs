#!/usr/bin/env node
/**
 * Skyline Publisher local render worker.
 * Requires Node 18+ and ffmpeg/ffprobe on PATH. Runs on your computer; it only works while the
 * computer is on. Publishing of already-rendered files runs in the cloud and does not need it.
 *
 *   SKYLINE_URL=https://<your-app> WORKER_SECRET=... node worker/render-worker.mjs
 */
import { spawn } from "node:child_process";
import { mkdtemp, writeFile, readFile, stat, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const BASE = process.env.SKYLINE_URL;
const SECRET = process.env.WORKER_SECRET;
if (!BASE || !SECRET) {
  console.error("Set SKYLINE_URL and WORKER_SECRET");
  process.exit(1);
}
const api = (path, body) =>
  fetch(`${BASE}/api/public/worker/${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${SECRET}`, "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  }).then((r) => r.json());

function run(cmd, args, onLine) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args);
    let out = "", err = "";
    p.stdout.on("data", (d) => (out += d));
    p.stderr.on("data", (d) => { err += d; onLine?.(String(d)); });
    p.on("close", (code) => (code === 0 ? resolve({ out, err }) : reject(new Error(err.slice(-800)))));
  });
}

async function download(url, file) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Download failed ${r.status}`);
  await writeFile(file, Buffer.from(await r.arrayBuffer()));
}

async function probe(file, withMotion = true, onProgress) {
  const { out } = await run("ffprobe", ["-v", "error", "-show_streams", "-show_format", "-of", "json", file]);
  const j = JSON.parse(out);
  const v = j.streams.find((s) => s.codec_type === "video");
  const a = j.streams.find((s) => s.codec_type === "audio");
  let rms = null;
  let lufs = null;
  if (a) {
    const { err } = await run("ffmpeg", ["-hide_banner", "-i", file, "-map", "0:a:0", "-af", "volumedetect", "-f", "null", "-"]);
    const m = /mean_volume:\s*(-?[\d.]+) dB/.exec(err);
    rms = m ? Number(m[1]) : null;
    const e = await run("ffmpeg", ["-hide_banner", "-nostats", "-i", file, "-map", "0:a:0", "-af", "ebur128", "-f", "null", "-"]);
    const all = [...e.err.matchAll(/I:\s*(-?[\d.]+) LUFS/g)];
    lufs = all.length ? Number(all[all.length - 1][1]) : null;
  }
  let motion = null;
  if (v && withMotion) {
    try { motion = await analyzeMotion(file, Number(j.format.duration), onProgress); } catch (e) { console.error("motion check failed", e.message); }
  }
  return {
    motion,
    has_audio: !!a, rms_db: rms, loudness_lufs: lufs, duration_s: Number(j.format.duration),
    width: v?.width ?? 0, height: v?.height ?? 0, size_bytes: (await stat(file)).size,
    video_codec: v?.codec_name ?? "none", audio_codec: a?.codec_name ?? null,
  };
}

/** Scene-change scores at 8 fps on a small copy; summary mirrors src/lib/motion.ts summarizeScores. */
async function analyzeMotion(file, duration, onProgress) {
  let lastProgress = 0;
  const { out } = await run("ffmpeg", ["-hide_banner", "-nostats", "-i", file, "-an", "-vf", "fps=8,scale=192:-2,select='gte(scene,0)',metadata=print:file=-", "-progress", "pipe:2", "-f", "null", "-"], (line) => {
    const matches = [...line.matchAll(/out_time_ms=(\d+)/g)];
    const latest = matches.at(-1);
    if (!latest || !duration) return;
    const percent = Math.min(95, Math.max(10, Math.round((Number(latest[1]) / 1_000_000 / duration) * 90) + 10));
    if (percent >= lastProgress + 2) {
      lastProgress = percent;
      onProgress?.(percent);
    }
  });
  const scores = [...out.matchAll(/lavfi\.scene_score=([\d.]+)/g)].map((m) => Number(m[1]));
  const n = scores.length;
  if (!n) return { frames: 0, mean: 0, p90: 0, jitter: 0, fast_share: 0 };
  const mean = scores.reduce((s, x) => s + x, 0) / n;
  const sorted = [...scores].sort((a, b) => a - b);
  let j = 0;
  for (let i = 1; i < n; i++) j += Math.abs(scores[i] - scores[i - 1]);
  return { frames: n, mean, p90: sorted[Math.min(n - 1, Math.floor(n * 0.9))], jitter: n > 1 ? j / (n - 1) : 0, fast_share: scores.filter((s) => s > 0.15).length / n };
}

async function handle(job) {
  const dir = await mkdtemp(join(tmpdir(), "skyline-"));
  try {
    const src = join(dir, "src.mp4");
    await download(job.source_url, src);
    if (job.mode === "probe") {
      await api("update", { job_id: job.id, status: "processing", progress: 5 });
      let progressUpdates = Promise.resolve();
      const verification = await probe(src, true, (progress) => {
        progressUpdates = progressUpdates.then(() => api("update", { job_id: job.id, status: "processing", progress }));
      });
      await progressUpdates;
      return api("update", { job_id: job.id, status: "completed", verification });
    }
    if (!job.track_url) throw new Error("No music track");
    const music = join(dir, "music");
    await download(job.track_url, music);
    const info = await probe(src, false);
    const d = info.duration_s;
    const fadeOut = Math.max(0, d - 1.5).toFixed(2);
    const vol = Number(job.music_volume ?? 0.8);
    const musicChain = `[1:a]atrim=0:${d},asetpts=N/SR/TB,volume=${vol},afade=t=in:d=0.5,afade=t=out:st=${fadeOut}:d=1.5[m]`;
    const filter = job.mode === "mix" && info.has_audio
      ? `${musicChain};[0:a][m]amix=inputs=2:duration=first:normalize=0[pre]`
      : `${musicChain};[m]anull[pre]`;
    // Loudness normalisation after the music chain (fades kept): target -14 LUFS, single pass.
    const filterWithLoudnorm = `${filter};[pre]loudnorm=I=-14:TP=-1.5:LRA=11,aresample=48000[a]`;
    const out = join(dir, "out.mp4");
    let lastReport = 0;
    await run("ffmpeg", [
      "-y", "-hide_banner", "-i", src, "-stream_loop", "-1", "-i", music,
      "-filter_complex", filterWithLoudnorm, "-map", "0:v:0", "-map", "[a]",
      "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-pix_fmt", "yuv420p", "-profile:v", "high",
      "-r", "30", "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-ac", "2",
      "-t", String(d), "-movflags", "+faststart", out,
    ], async (line) => {
      const m = /time=(\d+):(\d+):([\d.]+)/.exec(line);
      if (m && Date.now() - lastReport > 3000) {
        lastReport = Date.now();
        const t = +m[1] * 3600 + +m[2] * 60 + +m[3];
        const r = await api("update", { job_id: job.id, status: "processing", progress: Math.min(95, Math.round((t / d) * 100)) });
        if (r.cancel) throw new Error("Cancelled");
      }
    });
    const verification = await probe(out, false);
    const up = await fetch(job.upload.signedUrl, { method: "PUT", headers: { "Content-Type": "video/mp4" }, body: await readFile(out) });
    if (!up.ok) throw new Error(`Upload failed ${up.status}`);
    const r = await api("update", { job_id: job.id, status: "completed", output_path: job.upload.path, verification });
    console.log("done", job.id, r);
  } catch (e) {
    await api("update", { job_id: job.id, status: "failed", error: String(e.message ?? e).slice(0, 900) });
    console.error("failed", job.id, e.message);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

for (;;) {
  try {
    const { job } = await api("claim");
    if (job) await handle(job);
    else await new Promise((r) => setTimeout(r, 15000));
  } catch (e) {
    console.error(e.message);
    await new Promise((r) => setTimeout(r, 30000));
  }
}
