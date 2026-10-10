// App-wide import state: the upload keeps running when the user switches pages or brands,
// because it lives here (module scope in the browser tab), not inside the Add batch page.
import { useSyncExternalStore } from "react";
import { runImport, type FileProgress, type RunOptions } from "./importer";

type Source = { kind: "files"; files: File[] } | { kind: "zip"; file: File };

export interface ImportState {
  running: boolean;
  brandSlug: string | null;
  batchId: string | null;
  files: Map<string, FileProgress>;
  log: string[];
  result: { kind: "done" | "stopped" | "error"; message: string } | null;
}

let state: ImportState = { running: false, brandSlug: null, batchId: null, files: new Map(), log: [], result: null };
let abort: AbortController | null = null;
const subs = new Set<() => void>();

function set(patch: Partial<ImportState>) {
  state = { ...state, ...patch };
  subs.forEach((f) => f());
}

export const importStore = {
  get: () => state,
  subscribe(f: () => void) {
    subs.add(f);
    return () => subs.delete(f);
  },
  stop() {
    abort?.abort();
  },
  clear() {
    if (!state.running) set({ files: new Map(), log: [], result: null, batchId: null, brandSlug: null });
  },
  async start(source: Source, opts: RunOptions, onFinish?: () => void) {
    if (state.running) throw new Error("An import is already running.");
    abort = new AbortController();
    set({ running: true, brandSlug: opts.brandSlug, batchId: opts.batchId, files: new Map(), log: [], result: null });
    try {
      const r = await runImport(source, opts, {
        signal: abort.signal,
        onFile: (p) => set({ files: new Map(state.files).set(p.path, p) }),
        onLog: (msg) => set({ log: [...state.log, msg] }),
      });
      set({ result: { kind: "done", message: `Import finished: ${r.planned} media files checked, ${r.captions} caption rows read.${r.warnings.length ? ` Warning: ${r.warnings.join(" ")}` : ""}` } });
    } catch (e) {
      if ((e as Error).name === "AbortError") set({ result: { kind: "stopped", message: "Import stopped. Choose the same files again to resume." } });
      else set({ result: { kind: "error", message: (e as Error).message }, log: [...state.log, `Stopped: ${(e as Error).message}. Try the folder option if the archive is too large for this browser.`] });
    } finally {
      abort = null;
      set({ running: false });
      onFinish?.();
    }
  },
};

if (typeof window !== "undefined") {
  window.addEventListener("beforeunload", (e) => {
    if (state.running) {
      e.preventDefault();
      e.returnValue = "";
    }
  });
}

export function useImportState() {
  return useSyncExternalStore(importStore.subscribe, importStore.get, importStore.get);
}

export function importCounts(s: ImportState) {
  const media = [...s.files.values()].filter((f) => f.role === "reel" || f.role === "post");
  const finished = media.filter((f) => ["done", "duplicate", "error"].includes(f.status)).length;
  return { total: media.length, finished };
}
