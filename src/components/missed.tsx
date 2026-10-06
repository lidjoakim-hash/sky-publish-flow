import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/app-ui";
import { resolveMissed } from "@/lib/app.functions";
import { formatOslo } from "@/lib/schedule";
import type { Asset, Publication } from "@/lib/queries";

/** Items whose slot passed without posting. They are never posted late; the owner reschedules or skips. */
export function MissedPanel({ assets, pubs }: { assets: Asset[]; pubs: Publication[] }) {
  const qc = useQueryClient();
  const run = useServerFn(resolveMissed);
  const ids = new Set(pubs.filter((p) => p.status === "missed").map((p) => p.asset_id));
  const items = assets.filter((a) => ids.has(a.id));
  if (!items.length) return null;
  async function act(assetId: string, action: "reschedule" | "skip") {
    try {
      const r = await run({ data: { assetId, action } });
      (r.ok ? toast.success : toast)(r.message);
    } catch (e) {
      toast.error((e as Error).message);
    }
    qc.invalidateQueries();
  }
  return (
    <Panel title={`Missed slots (${items.length})`} className="mb-4">
      <p className="mb-2 text-xs text-muted-foreground">These were not posted within 3 hours of their time. They are never posted late automatically.</p>
      <div className="divide-y">
        {items.map((a) => (
          <div key={a.id} className="flex flex-wrap items-center gap-2 py-2 text-sm">
            <span className="min-w-0 flex-1 truncate">{a.file_name}</span>
            <span className="text-xs text-muted-foreground">{a.scheduled_at ? formatOslo(a.scheduled_at) : ""}</span>
            <Button size="sm" variant="outline" onClick={() => act(a.id, "reschedule")}>Reschedule</Button>
            <Button size="sm" variant="ghost" onClick={() => act(a.id, "skip")}>Skip</Button>
          </div>
        ))}
      </div>
    </Panel>
  );
}
