"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { startTransition, useActionState, useEffect, useState, type ReactNode } from "react";
import { motion } from "motion/react";
import {
  AlertTriangle, BadgeCheck, Bell, Building2, ChartColumn, Check, ChevronsUpDown, Eye, Flag, Gauge, Home, LogOut, Map, Menu, Package, Percent,
  Plus, Repeat, Route, Salad, ScrollText, Search, ShoppingBag, ShoppingCart, SlidersHorizontal, Store, Ticket, Truck, Upload, User, Users,
} from "lucide-react";
import { Command, CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator } from "@/components/ui/command";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { switchContextAction, logoutAction } from "@/app/actions/auth";
import { Logo } from "./logo";
import type { Nav, NavItem } from "./nav-config";

const ICONS: Record<string, typeof Home> = {
  home: Home, plus: Plus, ticket: Ticket, salad: Salad, repeat: Repeat, truck: Truck, chart: ChartColumn, badge: BadgeCheck, users: Users, map: Map, store: Store,
  eye: Eye, bag: ShoppingBag, package: Package, upload: Upload, percent: Percent, route: Route, cart: ShoppingCart, gauge: Gauge, alert: AlertTriangle, flag: Flag,
  sliders: SlidersHorizontal, scroll: ScrollText,
};
const Icon = ({ name, className }: { name: string; className?: string }) => {
  const C = ICONS[name] ?? Home;
  return <C aria-hidden className={cn("size-4 shrink-0", className)} />;
};
const initials = (s: string) => s.replace(/\(.*?\)/g, "").split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("");

/** Longest matching nav href wins, so /org/tickets/new doesn't also light up /org. */
function useActive(items: NavItem[]) {
  const path = usePathname();
  const hits = items.filter((i) => path === i.href || path.startsWith(i.href + "/"));
  return hits.sort((a, b) => b.href.length - a.href.length)[0]?.href;
}

type Ctx = { id: string; name: string; detail: string; kind: string };

