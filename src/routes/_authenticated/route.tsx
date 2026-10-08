import { createFileRoute, Link, Outlet, redirect, useRouterState } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Clock, CalendarDays, Gauge, Library, Music2, Send, Plug, Upload, LogOut, PauseCircle, PlayCircle, Compass, Tags, Lightbulb, BarChart3 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { settingsQuery } from "@/lib/queries";
import { cn } from "@/lib/utils";
import { useActiveBrand } from "@/components/brand";
import { importCounts, useImportState } from "@/lib/import-store";
import { Loader2, Pencil } from "lucide-react";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/" });
    return { user: data.user };
  },
  component: Shell,
});

const NAV = [
  { to: "/next", label: "Up next", icon: Clock },
  { to: "/overview", label: "Overview", icon: Gauge },
  { to: "/import", label: "Add batch", icon: Upload },
  { to: "/library", label: "Library", icon: Library },
  { to: "/organize", label: "Organize", icon: Tags },
  { to: "/strategy", label: "Strategy", icon: Compass },
  { to: "/calendar", label: "Calendar", icon: CalendarDays },
  { to: "/ideas", label: "Ideas", icon: Lightbulb },
  { to: "/audio", label: "Audio Studio", icon: Music2 },
  { to: "/results", label: "Results", icon: Send },
  { to: "/performance", label: "Performance", icon: BarChart3 },
  { to: "/connections", label: "Connections", icon: Plug },
] as const;

function Shell() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const { data: settings } = useQuery(settingsQuery);
  const active = settings?.publishing_active;
  return (
    <div className="min-h-screen lg:flex">
      <aside className="hidden w-60 shrink-0 flex-col bg-sidebar p-4 text-sidebar-foreground lg:flex">
        <div className="mb-6"><BusinessPicker /></div>
        <nav className="flex-1 space-y-1">
          {NAV.map((n) => (
            <Link
              key={n.to}
              to={n.to}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors hover:bg-sidebar-accent",
                path.startsWith(n.to) && "bg-sidebar-accent text-sidebar-primary",
              )}
            >
              <n.icon className="size-4" /> {n.label}
            </Link>
          ))}
        </nav>
        <StatusPill active={!!active} />
        <button onClick={() => supabase.auth.signOut()} className="mt-3 flex items-center gap-2 px-3 py-2 text-sm opacity-80 hover:opacity-100">
          <LogOut className="size-4" /> Sign out
        </button>
      </aside>
      <header className="sticky top-0 z-20 flex items-center justify-between bg-sidebar px-4 py-3 text-sidebar-accent-foreground lg:hidden">
        <BusinessPicker compact />
        <StatusPill active={!!active} compact />
      </header>
      <main className="min-w-0 flex-1 px-4 pb-28 pt-6 sm:px-6 lg:px-10 lg:pb-10">
        <Outlet />
      </main>
      <UploadPill />
      <nav className="fixed inset-x-0 bottom-0 z-20 flex overflow-x-auto border-t bg-card lg:hidden">
        {NAV.map((n) => (
          <Link key={n.to} to={n.to} className={cn("flex min-w-16 flex-1 flex-col items-center gap-1 py-2.5 text-[10px] text-muted-foreground", path.startsWith(n.to) && "text-teal")}>
            <n.icon className="size-5" />
            <span className="truncate">{n.label.split(" ")[0]}</span>
          </Link>
        ))}
      </nav>
    </div>
  );
}

function StatusPill({ active, compact }: { active: boolean; compact?: boolean }) {
  return (
    <div className={cn("flex items-center gap-2 rounded-lg text-xs font-semibold", compact ? "" : "bg-sidebar-accent px-3 py-2.5")}>
      {active ? <PlayCircle className="size-4 text-sidebar-primary" /> : <PauseCircle className="size-4 text-warning" />}
      {active ? "Publishing active" : "Publishing paused"}
    </div>
  );
}

/** Top-left business switcher. Each business keeps its own files, calendar and results. */
function BusinessPicker({ compact }: { compact?: boolean }) {
  const { slug, brand, brands, setSlug } = useActiveBrand();
  const qc = useQueryClient();
  async function rename() {
    if (!brand) return;
    const n = window.prompt("New name for this business", brand.name)?.trim();
    if (!n || n === brand.name) return;
    await supabase.from("brands").update({ name: n, updated_at: new Date().toISOString() }).eq("id", brand.id);
    qc.invalidateQueries({ queryKey: ["brands"] });
  }
  return (
    <div className="flex items-center gap-1">
      <select
        aria-label="Switch business"
        value={slug}
        onChange={(e) => setSlug(e.target.value)}
        className={cn("min-w-0 max-w-full cursor-pointer truncate rounded-md bg-sidebar-accent font-display font-bold text-sidebar-accent-foreground outline-none", compact ? "px-2 py-1 text-sm" : "w-full px-2 py-2 text-base")}
      >
        {brands.map((b) => <option key={b.slug} value={b.slug}>{b.name}</option>)}
      </select>
      <button aria-label="Rename business" onClick={rename} className="rounded p-1.5 opacity-70 hover:opacity-100"><Pencil className="size-3.5" /></button>
    </div>
  );
}

/** Small always-visible upload status so imports are visible from any page. */
function UploadPill() {
  const s = useImportState();
  const path = useRouterState({ select: (r) => r.location.pathname });
  const { brands } = useActiveBrand();
  if (!s.running || path.startsWith("/import")) return null;
  const { total, finished } = importCounts(s);
  const name = brands.find((b) => b.slug === s.brandSlug)?.name ?? "";
  return (
    <Link to="/import" className="fixed bottom-20 right-4 z-30 flex items-center gap-2 rounded-full bg-sidebar px-4 py-2 text-xs font-semibold text-sidebar-accent-foreground shadow-lg lg:bottom-4">
      <Loader2 className="size-4 animate-spin text-sidebar-primary" />
      Uploading {name}: {finished}/{total || "…"}
    </Link>
  );
}
