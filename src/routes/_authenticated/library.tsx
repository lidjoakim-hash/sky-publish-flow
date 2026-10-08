import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Activity, CalendarCheck, CalendarPlus, Download, Eye, EyeOff, Film, Image as ImageIcon, Pencil, Trash2, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AudioBadge, Empty, PageHeader } from "@/components/app-ui";
import { supabase } from "@/integrations/supabase/client";
import { assetsQuery, jobsQuery, signedUrl, type Asset } from "@/lib/queries";
import { formatOslo } from "@/lib/schedule";
import { readiness } from "@/lib/readiness";
import { metaIssues } from "@/lib/meta-format";
import { isFlaggedMotion, MOTION_TEXT, type MotionLabel } from "@/lib/motion";
import { AUDIO_MODES, AUDIO_MODE_LABEL, TRENDING_LIMITATION } from "@/lib/reel-audio";
import { deleteAssets } from "@/lib/app.functions";
import { RenderProgress } from "@/components/render-progress";

export const Route = createFileRoute("/_authenticated/library")({
  head: () => ({ meta: [{ title: "Library — Skyline Publisher" }, { name: "description", content: "Review media, captions and readiness." }, { property: "og:title", content: "Library — Skyline Publisher" }, { property: "og:description", content: "Review media, captions and readiness." }] }),
  component: LibraryPage,
});

type Filter = "all" | "reel" | "post" | "needs" | "skipped" | "seasonal" | "scheduled" | "unscheduled" | "shaky";

