/**
 * Camera-motion rating from FFmpeg scene-change scores (sampled at 8 fps on a 192px-wide copy).
 * Pure: the worker sends the summary, the server classifies. Thresholds are estimates — calibrate
 * against real clips. Mirror of summarizeScores lives in worker/render-worker.mjs.
 */
export type MotionStats = { frames: number; mean: number; p90: number; jitter: number; fast_share: number };
export type MotionLabel = "smooth" | "moderate" | "shaky" | "too_fast" | "unknown";

export const MOTION = { fastMean: 0.08, fastFrame: 0.15, fastShare: 0.25, moderateMean: 0.035, shakyRatio: 0.9, shakyMinMean: 0.02, minFrames: 10 };

export function summarizeScores(scores: number[]): MotionStats {
  const n = scores.length;
  if (!n) return { frames: 0, mean: 0, p90: 0, jitter: 0, fast_share: 0 };
  const mean = scores.reduce((s, x) => s + x, 0) / n;
  const sorted = [...scores].sort((a, b) => a - b);
  const p90 = sorted[Math.min(n - 1, Math.floor(n * 0.9))];
  let j = 0;
  for (let i = 1; i < n; i++) j += Math.abs(scores[i] - scores[i - 1]);
  return { frames: n, mean, p90, jitter: n > 1 ? j / (n - 1) : 0, fast_share: scores.filter((s) => s > MOTION.fastFrame).length / n };
}

export function classifyMotion(s: MotionStats): { label: MotionLabel; score: number; confidence: number } {
  if (s.frames < MOTION.minFrames) return { label: "unknown", score: 0, confidence: 0 };
  const ratio = s.jitter / (s.mean + 0.005);
  const score = Math.max(0, Math.min(100, Math.round((s.mean / 0.12) * 70 + Math.min(30, ratio * 15))));
  const sample = Math.min(1, s.frames / 40);
  const conf = (margin: number) => Math.round((0.5 + 0.45 * Math.min(1, Math.max(0, margin))) * sample * 100) / 100;
  if (s.mean > MOTION.fastMean || s.fast_share > MOTION.fastShare) {
    const m = Math.max((s.mean - MOTION.fastMean) / MOTION.fastMean, (s.fast_share - MOTION.fastShare) / MOTION.fastShare);
    return { label: "too_fast", score, confidence: conf(m) };
  }
  if (s.mean > MOTION.shakyMinMean && ratio > MOTION.shakyRatio) return { label: "shaky", score, confidence: conf((ratio - MOTION.shakyRatio) / MOTION.shakyRatio) };
  if (s.mean > MOTION.moderateMean) return { label: "moderate", score, confidence: conf(Math.min((s.mean - MOTION.moderateMean) / MOTION.moderateMean, (MOTION.fastMean - s.mean) / MOTION.fastMean)) };
  return { label: "smooth", score, confidence: conf((MOTION.moderateMean - s.mean) / MOTION.moderateMean) };
}

export const MOTION_TEXT: Record<MotionLabel, string> = {
  smooth: "Smooth / cinematic",
  moderate: "Some movement",
  shaky: "Too shaky",
  too_fast: "Too fast",
  unknown: "Motion unknown",
};

export const isFlaggedMotion = (label: string | null | undefined) => label === "shaky" || label === "too_fast";
