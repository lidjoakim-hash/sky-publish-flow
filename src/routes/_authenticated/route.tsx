import { createFileRoute, Link, Outlet, redirect, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { CalendarDays, Gauge, Library, Music2, Send, Plug, Upload, LogOut, PauseCircle, PlayCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { settingsQuery } from "@/lib/queries";
import { cn } from "@/lib/utils";

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
  { to: "/overview", label: "Overview", icon: Gauge },
  { to: "/import", label: "Add batch", icon: Upload },
  { to: "/library", label: "Library", icon: Library },
  { to: "/calendar", label: "Calendar", icon: CalendarDays },
  { to: "/audio", label: "Audio Studio", icon: Music2 },
  { to: "/results", label: "Results", icon: Send },
  { to: "/connections", label: "Connections", icon: Plug },
] as const;

function Shell() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const { data: settings } = useQuery(settingsQuery);
  const active = settings?.publishing_active;
  return (
    <div className="min-h-screen lg:flex">
      <aside className="hidden w-60 shrink-0 flex-col bg-sidebar p-4 text-sidebar-foreground lg:flex">
        <div className="mb-6 px-2 font-display text-lg font-bold text-sidebar-accent-foreground">Skyline Publisher</div>
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
        <span className="font-display font-bold">Skyline Publisher</span>
        <StatusPill active={!!active} compact />
      </header>
      <main className="min-w-0 flex-1 px-4 pb-28 pt-6 sm:px-6 lg:px-10 lg:pb-10">
        <Outlet />
      </main>
      <nav className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-7 border-t bg-card lg:hidden">
        {NAV.map((n) => (
          <Link key={n.to} to={n.to} className={cn("flex flex-col items-center gap-1 py-2.5 text-[10px] text-muted-foreground", path.startsWith(n.to) && "text-teal")}>
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
