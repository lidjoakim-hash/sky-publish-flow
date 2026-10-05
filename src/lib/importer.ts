/**
 * Browser-side batch importer. Reads user-selected files, a folder, or a ZIP (streamed one entry at a
 * time with bounded memory), matches captions, hashes, deduplicates, uploads originals to private
 * storage and records assets. Already-uploaded files are skipped on resume.
 */
import { Unzip, UnzipInflate, type UnzipFile } from "fflate";
import { supabase } from "@/integrations/supabase/client";
import { parseCaptionCsv, type CaptionRow } from "./csv";
import { classifyFiles, dirOf, importOrder, isSeasonal, matchCaption, normPath, stem, topicsFromName, type FileRole } from "./matching";
import { checkBomb, validateEntryPath, ZIP_LIMITS } from "./zip-safety";
import { probeAudioInBrowser } from "./audio";

export interface Entry {
  path: string;
  size: number;
  blob?: () => Promise<Blob>;
}

export type FileStatus = "queued" | "hashing" | "uploading" | "done" | "duplicate" | "skipped" | "excluded" | "error";
export interface FileProgress {
  path: string;
  role: FileRole;
  status: FileStatus;
  note?: string;
}

export interface ImportCallbacks {
  onFile: (p: FileProgress) => void;
  onLog: (msg: string) => void;
  signal: AbortSignal;
}

