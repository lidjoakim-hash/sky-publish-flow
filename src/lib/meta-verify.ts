/**
 * Read-only Meta connection check. Only GET requests; never queues, posts or returns the token.
 * `get` is injected so this stays pure and testable.
 */
import { requiredScopes } from "./brand-publishing";

export type GraphGet = <T>(path: string, params: Record<string, string>) => Promise<T>;

export interface VerifyResult {
  status: "connected" | "error";
  message: string;
  page_id?: string;
  page_name?: string;
  ig_user_id?: string | null;
  ig_username?: string | null;
  token_expires_at?: string | null;
  scopes?: string[];
}

export async function verifyMetaConnection(
  get: GraphGet,
  cfg: { pageId: string; igUserId: string | null; platforms: readonly string[]; strictScopes?: boolean },
): Promise<VerifyResult> {
  // 1. The token must belong to exactly this Page (catches another business's token).
  const me = await get<{ id: string; name?: string }>("me", { fields: "id,name" });
  if (me.id !== cfg.pageId) {
    return { status: "error", message: `The token belongs to a different Page (${me.name ?? me.id}), not Page ${cfg.pageId}.` };
  }
  const wantIg = cfg.platforms.includes("instagram");
  const page = await get<{ id: string; name: string; instagram_business_account?: { id: string; username?: string } }>(cfg.pageId, {
    fields: wantIg ? "id,name,instagram_business_account{id,username}" : "id,name",
  });
  const base = { page_id: page.id, page_name: page.name };
  let ig: { id: string; username?: string } | undefined;
  if (wantIg) {
    ig = page.instagram_business_account;
    if (!cfg.igUserId || ig?.id !== cfg.igUserId) {
      return { ...base, status: "error", message: `The Instagram account ${cfg.igUserId ?? "(not set)"} is not the one linked to Page "${page.name}" (${ig?.id ?? "none linked"}).` };
    }
  }
  // 2. Permissions. debug_token on the token itself; missing permissions block "connected".
  const dbg = await get<{ data: { expires_at?: number; scopes?: string[] } }>("debug_token", { input_token: "__SELF__" }).catch(() => null);
  const scopes = dbg?.data.scopes ?? [];
  const missing = dbg ? requiredScopes(cfg.platforms).filter((s) => !scopes.includes(s)) : [];
  const exp = dbg?.data.expires_at ? new Date(dbg.data.expires_at * 1000).toISOString() : null;
  const out = { ...base, ig_user_id: ig?.id ?? null, ig_username: ig?.username ?? null, token_expires_at: exp, scopes };
  if (!dbg && cfg.strictScopes !== false) return { ...out, status: "error", message: "Could not read the token's permissions. Check the token and try again." };
  if (missing.length) return { ...out, status: "error", message: `Token is missing permissions: ${missing.join(", ")}` };
  const where = wantIg ? `${page.name} and @${ig?.username ?? ig?.id}` : `${page.name} (Facebook only)`;
  return { ...out, status: "connected", message: `Connected to ${where}. Posting stays paused until you turn it on for this business.` };
}
