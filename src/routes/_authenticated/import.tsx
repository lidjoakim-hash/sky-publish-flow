import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useRef, useState } from "react";
import { importStore, useImportState } from "@/lib/import-store";
import { useActiveBrand } from "@/components/brand";
import { toast } from "sonner";
import { FolderOpen, FileArchive, Files, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { PageHeader, Panel } from "@/components/app-ui";
import { supabase } from "@/integrations/supabase/client";
import { batchesQuery, assetsQuery } from "@/lib/queries";

export const Route = createFileRoute("/_authenticated/import")({
  head: () => ({ meta: [{ title: "Add batch — Skyline Publisher" }, { name: "description", content: "Import Reels, posts and captions." }, { property: "og:title", content: "Add batch — Skyline Publisher" }, { property: "og:description", content: "Import Reels, posts and captions." }] }),
  component: ImportPage,
});

function ImportPage() {
  const qc = useQueryClient();
  const { data: batches = [] } = useQuery(batchesQuery);
  const { data: assets = [] } = useQuery(assetsQuery);
  const [name, setName] = useState("");
  const [allowRepeat, setAllowRepeat] = useState(false);
  const [resumeId, setResumeId] = useState<string | null>(null);
  const imp = useImportState();
  const { slug: brandSlug, brand } = useActiveBrand();
  const running = imp.running;
  const files = imp.files;
  const log = imp.log;
  const folderRef = useRef<HTMLInputElement>(null);
  const filesRef = useRef<HTMLInputElement>(null);
  const zipRef = useRef<HTMLInputElement>(null);

  const list = useMemo(() => [...files.values()], [files]);
  const media = list.filter((f) => f.role === "reel" || f.role === "post");
  const finished = media.filter((f) => ["done", "duplicate", "error"].includes(f.status)).length;
  const otherBrand = imp.brandSlug && imp.brandSlug !== brandSlug;

  async function start(source: { kind: "files"; files: File[] } | { kind: "zip"; file: File }) {
    if (importStore.get().running) return toast.error("An upload is already running. Wait for it or stop it first.");
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;
    let batchId = resumeId;
    if (!batchId) {
      const { data, error } = await supabase
        .from("batches")
        .insert({ name: name || `${brand?.name ?? "Batch"} ${new Date().toLocaleDateString("nb-NO")}`, source: source.kind, allow_repeat: allowRepeat })
        .select("id")
        .single();
      if (error) return toast.error(error.message);
      batchId = data.id;
      setResumeId(batchId);
    }
    const brandAssets = assets.filter((a) => a.brand_slug === brandSlug);
    await importStore.start(
      source,
      { batchId, userId: u.user.id, allowRepeat, brandSlug, startIndex: brandAssets.length ? Math.max(...brandAssets.map((a) => a.sort_index)) + 1 : 0 },
      () => {
        const r = importStore.get().result;
        if (r?.kind === "done") toast.success(r.message);
        else if (r?.kind === "stopped") toast(r.message);
        else if (r) toast.error(r.message);
        qc.invalidateQueries();
      },
    );
  }

  const pick = (input: HTMLInputElement | null) => input?.click();
  const [dragging, setDragging] = useState(false);

  async function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    if (running) return;
    const items = [...e.dataTransfer.items].map((i) => i.webkitGetAsEntry?.()).filter(Boolean) as FileSystemEntry[];
    const single = e.dataTransfer.files;
    if (items.length === 1 && items[0]!.isFile && single[0]?.name.toLowerCase().endsWith(".zip")) return start({ kind: "zip", file: single[0] });
    const out = await collectDropped(items);
    if (!out.length) return toast.error("Nothing to import in what you dropped.");
    start({ kind: "files", files: out });
  }

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title="Add batch" subtitle={`Step 1 of 4 · Files go to ${brand?.name ?? "the selected business"}. Originals and captions are kept exactly as provided.`} />
      {otherBrand && running && <p className="mb-4 rounded-lg border border-warning bg-warning/10 p-3 text-sm">An upload for another business is still running below. It keeps its own business; switch back to see it there too.</p>}
      <div className="grid gap-4 lg:grid-cols-3">
        <Panel className="lg:col-span-2" title="Choose files">
          <div
            onDragOver={(e) => { e.preventDefault(); if (!running) setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            className={`mb-4 rounded-xl border-2 border-dashed p-6 text-center text-sm transition-colors ${dragging ? "border-teal bg-accent text-accent-foreground" : "text-muted-foreground"}`}
          >
            <FolderOpen className="mx-auto mb-2 size-6 text-teal" />
            <span className="font-medium">Drag your folder, files or ZIP here</span>
            <span className="block text-xs">Subfolders such as First_Campaign are kept.</span>
          </div>
          <div className="mb-4 grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="bn">Batch name</Label>
              <Input id="bn" value={name} onChange={(e) => setName(e.target.value)} placeholder="Skyline 120 Reels + 44 posts" disabled={running || !!resumeId} className="h-11" />
            </div>
            <label className="flex items-center justify-between gap-3 rounded-lg border p-3 text-sm">
              <span>
                <span className="font-medium">Allow repeats</span>
                <span className="block text-xs text-muted-foreground">Only for intentional repeat campaigns</span>
              </span>
              <Switch checked={allowRepeat} onCheckedChange={setAllowRepeat} disabled={running} />
            </label>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <Button variant="outline" size="lg" className="h-auto flex-col gap-1 py-4" disabled={running} onClick={() => pick(folderRef.current)}>
              <FolderOpen className="size-5" /> Folder
              <span className="text-xs font-normal text-muted-foreground">Most reliable</span>
            </Button>
            <Button variant="outline" size="lg" className="h-auto flex-col gap-1 py-4" disabled={running} onClick={() => pick(filesRef.current)}>
              <Files className="size-5" /> Files
              <span className="text-xs font-normal text-muted-foreground">Media, CSV, TXT</span>
            </Button>
            <Button variant="outline" size="lg" className="h-auto flex-col gap-1 py-4" disabled={running} onClick={() => pick(zipRef.current)}>
              <FileArchive className="size-5" /> ZIP archive
              <span className="text-xs font-normal text-muted-foreground">Read one file at a time</span>
            </Button>
          </div>
          <input ref={folderRef} type="file" className="hidden" multiple {...({ webkitdirectory: "", directory: "" } as Record<string, string>)} onChange={(e) => { const fs = takeInputFiles(e.currentTarget); if (fs.length) start({ kind: "files", files: fs }); }} />
          <input ref={filesRef} type="file" className="hidden" multiple accept=".mp4,.mov,.m4v,.jpg,.jpeg,.png,.webp,.csv,.txt" onChange={(e) => { const fs = takeInputFiles(e.currentTarget); if (fs.length) start({ kind: "files", files: fs }); }} />
          <input ref={zipRef} type="file" className="hidden" accept=".zip" onChange={(e) => { const [f] = takeInputFiles(e.currentTarget); if (f) start({ kind: "zip", file: f }); }} />
          {resumeId && !running && (
            <p className="mt-3 text-xs text-muted-foreground">
              Choosing files again adds to the same batch and skips files that already finished.{" "}
              <button className="underline" onClick={() => setResumeId(null)}>Start a new batch instead</button>
            </p>
          )}
          {list.length > 0 && (
            <div className="mt-5 space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span>{finished} of {media.length} media files</span>
                {running && (
                  <Button size="sm" variant="ghost" onClick={() => importStore.stop()}>
                    <Square /> Stop
                  </Button>
                )}
              </div>
              <Progress value={media.length ? (finished / media.length) * 100 : 0} />
              <div className="max-h-80 divide-y overflow-auto rounded-lg border text-sm">
                {list.map((f) => (
                  <div key={f.path} className="flex items-center justify-between gap-3 px-3 py-2">
                    <span className="min-w-0 truncate">{f.path}</span>
                    <span className="flex shrink-0 items-center gap-2">
                      {f.note && <span className="hidden text-xs text-muted-foreground sm:inline">{f.note}</span>}
                      <Badge variant={f.status === "done" ? "success" : f.status === "error" ? "danger" : f.status === "duplicate" ? "warning" : "muted"}>
                        {f.role === "cover" ? "cover · " : f.role === "excluded" ? "" : ""}
                        {f.status}
                      </Badge>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {log.length > 0 && (
            <ul className="mt-3 space-y-1 text-xs text-destructive">
              {log.map((l, i) => <li key={i}>{l}</li>)}
            </ul>
          )}
          {!running && finished > 0 && (
            <div className="mt-4 flex justify-end">
              <Button asChild variant="teal"><Link to="/library">Next: prepare in Library</Link></Button>
            </div>
          )}
        </Panel>
        <div className="space-y-4">
          <Panel title="How matching works">
            <ul className="list-disc space-y-1.5 pl-4 text-sm text-muted-foreground">
              <li>Captions: Captions.csv path first, then a unique file name, then a matching .txt file.</li>
              <li>Reel JPEGs become covers, not posts. Preview images and HTML are ignored.</li>
              <li>The First_Campaign folder is ordered first.</li>
              <li>Identical file content is only stored once, even if renamed.</li>
              <li>Reel audio is checked right after upload.</li>
            </ul>
          </Panel>
          <Panel title="Good to know">
            <p className="text-sm text-muted-foreground">
              The app can only read files you choose; it cannot open G:\ by itself. Keep this tab open while uploading — you can move to other pages or businesses, the upload keeps going. If a large ZIP stops, unzip it and choose the folder instead.
            </p>
          </Panel>
          <Panel title="Recent batches">
            {batches.length === 0 ? <p className="text-sm text-muted-foreground">None yet.</p> : (
              <ul className="space-y-2 text-sm">
                {batches.slice(0, 6).map((b) => (
                  <li key={b.id} className="flex items-center justify-between gap-2">
                    <span className="truncate">{b.name}</span>
                    <Badge variant={b.status === "imported" ? "success" : "muted"}>{b.processed_files}/{b.total_files}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}

/** Captures the chosen files and clears the input, so picking the same file again re-triggers onChange (resume). */
export function takeInputFiles(input: HTMLInputElement): File[] {
  const files = [...(input.files ?? [])];
  input.value = "";
  return files;
}

/** Walks dropped folders and keeps each file's folder path (needed for caption matching and First_Campaign). */
async function collectDropped(entries: FileSystemEntry[]): Promise<File[]> {
  const out: File[] = [];
  const walk = async (entry: FileSystemEntry, prefix: string): Promise<void> => {
    if (entry.isFile) {
      const f = await new Promise<File>((res, rej) => (entry as FileSystemFileEntry).file(res, rej));
      Object.defineProperty(f, "webkitRelativePath", { value: prefix + f.name });
      out.push(f);
    } else if (entry.isDirectory) {
      const reader = (entry as FileSystemDirectoryEntry).createReader();
      for (;;) {
        const batch = await new Promise<FileSystemEntry[]>((res, rej) => reader.readEntries(res, rej));
        if (!batch.length) break;
        for (const child of batch) await walk(child, `${prefix}${entry.name}/`);
      }
    }
  };
  for (const e of entries) await walk(e, "");
  return out;
}
