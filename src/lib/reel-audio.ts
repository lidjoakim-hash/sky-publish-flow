/**
 * Reel audio modes. Meta's Instagram Content Publishing API (POST /{ig-user-id}/media with
 * media_type=REELS) accepts only the video file's own audio; it has no parameter to pick a
 * track from Instagram's music library and no endpoint listing trending audio. So "Trending"
 * modes can never be applied automatically — they publish the Reel's own/licensed audio, or
 * hand the Reel over to "Finish in Instagram" where the owner adds a sound in the app.
 */
export const AUDIO_MODES = ["trending_clean", "trending", "no_music", "manual"] as const;
export type AudioMode = (typeof AUDIO_MODES)[number];
export const DEFAULT_AUDIO_MODE: AudioMode = "trending_clean";

export const AUDIO_MODE_LABEL: Record<AudioMode, string> = {
  trending_clean: "Auto — Trending Clean",
  trending: "Auto — Trending",
  no_music: "No Music",
  manual: "Manual Audio",
};

export const TRENDING_LIMITATION =
  "Meta's publishing API can't add Instagram music-library or trending sounds. Automatic posts use the Reel's own sound or your licensed music. To add a trending sound, turn on “Finish in Instagram”.";

export function isAudioMode(v: unknown): v is AudioMode {
  return typeof v === "string" && (AUDIO_MODES as readonly string[]).includes(v);
}

/** Item setting wins; otherwise the account default; otherwise Trending Clean. */
export function effectiveAudioMode(itemMode: string | null | undefined, defaultMode: string | null | undefined): AudioMode {
  if (isAudioMode(itemMode)) return itemMode;
  if (isAudioMode(defaultMode)) return defaultMode;
  return DEFAULT_AUDIO_MODE;
}

export const isTrendingMode = (m: AudioMode) => m === "trending" || m === "trending_clean";

/** Which file is sent to Meta. "No Music" sends the untouched original, never the music render. */
export function publishFile(a: { storage_path: string | null; rendered_path: string | null }, mode: AudioMode): string | null {
  if (mode === "no_music") return a.storage_path;
  return a.rendered_path ?? a.storage_path;
}

/** Instagram Reels flagged "Finish in Instagram" are never auto-posted to Instagram (Facebook still is). */
export function needsInstagramFinish(a: { kind: string; finish_in_instagram: boolean }, platform: string): boolean {
  return platform === "instagram" && a.kind === "reel" && a.finish_in_instagram;
}

/** One-line label shown on scheduled Reels. */
export function audioLabel(mode: AudioMode, finishInInstagram: boolean): string {
  const base = `Audio: ${AUDIO_MODE_LABEL[mode]}`;
  if (finishInInstagram) return `${base} · finish in Instagram`;
  if (isTrendingMode(mode)) return `${base} · own/licensed sound (API limit)`;
  return base;
}

export const FINISH_MESSAGE = "Ready to finish in Instagram: download the Reel, post it in the Instagram app with a trending sound, then mark it posted here.";
