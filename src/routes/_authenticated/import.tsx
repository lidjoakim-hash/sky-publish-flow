import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useRef, useState } from "react";
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
import { runImport, type FileProgress } from "@/lib/importer";

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
  const [files, setFiles] = useState<Map<string, FileProgress>>(new Map());
  const [log, setLog] = useState<string[]>([]);
  const [running, setRunning] = useState(false);
  const abort = useRef<AbortController | null>(null);
  const folderRef = useRef<HTMLInputElement>(null);
  const filesRef = useRef<HTMLInputElement>(null);
  const zipRef = useRef<HTMLInputElement>(null);

  const list = useMemo(() => [...files.values()], [files]);
  const media = list.filter((f) => f.role === "reel" || f.role === "post");
  const finished = media.filter((f) => ["done", "duplicate", "error"].includes(f.status)).length;

  async function start(source: { kind: "files"; files: File[] } | { kind: "zip"; file: File }) {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;
    let batchId = resumeId;
    if (!batchId) {
      const { data, error } = await supabase
        .from("batches")
        .insert({ name: name || `Batch ${new Date().toLocaleDateString("nb-NO")}`, source: source.kind, allow_repeat: allowRepeat })
        .select("id")
        .single();
      if (error) return toast.error(error.message);
      batchId = data.id;
      setResumeId(batchId);
    }
    setFiles(new Map());
    setLog([]);
    setRunning(true);
    abort.current = new AbortController();
    try {
      const r = await runImport(
        source,
        { batchId, userId: u.user.id, allowRepeat, startIndex: assets.length ? Math.max(...assets.map((a) => a.sort_index)) + 1 : 0 },
        {
          signal: abort.current.signal,
          onFile: (p) => setFiles((m) => new Map(m).set(p.path, p)),
          onLog: (msg) => setLog((l) => [...l, msg]),
        },
      );
      toast.success(`Import finished: ${r.planned} media files checked, ${r.captions} caption rows read.`);
    } catch (e) {
      if ((e as Error).name === "AbortError") toast("Import stopped. Choose the same files again to resume.");
      else {
        toast.error((e as Error).message);
        setLog((l) => [...l, `Stopped: ${(e as Error).message}. Try the folder option if the archive is too large for this browser.`]);
      }
    } finally {
      setRunning(false);
      qc.invalidateQueries();
    }
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
      <PageHeader title="Add batch" subtitle="Step 1 of 4 · Choose your files. Originals and captions are kept exactly as provided." />
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
          <input ref={folderRef} type="file" className="hidden" multiple {...({ webkitdirectory: "", directory: "" } as Record<string, string>)} onChange={(e) => e.target.files && start({ kind: "files", files: [...e.target.files] })} />
          <input ref={filesRef} type="file" className="hidden" multiple accept=".mp4,.mov,.m4v,.jpg,.jpeg,.png,.webp,.csv,.txt" onChange={(e) => e.target.files && start({ kind: "files", files: [...e.target.files] })} />
          <input ref={zipRef} type="file" className="hidden" accept=".zip" onChange={(e) => e.target.files?.[0] && start({ kind: "zip", file: e.target.files[0] })} />
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
                  <Button size="sm" variant="ghost" onClick={() => abort.current?.abort()}>
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
              The app can only read files you choose; it cannot open G:\ by itself. Keep this tab open while uploading. If a large ZIP stops, unzip it and choose the folder instead.
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
