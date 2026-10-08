/**
 * Verifies the wake-up token sent by the scheduled database job.
 *
 * The token lives in public.job_tokens, which only the server can read (service_role
 * only, RLS enabled with no policies), so someone who finds the endpoint URL still
 * cannot trigger a send. The managed cron secret keeps working as an alternative.
 */
import { createHash, timingSafeEqual } from "node:crypto";

const digest = (value: string) => createHash("sha256").update(value, "utf8").digest();

export async function authenticateTickRequest(request: Request): Promise<boolean> {
  const match = /^Bearer ([^\s,]+)$/.exec(request.headers.get("authorization") ?? "");
  const token = match?.[1];
  if (!token) return false;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("job_tokens")
    .select("secret")
    .eq("name", "tick")
    .maybeSingle();
  if (error || !data?.secret) return false;
  const provided = digest(token);
  const expected = digest(String(data.secret));
  return provided.length === expected.length && timingSafeEqual(provided, expected);
}