function LibraryPage() {
  const qc = useQueryClient();
  const { data: assets = [] } = useQuery(assetsQuery);
  const { data: jobs = [], isError: jobsError } = useQuery(jobsQuery);
  const [filter, setFilter] = useState<Filter>("all");
  const [q, setQ] = useState("");
  const [edit, setEdit] = useState<Asset | null>(null);
  const [preview, setPreview] = useState<{ a: Asset; url: string } | null>(null);
  const [motionJobIds, setMotionJobIds] = useState<string[]>([]);
  const [motionCompletionKey, setMotionCompletionKey] = useState("");
  useEffect(() => {
    try {
      const saved: unknown = JSON.parse(sessionStorage.getItem("skyline-motion-progress") ?? "[]");
      if (Array.isArray(saved) && saved.every((id) => typeof id === "string")) setMotionJobIds(saved);
    } catch { /* Current active checks remain visible. */ }
  }, []);

  const list = useMemo(
    () =>
      assets.filter((a) => {
        if (q && !`${a.rel_path} ${a.caption ?? ""} ${a.topics.join(" ")}`.toLowerCase().includes(q.toLowerCase())) return false;
        if (filter === "reel" || filter === "post") return a.kind === filter && !a.skipped;
        if (filter === "skipped") return a.skipped;
        if (filter === "seasonal") return a.seasonal;
        if (filter === "needs") return !a.skipped && readiness(a).some((r) => !r.startsWith("Seasonal"));
        if (filter === "shaky") return !a.skipped && a.kind === "reel" && isFlaggedMotion(a.motion_label);
        if (filter === "scheduled") return !a.skipped && !!a.scheduled_at;
        if (filter === "unscheduled") return !a.skipped && !a.scheduled_at && a.upload_state === "done";
        return true;
      }).sort((a, b) => (filter === "scheduled" ? (a.scheduled_at ?? "").localeCompare(b.scheduled_at ?? "") : 0)),
    [assets, filter, q],
  );
  const scheduledCount = assets.filter((a) => !a.skipped && a.scheduled_at).length;
  const newCount = assets.filter((a) => !a.skipped && !a.scheduled_at && a.upload_state === "done").length;

  const flagged = assets.filter((a) => !a.skipped && a.kind === "reel" && isFlaggedMotion(a.motion_label));
  const unchecked = assets.filter((a) => !a.skipped && a.kind === "reel" && a.upload_state === "done" && !a.motion_label);
  const motionJobs = useMemo(() => {
    const names = new Map(assets.map((asset) => [asset.id, asset.file_name]));
    const visible = motionJobIds.length
      ? jobs.filter((job) => motionJobIds.includes(job.id))
      : jobs.filter((job) => job.mode === "probe" && ["queued", "processing"].includes(job.status));
    return visible.map((job) => ({ ...job, file_name: names.get(job.asset_id) ?? "Reel" }));
  }, [assets, jobs, motionJobIds]);
  useEffect(() => {
    const completed = motionJobs.filter((job) => job.status === "completed").map((job) => job.id).sort().join(",");
    if (completed && completed !== motionCompletionKey) {
      setMotionCompletionKey(completed);
      qc.invalidateQueries({ queryKey: ["assets"] });
    }
  }, [motionCompletionKey, motionJobs, qc]);

  async function checkMotion() {
    const { data, error } = await supabase.from("render_jobs").insert(unchecked.map((a) => ({ asset_id: a.id, mode: "probe" }))).select("id");
    if (error) return toast.error(error.message);
    const ids = (data ?? []).map((job) => job.id);
    setMotionJobIds(ids);
    try { sessionStorage.setItem("skyline-motion-progress", JSON.stringify(ids)); } catch { /* Optional persistence. */ }
    await qc.invalidateQueries({ queryKey: ["render_jobs"] });
    toast.success(`${unchecked.length} Reels queued — the render program on your computer measures the movement.`);
  }

  async function skipFlagged() {
    if (!confirm(`Skip ${flagged.length} shaky/fast Reels? Files are kept and you can unskip any time.`)) return;
    const { error } = await supabase.from("assets").update({ skipped: true, approved: false, scheduled_at: null }).in("id", flagged.map((a) => a.id));
    if (error) toast.error(error.message);
    else toast.success(`Skipped ${flagged.length} Reels`);
    qc.invalidateQueries({ queryKey: ["assets"] });
  }

  async function remove(a: Asset) {
    if (!confirm(`Delete “${a.file_name}” permanently? The file and all its records are removed from the system. This cannot be undone.`)) return;
    const res = await deleteAssets({ data: { ids: [a.id] } });
    if (res.ok) toast.success(res.message);
    else toast.error(res.message);
    qc.invalidateQueries({ queryKey: ["assets"] });
  }

  async function patch(id: string, p: Partial<Asset>) {
    const { error } = await supabase.from("assets").update(p).eq("id", id);
    if (error) toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["assets"] });
  }

  async function open(a: Asset) {
    const path = a.kind === "reel" ? (a.rendered_path ?? a.storage_path) : a.storage_path;
    if (!path) return toast("Not uploaded yet");
    const url = await signedUrl(path);
    if (url) setPreview({ a, url });
  }

  function exportDraft() {
    const esc = (s: string) => `"${s.replace(/"/g, '""')}"`;
    const rows = [["Asset", "Type", "Caption", "Topics", "Scheduled (Oslo)", "Skipped", "Audio"].join(",")];
    for (const a of assets)
      rows.push([esc(a.rel_path), a.kind === "reel" ? "Reel" : "Post", esc(a.caption ?? ""), esc(a.topics.join(" ")), a.scheduled_at ? esc(formatOslo(a.scheduled_at)) : "", a.skipped ? "yes" : "", a.audio_state].join(","));
    const blob = new Blob(["\uFEFF" + rows.join("\r\n")], { type: "text/csv;charset=utf-8" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "skyline-draft.csv";
    link.click();
  }

  const counts = {
    reel: assets.filter((a) => a.kind === "reel" && !a.skipped).length,
    post: assets.filter((a) => a.kind === "post" && !a.skipped).length,
    needs: assets.filter((a) => !a.skipped && readiness(a).some((r) => !r.startsWith("Seasonal"))).length,
  };

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Library"
        subtitle={`Step 2 of 4 · ${counts.reel} Reels · ${counts.post} posts · ${counts.needs} need attention`}
        actions={<Button variant="outline" onClick={exportDraft} disabled={!assets.length}><Download /> Export draft</Button>}
      />
      <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border bg-card p-3 shadow-card">
        <Button size="sm" variant={filter === "scheduled" ? "teal" : "outline"} onClick={() => setFilter("scheduled")}><CalendarCheck /> Scheduled ({scheduledCount})</Button>
        <Button size="sm" variant={filter === "unscheduled" ? "teal" : "outline"} onClick={() => setFilter("unscheduled")}><CalendarPlus /> Not scheduled yet ({newCount})</Button>
        <Button size="sm" variant="teal" className="ml-auto" disabled={!newCount} asChild={newCount > 0}>
          {newCount > 0 ? <Link to="/calendar" search={{ plan: "new" }}><Wand2 /> Schedule {newCount} new items</Link> : <span><Wand2 /> Nothing new to schedule</span>}
        </Button>
      </div>
      <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border bg-card p-3 shadow-card">
        <Activity className="size-4 text-teal" />
        <span className="text-sm font-semibold">Camera movement</span>
        <Button size="sm" variant="outline" disabled={!unchecked.length} onClick={checkMotion}>Check {unchecked.length} Reels</Button>
        <Button size="sm" variant={filter === "shaky" ? "teal" : "outline"} onClick={() => setFilter("shaky")}>Too shaky / fast ({flagged.length})</Button>
        <Button size="sm" variant="destructive" className="ml-auto" disabled={!flagged.length} onClick={skipFlagged}>Skip all {flagged.length} flagged</Button>
        {motionJobs.length > 0 && <div className="w-full"><RenderProgress jobs={motionJobs} error={jobsError} purpose="camera" /></div>}
      </div>
      <div className="mb-4 flex flex-col gap-2 sm:flex-row">
        <Input placeholder="Search file, caption or topic" value={q} onChange={(e) => setQ(e.target.value)} className="h-11 sm:max-w-xs" />
        <Select value={filter} onValueChange={(v) => setFilter(v as Filter)}>
          <SelectTrigger className="h-11 sm:w-56"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Everything</SelectItem>
            <SelectItem value="scheduled">Scheduled</SelectItem>
            <SelectItem value="unscheduled">Not scheduled yet</SelectItem>
            <SelectItem value="reel">Reels</SelectItem>
            <SelectItem value="post">Image posts</SelectItem>
            <SelectItem value="needs">Needs attention</SelectItem>
            <SelectItem value="seasonal">Seasonal topics</SelectItem>
            <SelectItem value="shaky">Too shaky / fast</SelectItem>
            <SelectItem value="skipped">Skipped</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {assets.length === 0 ? (
        <Empty>No media yet. Start with “Add batch”. Nothing from your 164 files has been uploaded so far.</Empty>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {list.map((a) => {
            const issues = readiness(a);
            return (
              <article key={a.id} className={`flex flex-col rounded-xl border bg-card p-4 shadow-card ${a.skipped ? "opacity-60" : ""}`}>
                <div className="mb-2 flex items-start justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2">
                    {a.kind === "reel" ? <Film className="size-4 shrink-0 text-teal" /> : <ImageIcon className="size-4 shrink-0 text-teal" />}
                    <span className="truncate text-sm font-semibold" title={a.rel_path}>{a.file_name}</span>
                  </div>
                  {a.kind === "reel" && <AudioBadge state={a.audio_state} />}
                </div>
                <p className="line-clamp-3 min-h-[3.75rem] whitespace-pre-line text-sm text-muted-foreground">{a.caption ?? "—"}</p>
                <div className="mt-2 flex flex-wrap gap-1">
                  {a.campaign_first && <Badge variant="teal">Campaign</Badge>}
                  {a.topics.slice(0, 3).map((t) => <Badge key={t} variant="muted">{t}</Badge>)}
                  {issues.map((i) => <Badge key={i} variant="warning">{i}</Badge>)}
                  {a.approved && <Badge variant="success">Approved</Badge>}
                  {a.kind === "reel" && a.motion_label && (
                    <Badge variant={isFlaggedMotion(a.motion_label) ? "warning" : "muted"}>
                      {MOTION_TEXT[a.motion_label as MotionLabel] ?? a.motion_label} · {Math.round(Number(a.motion_confidence ?? 0) * 100)}% sure
                    </Badge>
                  )}
                </div>
                {metaIssues(a).filter((i) => i.level === "tip").map((i) => (
                  <p key={i.text} className="mt-1 text-xs text-muted-foreground">Meta tip: {i.text}</p>
                ))}
                <div className="mt-2 text-xs text-muted-foreground">{a.scheduled_at ? formatOslo(a.scheduled_at) : "No date yet"}</div>
                <div className="mt-3 flex gap-2 border-t pt-3">
                  <Button size="sm" variant="ghost" onClick={() => open(a)}><Eye /> Preview</Button>
                  <Button size="sm" variant="ghost" onClick={() => setEdit(a)}><Pencil /> Edit</Button>
                  <Button size="sm" variant="ghost" className="ml-auto" onClick={() => patch(a.id, { skipped: !a.skipped, approved: false })}>
                    <EyeOff /> {a.skipped ? "Unskip" : "Skip"}
                  </Button>
                  <Button size="sm" variant="ghost" className="text-destructive" onClick={() => remove(a)}><Trash2 /> Delete</Button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      <EditDialog asset={edit} onClose={() => setEdit(null)} onSave={async (p) => { if (edit) await patch(edit.id, p); setEdit(null); }} />
      <Dialog open={!!preview} onOpenChange={(o) => !o && setPreview(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{preview?.a.file_name}</DialogTitle></DialogHeader>
          {preview && (preview.a.kind === "reel" ? <video src={preview.url} controls className="max-h-[60vh] w-full rounded-lg bg-primary" /> : <img src={preview.url} alt={preview.a.file_name} className="max-h-[60vh] w-full rounded-lg object-contain" />)}
          <p className="max-h-40 overflow-auto whitespace-pre-line text-sm">{preview?.a.caption}</p>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function EditDialog({ asset, onClose, onSave }: { asset: Asset | null; onClose: () => void; onSave: (p: Partial<Asset>) => Promise<void> }) {
  const [caption, setCaption] = useState("");
  const [topics, setTopics] = useState("");
  const [lastId, setLastId] = useState<string | null>(null);
  const [audio, setAudio] = useState("");
  const [finish, setFinish] = useState(false);
  if (asset && asset.id !== lastId) {
    setLastId(asset.id);
    setCaption(asset.caption ?? "");
    setTopics(asset.topics.join(", "));
    setAudio(asset.audio_mode ?? "");
    setFinish(asset.finish_in_instagram);
  }
  return (
    <Dialog open={!!asset} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Edit {asset?.file_name}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <Textarea rows={8} value={caption} onChange={(e) => setCaption(e.target.value)} />
          <Input value={topics} onChange={(e) => setTopics(e.target.value)} placeholder="Topics, comma separated" />
          <p className="text-xs text-muted-foreground">Source: {asset?.caption_source ?? "none"}. Captions are never rewritten automatically.</p>
          {asset?.kind === "reel" && (
            <div className="space-y-2 rounded-lg bg-muted p-3 text-sm">
              <label className="flex items-center gap-2">Audio
                <select aria-label="Audio" className="h-9 rounded-md border bg-background px-2" value={audio} onChange={(e) => setAudio(e.target.value)}>
                  <option value="">Use default</option>
                  {AUDIO_MODES.map((m) => <option key={m} value={m}>{AUDIO_MODE_LABEL[m]}</option>)}
                </select>
              </label>
              <label className="flex items-center gap-2"><input type="checkbox" checked={finish} onChange={(e) => setFinish(e.target.checked)} /> Finish in Instagram (add a trending sound yourself)</label>
              <p className="text-xs text-muted-foreground">{TRENDING_LIMITATION}</p>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="teal" onClick={() => onSave({ caption, caption_issue: caption.trim() ? null : "missing", caption_source: caption !== (asset?.caption ?? "") ? "edited" : asset?.caption_source, topics: topics.split(",").map((t) => t.trim()).filter(Boolean), approved: false, audio_mode: audio || null, finish_in_instagram: finish })}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
