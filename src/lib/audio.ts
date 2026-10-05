/** Audio readiness rules shared by the browser probe, the worker and the UI. */
export type AudioState = "unchecked" | "missing" | "silent" | "existing" | "processing" | "failed" | "ready";

/** Below this RMS level a track is treated as silent (a silent AAC stream does not count). */
export const SILENCE_DB = -50;

export function classifyLevel(hasStream: boolean, rmsDb: number | null): "missing" | "silent" | "existing" {
  if (!hasStream) return "missing";
  if (rmsDb == null || rmsDb < SILENCE_DB) return "silent";
  return "existing";
}

export const AUDIO_LABEL: Record<AudioState, string> = {
  unchecked: "Not checked",
  missing: "Missing audio",
  silent: "Silent audio",
  existing: "Existing audio",
  processing: "Processing",
  failed: "Failed",
  ready: "Ready",
};

/** A Reel may be approved only with verified audible audio. */
export const reelAudioOk = (s: string) => s === "existing" || s === "ready";

/**
 * Browser probe: decodes the file's audio with Web Audio and measures RMS.
 * Decoding fails when there is no audio stream. Only suitable for Reel-sized files.
 */
/** Scans MP4/MOV boxes for a sound handler ('hdlr' ... 'soun'). */
export function mp4HasSoundTrack(bytes: Uint8Array): boolean {
  for (let i = 0; i < bytes.length - 20; i++) {
    if (bytes[i] === 0x68 && bytes[i + 1] === 0x64 && bytes[i + 2] === 0x6c && bytes[i + 3] === 0x72) {
      // hdlr: version/flags(4) + pre_defined(4) + handler_type(4)
      const h = String.fromCharCode(bytes[i + 12], bytes[i + 13], bytes[i + 14], bytes[i + 15]);
      if (h === "soun") return true;
    }
  }
  return false;
}

export async function probeAudioInBrowser(file: Blob): Promise<{ state: "missing" | "silent" | "existing" | "unchecked"; rmsDb: number | null; duration: number | null }> {
  const raw = await file.arrayBuffer();
  const isVideo = /video|mp4|quicktime/.test(file.type) || file.type === "";
  if (isVideo && !mp4HasSoundTrack(new Uint8Array(raw))) return { state: "missing", rmsDb: null, duration: null };
  const AC = (window as unknown as { OfflineAudioContext: typeof OfflineAudioContext }).OfflineAudioContext;
  const ctx = new AC(1, 44100, 44100);
  let buf: AudioBuffer;
  try {
    buf = await ctx.decodeAudioData(raw);
  } catch {
    // Has a sound track but this browser cannot decode it: needs the render worker check.
    return { state: "unchecked", rmsDb: null, duration: null };
  }
  let sum = 0;
  let n = 0;
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < d.length; i += 4) {
      sum += d[i] * d[i];
      n++;
    }
  }
  const rms = n ? Math.sqrt(sum / n) : 0;
  const rmsDb = rms > 0 ? 20 * Math.log10(rms) : -120;
  return { state: classifyLevel(true, rmsDb), rmsDb: Math.round(rmsDb * 10) / 10, duration: buf.duration };
}
