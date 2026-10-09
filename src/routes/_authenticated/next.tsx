import { useBrandConnection , useBrandAssets, useBrandPublications } from "@/components/brand";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Film, Image as ImageIcon, AlertTriangle, ArrowDownToLine, XCircle, Heart, MessageCircle, Send, Bookmark, ThumbsUp, Share2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { assetsQuery, publicationsQuery, signedUrl, type Asset } from "@/lib/queries";
import { osloDateKey } from "@/lib/schedule";
import { metaIssues } from "@/lib/meta-format";
import { runway, swapCandidate, canMove } from "@/lib/upnext";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/next")({
  head: () => ({
    meta: [
      { title: "Up next — Skyline Publisher" },
      { name: "description", content: "The next scheduled posts and Reels, with exact times." },
      { property: "og:title", content: "Up next — Skyline Publisher" },
      { property: "og:description", content: "The next scheduled posts and Reels, with exact times." },
    ],
  }),
  component: NextPage,
});

const time = (iso: string) => new Intl.DateTimeFormat("nb-NO", { timeZone: "Europe/Oslo", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
const longDate = (key: string) => new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", weekday: "short", day: "numeric", month: "short" }).format(new Date(key + "T12:00:00Z"));
const dayLabel = (iso: string, today: string, tomorrow: string) => {
  const k = osloDateKey(iso);
  if (k === today) return "Today";
  if (k === tomorrow) return "Tomorrow";
  return new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Oslo", weekday: "long", day: "numeric", month: "long" }).format(new Date(iso));
};

function NextPage() {
  const { data: assets = [] } = useBrandAssets({ refetchInterval: 60000 });
  const { data: pubs = [] } = useBrandPublications();
  const [open, setOpen] = useState<Asset | null>(null);
  const now = Date.now();
  const today = osloDateKey(new Date());
  const tomorrow = osloDateKey(new Date(now + 86400000));
  const run = useMemo(() => runway(assets, today, osloDateKey, now), [assets, today]); // eslint-disable-line react-hooks/exhaustive-deps

  const days = useMemo(() => {
    const upcoming = assets
      .filter((a) => !a.skipped && a.scheduled_at && new Date(a.scheduled_at).getTime() >= now - 5 * 60000)
      .sort((a, b) => a.scheduled_at!.localeCompare(b.scheduled_at!))
      .slice(0, 40);
    const map = new Map<string, typeof upcoming>();
    for (const a of upcoming) {
      const k = osloDateKey(a.scheduled_at!);
      map.set(k, [...(map.get(k) ?? []), a]);
    }
    return [...map.values()];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assets]);

  const first = days[0]?.[0];
  const imbalance =
    run.days > 0 && run.postDays !== run.reelDays
      ? run.postDays < run.reelDays
        ? `Image posts run out ${run.postDays ? `after ${longDate(addDays(today, run.postDays - 1))}` : "now"} — after that only Reels (${run.reelDays - run.postDays} days).`
        : `Reels run out ${run.reelDays ? `after ${longDate(addDays(today, run.reelDays - 1))}` : "now"} — after that only image posts (${run.postDays - run.reelDays} days).`
      : null;

  return (
    <div className="mx-auto max-w-3xl">
      <div className="flex items-baseline justify-between gap-2">
        <h1 className="font-display text-2xl font-bold sm:text-3xl">Up next</h1>
        <Link to="/health" className="text-sm font-medium text-primary underline">Check all businesses</Link>
      </div>

      <div className={cn("mt-4 rounded-2xl border p-4 shadow-card", run.days <= 7 ? "border-warning bg-warning/10" : "bg-card")}>
        <div className="flex items-baseline gap-2">
          <span className="font-display text-4xl font-bold tabular-nums">{run.days}</span>
          <span className="text-sm font-semibold">{run.days === 1 ? "day" : "days"} of content left</span>
        </div>
        <div className="mt-1 text-sm text-muted-foreground">
          {run.lastKey ? `Last item goes out ${longDate(run.lastKey)}. ` : "Nothing scheduled. "}
          {run.postsLeft} image posts · {run.reelsLeft} Reels
        </div>
        {imbalance && <div className="mt-2 flex gap-2 text-sm font-medium"><AlertTriangle className="size-4 shrink-0 text-warning-foreground" />{imbalance}</div>}
      </div>

      {first ? (
        <button onClick={() => setOpen(first)} className="mt-4 block w-full rounded-2xl bg-sidebar p-5 text-left text-sidebar-accent-foreground shadow-card sm:p-6">
          <div className="text-xs font-semibold uppercase tracking-wide opacity-80">Next to go out · tap to preview</div>
          <div className="mt-1 font-display text-4xl font-bold sm:text-5xl">{time(first.scheduled_at!)}</div>
          <div className="mt-1 text-sm opacity-90">{dayLabel(first.scheduled_at!, today, tomorrow)} · {first.kind === "reel" ? "Reel" : "Image post"}</div>
          <div className="mt-2 truncate text-sm opacity-80">{first.file_name}</div>
        </button>
      ) : (
        <p className="mt-6 rounded-xl border bg-card p-6 text-center text-muted-foreground">Nothing is scheduled yet.</p>
      )}

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        {days.map((items) => (
          <section key={items[0].id} className="rounded-2xl border bg-card p-4 shadow-card">
            <h2 className="mb-3 font-display text-lg font-semibold">{dayLabel(items[0].scheduled_at!, today, tomorrow)}</h2>
            <ul className="space-y-2">
              {items.map((a) => {
                const issues = metaIssues(a).filter((i) => i.level === "error").length;
                return (
                  <li key={a.id}>
                    <button onClick={() => setOpen(a)} className={cn("flex w-full items-center gap-3 rounded-xl p-3 text-left", a.kind === "reel" ? "bg-teal/10" : "bg-muted")}>
                      <span className="w-14 shrink-0 font-display text-xl font-bold tabular-nums">{time(a.scheduled_at!)}</span>
                      {a.kind === "reel" ? <Film className="size-5 shrink-0 text-teal" /> : <ImageIcon className="size-5 shrink-0 text-muted-foreground" />}
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-semibold">{a.kind === "reel" ? "Reel" : "Image post"}{a.approved ? "" : " · not approved"}</div>
                        <div className="truncate text-xs text-muted-foreground">{a.file_name}</div>
                      </div>
                      {(issues > 0 || !a.caption?.trim()) && <AlertTriangle className="size-4 shrink-0 text-destructive" />}
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>

      <PreviewDialog asset={open} assets={assets} pubs={pubs} onClose={() => setOpen(null)} />
    </div>
  );
}

function addDays(key: string, n: number) {
  const d = new Date(key + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function PreviewDialog({ asset, assets, pubs, onClose }: { asset: Asset | null; assets: Asset[]; pubs: { asset_id: string; status: string }[]; onClose: () => void }) {
  const qc = useQueryClient();
  const { data: conn } = useBrandConnection();
  const [media, setMedia] = useState<{ src: string | null; video: boolean }>({ src: null, video: false });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setMedia({ src: null, video: false });
    if (!asset) return;
    const path = asset.kind === "reel" ? asset.cover_path ?? asset.rendered_path ?? asset.storage_path : asset.storage_path;
    const video = asset.kind === "reel" && !asset.cover_path;
    if (path) void signedUrl(path).then((src) => setMedia({ src, video }));
  }, [asset]);

  if (!asset) return null;
  const issues = metaIssues(asset);
  const movable = canMove(asset.id, pubs);
  const repl = swapCandidate(asset, assets, pubs);
  const name = conn?.ig_username ?? "skylinestavanger";
  const page = conn?.page_name ?? "Skyline Stavanger";
  const caption = asset.caption ?? "";
  const firstLine = caption.length > 125 ? caption.slice(0, 125) + "… more" : caption;

  async function act(unapprove: boolean) {
    if (!asset) return;
    setBusy(true);
    try {
      if (repl) {
        const mine = asset.scheduled_at!;
        const r1 = await supabase.from("assets").update({ scheduled_at: mine }).eq("id", repl.id);
        if (r1.error) throw r1.error;
        const r2 = await supabase.from("assets").update({ scheduled_at: repl.scheduled_at, ...(unapprove ? { approved: false } : {}) }).eq("id", asset.id);
        if (r2.error) throw r2.error;
        toast.success(`${repl.file_name} moved into ${time(mine)}; this one moved to the end.`);
      } else if (unapprove) {
        const r = await supabase.from("assets").update({ approved: false }).eq("id", asset.id);
        if (r.error) throw r.error;
        toast.success("Unapproved. No later item to fill the slot, so it stays empty.");
      }
      await qc.invalidateQueries();
      onClose();
    } catch (e) {
      toast.error(`Nothing changed: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  const Media = ({ ratio }: { ratio: string }) => (
    <div className={cn("w-full overflow-hidden bg-muted", ratio)}>
      {media.src ? (
        media.video ? <video src={media.src} className="size-full object-cover" controls playsInline muted /> : <img src={media.src} alt="" className="size-full object-cover" />
      ) : <div className="flex size-full items-center justify-center text-xs text-muted-foreground">Loading…</div>}
    </div>
  );

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto p-4 sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{time(asset.scheduled_at!)} · {asset.kind === "reel" ? "Reel" : "Image post"}</DialogTitle>
          <DialogDescription className="truncate">{asset.file_name}</DialogDescription>
        </DialogHeader>

        {(issues.length > 0 || !caption.trim() || !asset.approved) && (
          <ul className="space-y-1 rounded-lg border border-warning bg-warning/10 p-3 text-sm">
            {!asset.approved && <li>• Not approved — it won't be posted</li>}
            {!caption.trim() && <li className="text-destructive">• No caption</li>}
            {issues.map((i) => <li key={i.text} className={i.level === "error" ? "text-destructive" : ""}>• {i.text}</li>)}
          </ul>
        )}

        <Tabs defaultValue="ig">
          <TabsList className="w-full"><TabsTrigger value="ig" className="flex-1">Instagram</TabsTrigger><TabsTrigger value="fb" className="flex-1">Facebook</TabsTrigger></TabsList>
          <TabsContent value="ig">
            <div className="overflow-hidden rounded-xl border bg-card">
              <div className="flex items-center gap-2 p-2.5"><div className="size-7 rounded-full bg-teal" /><span className="text-sm font-semibold">{name}</span></div>
              <Media ratio={asset.kind === "reel" ? "aspect-[9/16] max-h-[55vh]" : "aspect-[4/5]"} />
              <div className="flex gap-3 p-2.5"><Heart className="size-5" /><MessageCircle className="size-5" /><Send className="size-5" /><Bookmark className="ml-auto size-5" /></div>
              <p className="whitespace-pre-line px-2.5 pb-3 text-sm"><span className="font-semibold">{name}</span> {firstLine || <em className="text-muted-foreground">no caption</em>}</p>
            </div>
          </TabsContent>
          <TabsContent value="fb">
            <div className="overflow-hidden rounded-xl border bg-card">
              <div className="flex items-center gap-2 p-2.5"><div className="size-8 rounded-full bg-primary" /><div><div className="text-sm font-semibold">{page}</div><div className="text-xs text-muted-foreground">{dayLabelShort(asset.scheduled_at!)}</div></div></div>
              <p className="whitespace-pre-line px-2.5 pb-2 text-sm">{caption || <em className="text-muted-foreground">no caption</em>}</p>
              <Media ratio={asset.kind === "reel" ? "aspect-[9/16] max-h-[55vh]" : "aspect-[4/5]"} />
              <div className="flex justify-around border-t p-2 text-xs text-muted-foreground"><span className="flex gap-1"><ThumbsUp className="size-4" />Like</span><span className="flex gap-1"><MessageCircle className="size-4" />Comment</span><span className="flex gap-1"><Share2 className="size-4" />Share</span></div>
            </div>
          </TabsContent>
        </Tabs>
        <p className="text-xs text-muted-foreground">Approximate look — Meta's apps may crop or cut text slightly differently.</p>

        {movable ? (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              {repl ? <>Fills this slot: <span className="font-medium text-foreground">{repl.file_name}</span> (last {asset.kind === "reel" ? "Reel" : "post"} in the queue, {dayLabelShort(repl.scheduled_at!)}).</> : "No later item of this type to move up."}
            </p>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" disabled={busy || !repl} onClick={() => act(false)}><ArrowDownToLine className="size-4" />Swap to end</Button>
              <Button variant="destructive" disabled={busy || !asset.approved} onClick={() => act(true)}><XCircle className="size-4" />Unapprove</Button>
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Already being sent or posted — it can't be moved.</p>
        )}
      </DialogContent>
    </Dialog>
  );
}

const dayLabelShort = (iso: string) => new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Oslo", weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
