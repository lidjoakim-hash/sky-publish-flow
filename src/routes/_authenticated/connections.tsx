import { useBrandConnection } from "@/components/brand";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, AlertTriangle, CircleDashed } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PageHeader, Panel } from "@/components/app-ui";
import { checkMetaConnection } from "@/lib/app.functions";

export const Route = createFileRoute("/_authenticated/connections")({
  head: () => ({ meta: [{ title: "Connections — Skyline Publisher" }, { name: "description", content: "Meta accounts, scheduler and render worker status." }, { property: "og:title", content: "Connections — Skyline Publisher" }, { property: "og:description", content: "Meta accounts, scheduler and render worker status." }] }),
  component: ConnectionsPage,
});

function ConnectionsPage() {
  const qc = useQueryClient();
  const { data: conn } = useBrandConnection();
  const check = useServerFn(checkMetaConnection);
  const [busy, setBusy] = useState(false);
  const status = conn?.status ?? "not_connected";

  async function run() {
    setBusy(true);
    try {
      const r = await check();
      (r.status === "connected" ? toast.success : toast.error)(r.message ?? "");
    } catch (e) {
      toast.error((e as Error).message);
    }
    setBusy(false);
    qc.invalidateQueries({ queryKey: ["connection"] });
  }

  const expSoon = conn?.token_expires_at && new Date(conn.token_expires_at).getTime() - Date.now() < 7 * 864e5;

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <PageHeader title="Connections" subtitle="Real status only. Nothing is shown as working until it has been checked." />
      <Panel title="Facebook Page + Instagram" action={<Badge variant={status === "connected" ? "success" : status === "error" ? "danger" : "muted"}>{status === "connected" ? "Connected" : status === "error" ? "Problem" : "Not connected"}</Badge>}>
        {status === "connected" ? (
          <div className="space-y-1 text-sm">
            <p className="flex items-center gap-2"><CheckCircle2 className="size-4 text-success" /> Page: {conn?.page_name} · Instagram: @{conn?.ig_username ?? conn?.ig_user_id}</p>
            <p className="text-muted-foreground">Token expires: {conn?.token_expires_at ? new Date(conn.token_expires_at).toLocaleDateString("nb-NO") : "does not expire (or unknown)"}</p>
            {expSoon && <p className="flex items-center gap-2 text-warning-foreground"><AlertTriangle className="size-4" /> The token expires within a week. Replace it to avoid a pause.</p>}
          </div>
        ) : (
          <div className="space-y-3 text-sm">
            {conn?.last_error && <p className="flex items-start gap-2 text-destructive"><AlertTriangle className="mt-0.5 size-4 shrink-0" /> {conn.last_error}</p>}
            <p>First version uses a personal server-side token (kept secret, never in the browser):</p>
            <ol className="list-decimal space-y-1.5 pl-5 text-muted-foreground">
              <li>In Meta for Developers, create a Business app you are an admin of, and add Instagram Graph API and Facebook Login for Business.</li>
              <li>Make sure your Instagram professional account is linked to the Skyline Facebook Page.</li>
              <li>In Graph API Explorer, get a long-lived <b>Page</b> access token with: instagram_basic, instagram_content_publish, pages_show_list, pages_read_engagement, pages_manage_posts.</li>
              <li>Add three secrets in Project Settings → Secrets: <code>META_PAGE_ACCESS_TOKEN</code>, <code>META_PAGE_ID</code>, <code>META_IG_USER_ID</code>.</li>
              <li>Come back and press “Check connection”.</li>
            </ol>
            <p className="text-xs text-muted-foreground">While you are an admin of the app, it can post to your own accounts without App Review. Meta's API cost is free.</p>
          </div>
        )}
        <Button variant="teal" className="mt-4" onClick={run} disabled={busy}>{busy ? "Checking…" : "Check connection"}</Button>
      </Panel>

      <Panel title="Cloud scheduler" action={<Badge variant="muted"><CircleDashed className="mr-1 size-3" /> Not scheduled yet</Badge>}>
        <p className="text-sm text-muted-foreground">
          A backend timer will check every 5 minutes for items that are due and for Meta processing, even when your computer is off. It is turned on when you activate publishing for the first time, so nothing runs while you prepare.
        </p>
      </Panel>

      <Panel title="Render worker (your computer)">
        <div className="space-y-2 text-sm text-muted-foreground">
          <p>Adds music to silent Reels using free FFmpeg. Needed only for rendering, not for publishing.</p>
          <ol className="list-decimal space-y-1 pl-5">
            <li>Install Node.js 18+ and FFmpeg.</li>
            <li>Download <code>worker/render-worker.mjs</code> from the project code.</li>
            <li>Run it with <code>SKYLINE_URL</code> (your app address) and <code>WORKER_SECRET</code> (ask in chat for how to get it safely).</li>
          </ol>
        </div>
      </Panel>

      <Panel title="Costs and limits">
        <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
          <li>Meta publishing API: free. Instagram allows about 50 API posts per 24 hours per account.</li>
          <li>Lovable Cloud: includes a free usage allowance; about 1 GB of originals plus rendered copies fits comfortably, but storage and database time beyond the allowance are billed by usage.</li>
          <li>Local rendering: free, uses your computer.</li>
          <li>Email alerts and AI voiceover: not set up. Both would need an extra provider and may cost money; you will be asked first.</li>
        </ul>
      </Panel>
    </div>
  );
}
