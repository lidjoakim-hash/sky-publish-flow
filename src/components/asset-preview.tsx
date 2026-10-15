// Shared tap-to-preview dialog: shows an asset as an approximate Instagram/Facebook post.
// Used by Up next (with swap/unapprove actions) and Calendar (read-only look).
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowDownToLine, XCircle, Heart, MessageCircle, Send, Bookmark, ThumbsUp, Share2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { signedUrl, type Asset } from "@/lib/queries";
import { osloDateKey } from "@/lib/schedule";
import { metaIssues } from "@/lib/meta-format";
import { addDays } from "@/lib/next-calendar";
import { canMove, swapCandidate } from "@/lib/upnext";
import { useActiveBrand, useBrandConnection } from "@/components/brand";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const time = (iso: string) => new Intl.DateTimeFormat("nb-NO", { timeZone: "Europe/Oslo", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
const dayLabelShort = (iso: string) => new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Oslo", weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
const dayLabel = (iso: string, today: string, tomorrow: string) => {
  const k = osloDateKey(iso);
  if (k === today) return "Today";
  if (k === tomorrow) return "Tomorrow";
  return new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Oslo", weekday: "long", day: "numeric", month: "long" }).format(new Date(iso));
};

export function AssetPreviewDialog({ asset, assets, pubs, onClose, withActions = false }: { asset: Asset | null; assets: Asset[]; pubs: { asset_id: string; status: string }[]; onClose: () => void; withActions?: boolean }) {
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
  const movable = withActions && canMove(asset.id, pubs);
  const repl = withActions ? swapCandidate(asset, assets, pubs) : null;
  const name = conn?.ig_username ?? brand?.name ?? "Instagram account";
  const page = conn?.page_name ?? brand?.name ?? "Facebook Page";
  const caption = asset.caption ?? "";
  const firstLine = caption.length > 125 ? caption.slice(0, 125) + "… more" : caption;
  const today = osloDateKey(new Date());
  const tomorrow = addDays(today, 1);

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

        {withActions && (movable ? (
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
        ))}
      </DialogContent>
    </Dialog>
  );
}
