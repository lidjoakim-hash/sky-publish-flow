/** Pure dry-run report (no I/O, no Meta calls). Never evidence that live posting works. */
import { allowedPlatforms, canSend, type ConnectionMode } from "./brand-publishing";
import { readiness } from "./readiness";
import type { Asset } from "./queries";

export interface DryRunInput {
  brand: string;
  mode: ConnectionMode;
  platforms: string[];
  enabled: boolean;
  globalActive: boolean;
  timeZone: string;
  connection: { status: string; ig_username?: string | null; ig_user_id?: string | null; page_name?: string | null } | null;
  secretsPresent: Record<string, boolean>;
  assets: Asset[];
}

export function buildDryRun(i: DryRunInput) {
  const connected = i.connection?.status === "connected";
  const row = { brand_slug: i.brand, platforms: i.platforms, enabled: i.enabled };
  const targets = i.platforms.map((p) => ({
    platform: p,
    allowed: (allowedPlatforms(i.brand) as string[]).includes(p),
    wouldSendNow: canSend({ globalActive: i.globalActive, row, connected, brand: i.brand }, p),
  }));
  const items = i.assets.map((a) => ({
    id: a.id, file: a.file_name, kind: a.kind, at: a.scheduled_at,
    atLocal: a.scheduled_at ? new Date(a.scheduled_at).toLocaleString("nb-NO", { timeZone: i.timeZone }) : null,
    approved: a.approved, issues: readiness(a),
  }));
  return {
    dryRun: true as const,
    metaCalls: 0,
    note: "Dry run only: nothing was sent to Meta and nothing was queued. This does not prove live posting works.",
    brand: i.brand, mode: i.mode, timeZone: i.timeZone,
    account: i.mode === "instagram_login" ? { instagram: i.connection?.ig_username ?? null, facebookPage: null } : { instagram: i.connection?.ig_username ?? null, facebookPage: i.connection?.page_name ?? null },
    connectionStatus: i.connection?.status ?? "not_connected",
    secretsPresent: i.secretsPresent,
    postingEnabled: i.enabled, globalActive: i.globalActive,
    targets, items,
    ready: items.filter((x) => !x.issues.length).length,
  };
}
