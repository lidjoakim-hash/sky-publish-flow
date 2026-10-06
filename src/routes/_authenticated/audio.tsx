import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Music2, Upload, RefreshCw, X, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Slider } from "@/components/ui/slider";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AudioBadge, Empty, PageHeader, Panel, Stat } from "@/components/app-ui";
import { supabase } from "@/integrations/supabase/client";
import { assetsQuery, jobsQuery, settingsQuery, signedUrl, tracksQuery, type Asset } from "@/lib/queries";
import { AUDIO_MODES, AUDIO_MODE_LABEL, TRENDING_LIMITATION, effectiveAudioMode } from "@/lib/reel-audio";
import { probeAudioInBrowser, reelAudioOk } from "@/lib/audio";
import { RenderProgress } from "@/components/render-progress";

export const Route = createFileRoute("/_authenticated/audio")({
  head: () => ({ meta: [{ title: "Audio Studio — Skyline Publisher" }, { name: "description", content: "Make sure every Reel has audible, licensed audio." }, { property: "og:title", content: "Audio Studio — Skyline Publisher" }, { property: "og:description", content: "Make sure every Reel has audible, licensed audio." }] }),
  component: AudioPage,
});

function AudioPage() {
  const qc = useQueryClient();
  const { data: assets = [] } = useQuery(assetsQuery);
  const { data: tracks = [] } = useQuery(tracksQuery);
  const { data: jobs = [], isError: jobsError } = useQuery(jobsQuery);
  const { data: settings } = useQuery(settingsQuery);
  async function setDefaultAudio(v: string) {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;
    const { error } = await supabase.from("settings").update({ reel_audio_mode: v }).eq("user_id", u.user.id);
    if (error) return toast.error(error.message);
    toast.success(`Default Reel audio: ${AUDIO_MODE_LABEL[effectiveAudioMode(v, null)]}`);
    qc.invalidateQueries({ queryKey: ["settings"] });
  }
  const reels = useMemo(() => assets.filter((a) => a.kind === "reel" && !a.skipped), [assets]);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [trackId, setTrackId] = useState<string>("rotate");
  const [mode, setMode] = useState<"replace" | "mix">("replace");
  const [volume, setVolume] = useState(80);
  const [license, setLicense] = useState("");
  const [checking, setChecking] = useState(false);
  const [queueing, setQueueing] = useState(false);
  const [renderIds, setRenderIds] = useState<string[]>([]);
  useEffect(() => {
    try {
      const saved: unknown = JSON.parse(sessionStorage.getItem("skyline-render-progress") ?? "[]");
      if (Array.isArray(saved) && saved.every((id) => typeof id === "string")) setRenderIds(saved);
    } catch { /* Progress remains available from the current queue. */ }
  }, []);
  const progressJobs = useMemo(() => renderIds.length ? jobs.filter((j) => renderIds.includes(j.id)) : jobs.filter((j) => j.mode !== "probe" && ["queued", "processing"].includes(j.status)), [jobs, renderIds]);
  const [compare, setCompare] = useState<{ a: Asset; orig: string | null; out: string | null } | null>(null);
  const [trackUrl, setTrackUrl] = useState<{ id: string; url: string | null } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const jobByAsset = useMemo(() => {
    const m = new Map<string, (typeof jobs)[number]>();
    for (const j of jobs) if (!m.has(j.asset_id)) m.set(j.asset_id, j);
    return m;
  }, [jobs]);

  const counts = {
    ready: reels.filter((r) => reelAudioOk(r.audio_state)).length,
    silent: reels.filter((r) => r.audio_state === "silent").length,
    missing: reels.filter((r) => r.audio_state === "missing").length,
    other: reels.filter((r) => ["unchecked", "failed", "processing"].includes(r.audio_state)).length,
  };

  async function uploadTrack(f: File) {
    if (!license.trim()) return toast.error("Describe the licence first (for example: 'Epidemic Sound, licence #123').");
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;
    const path = `${u.user.id}/music/${crypto.randomUUID()}.${f.name.split(".").pop()}`;
    const up = await supabase.storage.from("media").upload(path, f, { contentType: f.type });
    if (up.error) return toast.error(up.error.message);
    let duration: number | null = null;
    try {
      duration = (await probeAudioInBrowser(f)).duration;
    } catch {
      /* ignore */
    }
    await supabase.from("audio_tracks").insert({ name: f.name, storage_path: path, license_note: license, duration_s: duration });
    setLicense("");
    qc.invalidateQueries({ queryKey: ["tracks"] });
    toast.success("Track added.");
  }

  async function queue() {
    if (queueing) return;
    const ids = [...sel];
    if (!ids.length) return toast("Select Reels first.");
    if (!tracks.length) return toast.error("Upload a licensed track first.");
    const rows = ids.map((asset_id, i) => ({
      asset_id,
      track_id: trackId === "rotate" ? tracks[i % tracks.length].id : trackId,
      mode,
      music_volume: volume / 100,
    }));
    setQueueing(true);
    try {
    const { data, error } = await supabase.from("render_jobs").insert(rows).select("id");
    if (error) return toast.error(error.message);
    const queuedIds = (data ?? []).map((j) => j.id);
    setRenderIds(queuedIds);
    try { sessionStorage.setItem("skyline-render-progress", JSON.stringify(queuedIds)); } catch { /* Optional persistence. */ }
    await supabase.from("assets").update({ audio_state: "processing" }).in("id", ids);
    setSel(new Set());
    toast.success(`${ids.length} renders queued. They start when your render worker is running.`);
    await qc.invalidateQueries();
    } catch { toast.error("Could not refresh the render queue. Check the Reels list before trying again."); }
    finally { setQueueing(false); }
  }

  async function recheck() {
    setChecking(true);
    let n = 0;
    for (const r of reels.filter((x) => x.storage_path && !x.rendered_path)) {
      const url = await signedUrl(r.storage_path!);
      if (!url) continue;
      try {
        const blob = await (await fetch(url)).blob();
        const res = await probeAudioInBrowser(blob);
        await supabase.from("assets").update({ audio_state: res.state, audio_rms_db: res.rmsDb }).eq("id", r.id);
        n++;
      } catch {
        await supabase.from("assets").update({ audio_state: "failed" }).eq("id", r.id);
      }
    }
    setChecking(false);
    qc.invalidateQueries({ queryKey: ["assets"] });
    toast.success(`${n} Reels checked.`);
  }

  async function workerProbe() {
    const ids = reels.filter((r) => ["unchecked", "failed"].includes(r.audio_state) && r.storage_path).map((r) => r.id);
    if (!ids.length) return toast("No unchecked Reels.");
    const { error } = await supabase.from("render_jobs").insert(ids.map((asset_id) => ({ asset_id, mode: "probe" as const })));
    if (error) return toast.error(error.message);
    toast.success(`${ids.length} Reels queued for an exact check by your render worker.`);
    qc.invalidateQueries();
  }

  async function cancel(id: string) {
    await supabase.from("render_jobs").update({ cancel_requested: true }).eq("id", id);
    await supabase.from("render_jobs").update({ status: "cancelled" }).eq("id", id).eq("status", "queued");
    qc.invalidateQueries();
  }

  async function openCompare(a: Asset) {
    setCompare({ a, orig: a.storage_path ? await signedUrl(a.storage_path) : null, out: a.rendered_path ? await signedUrl(a.rendered_path) : null });
  }

  const needing = reels.filter((r) => !reelAudioOk(r.audio_state));
  const withSound = reels.filter((r) => r.audio_state === "existing");
  const toggle = (id: string) => setSel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="Audio Studio" subtitle="Every Reel needs audible audio before it can be approved. Originals are never changed." actions={<><Button variant="outline" onClick={recheck} disabled={checking}><RefreshCw /> {checking ? "Checking…" : "Re-check in browser"}</Button>{counts.other > 0 && <Button variant="outline" onClick={workerProbe}>Exact check with worker</Button>}</>} />
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Ready" value={counts.ready} tone="teal" />
        <Stat label="Silent audio" value={counts.silent} tone="warn" />
        <Stat label="Missing audio" value={counts.missing} tone="warn" />
        <Stat label="Unchecked / other" value={counts.other} />
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4">
          <Panel title="Default Reel audio">
            <select aria-label="Default Reel audio" className="h-11 w-full rounded-md border bg-background px-2 text-sm" value={effectiveAudioMode(null, settings?.reel_audio_mode)} onChange={(e) => setDefaultAudio(e.target.value)}>
              {AUDIO_MODES.map((m) => <option key={m} value={m}>{AUDIO_MODE_LABEL[m]}</option>)}
            </select>
            <p className="mt-2 text-xs text-muted-foreground">{TRENDING_LIMITATION} Change a single Reel under Library → Edit.</p>
          </Panel>
          <Panel title="Your licensed music">
            <Input placeholder="Licence / source note" value={license} onChange={(e) => setLicense(e.target.value)} className="mb-2 h-11" />
            <Button variant="outline" className="w-full" onClick={() => fileRef.current?.click()}><Upload /> Upload MP3 or WAV</Button>
            <input ref={fileRef} type="file" accept=".mp3,.wav,audio/mpeg,audio/wav" className="hidden" onChange={(e) => e.target.files?.[0] && uploadTrack(e.target.files[0])} />
            <ul className="mt-3 space-y-2 text-sm">
              {tracks.map((t) => (
                <li key={t.id} className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Music2 className="size-4 text-teal" /><span className="truncate">{t.name}</span>
                    <span className="ml-auto text-xs text-muted-foreground">{t.duration_s ? `${Math.round(Number(t.duration_s))}s` : ""}</span>
                    <Button size="icon" variant="ghost" aria-label={`Listen to ${t.name}`} onClick={async () => setTrackUrl(trackUrl?.id === t.id ? null : { id: t.id, url: await signedUrl(t.storage_path) })}><Play /></Button>
                  </div>
                  {trackUrl?.id === t.id && trackUrl.url && <audio src={trackUrl.url} controls autoPlay className="w-full" />}
                </li>
              ))}
              {!tracks.length && <li className="text-muted-foreground">No tracks yet. No music is bundled; use only music you are licensed to publish.</li>}
            </ul>
          </Panel>
          <Panel title="Apply to selected Reels">
            <div className="space-y-3 text-sm">
              <Select value={trackId} onValueChange={setTrackId}>
                <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="rotate">Rotate through all tracks</SelectItem>
                  {tracks.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={mode} onValueChange={(v) => setMode(v as "replace" | "mix")}>
                <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="replace">Remove existing sound, add music</SelectItem>
                  <SelectItem value="mix">Keep existing sound, mix in music</SelectItem>
                </SelectContent>
              </Select>
              <div>
                <div className="mb-2 flex justify-between"><span>Music volume</span><span>{volume}%</span></div>
                <Slider value={[volume]} min={10} max={150} step={5} onValueChange={(v) => setVolume(v[0])} />
              </div>
              <p className="text-xs text-muted-foreground">{mode === "replace" ? "The Reel's own sound is removed completely in the new copy; only the music plays. Your original file is kept unchanged." : "The Reel's own sound stays and the music plays underneath."}</p>
              <p className="text-xs text-muted-foreground">Music is looped or trimmed to each Reel, with short fades. The result is a new MP4 (H.264 + AAC) that is checked for sound level, length and size.</p>
               <Button variant="teal" className="w-full" onClick={queue} disabled={!sel.size || queueing}>{queueing ? "Queueing Reels…" : `Render ${sel.size || ""} Reels`}</Button>
            </div>
             {(queueing || progressJobs.length > 0) && <RenderProgress jobs={progressJobs} loading={queueing} error={jobsError} />}
          </Panel>
          <Panel title="Render worker">
            <p className="text-sm text-muted-foreground">
              Rendering runs on your own computer with free FFmpeg (no subscription). It only works while the computer is on. Publishing does not need it. Setup steps are on the Connections page.
            </p>
          </Panel>
        </div>
        <Panel className="lg:col-span-2" title={`Reels (${reels.length})`} action={<div className="flex flex-wrap gap-1">{needing.length > 0 && <Button size="sm" variant="ghost" onClick={() => setSel(new Set(needing.map((r) => r.id)))}>Select all needing audio</Button>}{withSound.length > 0 && <Button size="sm" variant="ghost" onClick={() => { setSel(new Set(withSound.map((r) => r.id))); setMode("replace"); }}>Select all with existing sound</Button>}</div>}>
          {!reels.length ? <Empty>No Reels imported yet.</Empty> : (
            <div className="divide-y">
              {reels.map((r) => {
                const j = jobByAsset.get(r.id);
                return (
                  <div key={r.id} className="flex items-center gap-3 py-2.5">
                    <Checkbox checked={sel.has(r.id)} onCheckedChange={() => toggle(r.id)} aria-label={`Select ${r.file_name}`} className="size-5" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{r.file_name}</div>
                      <div className="text-xs text-muted-foreground">{r.audio_rms_db != null ? `Level ${r.audio_rms_db} dB` : ""}{r.duration_s ? ` · ${r.duration_s}s` : ""}</div>
                      {j && ["queued", "processing"].includes(j.status) && <Progress value={j.progress} className="mt-1 h-1.5" />}
                      {j?.status === "failed" && <div className="text-xs text-destructive">{j.error}</div>}
                    </div>
                    <AudioBadge state={r.audio_state} />
                    {j && ["queued", "processing"].includes(j.status) ? (
                      <Button size="icon" variant="ghost" onClick={() => cancel(j.id)} aria-label="Cancel render"><X /></Button>
                    ) : (
                      <Button size="icon" variant="ghost" onClick={() => openCompare(r)} aria-label="Preview"><Play /></Button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </Panel>
      </div>
      <Dialog open={!!compare} onOpenChange={(o) => !o && setCompare(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>{compare?.a.file_name}</DialogTitle></DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <div><Badge variant="muted" className="mb-1">Original</Badge>{compare?.orig && <video src={compare.orig} controls className="max-h-[50vh] w-full rounded-lg" />}</div>
            <div><Badge variant="teal" className="mb-1">With music</Badge>{compare?.out ? <video src={compare.out} controls className="max-h-[50vh] w-full rounded-lg" /> : <p className="text-sm text-muted-foreground">Not rendered yet. Music is only added once the render worker on your computer has processed this Reel.</p>}</div>
          </div>
          <p className="text-xs text-muted-foreground">
            {compare?.a.audio_state === "silent" || compare?.a.audio_state === "missing" ? "The original has no audible sound — that is expected for this Reel." : "If you hear nothing, check the volume button on the player."}
          </p>
          <div className="hidden">
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
