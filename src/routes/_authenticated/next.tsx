import { useActiveBrand, useBrandConnection, useBrandAssets, useBrandPublications } from "@/components/brand";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Film, AlertTriangle, ArrowDownToLine, XCircle, Heart, MessageCircle, Send, Bookmark, ThumbsUp, Share2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { signedUrl, type Asset } from "@/lib/queries";
import { osloDateKey } from "@/lib/schedule";
import { metaIssues } from "@/lib/meta-format";
import { runway, swapCandidate, canMove } from "@/lib/upnext";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { NextCalendar } from "@/components/next-calendar";
import { addDays, calendarItems } from "@/lib/next-calendar";

export const Route = createFileRoute("/_authenticated/next")({
  head: () => ({
    meta: [
      { title: "Up next — Skyline Publisher" },
      { name: "description", content: "The next scheduled posts and Reels, with exact times." },
      { property: "og:title", content: "Up next — Skyline Publisher" },
      { property: "og:description", content: "The next scheduled posts and Reels, with exact times." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
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
  const { data: assets = [], slug } = useBrandAssets({ refetchInterval: 60000 });
  const { data: pubs = [] } = useBrandPublications({ refetchInterval: 60000 });
  const [open, setOpen] = useState<Asset | null>(null);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => setOpen(null), [slug]);
  const today = osloDateKey(new Date(now));
  const tomorrow = addDays(today, 1);
  const run = useMemo(() => runway(assets, today, osloDateKey, now), [assets, today, now]);
  const days = useMemo(() => calendarItems(assets, slug), [assets, slug]);
  const first = [...days.values()].flat().find((a) => a.scheduled_at && new Date(a.scheduled_at).getTime() >= now && !pubs.some((p) => p.asset_id === a.id && p.status === "published"));
  const imbalance = run.days > 0 && run.postDays !== run.reelDays
    ? run.postDays < run.reelDays ? "Image posts run out before Reels." : "Reels run out before image posts." : null;

  return (
    <div className="mx-auto min-w-0 max-w-3xl">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
        <h1 className="min-w-0 font-display text-xl font-bold sm:text-3xl">Up next</h1>
        <Button variant="link" asChild className="min-h-11 max-w-36 px-0 text-right text-xs whitespace-normal sm:max-w-none sm:text-sm"><Link to="/health">Check all businesses</Link></Button>
      </div>
      <div className="mt-2 grid min-w-0 grid-cols-2 gap-2 sm:gap-3">
        <div className={cn("min-w-0 rounded-lg border p-3", run.days <= 7 ? "border-warning bg-warning/10" : "bg-card")}>
          <div className="font-display text-2xl font-bold tabular-nums sm:text-3xl">{run.days} <span className="text-sm font-semibold">{run.days === 1 ? "day" : "days"} left</span></div>
          <div className="mt-1 text-xs text-muted-foreground">{run.postsLeft} posts · {run.reelsLeft} Reels</div>
          <div className="mt-1 text-xs text-muted-foreground">{run.lastKey ? `Until ${longDate(run.lastKey)}` : "Nothing scheduled"}</div>
        </div>
        {first?.scheduled_at ? <Button variant="default" onClick={() => setOpen(first)} className="block h-auto min-w-0 rounded-lg p-3 text-left whitespace-normal">
          <div className="text-xs font-medium opacity-80">Next to go out</div>
          <div className="font-display text-2xl font-bold tabular-nums sm:text-3xl">{time(first.scheduled_at)}</div>
          <div className="mt-1 text-xs">{dayLabel(first.scheduled_at, today, tomorrow)} · {first.kind === "reel" ? "Reel" : "Image post"}</div>
          <div className="mt-1 truncate text-xs opacity-80">{first.file_name}</div>
        </Button> : <div className="flex min-w-0 items-center rounded-lg bg-muted p-3 text-sm text-muted-foreground">No upcoming items.</div>}
      </div>
      {imbalance && <p className="mt-2 flex items-start gap-1.5 text-xs text-warning-foreground"><AlertTriangle className="size-3.5 shrink-0" />{imbalance}</p>}
      <NextCalendar key={slug} days={days} pubs={pubs} today={today} onPreview={setOpen} />
      <PreviewDialog asset={open} assets={assets} pubs={pubs} onClose={() => setOpen(null)} />
    </div>
  );
}

function PreviewDialog({ asset, assets, pubs, onClose }: { asset: Asset | null; assets: Asset[]; pubs: { asset_id: string; status: string }[]; onClose: () => void }) {
  const qc = useQueryClient();
  const { brand } = useActiveBrand();
  const { data: conn } = useBrandConnection();
  const [media, setMedia] = useState<{ src: string | null; video: boolean }>({ src: null, video: false });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setMedia({ src: null, video: false });
    if (!asset) return;
    const path = asset.kind === "reel" ? asset.cover_path ?? asset.rendered_path ?? asset.storage_path : asset.storage_path;
    const video = asset.kind === "reel" && !asset.cover_path;
    let active = true;
    if (path) void signedUrl(path).then((src) => { if (active) setMedia({ src, video }); });
    return () => { active = false; };
  }, [asset]);

  if (!asset?.scheduled_at) return null;
  const issues = metaIssues(asset);
  const movable = canMove(asset.id, pubs);
  const repl = swapCandidate(asset, assets, pubs);
  const name = conn?.ig_username ?? brand?.name ?? "Instagram account";
  const page = conn?.page_name ?? brand?.name ?? "Facebook Page";
  const caption = asset.caption ?? "";
  const firstLine = caption.length > 125 ? caption.slice(0, 125) + "… more" : caption;

  async function act(unapprove: boolean) {
    if (!asset?.scheduled_at) return;
    setBusy(true);
    try {
      if (repl) {
        const mine = asset.scheduled_at;
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
        media.video ? <video src={media.src} className="size-full object-contain" controls playsInline muted /> : <img src={media.src} alt="" className="size-full object-contain" />
      ) : <div className="flex size-full items-center justify-center text-xs text-muted-foreground">Loading…</div>}
    </div>
  );

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[calc(100dvh-1rem)] w-[calc(100%-1rem)] min-w-0 overflow-x-hidden overflow-y-auto rounded-lg p-3 [overflow-wrap:anywhere] [&>button]:right-1 [&>button]:top-1 [&>button]:flex [&>button]:size-11 [&>button]:items-center [&>button]:justify-center sm:max-w-md sm:p-4">
        <DialogHeader className="min-w-0 pr-10 text-left">
          <DialogTitle className="leading-snug">{time(asset.scheduled_at)} · {asset.kind === "reel" ? "Reel" : "Image post"}</DialogTitle>
          <DialogDescription className="[overflow-wrap:anywhere]">{asset.file_name}</DialogDescription>
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
              <div className="flex items-center gap-2 p-2.5"><div className="size-7 shrink-0 rounded-full bg-teal" /><span className="text-sm font-semibold">{name}</span></div>
              <Media ratio={asset.kind === "reel" ? "aspect-[9/16] max-h-[45dvh]" : "aspect-[4/5]"} />
              <div className="flex gap-3 p-2.5"><Heart className="size-5" /><MessageCircle className="size-5" /><Send className="size-5" /><Bookmark className="ml-auto size-5" /></div>
              <p className="whitespace-pre-line px-2.5 pb-3 text-sm"><span className="font-semibold">{name}</span> {firstLine || <em className="text-muted-foreground">no caption</em>}</p>
            </div>
          </TabsContent>
          <TabsContent value="fb">
            <div className="overflow-hidden rounded-xl border bg-card">
              <div className="flex items-center gap-2 p-2.5"><div className="size-8 shrink-0 rounded-full bg-primary" /><div><div className="text-sm font-semibold">{page}</div><div className="text-xs text-muted-foreground">{dayLabelShort(asset.scheduled_at)}</div></div></div>
              <p className="whitespace-pre-line px-2.5 pb-2 text-sm">{caption || <em className="text-muted-foreground">no caption</em>}</p>
              <Media ratio={asset.kind === "reel" ? "aspect-[9/16] max-h-[45dvh]" : "aspect-[4/5]"} />
              <div className="flex justify-around border-t p-2 text-xs text-muted-foreground"><span className="flex gap-1"><ThumbsUp className="size-4" />Like</span><span className="flex gap-1"><MessageCircle className="size-4" />Comment</span><span className="flex gap-1"><Share2 className="size-4" />Share</span></div>
            </div>
          </TabsContent>
        </Tabs>
        <p className="text-xs text-muted-foreground">Approximate look — Meta's apps may crop or cut text slightly differently.</p>

        {movable ? (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              {repl ? <>Fills this slot: <span className="font-medium text-foreground">{repl.file_name}</span> (last {asset.kind === "reel" ? "Reel" : "post"} in the queue, {dayLabelShort(repl.scheduled_at ?? "")}).</> : "No later item of this type to move up."}
            </p>
            <div className="grid grid-cols-1 gap-2 min-[360px]:grid-cols-2">
              <Button className="min-h-11 px-2" variant="outline" disabled={busy || !repl} onClick={() => act(false)}><ArrowDownToLine className="size-4" />Swap to end</Button>
              <Button className="min-h-11 px-2" variant="destructive" disabled={busy || !asset.approved} onClick={() => act(true)}><XCircle className="size-4" />Unapprove</Button>
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
