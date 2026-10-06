/** Rule/template-based idea briefs from existing assets. Pure, no AI, no invented facts.
 * Drafts reference the source asset and never replace its original caption. */
import { bucketLabel } from "./strategy";

export interface IdeaSource { id: string; file_name: string; kind: string; bucket: string | null; objective: string | null; topics: string[]; caption: string | null }
export interface Idea { source_asset_id: string; hook: string; brief: string; caption_draft: string | null; bucket: string | null; objective: string | null }

const HOOKS: Record<string, { nb: string[]; en: string[] }> = {
  education: { nb: ["Hva ser du fra lufta?", "Dette avslører en drone"], en: ["What the view reveals", "A quiet detail worth noticing"] },
  proof: { nb: ["Ferdig resultat", "Fra start til slutt"], en: ["How the day unfolded", "From first look to last dance"] },
  portfolio: { nb: ["Fra arbeidsdagen", "Et prosjekt sett ovenfra"], en: ["From a recent story", "Moments, unposed"] },
  local: { nb: ["Kjenner du igjen stedet?", "Rogaland fra oven"], en: ["A place with a story", "Where it happened"] },
  lead_generation: { nb: ["Lurer du på noe om bygget ditt?", "Send oss en melding"], en: ["Planning your day?", "Let's talk about your story"] },
  offer: { nb: ["Gjeldende tilbud (fyll inn verifisert tilbud)"], en: ["Current offer (enter verified details)"] },
  brand: { nb: ["Slik jobber vi", "Bak kamera"], en: ["How we work", "Behind the lens"] },
  visual_reach: { nb: ["Bare se", "Stavanger fra et annet perspektiv"], en: ["Just look", "Light, slowly"] },
  unclassified: { nb: ["Fra oven", "Et nytt perspektiv"], en: ["A new angle", "Look closer"] },
};

export function generateIdeas(a: IdeaSource, lang: string, count = 2): Idea[] {
  const b = a.bucket ?? "unclassified";
  const pool = (HOOKS[b] ?? HOOKS.unclassified!)[lang === "nb" ? "nb" : "en"];
  const topic = a.topics[0] ? ` Topic label: ${a.topics[0]}.` : "";
  return pool.slice(0, count).map((hook) => ({
    source_asset_id: a.id,
    hook,
    bucket: a.bucket,
    objective: a.objective,
    brief: `${a.kind === "reel" ? "Reel variation" : "Post variation"} from ${a.file_name}. Bucket: ${bucketLabel(a.bucket)}; objective: ${a.objective ?? "not set"}.${topic} Open with the hook as on-screen text, then use only what the footage actually shows. Do not add claims about defects, savings, customers, inspections or guarantees.`,
    // Draft = hook line + the original caption untouched underneath (owner edits before use).
    caption_draft: a.caption ? `${hook}\n\n${a.caption}` : null,
  }));
}
