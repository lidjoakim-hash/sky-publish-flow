import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

export const Route = createFileRoute("/api/public/cron/publish")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const denied = await authenticateCronRequest(request);
        if (denied) return denied;
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { runPublisherTick } = await import("@/lib/publisher.server");
        const report = await runPublisherTick(supabaseAdmin, `cron-${crypto.randomUUID()}`);
        return Response.json(report);
      },
    },
  },
});