export function AppChrome({
  nav, contexts, currentContext, user, unread, status, demo, children,
}: { nav: Nav; contexts: Ctx[]; currentContext: string; user: { name: string; phone: string }; unread: number; status: string | null; demo: boolean; children: ReactNode }) {
  const all = nav.groups.flatMap((g) => g.items);
  const active = useActive([...all, ...nav.dock]);
  const [open, setOpen] = useState(false);
  const [palette, setPalette] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const router = useRouter();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "k" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); setPalette((v) => !v); }
    };
    const onScroll = () => setScrolled(window.scrollY > 8);
    window.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => { window.removeEventListener("keydown", onKey); window.removeEventListener("scroll", onScroll); };
  }, []);
  const go = (href: string) => { setPalette(false); router.push(href); };

  // `pill` must be unique per rendered copy (sidebar vs drawer) so the shared-layout animation stays in one list.
  const navList = (pill: string, onNavigate?: () => void, dark = false) => (
    <nav aria-label="Main" className="flex flex-col gap-5">
      {nav.groups.map((g) => (
        <div key={g.label}>
          <p className={cn("px-3 pb-1.5 text-xs font-medium", dark ? "text-white/50" : "text-muted-foreground")}>{g.label}</p>
          <ul className="flex flex-col gap-0.5">
            {g.items.map((i) => {
              const on = active === i.href;
              return (
                <li key={i.href} className="relative">
                  {on && <motion.span layoutId={pill} aria-hidden className={cn("absolute inset-0 rounded-xl", dark ? "bg-cream" : "bg-forest")} transition={{ type: "spring", stiffness: 420, damping: 36 }} />}
                  <Link href={i.href} onClick={onNavigate} aria-current={on ? "page" : undefined}
                    className={cn("group relative flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm transition-colors",
                      on ? (dark ? "font-medium text-ink" : "text-white") : dark ? "text-white/75 hover:bg-white/10 hover:text-white" : "text-ink/75 hover:bg-forest-50 hover:text-forest")}>
                    <Icon name={i.icon} className={cn("transition-transform group-hover:scale-110", on ? (dark ? "text-forest" : "text-white") : dark ? "text-white/55 group-hover:text-turmeric" : "text-forest/60 group-hover:text-forest")} />
                    {i.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );

  return (
    <div className="min-h-screen">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-white focus:p-2">Skip to content</a>

      {/* Floating sidebar, inset from the viewport edges */}
      <aside className="fixed inset-y-3 left-3 z-30 hidden w-64 flex-col rounded-3xl border border-white/10 bg-leaf-900 p-4 text-white shadow-[0_20px_40px_-24px_rgb(11_46_31/0.6)] lg:flex">
        <div className="px-2 pb-4"><Logo light tagline /></div>
        <ContextSwitcher contexts={contexts} current={currentContext} dark />
        {nav.primary && (
          <Link href={nav.primary.href} className="group mt-3 flex items-center justify-center gap-2 rounded-xl bg-turmeric px-3 py-2.5 text-sm font-semibold text-turmeric-ink transition-colors hover:bg-[#ffc81f]">
            <Plus aria-hidden className="size-4" />{nav.primary.label}
          </Link>
        )}
        <div className="mt-5 min-h-0 flex-1 overflow-y-auto pr-1">{navList("pill-side", undefined, true)}</div>
        {demo && <p className="mt-3 rounded-xl bg-white/10 px-3 py-2 text-xs font-medium text-turmeric">Demo mode: fictional data</p>}
      </aside>

      {/* Floating top bar */}
      <header className="fixed inset-x-3 top-3 z-20 lg:left-[17.5rem]">
        <div className={cn("float flex items-center gap-2 rounded-2xl px-3 py-2 transition-[box-shadow,background-color] duration-300", scrolled && "shadow-[var(--shadow-lift)]")}>
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger className="inline-flex size-9 items-center justify-center rounded-xl hover:bg-forest-50 lg:hidden" aria-label="Open navigation"><Menu className="size-5" /></SheetTrigger>
            <SheetContent side="left" className="w-72 bg-white p-4">
              <SheetHeader className="p-0 pb-3"><SheetTitle><Logo tagline /></SheetTitle></SheetHeader>
              <ContextSwitcher contexts={contexts} current={currentContext} />
              <div className="mt-5 overflow-y-auto">{navList("pill-drawer", () => setOpen(false))}</div>
            </SheetContent>
          </Sheet>
          <div className="lg:hidden"><Logo small /></div>
          <Breadcrumb items={all} active={active} />
          <button type="button" onClick={() => setPalette(true)} aria-label="Search and jump to a page"
            className="ml-auto flex items-center gap-2 rounded-xl border border-line bg-white px-3 py-1.5 text-sm text-muted-foreground transition hover:border-forest/30 hover:bg-white md:ml-4 md:min-w-64">
            <Search aria-hidden className="size-4" /><span className="hidden md:inline">Jump to…</span>
            <kbd className="d-kbd d-kbd-xs ml-auto hidden md:inline-flex">Ctrl K</kbd>
          </button>
          <div className="flex items-center gap-1.5 md:ml-auto">
            {status && status !== "APPROVED" && <span className="hidden rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-ink sm:inline">{status.toLowerCase().replace(/_/g, " ")}</span>}
            <Tooltip>
              <TooltipTrigger asChild>
                <Link href="/notifications" className="relative inline-flex size-9 items-center justify-center rounded-xl hover:bg-forest-50" aria-label={`Inbox, ${unread} unread`}>
                  <Bell className="size-[18px]" />
                  {unread > 0 && <span className="absolute -right-0.5 -top-0.5 min-w-[18px] rounded-full bg-coral px-1 text-center text-[11px] font-semibold leading-[18px] text-white">{unread > 99 ? "99+" : unread}</span>}
                </Link>
              </TooltipTrigger>
              <TooltipContent>Inbox</TooltipContent>
            </Tooltip>
            <DropdownMenu>
              <DropdownMenuTrigger className="flex items-center gap-2 rounded-xl py-1 pl-1 pr-2 hover:bg-forest-50" aria-label="Account menu">
                <Avatar className="size-8"><AvatarFallback className="bg-forest text-xs font-semibold text-white">{initials(user.name)}</AvatarFallback></Avatar>
                <span className="hidden max-w-36 truncate text-sm font-medium sm:inline">{user.name.replace(/\s*\(.*\)/, "")}</span>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel className="font-normal"><div className="font-medium">{user.name}</div><div className="text-xs text-muted-foreground">{user.phone}</div></DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild><Link href="/account"><User className="size-4" />Account & preferences</Link></DropdownMenuItem>
                <DropdownMenuItem asChild><Link href="/notifications"><Bell className="size-4" />Inbox</Link></DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => startTransition(() => logoutAction())}><LogOut className="size-4" />Sign out</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      <main id="main" className="px-4 pb-28 pt-24 lg:pb-12 lg:pl-[18.5rem] lg:pr-8">
        <div className="mx-auto max-w-6xl">{children}</div>
      </main>

      {/* Floating dock: the priority actions on small screens */}
      <nav aria-label="Quick actions" className="float fixed inset-x-3 bottom-3 z-20 flex justify-around rounded-2xl px-2 py-1.5 lg:hidden">
        {nav.dock.map((i) => {
          const on = active === i.href;
          return (
            <Link key={i.href} href={i.href} aria-current={on ? "page" : undefined}
              className={cn("relative flex min-w-16 flex-col items-center gap-0.5 rounded-xl px-2 py-1.5 text-[11px] font-medium transition-colors", on ? "text-white" : "text-ink/70 active:scale-95")}>
              {on && <motion.span layoutId="pill-dock" aria-hidden className="absolute inset-0 -z-10 rounded-xl bg-forest" transition={{ type: "spring", stiffness: 420, damping: 34 }} />}
              <Icon name={i.icon} className="size-5" />{i.label}
            </Link>
          );
        })}
      </nav>

      {/* Ctrl/⌘ K: jump to any page available in the current context */}
      <CommandDialog open={palette} onOpenChange={setPalette} title="Jump to" description="Search pages and actions">
        <Command>
        <CommandInput placeholder="Where do you want to go?" />
        <CommandList>
          <CommandEmpty>Nothing matches. Try a page name like “tickets” or “orders”.</CommandEmpty>
          {nav.primary && (
            <CommandGroup heading="Do">
              <CommandItem onSelect={() => go(nav.primary!.href)}><Plus className="size-4" />{nav.primary.label}</CommandItem>
            </CommandGroup>
          )}
          {nav.groups.map((g) => (
            <CommandGroup key={g.label} heading={g.label}>
              {g.items.map((i) => <CommandItem key={i.href} value={`${g.label} ${i.label}`} onSelect={() => go(i.href)}><Icon name={i.icon} />{i.label}</CommandItem>)}
            </CommandGroup>
          ))}
          <CommandSeparator />
          <CommandGroup heading="You">
            <CommandItem onSelect={() => go("/notifications")}><Bell className="size-4" />Inbox{unread > 0 && ` (${unread} unread)`}</CommandItem>
            <CommandItem onSelect={() => go("/account")}><User className="size-4" />Account & preferences</CommandItem>
            <CommandItem onSelect={() => go("/how-it-works")}><Search className="size-4" />How Khana Bridge works</CommandItem>
          </CommandGroup>
        </CommandList>
        </Command>
      </CommandDialog>
    </div>
  );
}

function Breadcrumb({ items, active }: { items: NavItem[]; active?: string }) {
  const item = items.find((i) => i.href === active);
  return item ? <span className="hidden truncate text-sm font-medium text-muted-foreground md:inline">{item.label}</span> : null;
}

/** Organisation / role switcher. The chosen membership is re-validated on the server. */
function ContextSwitcher({ contexts, current, dark = false }: { contexts: Ctx[]; current: string; dark?: boolean }) {
  const [state, action, pending] = useActionState(switchContextAction, null);
  const cur = contexts.find((c) => c.id === current) ?? contexts[0];
  const choose = (id: string) => {
    const fd = new FormData();
    fd.set("membershipId", id);
    startTransition(() => action(fd));
  };
  return (
    <div>
      <DropdownMenu>
        <DropdownMenuTrigger disabled={pending} className={cn("flex w-full items-center gap-2.5 rounded-2xl border px-2.5 py-2 text-left", dark ? "border-white/15 bg-white/[0.07] hover:bg-white/[0.12]" : "border-line bg-white hover:border-forest/40")} aria-label="Switch organisation">
          <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-lg", dark ? "bg-turmeric text-turmeric-ink" : "bg-forest-50 text-forest")}><Building2 className="size-4" /></span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold">{cur.name}</span>
            <span className={cn("block truncate text-xs", dark ? "text-white/60" : "text-muted-foreground")}>{pending ? "Switching…" : cur.detail}</span>
          </span>
          <ChevronsUpDown className={cn("size-4", dark ? "text-white/60" : "text-muted-foreground")} />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-72">
          <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">Act as</DropdownMenuLabel>
          {contexts.map((c) => (
            <DropdownMenuItem key={c.id || "personal"} onSelect={() => c.id !== current && choose(c.id)} className="items-start gap-2.5 py-2">
              <span className="mt-0.5 size-4">{c.id === current && <Check className="size-4 text-forest" />}</span>
              <span className="min-w-0"><span className="block truncate font-medium">{c.name}</span><span className="block truncate text-xs text-muted-foreground">{c.detail}</span></span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      {state?.error && <p role="alert" className="mt-1 text-xs text-danger">{state.error}</p>}
    </div>
  );
}

export function PublicNav({ demo }: { demo: boolean }) {
  const path = usePathname();
  const link = (href: string, label: string) => (
    <Link href={href} aria-current={path === href ? "page" : undefined} className={cn("rounded-xl px-3 py-2 text-sm hover:bg-forest-50", path === href && "text-forest font-medium")}>{label}</Link>
  );
  return (
    <header className="fixed inset-x-3 top-3 z-20">
      <div className="float mx-auto flex max-w-6xl flex-wrap items-center gap-1 rounded-2xl px-3 py-2">
        <Logo tagline />
        <nav aria-label="Main" className="ml-auto flex flex-wrap items-center gap-0.5">
          <span className="hidden sm:contents">{link("/how-it-works", "How it works")}{link("/market", "Marketplace")}{link("/apply", "Register an organisation")}</span>
          {demo && <Link href="/demo" className="rounded-xl px-3 py-2 text-sm font-medium text-coral hover:bg-coral-50">Try the demo</Link>}
          <Link href="/login" className="btn btn-primary">Sign in</Link>
        </nav>
      </div>
    </header>
  );
}
