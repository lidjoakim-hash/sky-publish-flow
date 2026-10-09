import { useActiveBrand, useBrandConnection } from "@/components/brand";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, AlertTriangle, CircleDashed } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PageHeader, Panel } from "@/components/app-ui";
import { checkMetaConnection, dryRunBrand, setBrandPlatforms, setBrandPublishing } from "@/lib/app.functions";
import { brandPublishingQuery } from "@/lib/queries";
import { allowedPlatforms, connectionMode, DEFAULT_PLATFORMS, INSTAGRAM_LOGIN_BRANDS, requiredScopes, requiredSecrets } from "@/lib/brand-publishing";

export const Route = createFileRoute("/_authenticated/connections")({
  head: () => ({ meta: [{ title: "Connections — Skyline Publisher" }, { name: "description", content: "Meta accounts, scheduler and render worker status." }, { property: "og:title", content: "Connections — Skyline Publisher" }, { property: "og:description", content: "Meta accounts, scheduler and render worker status." }] }),
  component: ConnectionsPage,
});

function ConnectionsPage() {
  const qc = useQueryClient();
  const { data: conn, slug } = useBrandConnection();
  const { brand } = useActiveBrand();
  const { data: bps = [] } = useQuery(brandPublishingQuery);
  const bp = bps.find((r) => r.brand_slug === slug);
  const brandName = brand?.name ?? slug;
  const platforms = bp?.platforms?.length ? bp.platforms : (DEFAULT_PLATFORMS[slug] ?? []);
  const wantIg = platforms.includes("instagram");
  const enabled = !!bp?.enabled;
  const check = useServerFn(checkMetaConnection);
  const savePlatforms = useServerFn(setBrandPlatforms);
  const toggle = useServerFn(setBrandPublishing);
  const dry = useServerFn(dryRunBrand);
  const [report, setReport] = useState<Awaited<ReturnType<typeof dryRunBrand>> | null>(null);
  const igLogin = connectionMode(slug) === "instagram_login";
  const [busy, setBusy] = useState(false);
  const [testOk, setTestOk] = useState(false);
  const status = conn?.status ?? "not_connected";
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["connection"] });
    qc.invalidateQueries({ queryKey: ["brand-publishing"] });
  };

  async function act(fn: () => Promise<{ ok?: boolean; status?: string; message?: string | null }>) {
    setBusy(true);
    try {
      const r = await fn();
      (r.ok || r.status === "connected" ? toast.success : toast.error)(r.message ?? "");
    } catch (e) {
      toast.error((e as Error).message);
    }
    setBusy(false);
    refresh();
  }

  const expSoon = conn?.token_expires_at && new Date(conn.token_expires_at).getTime() - Date.now() < 7 * 864e5;
  const secrets = requiredSecrets(slug, platforms);
  const scopes = requiredScopes(platforms, slug);
  const platformLabel = platforms.length ? platforms.map((p) => (p === "instagram" ? "Instagram" : "Facebook")).join(" + ") : "no platforms chosen";

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <PageHeader title={`Connections — ${brandName}`} subtitle="Each business has its own accounts and its own posting switch. Switch business top-left to see its connection." />

      <Panel title="Platforms for this business" action={<Badge variant={enabled ? "success" : "muted"}>{enabled ? "Posting on" : "Paused"}</Badge>}>
        <div className="flex flex-wrap gap-4 text-sm">
          {(["facebook", "instagram"] as const).filter((p) => allowedPlatforms(slug).includes(p)).map((p) => (
            <label key={p} className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={platforms.includes(p)}
                disabled={busy || enabled}
                onChange={(e) => {
                  const next = e.target.checked ? [...platforms, p] : platforms.filter((x) => x !== p);
                  act(() => savePlatforms({ data: { brand: slug, platforms: next } }));
                }}
              />
              {p === "facebook" ? "Facebook Page" : "Instagram"}
            </label>
          ))}
        </div>
        {igLogin && <p className="mt-2 text-xs text-muted-foreground">{brandName} uses Instagram Login — Instagram only, no Facebook Page.</p>}
        <p className="mt-2 text-xs text-muted-foreground">{enabled ? "Pause posting to change platforms." : "Changing platforms requires a new connection check."}</p>
      </Panel>

      <Panel title={`${brandName} — ${platformLabel}`} action={<Badge variant={status === "connected" ? "success" : status === "error" ? "danger" : "muted"}>{status === "connected" ? "Connected" : status === "error" ? "Problem" : "Not connected"}</Badge>}>
        {status === "connected" ? (
          <div className="space-y-1 text-sm">
            <p className="flex items-center gap-2"><CheckCircle2 className="size-4 text-success" /> {igLogin ? `Instagram: @${conn?.ig_username} (no Facebook Page)` : `Page: ${conn?.page_name}`}{igLogin ? "" : ""}{igLogin ? "" : wantIg ? ` · Instagram: @${conn?.ig_username ?? conn?.ig_user_id}` : " · Instagram: not used"}</p>
            <p className="text-muted-foreground">Token expires: {conn?.token_expires_at ? new Date(conn.token_expires_at).toLocaleDateString("nb-NO") : "Expiry unknown"}</p>
            {expSoon && <p className="flex items-center gap-2 text-warning-foreground"><AlertTriangle className="size-4" /> The token expires within a week. Replace it to avoid a pause.</p>}
          </div>
        ) : (
          <div className="space-y-3 text-sm">
            {conn?.last_error && <p className="flex items-start gap-2 text-destructive"><AlertTriangle className="mt-0.5 size-4 shrink-0" /> {conn.last_error}</p>}
            {igLogin ? (<>
            <p>Uses Meta's Instagram API with Instagram Login (no Facebook Page). The token stays server-side, never in the browser.</p>
            <ol className="list-decimal space-y-1.5 pl-5 text-muted-foreground">
              <li>In Meta for Developers, add the “Instagram API with Instagram login” product to a Business app you admin.</li>
              <li>@{INSTAGRAM_LOGIN_BRANDS[slug]?.expectedUsername} must be an Instagram Business or Creator account, added as an Instagram tester/role on the app.</li>
              <li>Generate an Instagram user access token for @{INSTAGRAM_LOGIN_BRANDS[slug]?.expectedUsername} with: {scopes.join(", ")} (you approve it in Instagram's own screen).</li>
              <li>Ask in chat to add these secrets (a secure form opens): {secrets.map((n, i) => <span key={n}>{i ? ", " : ""}<code>{n}</code></span>)}.</li>
              <li>Press “Check connection”. It only reads from Instagram and must match @{INSTAGRAM_LOGIN_BRANDS[slug]?.expectedUsername} exactly.</li>
            </ol></>) : (<>
            <p>Uses a server-side Page token for this business only (kept secret, never in the browser):</p>
            <ol className="list-decimal space-y-1.5 pl-5 text-muted-foreground">
              <li>In Meta for Developers, use a Business app you are an admin of{wantIg ? ", with Instagram Graph API and Facebook Login for Business" : ", with Facebook Login for Business"}.</li>
              {wantIg ? <li>Make sure the Instagram professional account is linked to the {brandName} Facebook Page.</li> : <li>No Instagram account is needed for {brandName}.</li>}
              <li>In Graph API Explorer, get a long-lived <b>Page</b> access token for the {brandName} Page with: {scopes.join(", ")}.</li>
              <li>Ask in chat to add these secrets (a secure form opens): {secrets.map((n, i) => <span key={n}>{i ? ", " : ""}<code>{n}</code></span>)}.</li>
              <li>Come back and press “Check connection”. It only reads from Meta — it never posts or queues anything.</li>
            </ol></>)}
          </div>
        )}
        <Button variant="teal" className="mt-4" onClick={() => act(() => check({ data: { brand: slug } }))} disabled={busy || !platforms.length}>{busy ? "Working…" : "Check connection"}</Button>
      </Panel>

      <Panel title="Dry run (nothing is sent)">
        <p className="text-sm text-muted-foreground">Checks business, account, platforms and the next dated items' readiness. No Meta calls, nothing queued. Not proof that live posting works.</p>
        <Button variant="outline" className="mt-3" disabled={busy} onClick={async () => { setBusy(true); try { setReport(await dry({ data: { brand: slug } })); } catch (e) { toast.error((e as Error).message); } setBusy(false); }}>Run dry run</Button>
        {report && report.brand === slug && (
          <div className="mt-3 space-y-1 text-sm">
            <p>Account: {report.account.instagram ? `@${report.account.instagram}` : "not connected"}{report.account.facebookPage ? ` · Page: ${report.account.facebookPage}` : report.mode === "instagram_login" ? " · no Facebook Page" : ""} · connection: {report.connectionStatus}</p>
            <p>Secrets saved: {Object.entries(report.secretsPresent).map(([n, ok]) => `${n} ${ok ? "yes" : "missing"}`).join(", ")}</p>
            <p>Targets: {report.targets.map((t) => `${t.platform} — ${t.wouldSendNow ? "would send" : "would NOT send"}`).join(", ") || "none"} (posting {report.postingEnabled ? "on" : "paused"}, main switch {report.globalActive ? "on" : "off"})</p>
            <p>Next items ({report.timeZone}): {report.items.length ? `${report.ready}/${report.items.length} ready` : "none dated"}</p>
            <ul className="list-disc pl-5 text-muted-foreground">{report.items.map((x) => <li key={x.id}>{x.atLocal} · {x.file} · {x.issues.length ? x.issues.join(", ") : "ready"}{x.approved ? "" : " · not approved"}</li>)}</ul>
            <p className="text-xs text-muted-foreground">{report.note}</p>
          </div>
        )}
      </Panel>

      <Panel title={`Posting for ${brandName}`} action={<Badge variant={enabled ? "success" : "muted"}>{enabled ? "On" : "Paused"}</Badge>}>
        {enabled ? (
          <div className="space-y-2 text-sm">
            <p>Approved {brandName} items post to {platformLabel} while the main publishing switch is on.</p>
            <Button variant="outline" onClick={() => act(() => toggle({ data: { brand: slug, enabled: false } }))} disabled={busy}>Pause {brandName}</Button>
          </div>
        ) : (
          <div className="space-y-3 text-sm">
            <p className="text-muted-foreground">{brandName} is paused. The main publishing switch does not turn it on — only this button does.</p>
            <label className="flex items-start gap-2">
              <input type="checkbox" className="mt-1" checked={testOk} onChange={(e) => setTestOk(e.target.checked)} />
              <span>I have reviewed a draft or non-public test post for {brandName} and the {igLogin ? "Instagram account" : "Page"} is correct.</span>
            </label>
            <Button variant="teal" onClick={() => act(() => toggle({ data: { brand: slug, enabled: true, testConfirmed: testOk } }))} disabled={busy || status !== "connected" || !testOk}>
              Turn on posting for {brandName}
            </Button>
            {status !== "connected" && <p className="text-xs text-muted-foreground">Check the connection first.</p>}
          </div>
        )}
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
