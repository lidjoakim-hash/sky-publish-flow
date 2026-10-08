import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

export const Route = createFileRoute("/api/public/cron/publish")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const denied = await authenticateCronRequest(request);
        if (denied) {
          // The scheduled database job authenticates with the server-only token in job_tokens.
          const { authenticateTickRequest } = await import("@/lib/tick-auth.server");
          if (!(await authenticateTickRequest(request))) return denied;
        }
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { runPublisherTick } = await import("@/lib/publisher.server");
        const report = await runPublisherTick(supabaseAdmin, `cron-${crypto.randomUUID()}`);
        return Response.json(report);
      },
    },
  },
});