async function sha256Hex(buf: ArrayBuffer) {
  const h = await crypto.subtle.digest("SHA-256", buf);
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

const extOf = (p: string) => (p.match(/\.([^.]+)$/)?.[1] ?? "bin").toLowerCase();
const mimeOf = (p: string) => {
  const e = extOf(p);
  return e === "mp4" || e === "m4v" ? "video/mp4" : e === "mov" ? "video/quicktime" : e === "png" ? "image/png" : e === "webp" ? "image/webp" : "image/jpeg";
};

/** Streams a ZIP once; `want` decides which entries to inflate; `handle` runs before more bytes are read. */
async function streamZip(file: File, want: (name: string) => boolean, handle: (name: string, data: Uint8Array) => Promise<void>, cb: ImportCallbacks) {
  const reader = file.stream().getReader();
  const pending: Array<{ name: string; data: Uint8Array }> = [];
  let failure: Error | null = null;
  let total = 0;
  let count = 0;
  const unzip = new Unzip((f: UnzipFile) => {
    count++;
    if (count > ZIP_LIMITS.maxEntries) failure = new Error("Too many entries in archive");
    const safe = validateEntryPath(f.name);
    if (!safe) {
      cb.onLog(`Rejected unsafe path: ${f.name}`);
      return;
    }
    if (f.name.endsWith("/") || !want(safe)) return;
    const bomb = checkBomb(f.size ?? 0, f.originalSize ?? 0, total);
    if (bomb) {
      cb.onLog(`Rejected ${safe}: ${bomb}`);
      return;
    }
    const chunks: Uint8Array[] = [];
    let got = 0;
    f.ondata = (err, chunk, final) => {
      if (err) {
        failure = err;
        return;
      }
      got += chunk.length;
      total += chunk.length;
      if (got > ZIP_LIMITS.maxEntryBytes || total > ZIP_LIMITS.maxTotalBytes) {
        failure = new Error(`Stopped: ${safe} expands beyond safe limits`);
        f.terminate();
        return;
      }
      chunks.push(chunk);
      if (final) {
        const out = new Uint8Array(got);
        let o = 0;
        for (const c of chunks) {
          out.set(c, o);
          o += c.length;
        }
        pending.push({ name: safe, data: out });
      }
    };
    f.start();
  });
  unzip.register(UnzipInflate);
  for (;;) {
    if (cb.signal.aborted) throw new DOMException("Stopped", "AbortError");
    const { value, done } = await reader.read();
    unzip.push(value ?? new Uint8Array(0), done);
    if (failure) throw failure;
    while (pending.length) {
      const e = pending.shift()!;
      await handle(e.name, e.data);
    }
    if (done) break;
  }
}

/** Lists ZIP entry names/sizes and collects small caption files in one bounded pass. */
async function zipPassOne(file: File, cb: ImportCallbacks) {
  const names: Entry[] = [];
  const texts = new Map<string, string>();
  const reader = file.stream().getReader();
  const pending: Array<Promise<void>> = [];
  const unzip = new Unzip((f) => {
    const safe = validateEntryPath(f.name);
    if (!safe || f.name.endsWith("/")) {
      if (!safe) cb.onLog(`Rejected unsafe path: ${f.name}`);
      return;
    }
    names.push({ path: safe, size: f.originalSize ?? 0 });
    if (/\.(csv|txt)$/i.test(safe) && (f.originalSize ?? 0) < 5 * 1024 * 1024) {
      const chunks: Uint8Array[] = [];
      pending.push(
        new Promise((res) => {
          f.ondata = (err, c, final) => {
            if (!err) chunks.push(c);
            if (final || err) {
              texts.set(safe, new TextDecoder("utf-8").decode(concat(chunks)));
              res();
            }
          };
          f.start();
        }),
      );
    }
  });
  unzip.register(UnzipInflate);
  for (;;) {
    if (cb.signal.aborted) throw new DOMException("Stopped", "AbortError");
    const { value, done } = await reader.read();
    unzip.push(value ?? new Uint8Array(0), done);
    if (done) break;
  }
  await Promise.all(pending);
  return { names, texts };
}

function concat(chunks: Uint8Array[]) {
  const n = chunks.reduce((a, c) => a + c.length, 0);
  const out = new Uint8Array(n);
  let o = 0;
  for (const c of chunks) {
    out.set(c, o);
    o += c.length;
  }
  return out;
}

export interface ImportPlan {
  roles: Map<string, FileRole>;
  csvRows: CaptionRow[];
  csvDir: string;
  txt: Map<string, string>;
  order: string[];
}

function buildPlan(entries: Entry[], texts: Map<string, string>): ImportPlan {
  const roles = classifyFiles(entries);
  let csvRows: CaptionRow[] = [];
  let csvDir = "";
  const csvs = [...roles].filter(([, r]) => r === "caption_csv").map(([p]) => p).sort((a, b) => a.split("/").length - b.split("/").length);
  for (const p of csvs) {
    try {
      const rows = parseCaptionCsv(texts.get(p) ?? "");
      if (!csvRows.length) csvDir = dirOf(p);
      csvRows = csvRows.concat(rows);
    } catch {
      /* not a caption CSV */
    }
  }
  const txt = new Map<string, string>();
  for (const [p, r] of roles) if (r === "caption_txt") txt.set(p.toLowerCase(), (texts.get(p) ?? "").trim());
  const order = importOrder([...roles].filter(([, r]) => r === "reel" || r === "post" || r === "cover").map(([p]) => p));
  return { roles, csvRows, csvDir, txt, order };
}

export interface RunOptions {
  batchId: string;
  userId: string;
  allowRepeat: boolean;
  startIndex: number;
}

export async function runImport(source: { kind: "files"; files: File[] } | { kind: "zip"; file: File }, opts: RunOptions, cb: ImportCallbacks) {
  let entries: Entry[];
  let texts: Map<string, string>;
  if (source.kind === "zip") {
    cb.onLog("Reading archive index and captions…");
    const p1 = await zipPassOne(source.file, cb);
    entries = p1.names;
    texts = p1.texts;
  } else {
    entries = source.files.map((f) => ({
      path: normPath((f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name),
      size: f.size,
      blob: async () => f,
    }));
    texts = new Map();
    for (const f of source.files) {
      const p = normPath((f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name);
      if (/\.(csv|txt)$/i.test(p)) texts.set(p, await f.text());
    }
  }
  const plan = buildPlan(entries, texts);
  for (const [p, r] of plan.roles) if (r === "excluded") cb.onFile({ path: p, role: r, status: "excluded" });
  for (const p of plan.order) cb.onFile({ path: p, role: plan.roles.get(p)!, status: "queued" });

  // Existing state for resume + dedupe
  const { data: existing } = await supabase.from("assets").select("id, sha256, rel_path, batch_id, upload_state");
  const doneInBatch = new Set((existing ?? []).filter((a) => a.batch_id === opts.batchId && a.upload_state === "done").map((a) => a.rel_path));
  const shaSeen = new Set((existing ?? []).filter((a) => opts.allowRepeat ? a.batch_id === opts.batchId : true).map((a) => a.sha256));
  const coverByKey = new Map<string, string>();
  const reelIdByKey = new Map<string, string>();
  const orderIndex = new Map(plan.order.map((p, i) => [p, i]));
  let processed = 0;

  const handle = async (path: string, data: Blob | Uint8Array) => {
    const role = plan.roles.get(path);
    if (!role || (role !== "reel" && role !== "post" && role !== "cover")) return;
    if (doneInBatch.has(path)) {
      cb.onFile({ path, role, status: "done", note: "Already uploaded" });
      return;
    }
    cb.onFile({ path, role, status: "hashing" });
    const blob = data instanceof Blob ? data : new Blob([data as BlobPart], { type: mimeOf(path) });
    const sha = await sha256Hex(await blob.arrayBuffer());
    const key = `${dirOf(path)}/${stem(path).toLowerCase().replace(/[_-]?(cover|thumb)$/, "")}`;
    if (role === "cover") {
      const cp = `${opts.userId}/covers/${sha}.${extOf(path)}`;
      const up = await supabase.storage.from("media").upload(cp, blob, { contentType: mimeOf(path), upsert: false });
      if (up.error && !/exists/i.test(up.error.message)) throw up.error;
      coverByKey.set(key, cp);
      const reelId = reelIdByKey.get(key);
      if (reelId) await supabase.from("assets").update({ cover_path: cp }).eq("id", reelId);
      cb.onFile({ path, role, status: "done", note: "Reel cover" });
      return;
    }
    if (shaSeen.has(sha)) {
      cb.onFile({ path, role, status: "duplicate", note: "Same file content already in library" });
      return;
    }
    shaSeen.add(sha);
    const m = matchCaption(path, plan.csvRows, plan.txt, plan.csvDir);
    const storagePath = `${opts.userId}/originals/${sha}.${extOf(path)}`;
    const { data: row, error } = await supabase
      .from("assets")
      .upsert(
        {
          batch_id: opts.batchId,
          rel_path: path,
          file_name: path.split("/").pop()!,
          kind: role,
          sha256: sha,
          size_bytes: blob.size,
          mime: mimeOf(path),
          caption: m.caption,
          caption_source: m.source,
          caption_issue: m.issue,
          topics: topicsFromName(path),
          seasonal: isSeasonal(path, m.caption),
          campaign_first: /First_Campaign/i.test(path),
          sort_index: opts.startIndex + (orderIndex.get(path) ?? 0),
          upload_state: "uploading",
          cover_path: coverByKey.get(key) ?? null,
        },
        { onConflict: "user_id,sha256,batch_id" },
      )
      .select("id")
      .single();
    if (error) throw error;
    if (role === "reel") reelIdByKey.set(key, row.id);
    cb.onFile({ path, role, status: "uploading" });
    const up = await supabase.storage.from("media").upload(storagePath, blob, { contentType: mimeOf(path), upsert: false });
    if (up.error && !/exists/i.test(up.error.message)) throw up.error;
    const patch: Record<string, unknown> = { storage_path: storagePath, upload_state: "done" };
    if (role === "reel") {
      try {
        const a = await probeAudioInBrowser(blob);
        patch.audio_state = a.state;
        patch.audio_rms_db = a.rmsDb;
        if (a.duration) patch.duration_s = Math.round(a.duration * 10) / 10;
      } catch {
        patch.audio_state = "unchecked";
      }
    }
    await supabase.from("assets").update(patch).eq("id", row.id);
    cb.onFile({ path, role, status: "done", note: m.issue ? `Caption ${m.issue}` : undefined });
    processed++;
    if (processed % 5 === 0) await supabase.from("batches").update({ processed_files: processed }).eq("id", opts.batchId);
  };

  const safeHandle = async (p: string, d: Blob | Uint8Array) => {
    try {
      await handle(p, d);
    } catch (e) {
      cb.onFile({ path: p, role: plan.roles.get(p) ?? "excluded", status: "error", note: (e as Error).message });
    }
  };

  await supabase.from("batches").update({ total_files: plan.order.length, status: "importing" }).eq("id", opts.batchId);
  if (source.kind === "zip") {
    const wanted = new Set(plan.order);
    // Covers are small and processed as they appear; media order follows the archive.
    await streamZip(source.file, (n) => wanted.has(n), safeHandle, cb);
  } else {
    const byPath = new Map(entries.map((e) => [e.path, e]));
    // Covers first so Reels get them attached immediately.
    const ordered = [...plan.order.filter((p) => plan.roles.get(p) === "cover"), ...plan.order.filter((p) => plan.roles.get(p) !== "cover")];
    for (const p of ordered) {
      if (cb.signal.aborted) throw new DOMException("Stopped", "AbortError");
      await safeHandle(p, await byPath.get(p)!.blob!());
    }
  }
  // Attach covers that arrived after their Reel (ZIP order)
  for (const [key, cp] of coverByKey) {
    const id = reelIdByKey.get(key);
    if (id) await supabase.from("assets").update({ cover_path: cp }).eq("id", id);
  }
  await supabase.from("batches").update({ status: "imported", processed_files: processed }).eq("id", opts.batchId);
  return { planned: plan.order.length, captions: plan.csvRows.length };
}
