import type { Asset } from "./queries";
import { reelAudioOk } from "./audio";
import { metaIssues } from "./meta-format";

/** Reasons an item cannot be approved yet (seasonal is advisory only). Meta format errors block. */
export function readiness(a: Asset): string[] {
  const out: string[] = [];
  if (a.upload_state !== "done") out.push("Not uploaded");
  if (!a.caption?.trim()) out.push(a.caption_issue === "ambiguous" ? "Caption ambiguous" : "Caption missing");
  if (a.kind === "reel" && !reelAudioOk(a.audio_state)) out.push("Needs audio");
  for (const i of metaIssues(a)) if (i.level === "error") out.push(i.text);
  if (a.seasonal) out.push("Seasonal: check date");
  return out;
}
