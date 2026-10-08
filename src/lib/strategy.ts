/** Strategy vocabulary, brand defaults and rule-based (non-AI) suggestions. Pure, no I/O. */

export const BUCKETS = [
  { id: "lead_generation", label: "Lead generation" },
  { id: "education", label: "Education" },
  { id: "proof", label: "Proof" },
  { id: "portfolio", label: "Portfolio" },
  { id: "brand", label: "Brand" },
  { id: "local", label: "Local Stavanger/Rogaland" },
  { id: "offer", label: "Offer" },
  { id: "visual_reach", label: "Entertainment / visual reach" },
] as const;
export type BucketId = (typeof BUCKETS)[number]["id"];
export const UNCLASSIFIED = "unclassified";
export const bucketLabel = (b: string | null | undefined) => BUCKETS.find((x) => x.id === b)?.label ?? "Unclassified";

export const OBJECTIVES = [
  { id: "reach", label: "Reach" },
  { id: "leads", label: "Leads" },
] as const;
export type Objective = (typeof OBJECTIVES)[number]["id"];

export const REVIEW_STATES = ["unreviewed", "good", "needs_work", "reject"] as const;
export const REVIEW_LABEL: Record<string, string> = { unreviewed: "Unreviewed", good: "Quality OK", needs_work: "Needs work", reject: "Do not use" };

export interface BrandStrategy {
  /** Per-bucket relative weights (missing = 1). */
  weights?: Partial<Record<string, number>>;
  /** Days before the same source/session group may be scheduled again (0 = off). */
  cooldownDays?: number;
  /** Quality-first preset: daily caps and minimum spacing. Only used when enabled explicitly. */
  qualityPreset?: { enabled: boolean; postsPerDay: number; reelsPerDay: number; minSpacingHours: number };
  minSample?: number;
  maxStep?: number;
  diversityFloor?: number;
}

export const DEFAULT_STRATEGY: Required<Omit<BrandStrategy, "weights" | "qualityPreset">> = {
  cooldownDays: 2,
  minSample: 5,
  maxStep: 0.2,
  diversityFloor: 0.05,
};

export const BRAND_DEFAULTS = [
  {
    slug: "skyline",
    name: "Skyline Stavanger",
    language: "nb",
    voice: "Norsk bokmål. Saklig og trygg. Vis ekte droneinspeksjon, bygg og eiendom i Stavanger/Rogaland.",
    focus: "Real drone inspection, construction and property work in Stavanger/Rogaland.",
  },
  {
    slug: "velune",
    name: "Velune",
    language: "en",
    voice: "Refined, editorial and documentary wedding photography. Calm, unhurried voice.",
    focus: "Editorial/documentary wedding photography.",
  },
  { slug: "lidverk", name: "Lidverk", language: "en", voice: "Clear, helpful and direct. Only claims the owner has verified.", focus: "Lidverk — owner to describe services and offers." },
  { slug: "speakfluent", name: "Speak Fluent", language: "en", voice: "Friendly, encouraging and clear. Only claims the owner has verified.", focus: "Language learning — owner to describe courses and offers." },
  { slug: "tekstilrens", name: "Tekstilrens Stavanger", language: "nb", voice: "Norsk bokmål. Saklig og vennlig. Vis ekte arbeid i Stavanger.", focus: "Textile cleaning in Stavanger — owner to describe services and prices." },
] as const;

/** Session/source group: explicit owner value, else parent folder + file stem minus copy/edit/version markers. */
export function sourceGroupOf(a: { source_group?: string | null; rel_path: string }): string {
  if (a.source_group?.trim()) return a.source_group.trim().toLowerCase();
  const parts = a.rel_path.split("/");
  const file = parts.pop() ?? "";
  const stem = file.replace(/\.[^.]+$/, "").toLowerCase().replace(/(\s*\(\d+\)|[\s_-]*(copy|kopi|final|edit|v\d+))+$/g, "");
  return `${parts.slice(-1)[0] ?? ""}/${stem}`;
}

const RULES: { bucket: BucketId; words: RegExp }[] = [
  { bucket: "offer", words: /\b(tilbud|pris|rabatt|kampanje|offer|price)\b/i },
  { bucket: "lead_generation", words: /\b(kontakt|bestill|ring oss|book|send melding|befaring)\b/i },
  { bucket: "education", words: /\b(slik|hvordan|tips|visste du|derfor|guide|how to)\b/i },
  { bucket: "proof", words: /\b(før og etter|resultat|ferdig|kunde|before|after)\b/i },
  { bucket: "local", words: /\b(stavanger|sandnes|rogaland|sola|randaberg|j[øo]rpeland|ryfylke|lysefjord)\b/i },
  { bucket: "portfolio", words: /\b(prosjekt|inspeksjon|tak|fasade|bygg|eiendom|inspection|roof)\b/i },
  { bucket: "visual_reach", words: /\b(utsikt|solnedgang|soloppgang|blå time|fjord|drone|aerial|view)\b/i },
];

export interface Suggestion {
  bucket: BucketId | null;
  objective: Objective;
  reason: string;
}

/** Keyword-based suggestion from file name, topics and caption text. Never vision analysis. */
export function suggestClassification(a: { file_name: string; caption?: string | null; topics?: string[] | null }): Suggestion {
  // File name and owner tags first; captions often end with a generic call-to-action, so they come second.
  const sources: [string, string][] = [
    ["file name/tags", [a.file_name.replace(/[_-]/g, " "), (a.topics ?? []).join(" ")].join(" ")],
    ["caption", a.caption ?? ""],
  ];
  for (const [where, text] of sources) {
    for (const r of RULES) {
      const m = text.match(r.words);
      if (m) {
        const leads = r.bucket === "lead_generation" || r.bucket === "offer" || r.bucket === "proof";
        return { bucket: r.bucket, objective: leads ? "leads" : "reach", reason: `Suggested from the word "${m[0]}" in the ${where}` };
      }
    }
  }
  return { bucket: null, objective: "reach", reason: "No keyword match — left unclassified" };
}
